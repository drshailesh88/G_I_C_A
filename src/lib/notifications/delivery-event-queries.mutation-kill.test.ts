/**
 * Mutation-killing tests for delivery-event-queries.ts
 *
 * Targets: 33 NoCoverage mutations in delivery event queries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockReturning, mockLimit, mockOrderBy, mockWhere, mockSet, mockValues, mockFrom, dbChain } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockLimit = vi.fn();
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
  chain.returning = mockReturning.mockResolvedValue([{ id: 'de-1' }]);
  chain.limit = mockLimit;
  chain.orderBy = mockOrderBy.mockReturnValue(chain);

  return { mockReturning, mockLimit, mockOrderBy, mockWhere, mockSet, mockValues, mockFrom, dbChain: chain };
});

vi.mock('@/lib/db', () => ({
  db: {
    insert: dbChain.insert,
    update: dbChain.update,
    select: dbChain.select,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  notificationDeliveryEvents: {
    notificationLogId: 'notificationLogId',
    receivedAt: 'receivedAt',
  },
  notificationLog: {
    id: 'id',
    eventId: 'eventId',
    status: 'status',
    providerMessageId: 'providerMessageId',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ _type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  desc: vi.fn((col: unknown) => ({ _type: 'desc', col })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ _type: 'sql', strings, values }),
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn((...args: unknown[]) => ({ _type: 'withEventScope', args })),
}));

import {
  insertDeliveryEvent,
  listDeliveryEventsForLog,
  findLogByProviderMessageId,
  updateLogStatus,
} from './delivery-event-queries';

beforeEach(() => {
  vi.clearAllMocks();
  mockReturning.mockResolvedValue([{ id: 'de-1' }]);
  mockLimit.mockResolvedValue([{ id: 'log-1' }]);
  mockWhere.mockReturnValue(dbChain);
  mockOrderBy.mockReturnValue(dbChain);
  mockFrom.mockReturnValue(dbChain);
});

describe('insertDeliveryEvent', () => {
  it('inserts with all fields', async () => {
    await insertDeliveryEvent({
      notificationLogId: 'log-1',
      eventType: 'delivered',
      providerPayloadJson: { foo: 'bar' },
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationLogId: 'log-1',
        eventType: 'delivered',
        providerPayloadJson: { foo: 'bar' },
      }),
    );
  });

  it('defaults providerPayloadJson to null', async () => {
    await insertDeliveryEvent({
      notificationLogId: 'log-1',
      eventType: 'sent',
    });

    const valuesArg = mockValues.mock.calls[0][0];
    expect(valuesArg.providerPayloadJson).toBeNull();
  });

  it('returns the inserted row', async () => {
    const result = await insertDeliveryEvent({
      notificationLogId: 'log-1',
      eventType: 'sent',
    });

    expect(result).toEqual({ id: 'de-1' });
  });
});

describe('listDeliveryEventsForLog', () => {
  it('returns empty array if log does not belong to event', async () => {
    mockLimit.mockResolvedValueOnce([]); // log not found for event

    const result = await listDeliveryEventsForLog('log-1', 'evt-wrong');

    expect(result).toEqual([]);
  });

  it('returns delivery events when log belongs to event', async () => {
    mockLimit.mockResolvedValueOnce([{ id: 'log-1' }]); // log found
    mockOrderBy.mockReturnValue(Promise.resolve([{ id: 'de-1' }, { id: 'de-2' }]));

    const result = await listDeliveryEventsForLog('log-1', 'evt-1');

    expect(result).toEqual([{ id: 'de-1' }, { id: 'de-2' }]);
  });

  it('uses withEventScope for event isolation', async () => {
    const { withEventScope } = await import('@/lib/db/with-event-scope');
    mockLimit.mockResolvedValueOnce([{ id: 'log-1' }]);
    mockOrderBy.mockReturnValue(Promise.resolve([]));

    await listDeliveryEventsForLog('log-1', 'evt-1');

    expect(withEventScope).toHaveBeenCalled();
  });
});

describe('findLogByProviderMessageId', () => {
  it('returns log when found', async () => {
    mockLimit.mockResolvedValueOnce([{ id: 'log-1', providerMessageId: 'msg-1' }]);

    const result = await findLogByProviderMessageId('msg-1');

    expect(result).toEqual({ id: 'log-1', providerMessageId: 'msg-1' });
  });

  it('returns null when not found', async () => {
    mockLimit.mockResolvedValueOnce([]);

    const result = await findLogByProviderMessageId('nonexistent');

    expect(result).toBeNull();
  });
});

describe('updateLogStatus (CAS)', () => {
  it('updates status with DB-level CAS for sent', async () => {
    await updateLogStatus('log-1', 'sent', '2026-01-01T00:00:00Z');

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.status).toBe('sent');
    expect(setArg.sentAt).toBeInstanceOf(Date);
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  it('sets deliveredAt for delivered status', async () => {
    await updateLogStatus('log-1', 'delivered', '2026-01-01T00:00:00Z');

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.status).toBe('delivered');
    expect(setArg.deliveredAt).toBeInstanceOf(Date);
  });

  it('sets readAt for read status', async () => {
    await updateLogStatus('log-1', 'read', '2026-01-01T00:00:00Z');

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.readAt).toBeInstanceOf(Date);
  });

  it('sets failedAt for failed status', async () => {
    await updateLogStatus('log-1', 'failed', '2026-01-01T00:00:00Z');

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.failedAt).toBeInstanceOf(Date);
  });

  it('returns null when CAS rejects the update', async () => {
    mockReturning.mockResolvedValueOnce([]);

    const result = await updateLogStatus('log-1', 'sent', '2026-01-01T00:00:00Z');

    expect(result).toBeNull();
  });

  it('returns the updated row on success', async () => {
    mockReturning.mockResolvedValueOnce([{ id: 'log-1', status: 'sent' }]);

    const result = await updateLogStatus('log-1', 'sent', '2026-01-01T00:00:00Z');

    expect(result).toEqual({ id: 'log-1', status: 'sent' });
  });
});
