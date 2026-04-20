/**
 * Mutation-kill-2 tests for log-queries.ts
 *
 * Targets survivors left behind by log-queries.mutation-kill.test.ts:
 *   - upsertLogEntry: full field mapping, sentAt/failedAt conditionals,
 *     onConflictDoUpdate setWhere clause, error bubbling when no row returned.
 *   - beginLogAttempt: full field mapping, setWhere restricted to status=failed,
 *     shouldSend branches (insert vs existing failed retry vs already-sent duplicate
 *     vs cross-event collision error).
 *   - listFailedLogs: branch-level assertions that channel / templateKey filters
 *     actually add the correct `eq` predicates, and that "both" composes them.
 *   - validation error messages (required for StringLiteral mutations on Zod
 *     messages), and `.trim()` on templateKey filter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockReturning,
  mockLimit,
  mockOffset,
  mockOrderBy,
  mockWhere,
  mockSet,
  mockValues,
  mockFrom,
  mockOnConflictDoUpdate,
  dbChain,
} = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockLimit = vi.fn();
  const mockOffset = vi.fn();
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn();
  const mockSet = vi.fn();
  const mockValues = vi.fn();
  const mockFrom = vi.fn();
  const mockOnConflictDoUpdate = vi.fn();

  const chain: Record<string, any> = {};
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = mockFrom.mockReturnValue(chain);
  chain.values = mockValues.mockReturnValue(chain);
  chain.set = mockSet.mockReturnValue(chain);
  chain.where = mockWhere.mockReturnValue(chain);
  chain.returning = mockReturning;
  chain.limit = mockLimit.mockReturnValue(chain);
  chain.offset = mockOffset.mockReturnValue(chain);
  chain.orderBy = mockOrderBy.mockReturnValue(chain);
  chain.onConflictDoUpdate = mockOnConflictDoUpdate.mockReturnValue(chain);

  return {
    mockReturning,
    mockLimit,
    mockOffset,
    mockOrderBy,
    mockWhere,
    mockSet,
    mockValues,
    mockFrom,
    mockOnConflictDoUpdate,
    dbChain: chain,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    insert: dbChain.insert,
    update: dbChain.update,
    select: dbChain.select,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  notificationLog: {
    id: 'id',
    eventId: 'eventId',
    channel: 'channel',
    status: 'status',
    failedAt: 'failedAt',
    templateKeySnapshot: 'templateKeySnapshot',
    providerMessageId: 'providerMessageId',
    idempotencyKey: 'idempotencyKey',
    attempts: 'attempts',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ _type: 'eq', col, val })),
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  desc: vi.fn((col: unknown) => ({ _type: 'desc', col })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      _type: 'sql',
      strings: Array.from(strings),
      values,
    }),
    {},
  ),
}));

import {
  upsertLogEntry,
  beginLogAttempt,
  listFailedLogs,
  createLogEntry,
  updateLogStatus,
  markAsRetrying,
  getLogById,
} from './log-queries';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const EVENT_ID_2 = '550e8400-e29b-41d4-a716-446655440010';
const LOG_ID = '550e8400-e29b-41d4-a716-446655440001';

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    eventId: EVENT_ID,
    personId: 'person-1',
    templateId: 'tpl-1',
    templateKeySnapshot: 'registration_confirmation',
    templateVersionNo: 3,
    channel: 'email' as const,
    provider: 'resend' as const,
    triggerType: 'registration.created',
    triggerEntityType: 'registration',
    triggerEntityId: 'reg-1',
    sendMode: 'automatic' as const,
    idempotencyKey: 'idem-1',
    recipientEmail: 'user@example.com',
    recipientPhoneE164: '+14155552671',
    renderedSubject: 'Welcome',
    renderedBody: '<p>Hello</p>',
    renderedVariablesJson: { name: 'Test' } as Record<string, unknown>,
    attachmentManifestJson: [{ fileName: 'f.pdf', storageKey: 'k' }],
    initiatedByUserId: 'user-1',
    isResend: true,
    resendOfId: 'log-0',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReturning.mockResolvedValue([{ id: LOG_ID, eventId: EVENT_ID, status: 'queued' }]);
  mockLimit.mockReturnValue(dbChain);
  mockOffset.mockReturnValue(dbChain);
  mockOrderBy.mockReturnValue(dbChain);
  mockWhere.mockReturnValue(dbChain);
  mockFrom.mockReturnValue(dbChain);
  mockSet.mockReturnValue(dbChain);
  mockValues.mockReturnValue(dbChain);
  mockOnConflictDoUpdate.mockReturnValue(dbChain);
});

// ─────────────────────────────────────────────────────────
// Validation error messages (kill StringLiteral survivors
// on the schema definitions).
// ─────────────────────────────────────────────────────────
describe('assertion error messages', () => {
  it('reports a specific message for an invalid notification log id', async () => {
    await expect(
      updateLogStatus('not-a-uuid', EVENT_ID, { status: 'sent' }),
    ).rejects.toThrow(/Invalid notification log ID/);
  });

  it('reports a specific message when idempotency key is empty', async () => {
    await expect(
      createLogEntry(baseInput({ idempotencyKey: '' }) as never),
    ).rejects.toThrow(/Invalid idempotency key/);
  });

  it('reports a specific message when idempotency key exceeds 512 chars', async () => {
    await expect(
      createLogEntry(baseInput({ idempotencyKey: 'a'.repeat(513) }) as never),
    ).rejects.toThrow(/too long/i);
  });

  it('rejects an idempotency key with surrounding whitespace', async () => {
    await expect(
      createLogEntry(baseInput({ idempotencyKey: ' key ' }) as never),
    ).rejects.toThrow(/whitespace/i);
  });
});

// ─────────────────────────────────────────────────────────
// upsertLogEntry — full field mapping + conflict clause.
// ─────────────────────────────────────────────────────────
describe('upsertLogEntry', () => {
  it('maps every input field onto values() including triggers, recipient, rendered body, attachments', async () => {
    await upsertLogEntry(baseInput({ status: 'sent' }) as never);

    expect(mockValues).toHaveBeenCalledTimes(1);
    const v = mockValues.mock.calls[0][0];
    expect(v.eventId).toBe(EVENT_ID);
    expect(v.personId).toBe('person-1');
    expect(v.templateId).toBe('tpl-1');
    expect(v.templateKeySnapshot).toBe('registration_confirmation');
    expect(v.templateVersionNo).toBe(3);
    expect(v.channel).toBe('email');
    expect(v.provider).toBe('resend');
    expect(v.triggerType).toBe('registration.created');
    expect(v.triggerEntityType).toBe('registration');
    expect(v.triggerEntityId).toBe('reg-1');
    expect(v.sendMode).toBe('automatic');
    expect(v.idempotencyKey).toBe('idem-1');
    expect(v.recipientEmail).toBe('user@example.com');
    expect(v.recipientPhoneE164).toBe('+14155552671');
    expect(v.renderedSubject).toBe('Welcome');
    expect(v.renderedBody).toBe('<p>Hello</p>');
    expect(v.renderedVariablesJson).toEqual({ name: 'Test' });
    expect(v.attachmentManifestJson).toEqual([{ fileName: 'f.pdf', storageKey: 'k' }]);
    expect(v.initiatedByUserId).toBe('user-1');
    expect(v.isResend).toBe(true);
    expect(v.resendOfId).toBe('log-0');
  });

  it('defaults optional fields to null / false on values()', async () => {
    await upsertLogEntry({
      eventId: EVENT_ID,
      personId: 'p',
      templateId: null,
      templateKeySnapshot: 'k',
      templateVersionNo: null,
      channel: 'email',
      provider: 'resend',
      sendMode: 'manual',
      idempotencyKey: 'idem-min',
      renderedBody: 'body',
    } as never);

    const v = mockValues.mock.calls[0][0];
    expect(v.triggerType).toBeNull();
    expect(v.triggerEntityType).toBeNull();
    expect(v.triggerEntityId).toBeNull();
    expect(v.recipientEmail).toBeNull();
    expect(v.recipientPhoneE164).toBeNull();
    expect(v.renderedSubject).toBeNull();
    expect(v.renderedVariablesJson).toBeNull();
    expect(v.attachmentManifestJson).toBeNull();
    expect(v.lastErrorCode).toBeNull();
    expect(v.lastErrorMessage).toBeNull();
    expect(v.initiatedByUserId).toBeNull();
    expect(v.isResend).toBe(false);
    expect(v.resendOfId).toBeNull();
  });

  it('defaults status to "queued" when not provided and sets lastAttemptAt', async () => {
    await upsertLogEntry(baseInput({ status: undefined }) as never);

    const v = mockValues.mock.calls[0][0];
    expect(v.status).toBe('queued');
    expect(v.lastAttemptAt).toBeInstanceOf(Date);
    // Neither sentAt nor failedAt stamped for queued.
    expect(v.sentAt).toBeNull();
    expect(v.failedAt).toBeNull();
  });

  it('stamps sentAt (and leaves failedAt null) when status === "sent"', async () => {
    await upsertLogEntry(baseInput({ status: 'sent' }) as never);

    const v = mockValues.mock.calls[0][0];
    expect(v.sentAt).toBeInstanceOf(Date);
    expect(v.failedAt).toBeNull();

    const set = mockOnConflictDoUpdate.mock.calls[0][0].set;
    expect(set.sentAt).toBeInstanceOf(Date);
    // failedAt must NOT be added when status is sent.
    expect(Object.prototype.hasOwnProperty.call(set, 'failedAt')).toBe(false);
  });

  it('stamps failedAt (and leaves sentAt null) when status === "failed"', async () => {
    await upsertLogEntry(baseInput({ status: 'failed' }) as never);

    const v = mockValues.mock.calls[0][0];
    expect(v.failedAt).toBeInstanceOf(Date);
    expect(v.sentAt).toBeNull();

    const set = mockOnConflictDoUpdate.mock.calls[0][0].set;
    expect(set.failedAt).toBeInstanceOf(Date);
    expect(Object.prototype.hasOwnProperty.call(set, 'sentAt')).toBe(false);
  });

  it('neither sentAt nor failedAt set in ON CONFLICT update when status is queued', async () => {
    await upsertLogEntry(baseInput({ status: 'queued' }) as never);
    const set = mockOnConflictDoUpdate.mock.calls[0][0].set;
    expect(Object.prototype.hasOwnProperty.call(set, 'sentAt')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(set, 'failedAt')).toBe(false);
  });

  it('forwards lastErrorCode / lastErrorMessage to insert values and update set', async () => {
    await upsertLogEntry(
      baseInput({
        status: 'failed',
        lastErrorCode: 'RATE_LIMIT',
        lastErrorMessage: 'slow down',
      }) as never,
    );

    const v = mockValues.mock.calls[0][0];
    expect(v.lastErrorCode).toBe('RATE_LIMIT');
    expect(v.lastErrorMessage).toBe('slow down');

    const set = mockOnConflictDoUpdate.mock.calls[0][0].set;
    expect(set.lastErrorCode).toBe('RATE_LIMIT');
    expect(set.lastErrorMessage).toBe('slow down');
  });

  it('increments attempts with a sql`attempts + 1` expression in the conflict set', async () => {
    await upsertLogEntry(baseInput({ status: 'queued' }) as never);

    const set = mockOnConflictDoUpdate.mock.calls[0][0].set;
    expect(set.attempts).toBeDefined();
    expect(set.attempts._type).toBe('sql');
    const sqlLiteral = set.attempts.strings.join('');
    expect(sqlLiteral).toContain('+ 1');
  });

  it('restricts the conflict update to rows in the same eventId (setWhere guard)', async () => {
    await upsertLogEntry(baseInput({}) as never);

    const cfg = mockOnConflictDoUpdate.mock.calls[0][0];
    expect(cfg.target).toBe('idempotencyKey');
    expect(cfg.setWhere).toBeDefined();
    // setWhere is eq(eventId, input.eventId).
    expect(cfg.setWhere._type).toBe('eq');
    expect(cfg.setWhere.col).toBe('eventId');
    expect(cfg.setWhere.val).toBe(EVENT_ID);
  });

  it('throws when returning() yields no row (idempotency key owned by another event)', async () => {
    mockReturning.mockResolvedValueOnce([]);
    await expect(
      upsertLogEntry(baseInput({ eventId: EVENT_ID_2 }) as never),
    ).rejects.toThrow(/already reserved/i);
  });
});

// ─────────────────────────────────────────────────────────
// beginLogAttempt — insert vs retry vs already-sent vs collision.
// ─────────────────────────────────────────────────────────
describe('beginLogAttempt', () => {
  it('inserts with status="queued" and lastAttemptAt and maps every input field', async () => {
    await beginLogAttempt(baseInput({}) as never);

    const v = mockValues.mock.calls[0][0];
    expect(v.status).toBe('queued');
    expect(v.lastAttemptAt).toBeInstanceOf(Date);
    expect(v.eventId).toBe(EVENT_ID);
    expect(v.personId).toBe('person-1');
    expect(v.templateId).toBe('tpl-1');
    expect(v.templateKeySnapshot).toBe('registration_confirmation');
    expect(v.templateVersionNo).toBe(3);
    expect(v.channel).toBe('email');
    expect(v.provider).toBe('resend');
    expect(v.triggerType).toBe('registration.created');
    expect(v.triggerEntityType).toBe('registration');
    expect(v.triggerEntityId).toBe('reg-1');
    expect(v.sendMode).toBe('automatic');
    expect(v.idempotencyKey).toBe('idem-1');
    expect(v.recipientEmail).toBe('user@example.com');
    expect(v.recipientPhoneE164).toBe('+14155552671');
    expect(v.renderedSubject).toBe('Welcome');
    expect(v.renderedBody).toBe('<p>Hello</p>');
    expect(v.renderedVariablesJson).toEqual({ name: 'Test' });
    expect(v.attachmentManifestJson).toEqual([{ fileName: 'f.pdf', storageKey: 'k' }]);
    expect(v.initiatedByUserId).toBe('user-1');
    expect(v.isResend).toBe(true);
    expect(v.resendOfId).toBe('log-0');
  });

  it('defaults isResend to false and optional fields to null', async () => {
    await beginLogAttempt({
      eventId: EVENT_ID,
      personId: 'p',
      templateId: null,
      templateKeySnapshot: 'k',
      templateVersionNo: null,
      channel: 'email',
      provider: 'resend',
      sendMode: 'manual',
      idempotencyKey: 'idem-min',
      renderedBody: 'body',
    } as never);

    const v = mockValues.mock.calls[0][0];
    expect(v.isResend).toBe(false);
    expect(v.triggerType).toBeNull();
    expect(v.triggerEntityType).toBeNull();
    expect(v.triggerEntityId).toBeNull();
    expect(v.recipientEmail).toBeNull();
    expect(v.recipientPhoneE164).toBeNull();
    expect(v.renderedSubject).toBeNull();
    expect(v.renderedVariablesJson).toBeNull();
    expect(v.attachmentManifestJson).toBeNull();
    expect(v.initiatedByUserId).toBeNull();
    expect(v.resendOfId).toBeNull();
  });

  it('returns shouldSend=true with the inserted row on first attempt', async () => {
    const inserted = { id: LOG_ID, eventId: EVENT_ID, status: 'queued' };
    mockReturning.mockResolvedValueOnce([inserted]);

    const res = await beginLogAttempt(baseInput({}) as never);
    expect(res).toEqual({ row: inserted, shouldSend: true });
  });

  it('conflict update set: resets error fields, bumps attempts, keeps status=queued', async () => {
    await beginLogAttempt(baseInput({}) as never);
    const set = mockOnConflictDoUpdate.mock.calls[0][0].set;
    expect(set.status).toBe('queued');
    expect(set.lastErrorCode).toBeNull();
    expect(set.lastErrorMessage).toBeNull();
    expect(set.attempts._type).toBe('sql');
    expect(set.attempts.strings.join('')).toContain('+ 1');
    expect(set.lastAttemptAt).toBeInstanceOf(Date);
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  it('setWhere restricts retry to matching eventId AND status="failed"', async () => {
    await beginLogAttempt(baseInput({}) as never);
    const cfg = mockOnConflictDoUpdate.mock.calls[0][0];
    expect(cfg.setWhere._type).toBe('and');
    const guards = cfg.setWhere.args as Array<{ col: string; val: unknown }>;
    expect(guards).toHaveLength(2);
    expect(guards.find((g) => g.col === 'eventId')?.val).toBe(EVENT_ID);
    expect(guards.find((g) => g.col === 'status')?.val).toBe('failed');
  });

  it('when insert/update is suppressed by setWhere, loads the existing row and returns shouldSend=false', async () => {
    // First call (insert/upsert) returns no row – setWhere prevented the retry.
    mockReturning.mockResolvedValueOnce([]);
    // Second call – SELECT existing row – returns the live row.
    const existing = { id: LOG_ID, eventId: EVENT_ID, status: 'sent' };
    mockLimit.mockReturnValueOnce(Promise.resolve([existing]));

    const res = await beginLogAttempt(baseInput({}) as never);
    expect(res).toEqual({ row: existing, shouldSend: false });
  });

  it('throws when no row exists after the suppressed upsert (cross-event collision)', async () => {
    mockReturning.mockResolvedValueOnce([]);
    mockLimit.mockReturnValueOnce(Promise.resolve([]));

    await expect(beginLogAttempt(baseInput({ eventId: EVENT_ID_2 }) as never)).rejects.toThrow(
      /already reserved/i,
    );
  });
});

// ─────────────────────────────────────────────────────────
// listFailedLogs — branch coverage on the filter builder.
// ─────────────────────────────────────────────────────────
describe('listFailedLogs filter composition', () => {
  it('default query filters eventId AND status="failed" (no channel/templateKey predicates)', async () => {
    mockOffset.mockReturnValueOnce(Promise.resolve([]));
    await listFailedLogs(EVENT_ID);

    const whereArg = mockWhere.mock.calls.at(-1)?.[0];
    expect(whereArg._type).toBe('and');
    const guards = whereArg.args as Array<{ col: string; val: unknown }>;
    expect(guards.map((g) => g.col).sort()).toEqual(['eventId', 'status']);
    expect(guards.find((g) => g.col === 'status')?.val).toBe('failed');
  });

  it('default limit=50 and offset=0 when no filters supplied', async () => {
    mockOffset.mockReturnValueOnce(Promise.resolve([]));
    await listFailedLogs(EVENT_ID);
    expect(mockLimit).toHaveBeenLastCalledWith(50);
    expect(mockOffset).toHaveBeenLastCalledWith(0);
  });

  it('channel filter adds an eq(channel, value) predicate and keeps status="failed"', async () => {
    mockOffset.mockReturnValueOnce(Promise.resolve([]));
    await listFailedLogs(EVENT_ID, { channel: 'whatsapp' });

    const whereArg = mockWhere.mock.calls.at(-1)?.[0];
    const guards = whereArg.args as Array<{ col: string; val: unknown }>;
    expect(guards.find((g) => g.col === 'channel')?.val).toBe('whatsapp');
    expect(guards.find((g) => g.col === 'status')?.val).toBe('failed');
    expect(guards.find((g) => g.col === 'eventId')?.val).toBe(EVENT_ID);
  });

  it('templateKey filter adds an eq(templateKeySnapshot, value) predicate', async () => {
    mockOffset.mockReturnValueOnce(Promise.resolve([]));
    await listFailedLogs(EVENT_ID, { templateKey: 'faculty_invite' });

    const whereArg = mockWhere.mock.calls.at(-1)?.[0];
    const guards = whereArg.args as Array<{ col: string; val: unknown }>;
    expect(guards.find((g) => g.col === 'templateKeySnapshot')?.val).toBe('faculty_invite');
    expect(guards.find((g) => g.col === 'status')?.val).toBe('failed');
    // Templated-only queries must not implicitly add a channel filter.
    expect(guards.find((g) => g.col === 'channel')).toBeUndefined();
  });

  it('channel + templateKey composes both predicates', async () => {
    mockOffset.mockReturnValueOnce(Promise.resolve([]));
    await listFailedLogs(EVENT_ID, { channel: 'email', templateKey: 'welcome' });

    const whereArg = mockWhere.mock.calls.at(-1)?.[0];
    const guards = whereArg.args as Array<{ col: string; val: unknown }>;
    expect(guards.find((g) => g.col === 'channel')?.val).toBe('email');
    expect(guards.find((g) => g.col === 'templateKeySnapshot')?.val).toBe('welcome');
    expect(guards.find((g) => g.col === 'status')?.val).toBe('failed');
  });

  it('trims whitespace around templateKey before applying the filter', async () => {
    mockOffset.mockReturnValueOnce(Promise.resolve([]));
    await listFailedLogs(EVENT_ID, { templateKey: '  welcome  ' });

    const whereArg = mockWhere.mock.calls.at(-1)?.[0];
    const guards = whereArg.args as Array<{ col: string; val: unknown }>;
    expect(guards.find((g) => g.col === 'templateKeySnapshot')?.val).toBe('welcome');
  });

  it('rejects a templateKey that is only whitespace (fails min(1) after trim)', async () => {
    await expect(listFailedLogs(EVENT_ID, { templateKey: '   ' })).rejects.toThrow();
  });

  it('rejects an unknown filter key (strict schema)', async () => {
    await expect(
      listFailedLogs(EVENT_ID, { bogus: 'x' } as never),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────
// updateLogStatus — confirm undefined-vs-defined propagation
// and correct optimistic locks.
// ─────────────────────────────────────────────────────────
describe('updateLogStatus field gating', () => {
  it('leaves unspecified optional fields undefined in set() (skips them in the UPDATE)', async () => {
    await updateLogStatus(LOG_ID, EVENT_ID, { status: 'sent' });
    const set = mockSet.mock.calls[0][0];
    expect(set.status).toBe('sent');
    expect(set.providerMessageId).toBeUndefined();
    expect(set.providerConversationId).toBeUndefined();
    expect(set.lastErrorCode).toBeUndefined();
    expect(set.lastErrorMessage).toBeUndefined();
    expect(set.sentAt).toBeUndefined();
    expect(set.failedAt).toBeUndefined();
  });

  it('passes null through (explicit clear), does not coerce null to undefined', async () => {
    await updateLogStatus(LOG_ID, EVENT_ID, {
      status: 'queued',
      providerMessageId: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    });
    const set = mockSet.mock.calls[0][0];
    expect(set.providerMessageId).toBeNull();
    expect(set.lastErrorCode).toBeNull();
    expect(set.lastErrorMessage).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// markAsRetrying — confirm optimistic lock on status="failed"
// (not on some other literal).
// ─────────────────────────────────────────────────────────
describe('markAsRetrying lock semantics', () => {
  it('filters rows with id + eventId + status="failed"', async () => {
    await markAsRetrying(LOG_ID, EVENT_ID);
    const whereArg = mockWhere.mock.calls.at(-1)?.[0];
    expect(whereArg._type).toBe('and');
    const guards = whereArg.args as Array<{ col: string; val: unknown }>;
    expect(guards.find((g) => g.col === 'id')?.val).toBe(LOG_ID);
    expect(guards.find((g) => g.col === 'eventId')?.val).toBe(EVENT_ID);
    expect(guards.find((g) => g.col === 'status')?.val).toBe('failed');
  });
});

// ─────────────────────────────────────────────────────────
// getLogById — confirm scoping uses both id and eventId.
// ─────────────────────────────────────────────────────────
describe('getLogById scoping', () => {
  it('filters by logId AND eventId together', async () => {
    mockLimit.mockReturnValueOnce(Promise.resolve([{ id: LOG_ID }]));
    await getLogById(LOG_ID, EVENT_ID);

    const whereArg = mockWhere.mock.calls.at(-1)?.[0];
    expect(whereArg._type).toBe('and');
    const guards = whereArg.args as Array<{ col: string; val: unknown }>;
    expect(guards.find((g) => g.col === 'id')?.val).toBe(LOG_ID);
    expect(guards.find((g) => g.col === 'eventId')?.val).toBe(EVENT_ID);
  });
});
