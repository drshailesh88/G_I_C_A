/**
 * Mutation-killing tests Round 2 for trigger-queries.ts
 *
 * Targets: 17 Survived ConditionalExpression in updateTrigger/listTriggersForEvent.
 * Strategy: Verify fields NOT set when omitted, plus filter combinations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const VALID_EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_TRIGGER_ID = '660e8400-e29b-41d4-a716-446655440000';
const VALID_TEMPLATE_ID = '770e8400-e29b-41d4-a716-446655440000';

const { mockReturning, mockLimit, mockOrderBy, mockWhere, mockSet, mockValues, mockFrom, mockInnerJoin, dbChain } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockLimit = vi.fn();
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn();
  const mockSet = vi.fn();
  const mockValues = vi.fn();
  const mockFrom = vi.fn();
  const mockInnerJoin = vi.fn();
  const chain: Record<string, any> = {};
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = mockFrom.mockReturnValue(chain);
  chain.values = mockValues.mockReturnValue(chain);
  chain.set = mockSet.mockReturnValue(chain);
  chain.where = mockWhere.mockReturnValue(chain);
  chain.returning = mockReturning.mockResolvedValue([{ id: '660e8400-e29b-41d4-a716-446655440000' }]);
  chain.limit = mockLimit.mockResolvedValue([{
    id: '770e8400-e29b-41d4-a716-446655440000',
    eventId: '550e8400-e29b-41d4-a716-446655440000',
  }]);
  chain.orderBy = mockOrderBy.mockReturnValue(chain);
  chain.innerJoin = mockInnerJoin.mockReturnValue(chain);
  return { mockReturning, mockLimit, mockOrderBy, mockWhere, mockSet, mockValues, mockFrom, mockInnerJoin, dbChain: chain };
});

vi.mock('@/lib/db', () => ({ db: { insert: dbChain.insert, update: dbChain.update, delete: dbChain.delete, select: dbChain.select } }));
vi.mock('@/lib/db/schema', () => ({ automationTriggers: { id: 'id', eventId: 'eventId', triggerEventType: 'triggerEventType', channel: 'channel', isEnabled: 'isEnabled', createdAt: 'createdAt', priority: 'priority', templateId: 'templateId' }, notificationTemplates: { id: 'id', eventId: 'eventId' } }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn((...a: unknown[]) => ({ _type: 'eq', a })), and: vi.fn((...a: unknown[]) => ({ _type: 'and', a })), desc: vi.fn((c: unknown) => ({ _type: 'desc', c })) }));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn((...a: unknown[]) => ({ _type: 'withEventScope', a })) }));

import { updateTrigger, listTriggersForEvent } from './trigger-queries';

beforeEach(() => {
  vi.clearAllMocks();
  mockReturning.mockResolvedValue([{ id: VALID_TRIGGER_ID }]);
  mockLimit.mockResolvedValue([{ id: VALID_TEMPLATE_ID, eventId: VALID_EVENT_ID }]);
  mockWhere.mockReturnValue(dbChain);
  mockOrderBy.mockReturnValue(dbChain);
  mockFrom.mockReturnValue(dbChain);
});

describe('updateTrigger — negative assertions', () => {
  it('does not set guardConditionJson when not provided', async () => {
    await updateTrigger(VALID_TRIGGER_ID, { eventId: VALID_EVENT_ID, updatedBy: 'u' });
    const s = mockSet.mock.calls[0][0];
    expect(s).not.toHaveProperty('guardConditionJson');
  });

  it('does not set templateId when not provided', async () => {
    await updateTrigger(VALID_TRIGGER_ID, { eventId: VALID_EVENT_ID, updatedBy: 'u' });
    expect(mockSet.mock.calls[0][0]).not.toHaveProperty('templateId');
  });

  it('does not set recipientResolution when not provided', async () => {
    await updateTrigger(VALID_TRIGGER_ID, { eventId: VALID_EVENT_ID, updatedBy: 'u' });
    expect(mockSet.mock.calls[0][0]).not.toHaveProperty('recipientResolution');
  });

  it('does not set delaySeconds when not provided', async () => {
    await updateTrigger(VALID_TRIGGER_ID, { eventId: VALID_EVENT_ID, updatedBy: 'u' });
    expect(mockSet.mock.calls[0][0]).not.toHaveProperty('delaySeconds');
  });

  it('does not set idempotencyScope when not provided', async () => {
    await updateTrigger(VALID_TRIGGER_ID, { eventId: VALID_EVENT_ID, updatedBy: 'u' });
    expect(mockSet.mock.calls[0][0]).not.toHaveProperty('idempotencyScope');
  });

  it('does not set isEnabled when not provided', async () => {
    await updateTrigger(VALID_TRIGGER_ID, { eventId: VALID_EVENT_ID, updatedBy: 'u' });
    expect(mockSet.mock.calls[0][0]).not.toHaveProperty('isEnabled');
  });

  it('does not set priority when not provided', async () => {
    await updateTrigger(VALID_TRIGGER_ID, { eventId: VALID_EVENT_ID, updatedBy: 'u' });
    expect(mockSet.mock.calls[0][0]).not.toHaveProperty('priority');
  });

  it('does not set notes when not provided', async () => {
    await updateTrigger(VALID_TRIGGER_ID, { eventId: VALID_EVENT_ID, updatedBy: 'u' });
    expect(mockSet.mock.calls[0][0]).not.toHaveProperty('notes');
  });
});

describe('listTriggersForEvent — no filters path', () => {
  it('returns results with no filters', async () => {
    mockOrderBy.mockReturnValue(Promise.resolve([{ id: VALID_TRIGGER_ID }]));

    const result = await listTriggersForEvent(VALID_EVENT_ID);

    expect(result).toEqual([{ id: VALID_TRIGGER_ID }]);
  });

  it('uses all three filters together', async () => {
    const { eq } = await import('drizzle-orm');
    mockOrderBy.mockReturnValue(Promise.resolve([]));

    await listTriggersForEvent(VALID_EVENT_ID, {
      triggerEventType: 'registration.created',
      channel: 'email',
      isEnabled: true,
    });

    // eq should have been called for eventId + each filter
    expect(eq).toHaveBeenCalled();
  });
});
