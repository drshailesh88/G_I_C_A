/**
 * Mutation-killing tests for trigger-queries.ts
 *
 * Targets: 68 NoCoverage mutations in automation trigger CRUD.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  chain.returning = mockReturning.mockResolvedValue([{ id: 'trigger-1' }]);
  chain.limit = mockLimit.mockResolvedValue([{ id: 'trigger-1' }]);
  chain.orderBy = mockOrderBy.mockReturnValue(chain);
  chain.innerJoin = mockInnerJoin.mockReturnValue(chain);

  return { mockReturning, mockLimit, mockOrderBy, mockWhere, mockSet, mockValues, mockFrom, mockInnerJoin, dbChain: chain };
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
    templateId: 'templateId',
    isEnabled: 'isEnabled',
    createdAt: 'createdAt',
    priority: 'priority',
  },
  notificationTemplates: {
    id: 'id',
    eventId: 'eventId',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ _type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  desc: vi.fn((col: unknown) => ({ _type: 'desc', col })),
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn((...args: unknown[]) => ({ _type: 'withEventScope', args })),
}));

import {
  createTrigger,
  updateTrigger,
  listTriggersForEvent,
  getActiveTriggersForEventType,
  getTriggerById,
  deleteTrigger,
} from './trigger-queries';

beforeEach(() => {
  vi.clearAllMocks();
  mockReturning.mockResolvedValue([{ id: 'trigger-1' }]);
  mockLimit.mockResolvedValue([{ id: 'trigger-1' }]);
  mockWhere.mockReturnValue(dbChain);
  mockOrderBy.mockReturnValue(dbChain);
  mockFrom.mockReturnValue(dbChain);
  mockInnerJoin.mockReturnValue(dbChain);
});

describe('createTrigger', () => {
  it('maps all input fields with correct defaults', async () => {
    await createTrigger({
      eventId: 'evt-1',
      triggerEventType: 'registration.created',
      guardConditionJson: { minAge: 18 },
      channel: 'email',
      templateId: 'tpl-1',
      recipientResolution: 'person.email',
      delaySeconds: 60,
      idempotencyScope: 'custom_scope',
      isEnabled: false,
      priority: 10,
      notes: 'Test trigger',
      createdBy: 'user-1',
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-1',
        triggerEventType: 'registration.created',
        guardConditionJson: { minAge: 18 },
        channel: 'email',
        templateId: 'tpl-1',
        recipientResolution: 'person.email',
        delaySeconds: 60,
        idempotencyScope: 'custom_scope',
        isEnabled: false,
        priority: 10,
        notes: 'Test trigger',
        createdBy: 'user-1',
        updatedBy: 'user-1',
      }),
    );
  });

  it('applies ?? defaults for optional fields', async () => {
    await createTrigger({
      eventId: 'evt-1',
      triggerEventType: 'test',
      channel: 'email',
      templateId: 'tpl-1',
      recipientResolution: 'person.email',
      createdBy: 'user-1',
    });

    const valuesArg = mockValues.mock.calls[0][0];
    expect(valuesArg.guardConditionJson).toBeNull();
    expect(valuesArg.delaySeconds).toBe(0);
    expect(valuesArg.idempotencyScope).toBe('per_person_per_trigger_entity_per_channel');
    expect(valuesArg.isEnabled).toBe(true);
    expect(valuesArg.priority).toBeNull();
    expect(valuesArg.notes).toBeNull();
  });
});

describe('updateTrigger', () => {
  it('always sets updatedBy and updatedAt', async () => {
    await updateTrigger('trigger-1', {
      eventId: 'evt-1',
      updatedBy: 'user-2',
    });

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.updatedBy).toBe('user-2');
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  it('conditionally sets each field when provided', async () => {
    await updateTrigger('trigger-1', {
      eventId: 'evt-1',
      guardConditionJson: { x: 1 },
      templateId: 'tpl-2',
      recipientResolution: 'person.phone',
      delaySeconds: 120,
      idempotencyScope: 'new_scope',
      isEnabled: false,
      priority: 5,
      notes: 'Updated',
      updatedBy: 'user-2',
    });

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.guardConditionJson).toEqual({ x: 1 });
    expect(setArg.templateId).toBe('tpl-2');
    expect(setArg.recipientResolution).toBe('person.phone');
    expect(setArg.delaySeconds).toBe(120);
    expect(setArg.idempotencyScope).toBe('new_scope');
    expect(setArg.isEnabled).toBe(false);
    expect(setArg.priority).toBe(5);
    expect(setArg.notes).toBe('Updated');
  });

  it('returns null when no row matches', async () => {
    mockReturning.mockResolvedValueOnce([]);

    const result = await updateTrigger('nonexistent', {
      eventId: 'evt-1',
      updatedBy: 'user-2',
    });

    expect(result).toBeNull();
  });

  it('uses withEventScope for event isolation', async () => {
    const { withEventScope } = await import('@/lib/db/with-event-scope');

    await updateTrigger('trigger-1', {
      eventId: 'evt-1',
      updatedBy: 'user-2',
    });

    expect(withEventScope).toHaveBeenCalled();
  });
});

describe('listTriggersForEvent', () => {
  it('returns triggers for an event', async () => {
    mockOrderBy.mockReturnValue(Promise.resolve([{ id: 'trigger-1' }]));

    const result = await listTriggersForEvent('evt-1');

    expect(dbChain.select).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'trigger-1' }]);
  });

  it('applies triggerEventType filter', async () => {
    const { eq } = await import('drizzle-orm');
    mockOrderBy.mockReturnValue(Promise.resolve([]));

    await listTriggersForEvent('evt-1', { triggerEventType: 'registration.created' });

    expect(eq).toHaveBeenCalled();
  });

  it('applies channel filter', async () => {
    mockOrderBy.mockReturnValue(Promise.resolve([]));

    await listTriggersForEvent('evt-1', { channel: 'email' });

    expect(mockWhere).toHaveBeenCalled();
  });

  it('applies isEnabled filter', async () => {
    const { eq } = await import('drizzle-orm');
    mockOrderBy.mockReturnValue(Promise.resolve([]));

    await listTriggersForEvent('evt-1', { isEnabled: true });

    expect(eq).toHaveBeenCalled();
  });

  it('applies isEnabled=false filter', async () => {
    mockOrderBy.mockReturnValue(Promise.resolve([]));

    await listTriggersForEvent('evt-1', { isEnabled: false });

    expect(mockWhere).toHaveBeenCalled();
  });
});

describe('getActiveTriggersForEventType', () => {
  it('queries with event scope and filters active triggers', async () => {
    const { withEventScope } = await import('@/lib/db/with-event-scope');
    // Return rows that pass the post-filter
    mockOrderBy.mockReturnValue(
      Promise.resolve([
        { trigger: { id: 't1' }, template: { eventId: 'evt-1' } },
        { trigger: { id: 't2' }, template: { eventId: null } }, // global
        { trigger: { id: 't3' }, template: { eventId: 'evt-other' } }, // cross-event
      ]),
    );

    const result = await getActiveTriggersForEventType('evt-1', 'registration.created');

    expect(withEventScope).toHaveBeenCalled();
    expect(mockInnerJoin).toHaveBeenCalled();
    // Post-filter should exclude cross-event template
    expect(result).toHaveLength(2);
    expect(result[0].trigger.id).toBe('t1');
    expect(result[1].trigger.id).toBe('t2');
  });
});

describe('getTriggerById', () => {
  it('returns trigger scoped by eventId', async () => {
    const result = await getTriggerById('trigger-1', 'evt-1');

    expect(result).toEqual({ id: 'trigger-1' });
  });

  it('returns null when not found', async () => {
    mockLimit.mockResolvedValueOnce([]);

    const result = await getTriggerById('nonexistent', 'evt-1');

    expect(result).toBeNull();
  });
});

describe('deleteTrigger', () => {
  it('deletes and returns the trigger', async () => {
    const result = await deleteTrigger('trigger-1', 'evt-1');

    expect(dbChain.delete).toHaveBeenCalled();
    expect(mockReturning).toHaveBeenCalled();
    expect(result).toEqual({ id: 'trigger-1' });
  });

  it('returns null when trigger not found', async () => {
    mockReturning.mockResolvedValueOnce([]);

    const result = await deleteTrigger('nonexistent', 'evt-1');

    expect(result).toBeNull();
  });
});
