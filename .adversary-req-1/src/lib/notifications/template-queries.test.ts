import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));
vi.mock('@/lib/db/schema', () => ({
  notificationTemplates: {
    id: 'id',
    eventId: 'eventId',
    channel: 'channel',
    templateKey: 'templateKey',
    status: 'status',
    updatedAt: 'updatedAt',
    versionNo: 'versionNo',
  },
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((column, value) => ({ op: 'eq', column, value })),
  and: vi.fn((...conditions) => ({ op: 'and', conditions })),
  isNull: vi.fn((column) => ({ op: 'isNull', column })),
  desc: vi.fn((column) => ({ op: 'desc', column })),
}));

import { createEventOverride, updateTemplate } from './template-queries';

function chainedSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

function chainedInsert(rows: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.insert.mockReturnValue(chain);
  return chain;
}

function chainedUpdate(rows: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.update.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createEventOverride', () => {
  it('rejects blank eventId instead of creating an invalid override', async () => {
    chainedSelect([
      {
        id: 'global-template-id',
        eventId: null,
        templateKey: 'registration_confirmation',
        channel: 'email',
        templateName: 'Registration Confirmation',
        metaCategory: 'registration',
        triggerType: 'registration.created',
        sendMode: 'manual',
        subjectLine: 'Confirmed',
        bodyContent: 'Body',
        previewText: null,
        allowedVariablesJson: [],
        requiredVariablesJson: [],
        brandingMode: 'event_branding',
        customBrandingJson: null,
        whatsappTemplateName: null,
        whatsappLanguageCode: null,
      },
    ]);
    chainedInsert([{ id: 'override-template-id' }]);

    await expect(
      createEventOverride('global-template-id', '', 'user_123'),
    ).rejects.toThrow(/eventId/i);
  });
});

describe('updateTemplate', () => {
  it('clears archivedAt when reactivating an archived template', async () => {
    const updateChain = chainedUpdate([{ id: 'template-id', status: 'active' }]);

    await updateTemplate('template-id', {
      status: 'active',
      updatedBy: 'user_123',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.archivedAt).toBeNull();
  });
});
