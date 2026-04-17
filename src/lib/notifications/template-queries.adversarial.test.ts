import { beforeEach, describe, expect, it, vi } from 'vitest';

const VALID_EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_TEMPLATE_ID = '660e8400-e29b-41d4-a716-446655440000';

const {
  mockWhere,
  mockOrderBy,
  mockLimit,
  mockReturning,
  mockSet,
  mockValues,
  mockFrom,
  mockWithEventScope,
  mockEventIdParse,
  mockSql,
  dbChain,
} = vi.hoisted(() => {
  const mockWhere = vi.fn();
  const mockOrderBy = vi.fn();
  const mockLimit = vi.fn();
  const mockReturning = vi.fn();
  const mockSet = vi.fn();
  const mockValues = vi.fn();
  const mockFrom = vi.fn();
  const mockWithEventScope = vi.fn((...args: unknown[]) => ({ _type: 'withEventScope', args }));
  const mockEventIdParse = vi.fn((value: unknown) => {
    if (value === 'not-a-uuid' || value === undefined) {
      throw new Error('Invalid event ID');
    }
    return value;
  });
  const mockSql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      _type: 'sql',
      strings: [...strings],
      values,
    }),
    { __esModule: true },
  );

  const chain: Record<string, any> = {};
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = mockFrom.mockReturnValue(chain);
  chain.values = mockValues.mockReturnValue(chain);
  chain.set = mockSet.mockReturnValue(chain);
  chain.where = mockWhere.mockReturnValue(chain);
  chain.orderBy = mockOrderBy.mockResolvedValue([]);
  chain.limit = mockLimit.mockResolvedValue([]);
  chain.returning = mockReturning.mockResolvedValue([{ id: '660e8400-e29b-41d4-a716-446655440000' }]);

  return {
    mockWhere,
    mockOrderBy,
    mockLimit,
    mockReturning,
    mockSet,
    mockValues,
    mockFrom,
    mockWithEventScope,
    mockEventIdParse,
    mockSql,
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
  notificationTemplates: {
    id: 'id',
    eventId: 'eventId',
    channel: 'channel',
    templateKey: 'templateKey',
    status: 'status',
    metaCategory: 'metaCategory',
    versionNo: 'versionNo',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ _type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  isNull: vi.fn((column: unknown) => ({ _type: 'isNull', column })),
  desc: vi.fn((column: unknown) => ({ _type: 'desc', column })),
  sql: mockSql,
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: mockWithEventScope,
}));

vi.mock('@/lib/validations/event', () => ({
  eventIdSchema: {
    parse: mockEventIdParse,
  },
}));

import {
  createEventOverride,
  getTemplateById,
  listTemplatesForEvent,
  updateTemplate,
} from './template-queries';

beforeEach(() => {
  vi.clearAllMocks();
  mockWhere.mockReturnValue(dbChain);
  mockOrderBy.mockResolvedValue([]);
  mockLimit.mockResolvedValue([]);
  mockReturning.mockResolvedValue([{ id: VALID_TEMPLATE_ID }]);
  mockFrom.mockReturnValue(dbChain);
  mockEventIdParse.mockImplementation((value: unknown) => {
    if (value === 'not-a-uuid' || value === undefined) {
      throw new Error('Invalid event ID');
    }
    return value;
  });
});

describe('template query hardening', () => {
  it('rejects malformed event scopes before listing templates', async () => {
    await expect(listTemplatesForEvent('not-a-uuid')).rejects.toThrow('Invalid event ID');
    expect(mockWhere).not.toHaveBeenCalled();
  });

  it('rejects unscoped template reads before hitting the database', async () => {
    await expect(getTemplateById(VALID_TEMPLATE_ID, undefined as never)).rejects.toThrow('Invalid event ID');
    expect(mockWhere).not.toHaveBeenCalled();
  });

  it('rejects malformed event IDs before creating an event override', async () => {
    await expect(createEventOverride(VALID_TEMPLATE_ID, 'not-a-uuid', 'user-1')).rejects.toThrow('Invalid event ID');
    expect(dbChain.select).not.toHaveBeenCalled();
    expect(dbChain.insert).not.toHaveBeenCalled();
  });

  it('increments template versions atomically on content updates', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, {
      eventId: VALID_EVENT_ID,
      bodyContent: 'updated body',
      updatedBy: 'user-2',
    });

    expect(dbChain.select).not.toHaveBeenCalled();
    expect(mockSet.mock.calls[0][0].versionNo).toMatchObject({ _type: 'sql' });
  });
});
