import { beforeEach, describe, expect, it, vi } from 'vitest';

const VALID_EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const VALID_TRIGGER_ID = '660e8400-e29b-41d4-a716-446655440000';
const VALID_TEMPLATE_ID = '770e8400-e29b-41d4-a716-446655440000';
const FOREIGN_TEMPLATE_ID = '770e8400-e29b-41d4-a716-446655440001';

const {
  mockReturning,
  mockLimit,
  mockOrderBy,
  mockWhere,
  mockSet,
  mockValues,
  mockFrom,
  dbChain,
} = vi.hoisted(() => {
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
  chain.orderBy = mockOrderBy.mockResolvedValue([{ id: '660e8400-e29b-41d4-a716-446655440000' }]);

  return {
    mockReturning,
    mockLimit,
    mockOrderBy,
    mockWhere,
    mockSet,
    mockValues,
    mockFrom,
    dbChain: chain,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    insert: dbChain.insert,
    update: dbChain.update,
    delete: dbChain.delete,
    select: dbChain.select,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  automationTriggers: {
    id: 'id',
    eventId: 'eventId',
    triggerEventType: 'triggerEventType',
    channel: 'channel',
    isEnabled: 'isEnabled',
    createdAt: 'createdAt',
    priority: 'priority',
    templateId: 'templateId',
  },
  notificationTemplates: {
    id: 'id',
    eventId: 'eventId',
    channel: 'channel',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ _type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  desc: vi.fn((column: unknown) => ({ _type: 'desc', column })),
}));

import {
  createTrigger,
  getTriggerById,
  listTriggersForEvent,
  updateTrigger,
} from './trigger-queries';

beforeEach(() => {
  vi.clearAllMocks();
  mockWhere.mockReturnValue(dbChain);
  mockFrom.mockReturnValue(dbChain);
  mockValues.mockReturnValue(dbChain);
  mockSet.mockReturnValue(dbChain);
  mockReturning.mockResolvedValue([{ id: VALID_TRIGGER_ID }]);
  mockLimit.mockResolvedValue([{ id: VALID_TEMPLATE_ID, eventId: VALID_EVENT_ID, channel: 'email' }]);
  mockOrderBy.mockResolvedValue([{ id: VALID_TRIGGER_ID }]);
});

describe('trigger query hardening', () => {
  it('rejects malformed event IDs before listing trigger rows', async () => {
    await expect(listTriggersForEvent('not-a-uuid')).rejects.toThrow('Invalid event ID');

    expect(dbChain.select).not.toHaveBeenCalled();
  });

  it('rejects malformed trigger IDs before reading a trigger', async () => {
    await expect(getTriggerById('not-a-uuid', VALID_EVENT_ID)).rejects.toThrow('Invalid automation trigger ID');

    expect(dbChain.select).not.toHaveBeenCalled();
  });

  it('rejects template IDs from another event during trigger creation', async () => {
    mockLimit.mockResolvedValueOnce([{ id: FOREIGN_TEMPLATE_ID, eventId: OTHER_EVENT_ID }]);

    await expect(
      createTrigger({
        eventId: VALID_EVENT_ID,
        triggerEventType: 'registration.created',
        channel: 'email',
        templateId: FOREIGN_TEMPLATE_ID,
        recipientResolution: 'trigger_person',
        createdBy: 'user-1',
      }),
    ).rejects.toThrow('Notification template is outside the active event scope');

    expect(dbChain.insert).not.toHaveBeenCalled();
  });

  it('rejects template IDs from another event during trigger updates', async () => {
    mockLimit.mockResolvedValueOnce([{ id: FOREIGN_TEMPLATE_ID, eventId: OTHER_EVENT_ID }]);

    await expect(
      updateTrigger(VALID_TRIGGER_ID, {
        eventId: VALID_EVENT_ID,
        templateId: FOREIGN_TEMPLATE_ID,
        updatedBy: 'user-2',
      }),
    ).rejects.toThrow('Notification template is outside the active event scope');

    expect(dbChain.update).not.toHaveBeenCalled();
  });

  it('should reject trigger creation when the template channel does not match the trigger channel', async () => {
    mockLimit.mockResolvedValueOnce([{ id: VALID_TEMPLATE_ID, eventId: VALID_EVENT_ID, channel: 'whatsapp' }]);

    // BUG: createTrigger only checks event scope and lets email triggers point at WhatsApp templates.
    await expect(
      createTrigger({
        eventId: VALID_EVENT_ID,
        triggerEventType: 'registration.created',
        channel: 'email',
        templateId: VALID_TEMPLATE_ID,
        recipientResolution: 'trigger_person',
        createdBy: 'user-1',
      }),
    ).rejects.toThrow('Notification template channel does not match trigger channel');

    expect(dbChain.insert).not.toHaveBeenCalled();
  });
});
