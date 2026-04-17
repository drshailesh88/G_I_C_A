import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  dbChain,
  mockFrom,
  mockLimit,
  mockOffset,
  mockOnConflict,
  mockOrderBy,
  mockReturning,
  mockValues,
  mockWhere,
} = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockValues = vi.fn();
  const mockOnConflict = vi.fn();
  const mockWhere = vi.fn();
  const mockFrom = vi.fn();
  const mockOrderBy = vi.fn();
  const mockLimit = vi.fn();
  const mockOffset = vi.fn();

  const chain: Record<string, any> = {};
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = mockFrom.mockReturnValue(chain);
  chain.values = mockValues.mockReturnValue(chain);
  chain.onConflictDoUpdate = mockOnConflict.mockReturnValue(chain);
  chain.where = mockWhere.mockReturnValue(chain);
  chain.orderBy = mockOrderBy.mockReturnValue(chain);
  chain.limit = mockLimit.mockReturnValue(chain);
  chain.offset = mockOffset.mockReturnValue(Promise.resolve([{ id: 'log-1' }]));
  chain.returning = mockReturning;

  return {
    dbChain: chain,
    mockFrom,
    mockLimit,
    mockOffset,
    mockOnConflict,
    mockOrderBy,
    mockReturning,
    mockValues,
    mockWhere,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    insert: dbChain.insert,
    select: dbChain.select,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  notificationLog: {
    id: 'id',
    eventId: 'eventId',
    idempotencyKey: 'idempotencyKey',
    attempts: 'attempts',
    status: 'status',
    failedAt: 'failedAt',
    channel: 'channel',
    templateKeySnapshot: 'templateKeySnapshot',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ _type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  desc: vi.fn((column: unknown) => ({ _type: 'desc', column })),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      _type: 'sql',
      strings: Array.from(strings),
      values,
    })),
    {
      raw: vi.fn((value: string) => ({ _type: 'sql_raw', value })),
    },
  ),
}));

import {
  beginLogAttempt,
  createLogEntry,
  getLogById,
  listFailedLogs,
  upsertLogEntry,
} from './log-queries';
import type { CreateLogEntryInput } from './types';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const LOG_ID = '550e8400-e29b-41d4-a716-446655440001';

function makeInput(overrides: Partial<CreateLogEntryInput> = {}): CreateLogEntryInput {
  return {
    eventId: EVENT_ID,
    personId: '550e8400-e29b-41d4-a716-446655440002',
    templateId: null,
    templateKeySnapshot: 'registration_confirmation',
    templateVersionNo: 1,
    channel: 'email',
    provider: 'resend',
    sendMode: 'automatic',
    idempotencyKey: 'notification:user:event:registration:trigger:email',
    renderedBody: 'Hello',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReturning.mockResolvedValue([{ id: LOG_ID, eventId: EVENT_ID, status: 'queued' }]);
  mockLimit.mockReturnValue(dbChain);
  mockOffset.mockReturnValue(Promise.resolve([{ id: LOG_ID }]));
});

describe('log-queries adversarial hardening', () => {
  it('rejects cross-event idempotency conflicts during upsert instead of updating a foreign row', async () => {
    mockReturning.mockResolvedValueOnce([]);

    await expect(upsertLogEntry(makeInput())).rejects.toThrow(
      'Notification idempotency key is already reserved by another event',
    );

    expect(mockOnConflict).toHaveBeenCalledTimes(1);
    expect(mockOnConflict.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        setWhere: expect.any(Object),
      }),
    );
  });

  it('rejects cross-event idempotency conflicts before beginning another send attempt', async () => {
    mockReturning.mockResolvedValueOnce([]);
    mockLimit.mockReturnValueOnce(Promise.resolve([]));

    await expect(beginLogAttempt(makeInput())).rejects.toThrow(
      'Notification idempotency key is already reserved by another event',
    );

    expect(mockOnConflict).toHaveBeenCalledTimes(1);
    expect(mockOnConflict.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        setWhere: expect.any(Object),
      }),
    );
  });

  it('rejects whitespace-padded idempotency keys before inserting a log row', async () => {
    await expect(
      createLogEntry(makeInput({ idempotencyKey: ' notification:key ' })),
    ).rejects.toThrow('Idempotency key must not contain surrounding whitespace');

    expect(dbChain.insert).not.toHaveBeenCalled();
  });

  it('fails closed on oversized failed-log pagination requests', async () => {
    await expect(
      listFailedLogs(EVENT_ID, { limit: 201 }),
    ).rejects.toThrow(/less than or equal to 200|at most 200/i);

    await expect(
      listFailedLogs(EVENT_ID, { offset: 10001 }),
    ).rejects.toThrow(/less than or equal to 10000|at most 10000/i);
  });

  it('rejects malformed event IDs before reaching the database', async () => {
    await expect(getLogById(LOG_ID, 'not-a-uuid')).rejects.toThrow('Invalid event ID');

    expect(dbChain.select).not.toHaveBeenCalled();
  });
});
