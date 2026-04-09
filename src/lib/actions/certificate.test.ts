import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockRevalidatePath, mockAssertEventAccess } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'user_123' }),
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

import {
  createCertificateTemplate,
  updateCertificateTemplate,
  activateCertificateTemplate,
  archiveCertificateTemplate,
  listCertificateTemplates,
  getCertificateTemplate,
} from './certificate';

// ── Chain helpers ─────────────────────────────────────────────
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

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TEMPLATE_ID = '550e8400-e29b-41d4-a716-446655440001';

const validCreateInput = {
  templateName: 'Delegate Attendance Certificate',
  certificateType: 'delegate_attendance' as const,
  audienceScope: 'delegate' as const,
  templateJson: { schemas: [], basePdf: 'data:...' },
};

const mockTemplate = {
  id: TEMPLATE_ID,
  eventId: EVENT_ID,
  templateName: 'Delegate Attendance Certificate',
  certificateType: 'delegate_attendance',
  audienceScope: 'delegate',
  templateJson: { schemas: [], basePdf: 'data:...' },
  pageSize: 'A4_landscape',
  orientation: 'landscape',
  status: 'draft',
  versionNo: 1,
  createdBy: 'user_123',
  updatedBy: 'user_123',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
  mockDb.transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
});

// ── List ─────────────────────────────────────────────────────
describe('listCertificateTemplates', () => {
  it('returns templates for the event', async () => {
    chainedSelect([mockTemplate]);

    const result = await listCertificateTemplates(EVENT_ID);
    expect(result).toEqual([mockTemplate]);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID);
  });

  it('returns empty array when no templates exist', async () => {
    chainedSelect([]);
    const result = await listCertificateTemplates(EVENT_ID);
    expect(result).toEqual([]);
  });
});

// ── Get ──────────────────────────────────────────────────────
describe('getCertificateTemplate', () => {
  it('returns a template by ID', async () => {
    chainedSelect([mockTemplate]);

    const result = await getCertificateTemplate(EVENT_ID, TEMPLATE_ID);
    expect(result).toEqual(mockTemplate);
  });

  it('throws when template not found', async () => {
    chainedSelect([]);
    await expect(getCertificateTemplate(EVENT_ID, TEMPLATE_ID)).rejects.toThrow('Certificate template not found');
  });
});

// ── Create ───────────────────────────────────────────────────
describe('createCertificateTemplate', () => {
  it('creates a template with correct fields', async () => {
    chainedInsert([mockTemplate]);

    const result = await createCertificateTemplate(EVENT_ID, validCreateInput);
    expect(result).toEqual(mockTemplate);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/certificates`);
  });

  it('rejects invalid input', async () => {
    await expect(createCertificateTemplate(EVENT_ID, {})).rejects.toThrow();
  });

  it('rejects unauthorized access', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));
    await expect(createCertificateTemplate(EVENT_ID, validCreateInput)).rejects.toThrow('Forbidden');
  });

  it('applies default file name pattern when not provided (CP-16)', async () => {
    const insertChain = chainedInsert([{
      ...mockTemplate,
      defaultFileNamePattern: '{{full_name}}-{{event_name}}-certificate.pdf',
    }]);

    await createCertificateTemplate(EVENT_ID, validCreateInput);
    // Verify the insert was called with the default pattern
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.defaultFileNamePattern).toBe('{{full_name}}-{{event_name}}-certificate.pdf');
  });
});

// ── Update ───────────────────────────────────────────────────
describe('updateCertificateTemplate', () => {
  it('updates a draft template', async () => {
    const updated = { ...mockTemplate, templateName: 'Updated Name' };
    chainedSelect([mockTemplate]);
    chainedUpdate([updated]);

    const result = await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'Updated Name',
    });
    expect(result.templateName).toBe('Updated Name');
  });

  it('throws when template not found', async () => {
    chainedSelect([]);
    await expect(updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'Updated',
    })).rejects.toThrow('Certificate template not found');
  });

  it('throws when updating archived template', async () => {
    chainedSelect([{ ...mockTemplate, status: 'archived' }]);
    await expect(updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'Updated',
    })).rejects.toThrow('Cannot update an archived template');
  });

  it('bumps version when updating active template JSON', async () => {
    const activeTemplate = { ...mockTemplate, status: 'active', versionNo: 2 };
    chainedSelect([activeTemplate]);
    const updatedResult = { ...activeTemplate, versionNo: 3 };
    chainedUpdate([updatedResult]);

    const result = await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateJson: { schemas: [{ updated: true }] },
    });
    expect(result.versionNo).toBe(3);
  });
});

// ── Activate ─────────────────────────────────────────────────
describe('activateCertificateTemplate', () => {
  it('activates a draft template', async () => {
    // First select: fetch the template
    chainedSelect([mockTemplate]);
    // Then update: archive existing + activate this one
    chainedUpdate([{ ...mockTemplate, status: 'active' }]);

    const result = await activateCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    expect(result.status).toBe('active');
  });

  it('throws when template not found', async () => {
    chainedSelect([]);
    await expect(activateCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID }))
      .rejects.toThrow('Certificate template not found');
  });

  it('throws when activating an active template', async () => {
    chainedSelect([{ ...mockTemplate, status: 'active' }]);
    await expect(activateCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID }))
      .rejects.toThrow('Cannot activate a template with status "active"');
  });
});

// ── Archive ──────────────────────────────────────────────────
describe('archiveCertificateTemplate', () => {
  it('archives a draft template', async () => {
    chainedSelect([mockTemplate]);
    chainedUpdate([{ ...mockTemplate, status: 'archived' }]);

    const result = await archiveCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    expect(result.status).toBe('archived');
  });

  it('archives an active template', async () => {
    chainedSelect([{ ...mockTemplate, status: 'active' }]);
    chainedUpdate([{ ...mockTemplate, status: 'archived' }]);

    const result = await archiveCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    expect(result.status).toBe('archived');
  });

  it('throws when template not found', async () => {
    chainedSelect([]);
    await expect(archiveCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID }))
      .rejects.toThrow('Certificate template not found');
  });

  it('throws when already archived', async () => {
    chainedSelect([{ ...mockTemplate, status: 'archived' }]);
    await expect(archiveCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID }))
      .rejects.toThrow('Cannot archive a template with status "archived"');
  });
});
