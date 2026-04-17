/**
 * Mutation-killing tests for template-queries.ts
 *
 * Targets: 131 NoCoverage mutations in DB query functions.
 * Strategy: Mock drizzle db to capture values/set/where args,
 * then assert exact field mapping from input to DB call.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const VALID_TEMPLATE_ID = '660e8400-e29b-41d4-a716-446655440000';
const OTHER_TEMPLATE_ID = '770e8400-e29b-41d4-a716-446655440000';

// vi.hoisted ensures these are available inside vi.mock factories
const { mockReturning, mockLimit, mockOrderBy, mockWhere, mockSet, mockValues, mockFrom, mockInnerJoin, mockWithEventScope, mockEventIdParse, mockSql, dbChain } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockLimit = vi.fn();
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn();
  const mockSet = vi.fn();
  const mockValues = vi.fn();
  const mockFrom = vi.fn();
  const mockInnerJoin = vi.fn();
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
  chain.innerJoin = mockInnerJoin.mockReturnValue(chain);

  return {
    mockReturning,
    mockLimit,
    mockOrderBy,
    mockWhere,
    mockSet,
    mockValues,
    mockFrom,
    mockInnerJoin,
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
    delete: dbChain.delete,
    select: dbChain.select,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  notificationTemplates: {
    id: 'id', eventId: 'eventId', channel: 'channel', templateKey: 'templateKey',
    status: 'status', metaCategory: 'metaCategory', versionNo: 'versionNo', updatedAt: 'updatedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ _type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  isNull: vi.fn((col: unknown) => ({ _type: 'isNull', col })),
  desc: vi.fn((col: unknown) => ({ _type: 'desc', col })),
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
  createTemplate,
  updateTemplate,
  getTemplateById,
  archiveTemplate,
  listTemplatesForEvent,
  createEventOverride,
} from './template-queries';

beforeEach(() => {
  vi.clearAllMocks();
  mockReturning.mockResolvedValue([{ id: 'tpl-1', versionNo: 1 }]);
  mockLimit.mockResolvedValue([{ id: 'tpl-1', versionNo: 1 }]);
  mockWhere.mockReturnValue(dbChain);
  mockOrderBy.mockReturnValue(dbChain);
  mockFrom.mockReturnValue(dbChain);
  mockEventIdParse.mockImplementation((value: unknown) => value);
});

describe('createTemplate', () => {
  it('maps all input fields to db.insert().values() with correct defaults', async () => {
    const input = {
      eventId: 'evt-1', templateKey: 'registration_confirmation', channel: 'email' as const,
      templateName: 'Registration Confirmation', metaCategory: 'registration',
      triggerType: 'registration.created', sendMode: 'automatic' as const, status: 'active' as const,
      subjectLine: 'Welcome {{name}}', bodyContent: '<p>Hello {{name}}</p>',
      previewText: 'Welcome to the event', allowedVariablesJson: ['name', 'eventName'],
      requiredVariablesJson: ['name'], brandingMode: 'event_branding' as const,
      customBrandingJson: { color: '#fff' }, whatsappTemplateName: 'reg_confirm',
      whatsappLanguageCode: 'en', isSystemTemplate: true, notes: 'Test template', createdBy: 'user-1',
    };

    await createTemplate(input);

    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'evt-1', templateKey: 'registration_confirmation', channel: 'email',
      templateName: 'Registration Confirmation', metaCategory: 'registration',
      triggerType: 'registration.created', sendMode: 'automatic', status: 'active',
      subjectLine: 'Welcome {{name}}', bodyContent: '<p>Hello {{name}}</p>',
      previewText: 'Welcome to the event', allowedVariablesJson: ['name', 'eventName'],
      requiredVariablesJson: ['name'], brandingMode: 'event_branding',
      customBrandingJson: { color: '#fff' }, whatsappTemplateName: 'reg_confirm',
      whatsappLanguageCode: 'en', isSystemTemplate: true, notes: 'Test template',
      createdBy: 'user-1', updatedBy: 'user-1',
    }));
  });

  it('applies ?? null defaults when optional fields are undefined', async () => {
    await createTemplate({
      eventId: null, templateKey: 'test_key', channel: 'email' as const,
      templateName: 'Test', metaCategory: 'system', bodyContent: '<p>Test</p>', createdBy: 'user-1',
    });

    const v = mockValues.mock.calls[0][0];
    expect(v.triggerType).toBeNull();
    expect(v.sendMode).toBe('manual');
    expect(v.status).toBe('draft');
    expect(v.subjectLine).toBeNull();
    expect(v.previewText).toBeNull();
    expect(v.allowedVariablesJson).toEqual([]);
    expect(v.requiredVariablesJson).toEqual([]);
    expect(v.brandingMode).toBe('event_branding');
    expect(v.customBrandingJson).toBeNull();
    expect(v.whatsappTemplateName).toBeNull();
    expect(v.whatsappLanguageCode).toBeNull();
    expect(v.isSystemTemplate).toBe(false);
    expect(v.notes).toBeNull();
  });

  it('returns the inserted template row', async () => {
    const result = await createTemplate({
      eventId: 'evt-1', templateKey: 'k', channel: 'email' as const,
      templateName: 'T', metaCategory: 'system', bodyContent: 'b', createdBy: 'u',
    });
    expect(result).toEqual({ id: 'tpl-1', versionNo: 1 });
  });
});

describe('updateTemplate', () => {
  it('always sets updatedBy and updatedAt', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', updatedBy: 'user-2' });
    const s = mockSet.mock.calls[0][0];
    expect(s.updatedBy).toBe('user-2');
    expect(s.updatedAt).toBeInstanceOf(Date);
  });

  it('conditionally adds fields only when provided', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, {
      eventId: 'evt-1', templateName: 'New Name', subjectLine: 'New Subject',
      bodyContent: 'New Body', previewText: 'New Preview',
      allowedVariablesJson: ['a'], requiredVariablesJson: ['b'],
      brandingMode: 'custom', customBrandingJson: { x: 1 }, notes: 'Updated notes', updatedBy: 'user-2',
    });
    const s = mockSet.mock.calls[0][0];
    expect(s.templateName).toBe('New Name');
    expect(s.subjectLine).toBe('New Subject');
    expect(s.bodyContent).toBe('New Body');
    expect(s.previewText).toBe('New Preview');
    expect(s.allowedVariablesJson).toEqual(['a']);
    expect(s.requiredVariablesJson).toEqual(['b']);
    expect(s.brandingMode).toBe('custom');
    expect(s.customBrandingJson).toEqual({ x: 1 });
    expect(s.notes).toBe('Updated notes');
  });

  it('sets lastActivatedAt when status changes to active', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', status: 'active', updatedBy: 'user-2' });
    const s = mockSet.mock.calls[0][0];
    expect(s.status).toBe('active');
    expect(s.lastActivatedAt).toBeInstanceOf(Date);
    expect(s.archivedAt).toBeNull();
  });

  it('sets archivedAt when status changes to archived', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', status: 'archived', updatedBy: 'user-2' });
    const s = mockSet.mock.calls[0][0];
    expect(s.archivedAt).toBeInstanceOf(Date);
  });

  it('increments versionNo when bodyContent changes', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', bodyContent: 'Updated body', updatedBy: 'user-2' });
    expect(mockSet.mock.calls[0][0].versionNo).toMatchObject({ _type: 'sql' });
  });

  it('increments versionNo when subjectLine changes', async () => {
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', subjectLine: 'New subject', updatedBy: 'user-2' });
    expect(mockSet.mock.calls[0][0].versionNo).toMatchObject({ _type: 'sql' });
  });

  it('uses isNull for global templates (eventId = null)', async () => {
    const { isNull } = await import('drizzle-orm');
    await updateTemplate(VALID_TEMPLATE_ID, { eventId: null, templateName: 'X', updatedBy: 'user-2' });
    expect(isNull).toHaveBeenCalled();
  });

  it('returns null when no row matches', async () => {
    mockReturning.mockResolvedValueOnce([]);
    const result = await updateTemplate(VALID_TEMPLATE_ID, { eventId: 'evt-1', updatedBy: 'user-2' });
    expect(result).toBeNull();
  });
});

describe('getTemplateById', () => {
  it('scopes by eventId when provided', async () => {
    await getTemplateById(VALID_TEMPLATE_ID, 'evt-1');
    expect(mockWithEventScope).toHaveBeenCalled();
  });

  it('uses isNull for global templates (eventId === null)', async () => {
    const { isNull } = await import('drizzle-orm');
    await getTemplateById(VALID_TEMPLATE_ID, null);
    expect(isNull).toHaveBeenCalled();
  });

  it('returns null when template not found', async () => {
    mockLimit.mockResolvedValueOnce([]);
    const result = await getTemplateById('00000000-0000-0000-0000-000000000000', null);
    expect(result).toBeNull();
  });
});

describe('archiveTemplate', () => {
  it('delegates to updateTemplate with archived status', async () => {
    await archiveTemplate(VALID_TEMPLATE_ID, 'evt-1', 'user-3');
    expect(mockSet.mock.calls[0][0].status).toBe('archived');
    expect(mockSet.mock.calls[0][0].updatedBy).toBe('user-3');
  });
});

describe('listTemplatesForEvent', () => {
  it('queries event-specific and global templates', async () => {
    mockOrderBy.mockReturnValue(Promise.resolve([]));
    await listTemplatesForEvent('evt-1');
    expect(dbChain.select).toHaveBeenCalledTimes(2);
  });

  it('applies channel filter when provided', async () => {
    const { eq } = await import('drizzle-orm');
    mockOrderBy.mockReturnValue(Promise.resolve([]));
    await listTemplatesForEvent('evt-1', { channel: 'email' });
    expect(eq).toHaveBeenCalled();
  });

  it('applies status and metaCategory filters', async () => {
    mockOrderBy.mockReturnValue(Promise.resolve([]));
    await listTemplatesForEvent('evt-1', { status: 'active', metaCategory: 'registration' });
    expect(mockWhere).toHaveBeenCalled();
  });
});

describe('createEventOverride', () => {
  it('throws when eventId is empty', async () => {
    mockEventIdParse.mockImplementation(() => {
      throw new Error('Invalid event ID');
    });
    await expect(createEventOverride(VALID_TEMPLATE_ID, '', 'user-1')).rejects.toThrow('Invalid event ID');
  });

  it('throws when eventId is whitespace', async () => {
    mockEventIdParse.mockImplementation(() => {
      throw new Error('Invalid event ID');
    });
    await expect(createEventOverride(VALID_TEMPLATE_ID, '   ', 'user-1')).rejects.toThrow('Invalid event ID');
  });

  it('throws when source template not found', async () => {
    mockLimit.mockResolvedValueOnce([]);
    await expect(createEventOverride(OTHER_TEMPLATE_ID, 'evt-1', 'user-1')).rejects.toThrow('not found');
  });

  it('throws when source template is not global', async () => {
    mockLimit.mockResolvedValueOnce([{ id: VALID_TEMPLATE_ID, eventId: 'evt-other', templateName: 'Test' }]);
    await expect(createEventOverride(VALID_TEMPLATE_ID, 'evt-1', 'user-1')).rejects.toThrow('not a global template');
  });

  it('creates event override from global template with correct fields', async () => {
    mockLimit.mockResolvedValueOnce([{
      id: VALID_TEMPLATE_ID, eventId: null, templateKey: 'registration_confirmation', channel: 'email',
      templateName: 'Registration Confirmation', metaCategory: 'registration', triggerType: 'registration.created',
      sendMode: 'automatic', subjectLine: 'Welcome', bodyContent: '<p>Hello</p>', previewText: 'Preview',
      allowedVariablesJson: ['name'], requiredVariablesJson: ['name'], brandingMode: 'event_branding',
      customBrandingJson: null, whatsappTemplateName: null, whatsappLanguageCode: null,
    }]);

    await createEventOverride(VALID_TEMPLATE_ID, 'evt-1', 'user-1');

    const v = mockValues.mock.calls[0][0];
    expect(v.eventId).toBe('evt-1');
    expect(v.templateName).toBe('Registration Confirmation (Event Override)');
    expect(v.status).toBe('draft');
    expect(v.isSystemTemplate).toBe(false);
    expect(v.notes).toContain('Override of global template');
    expect(v.createdBy).toBe('user-1');
  });
});
