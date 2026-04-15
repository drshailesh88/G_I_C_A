/**
 * Tests for notification_log upsert — cascade-029
 *
 * Spec: notification_log has exactly one row per idempotency key;
 * retries UPDATE in place.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockReturning,
  mockWhere,
  mockSet,
  mockValues,
  mockOnConflict,
  dbChain,
} = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockWhere = vi.fn();
  const mockSet = vi.fn();
  const mockValues = vi.fn();
  const mockOnConflict = vi.fn();

  const chain: Record<string, any> = {};
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.values = mockValues.mockReturnValue(chain);
  chain.onConflictDoUpdate = mockOnConflict.mockReturnValue(chain);
  chain.set = mockSet.mockReturnValue(chain);
  chain.where = mockWhere.mockReturnValue(chain);
  chain.returning = mockReturning;

  return {
    mockReturning,
    mockWhere,
    mockSet,
    mockValues,
    mockOnConflict,
    dbChain: chain,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    insert: dbChain.insert,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  notificationLog: {
    id: 'id',
    eventId: 'eventId',
    idempotencyKey: 'idempotencyKey',
    attempts: 'attempts',
    status: 'status',
    lastErrorCode: 'lastErrorCode',
    lastErrorMessage: 'lastErrorMessage',
    sentAt: 'sentAt',
    failedAt: 'failedAt',
    lastAttemptAt: 'lastAttemptAt',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ _type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      _type: 'sql',
      strings: Array.from(strings),
      values,
    })),
    {
      raw: vi.fn((s: string) => ({ _type: 'sql_raw', value: s })),
    },
  ),
}));

import { upsertLogEntry } from './log-queries';
import type { CreateLogEntryInput } from './types';

function makeInput(overrides: Partial<CreateLogEntryInput> = {}): CreateLogEntryInput {
  return {
    eventId: 'evt-1',
    personId: 'person-1',
    templateId: null,
    templateKeySnapshot: 'welcome',
    templateVersionNo: 1,
    channel: 'email',
    provider: 'resend',
    sendMode: 'automatic',
    idempotencyKey: 'notification:u1:evt-1:welcome:trig1:email',
    renderedBody: 'Hello',
    status: 'queued',
    ...overrides,
  };
}

describe('upsertLogEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('first attempt inserts row with attempts=1', async () => {
    const insertedRow = {
      id: 'log-1',
      idempotencyKey: 'notification:u1:evt-1:welcome:trig1:email',
      attempts: 1,
      status: 'sent',
    };
    mockReturning.mockResolvedValueOnce([insertedRow]);

    const result = await upsertLogEntry(makeInput());

    expect(result).toEqual(insertedRow);
    expect(dbChain.insert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledTimes(1);
    expect(mockOnConflict).toHaveBeenCalledTimes(1);

    const onConflictArg = mockOnConflict.mock.calls[0][0];
    expect(onConflictArg).toHaveProperty('target', 'idempotencyKey');
    expect(onConflictArg).toHaveProperty('set');
    const setObj = onConflictArg.set;
    expect(setObj.attempts._type).toBe('sql');
  });

  it('retry updates same row — attempts increments, never second INSERT', async () => {
    const upsertedRow = {
      id: 'log-1',
      idempotencyKey: 'notification:u1:evt-1:welcome:trig1:email',
      attempts: 3,
      status: 'sent',
    };
    mockReturning.mockResolvedValueOnce([upsertedRow]);

    const result = await upsertLogEntry(
      makeInput({ status: 'sent' }),
    );

    expect(result.attempts).toBe(3);
    expect(dbChain.insert).toHaveBeenCalledTimes(1);
  });

  it('upsert set clause uses SQL attempts = attempts + 1 for atomic increment', async () => {
    mockReturning.mockResolvedValueOnce([{ id: 'log-1', attempts: 2 }]);

    await upsertLogEntry(makeInput({ status: 'failed', lastErrorCode: 'PROVIDER_TIMEOUT' }));

    const onConflictArg = mockOnConflict.mock.calls[0][0];
    const setObj = onConflictArg.set;

    expect(setObj.attempts._type).toBe('sql');
    const sqlStrings = setObj.attempts.strings.join('');
    expect(sqlStrings).toContain('+ 1');
    expect(setObj.attempts.values).toContain('attempts');
  });

  it('upsert updates status, lastErrorCode, lastErrorMessage on conflict', async () => {
    mockReturning.mockResolvedValueOnce([{ id: 'log-1', attempts: 2, status: 'failed' }]);

    await upsertLogEntry(makeInput({
      status: 'failed',
      lastErrorCode: 'PROVIDER_TIMEOUT',
      lastErrorMessage: 'Timed out after 5000ms',
    }));

    const onConflictArg = mockOnConflict.mock.calls[0][0];
    const setObj = onConflictArg.set;
    expect(setObj).toHaveProperty('status');
    expect(setObj).toHaveProperty('lastErrorCode');
    expect(setObj).toHaveProperty('lastErrorMessage');
    expect(setObj).toHaveProperty('lastAttemptAt');
    expect(setObj).toHaveProperty('updatedAt');
  });

  it('upsert updates sentAt when status is sent', async () => {
    mockReturning.mockResolvedValueOnce([{ id: 'log-1', attempts: 1, status: 'sent' }]);

    await upsertLogEntry(makeInput({ status: 'sent' }));

    const onConflictArg = mockOnConflict.mock.calls[0][0];
    const setObj = onConflictArg.set;
    expect(setObj).toHaveProperty('sentAt');
  });

  it('upsert updates failedAt when status is failed', async () => {
    mockReturning.mockResolvedValueOnce([{ id: 'log-1', attempts: 2, status: 'failed' }]);

    await upsertLogEntry(makeInput({ status: 'failed' }));

    const onConflictArg = mockOnConflict.mock.calls[0][0];
    const setObj = onConflictArg.set;
    expect(setObj).toHaveProperty('failedAt');
  });
});
