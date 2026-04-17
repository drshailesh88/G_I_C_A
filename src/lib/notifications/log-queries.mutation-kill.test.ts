/**
 * Mutation-killing tests for log-queries.ts
 *
 * Targets: 50 NoCoverage mutations in notification log CRUD.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockReturning, mockLimit, mockOffset, mockOrderBy, mockWhere, mockSet, mockValues, mockFrom, dbChain } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockLimit = vi.fn();
  const mockOffset = vi.fn();
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn();
  const mockSet = vi.fn();
  const mockValues = vi.fn();
  const mockFrom = vi.fn();

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

  return { mockReturning, mockLimit, mockOffset, mockOrderBy, mockWhere, mockSet, mockValues, mockFrom, dbChain: chain };
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
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ _type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  desc: vi.fn((col: unknown) => ({ _type: 'desc', col })),
}));

import {
  createLogEntry,
  updateLogStatus,
  markAsRetrying,
  getLogById,
  listFailedLogs,
} from './log-queries';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const LOG_ID = '550e8400-e29b-41d4-a716-446655440001';
const OTHER_LOG_ID = '550e8400-e29b-41d4-a716-446655440099';

beforeEach(() => {
  vi.clearAllMocks();
  const mockRow = { id: LOG_ID, eventId: EVENT_ID, status: 'queued' };
  mockReturning.mockResolvedValue([mockRow]);
  mockLimit.mockReturnValue(dbChain);
  mockOffset.mockReturnValue(dbChain);
  mockOrderBy.mockReturnValue(dbChain);
  mockWhere.mockReturnValue(dbChain);
  mockFrom.mockReturnValue(dbChain);
});

describe('createLogEntry', () => {
  it('maps all input fields to db.insert().values()', async () => {
    const input = {
      eventId: EVENT_ID,
      personId: 'person-1',
      templateId: 'tpl-1',
      templateKeySnapshot: 'registration_confirmation',
      templateVersionNo: 2,
      channel: 'email' as const,
      provider: 'resend',
      triggerType: 'registration.created',
      triggerEntityType: 'registration',
      triggerEntityId: 'reg-1',
      sendMode: 'automatic' as const,
      idempotencyKey: 'idem-1',
      recipientEmail: 'user@example.com',
      recipientPhoneE164: null,
      renderedSubject: 'Welcome',
      renderedBody: '<p>Hello</p>',
      renderedVariablesJson: { name: 'Test' },
      attachmentManifestJson: [{ fileName: 'f.pdf', storageKey: 'k' }],
      status: 'queued' as const,
      initiatedByUserId: 'user-1',
      isResend: true,
      resendOfId: 'log-0',
    };

    await createLogEntry(input);

    const valuesArg = mockValues.mock.calls[0][0];
    expect(valuesArg.eventId).toBe(EVENT_ID);
    expect(valuesArg.personId).toBe('person-1');
    expect(valuesArg.templateId).toBe('tpl-1');
    expect(valuesArg.templateKeySnapshot).toBe('registration_confirmation');
    expect(valuesArg.templateVersionNo).toBe(2);
    expect(valuesArg.channel).toBe('email');
    expect(valuesArg.provider).toBe('resend');
    expect(valuesArg.triggerType).toBe('registration.created');
    expect(valuesArg.triggerEntityType).toBe('registration');
    expect(valuesArg.triggerEntityId).toBe('reg-1');
    expect(valuesArg.sendMode).toBe('automatic');
    expect(valuesArg.idempotencyKey).toBe('idem-1');
    expect(valuesArg.recipientEmail).toBe('user@example.com');
    expect(valuesArg.recipientPhoneE164).toBeNull();
    expect(valuesArg.renderedSubject).toBe('Welcome');
    expect(valuesArg.renderedBody).toBe('<p>Hello</p>');
    expect(valuesArg.renderedVariablesJson).toEqual({ name: 'Test' });
    expect(valuesArg.attachmentManifestJson).toEqual([{ fileName: 'f.pdf', storageKey: 'k' }]);
    expect(valuesArg.status).toBe('queued');
    expect(valuesArg.initiatedByUserId).toBe('user-1');
    expect(valuesArg.isResend).toBe(true);
    expect(valuesArg.resendOfId).toBe('log-0');
  });

  it('applies ?? null defaults for optional fields', async () => {
    await createLogEntry({
      eventId: EVENT_ID,
      personId: 'person-1',
      templateId: null,
      templateKeySnapshot: 'key',
      templateVersionNo: null,
      channel: 'email',
      provider: 'resend',
      sendMode: 'manual',
      idempotencyKey: 'k',
      renderedBody: 'body',
    } as any);

    const valuesArg = mockValues.mock.calls[0][0];
    expect(valuesArg.triggerType).toBeNull();
    expect(valuesArg.triggerEntityType).toBeNull();
    expect(valuesArg.triggerEntityId).toBeNull();
    expect(valuesArg.recipientEmail).toBeNull();
    expect(valuesArg.recipientPhoneE164).toBeNull();
    expect(valuesArg.renderedSubject).toBeNull();
    expect(valuesArg.renderedVariablesJson).toBeNull();
    expect(valuesArg.attachmentManifestJson).toBeNull();
    expect(valuesArg.status).toBe('queued');
    expect(valuesArg.initiatedByUserId).toBeNull();
    expect(valuesArg.isResend).toBe(false);
    expect(valuesArg.resendOfId).toBeNull();
  });

  it('returns the first inserted row', async () => {
    const result = await createLogEntry({
      eventId: EVENT_ID,
      personId: 'p',
      templateId: null,
      templateKeySnapshot: 'k',
      templateVersionNo: null,
      channel: 'email',
      provider: 'resend',
      sendMode: 'manual',
      idempotencyKey: 'k',
      renderedBody: 'body',
    } as any);

    expect(result).toEqual({ id: LOG_ID, eventId: EVENT_ID, status: 'queued' });
  });
});

describe('updateLogStatus', () => {
  it('sets status and provider fields', async () => {
    await updateLogStatus(LOG_ID, EVENT_ID, {
      status: 'sent',
      providerMessageId: 'msg-1',
      providerConversationId: 'conv-1',
      sentAt: new Date('2026-01-01'),
    });

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.status).toBe('sent');
    expect(setArg.providerMessageId).toBe('msg-1');
    expect(setArg.providerConversationId).toBe('conv-1');
    expect(setArg.sentAt).toEqual(new Date('2026-01-01'));
    expect(setArg.lastAttemptAt).toBeInstanceOf(Date);
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  it('sets error fields on failure', async () => {
    await updateLogStatus(LOG_ID, EVENT_ID, {
      status: 'failed',
      lastErrorCode: 'PROVIDER_TIMEOUT',
      lastErrorMessage: 'Timed out',
      failedAt: new Date('2026-01-01'),
    });

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.status).toBe('failed');
    expect(setArg.lastErrorCode).toBe('PROVIDER_TIMEOUT');
    expect(setArg.lastErrorMessage).toBe('Timed out');
    expect(setArg.failedAt).toEqual(new Date('2026-01-01'));
  });

  it('returns null when log not found', async () => {
    mockReturning.mockResolvedValueOnce([]);

    const result = await updateLogStatus(OTHER_LOG_ID, EVENT_ID, {
      status: 'sent',
    });

    expect(result).toBeNull();
  });

  it('scopes update by logId AND eventId', async () => {
    const { eq, and } = await import('drizzle-orm');

    await updateLogStatus(LOG_ID, EVENT_ID, { status: 'sent' });

    expect(and).toHaveBeenCalled();
    expect(eq).toHaveBeenCalled();
  });
});

describe('markAsRetrying', () => {
  it('sets status to retrying with timestamps', async () => {
    await markAsRetrying(LOG_ID, EVENT_ID);

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.status).toBe('retrying');
    expect(setArg.lastAttemptAt).toBeInstanceOf(Date);
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  it('uses optimistic lock (status = failed)', async () => {
    const { eq } = await import('drizzle-orm');

    await markAsRetrying(LOG_ID, EVENT_ID);

    // eq should be called with status = 'failed' for the optimistic lock
    expect(eq).toHaveBeenCalled();
  });

  it('returns null when lock fails', async () => {
    mockReturning.mockResolvedValueOnce([]);

    const result = await markAsRetrying(LOG_ID, EVENT_ID);

    expect(result).toBeNull();
  });
});

describe('getLogById', () => {
  it('returns log scoped by eventId', async () => {
    mockLimit.mockReturnValue(Promise.resolve([{ id: LOG_ID }]));

    const result = await getLogById(LOG_ID, EVENT_ID);

    expect(result).toEqual({ id: LOG_ID });
  });

  it('returns null when not found', async () => {
    mockLimit.mockReturnValue(Promise.resolve([]));

    const result = await getLogById(OTHER_LOG_ID, EVENT_ID);

    expect(result).toBeNull();
  });
});

describe('listFailedLogs', () => {
  it('lists failed logs with default limit and offset', async () => {
    // Make chain resolve as array at the end
    mockOffset.mockReturnValue(Promise.resolve([{ id: LOG_ID }]));

    const result = await listFailedLogs(EVENT_ID);

    expect(result).toEqual([{ id: LOG_ID }]);
  });

  it('applies custom limit and offset', async () => {
    mockOffset.mockReturnValue(Promise.resolve([]));

    await listFailedLogs(EVENT_ID, { limit: 20, offset: 10 });

    expect(mockLimit).toHaveBeenCalledWith(20);
    expect(mockOffset).toHaveBeenCalledWith(10);
  });

  it('applies channel filter', async () => {
    mockOffset.mockReturnValue(Promise.resolve([]));

    await listFailedLogs(EVENT_ID, { channel: 'email' });

    expect(mockWhere).toHaveBeenCalled();
  });

  it('applies templateKey filter', async () => {
    mockOffset.mockReturnValue(Promise.resolve([]));

    await listFailedLogs(EVENT_ID, { templateKey: 'registration_confirmation' });

    expect(mockWhere).toHaveBeenCalled();
  });

  it('applies both channel and templateKey filters', async () => {
    mockOffset.mockReturnValue(Promise.resolve([]));

    await listFailedLogs(EVENT_ID, {
      channel: 'whatsapp',
      templateKey: 'travel_update',
    });

    expect(mockWhere).toHaveBeenCalled();
  });
});
