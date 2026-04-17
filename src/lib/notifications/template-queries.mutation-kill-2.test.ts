/**
 * Mutation-killing tests Round 2 for template-queries.ts
 *
 * Targets: 25 Survived ConditionalExpression in updateTemplate
 * (if field !== undefined → updateData.field = ...).
 * Strategy: Verify fields are NOT set when omitted from input.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const VALID_TEMPLATE_ID = '660e8400-e29b-41d4-a716-446655440000';

const { mockReturning, mockLimit, mockOrderBy, mockWhere, mockSet, mockValues, mockFrom, mockWithEventScope, mockEventIdParse, mockSql, dbChain } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockLimit = vi.fn();
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn();
  const mockSet = vi.fn();
  const mockValues = vi.fn();
  const mockFrom = vi.fn();
  const mockWithEventScope = vi.fn((...args: unknown[]) => ({ _type: 'withEventScope', args }));
  const mockEventIdParse = vi.fn((value: unknown) => value);
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
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = mockFrom.mockReturnValue(chain);
  chain.values = mockValues.mockReturnValue(chain);
  chain.set = mockSet.mockReturnValue(chain);
  chain.where = mockWhere.mockReturnValue(chain);
  chain.returning = mockReturning.mockResolvedValue([{ id: 'tpl-1', versionNo: 1 }]);
  chain.limit = mockLimit.mockResolvedValue([{ id: 'tpl-1', versionNo: 1 }]);
  chain.orderBy = mockOrderBy.mockReturnValue(chain);

  return {
    mockReturning,
    mockLimit,
    mockOrderBy,
    mockWhere,
    mockSet,
    mockValues,
    mockFrom,
    mockWithEventScope,
    mockEventIdParse,
    mockSql,
    dbChain: chain,
  };
});

vi.mock('@/lib/db', () => ({ db: { insert: dbChain.insert, update: dbChain.update, delete: dbChain.delete, select: dbChain.select } }));
vi.mock('@/lib/db/schema', () => ({ notificationTemplates: { id: 'id', eventId: 'eventId', channel: 'channel', templateKey: 'templateKey', status: 'status', metaCategory: 'metaCategory', versionNo: 'versionNo', updatedAt: 'updatedAt' } }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn((...a: unknown[]) => ({ _type: 'eq', a })), and: vi.fn((...a: unknown[]) => ({ _type: 'and', a })), isNull: vi.fn((c: unknown) => ({ _type: 'isNull', c })), desc: vi.fn((c: unknown) => ({ _type: 'desc', c })), sql: mockSql }));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: mockWithEventScope }));
vi.mock('@/lib/validations/event', () => ({ eventIdSchema: { parse: mockEventIdParse } }));

import { updateTemplate, listTemplatesForEvent, getTemplateById } from './template-queries';

beforeEach(() => {
  vi.clearAllMocks();
  mockReturning.mockResolvedValue([{ id: 'tpl-1', versionNo: 1 }]);
  mockLimit.mockResolvedValue([{ id: 'tpl-1', versionNo: 1 }]);
  mockWhere.mockReturnValue(dbChain);
  mockOrderBy.mockReturnValue(dbChain);
  mockFrom.mockReturnValue(dbChain);
  mockEventIdParse.mockImplementation((value: unknown) => value);
});

describe('updateTemplate — negative assertions (fields NOT set when omitted)', () => {
  it('does not set templateName when not provided', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', updatedBy: 'u' });
    const s = mockSet.mock.calls[0][0];
    expect(s).not.toHaveProperty('templateName');
  });

  it('does not set status when not provided', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', updatedBy: 'u' });
    const s = mockSet.mock.calls[0][0];
    expect(s).not.toHaveProperty('status');
    expect(s).not.toHaveProperty('lastActivatedAt');
    expect(s).not.toHaveProperty('archivedAt');
  });

  it('does not set subjectLine when not provided', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', updatedBy: 'u' });
    const s = mockSet.mock.calls[0][0];
    expect(s).not.toHaveProperty('subjectLine');
  });

  it('does not set bodyContent when not provided', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', updatedBy: 'u' });
    const s = mockSet.mock.calls[0][0];
    expect(s).not.toHaveProperty('bodyContent');
  });

  it('does not set previewText when not provided', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', updatedBy: 'u' });
    const s = mockSet.mock.calls[0][0];
    expect(s).not.toHaveProperty('previewText');
  });

  it('does not set allowedVariablesJson when not provided', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', updatedBy: 'u' });
    const s = mockSet.mock.calls[0][0];
    expect(s).not.toHaveProperty('allowedVariablesJson');
  });

  it('does not set requiredVariablesJson when not provided', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', updatedBy: 'u' });
    const s = mockSet.mock.calls[0][0];
    expect(s).not.toHaveProperty('requiredVariablesJson');
  });

  it('does not set brandingMode when not provided', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', updatedBy: 'u' });
    const s = mockSet.mock.calls[0][0];
    expect(s).not.toHaveProperty('brandingMode');
  });

  it('does not set customBrandingJson when not provided', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', updatedBy: 'u' });
    const s = mockSet.mock.calls[0][0];
    expect(s).not.toHaveProperty('customBrandingJson');
  });

  it('does not set notes when not provided', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', updatedBy: 'u' });
    const s = mockSet.mock.calls[0][0];
    expect(s).not.toHaveProperty('notes');
  });

  it('does not increment versionNo when neither bodyContent nor subjectLine changes', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', templateName: 'New', updatedBy: 'u' });
    const s = mockSet.mock.calls[0][0];
    expect(s).not.toHaveProperty('versionNo');
  });

  it('does not set archivedAt or lastActivatedAt when status is draft', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', status: 'draft', updatedBy: 'u' });
    const s = mockSet.mock.calls[0][0];
    expect(s.status).toBe('draft');
    expect(s).not.toHaveProperty('lastActivatedAt');
    expect(s).not.toHaveProperty('archivedAt');
  });
});

describe('getTemplateById — undefined eventId path', () => {
  it('rejects unscoped reads when eventId is undefined', async () => {
    mockEventIdParse.mockImplementation(() => {
      throw new Error('Invalid event ID');
    });

    await expect(getTemplateById(VALID_TEMPLATE_ID, undefined as never)).rejects.toThrow('Invalid event ID');
    expect(mockWhere).not.toHaveBeenCalled();
  });
});

describe('listTemplatesForEvent — no filters', () => {
  it('returns both event and global templates', async () => {
    mockOrderBy.mockReturnValueOnce(Promise.resolve([{ id: 'e1' }]));
    mockOrderBy.mockReturnValueOnce(Promise.resolve([{ id: 'g1' }]));

    const result = await listTemplatesForEvent('evt-1');

    expect(result).toEqual({
      eventTemplates: [{ id: 'e1' }],
      globalTemplates: [{ id: 'g1' }],
    });
  });
});
