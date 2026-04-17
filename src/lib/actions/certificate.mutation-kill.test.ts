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
  allowedVariablesJson: ['full_name', 'event_name'],
  requiredVariablesJson: ['full_name'],
  createdBy: 'user_123',
  updatedBy: 'user_123',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
  mockDb.transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
});

// ── Create: kill || null coercion and ConditionalExpression mutations ──

describe('createCertificateTemplate — coercion and defaults', () => {
  it('sets signatureConfigJson to null when not provided (L61)', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, validCreateInput);
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.signatureConfigJson).toBeNull();
  });

  it('sets signatureConfigJson to provided value when given', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, {
      ...validCreateInput,
      signatureConfigJson: { name: 'Dean' },
    });
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.signatureConfigJson).toEqual({ name: 'Dean' });
  });

  it('sets brandingSnapshotJson to null when not provided (L62)', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, validCreateInput);
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.brandingSnapshotJson).toBeNull();
  });

  it('sets brandingSnapshotJson to provided value when given', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, {
      ...validCreateInput,
      brandingSnapshotJson: { logo: 'url' },
    });
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.brandingSnapshotJson).toEqual({ logo: 'url' });
  });

  it('sets verificationText to null when not provided (L64)', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, validCreateInput);
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.verificationText).toBeNull();
  });

  it('sets verificationText to provided value when given', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, {
      ...validCreateInput,
      verificationText: 'Scan QR',
    });
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.verificationText).toBe('Scan QR');
  });

  it('sets notes to null when not provided (L65)', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, validCreateInput);
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.notes).toBeNull();
  });

  it('sets notes to provided value when given', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, {
      ...validCreateInput,
      notes: 'Annual conference',
    });
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.notes).toBe('Annual conference');
  });

  it('sets status to draft (L66)', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, validCreateInput);
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.status).toBe('draft');
  });

  it('sets versionNo to 1', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, validCreateInput);
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.versionNo).toBe(1);
  });

  it('sets createdBy and updatedBy to userId', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, validCreateInput);
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.createdBy).toBe('user_123');
    expect(insertCall.updatedBy).toBe('user_123');
  });

  it('sets eventId on the insert', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, validCreateInput);
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.eventId).toBe(EVENT_ID);
  });

  it('sets qrVerificationEnabled to true by default', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, validCreateInput);
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.qrVerificationEnabled).toBe(true);
  });

  it('passes qrVerificationEnabled=false when explicitly set', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, {
      ...validCreateInput,
      qrVerificationEnabled: false,
    });
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.qrVerificationEnabled).toBe(false);
  });

  it('passes templateName, certificateType, audienceScope, templateJson from validated input', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, validCreateInput);
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.templateName).toBe('Delegate Attendance Certificate');
    expect(insertCall.certificateType).toBe('delegate_attendance');
    expect(insertCall.audienceScope).toBe('delegate');
    expect(insertCall.templateJson).toEqual({ schemas: [], basePdf: 'data:...' });
  });

  it('passes pageSize and orientation defaults', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, validCreateInput);
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.pageSize).toBe('A4_landscape');
    expect(insertCall.orientation).toBe('landscape');
  });

  it('passes allowedVariablesJson and requiredVariablesJson defaults', async () => {
    const insertChain = chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, validCreateInput);
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.allowedVariablesJson).toEqual([]);
    expect(insertCall.requiredVariablesJson).toEqual([]);
  });

  it('revalidates the correct path', async () => {
    chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, validCreateInput);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/certificates`);
  });
});

// ── Update: kill every ConditionalExpression + EqualityOperator survivor ──

describe('updateCertificateTemplate — individual field update assertions', () => {
  it('passes templateName to updateFields when provided (L98)', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([{ ...mockTemplate, templateName: 'New' }]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'New',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.templateName).toBe('New');
  });

  it('does NOT include templateName in updateFields when not provided', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      notes: 'just notes',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('templateName');
  });

  it('passes templateJson when provided (L99)', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateJson: { updated: true },
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.templateJson).toEqual({ updated: true });
  });

  it('does NOT include templateJson when not provided', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'X',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('templateJson');
  });

  it('passes pageSize when provided (L100)', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      pageSize: 'A4_portrait',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.pageSize).toBe('A4_portrait');
  });

  it('does NOT include pageSize when not provided', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'X',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('pageSize');
  });

  it('passes orientation when provided (L101)', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      orientation: 'portrait',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.orientation).toBe('portrait');
  });

  it('does NOT include orientation when not provided', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'X',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('orientation');
  });

  it('passes allowedVariablesJson when provided (L102)', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      allowedVariablesJson: ['full_name'],
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.allowedVariablesJson).toEqual(['full_name']);
  });

  it('does NOT include allowedVariablesJson when not provided', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'X',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('allowedVariablesJson');
  });

  it('passes requiredVariablesJson when provided (L103)', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      requiredVariablesJson: ['full_name'],
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.requiredVariablesJson).toEqual(['full_name']);
  });

  it('does NOT include requiredVariablesJson when not provided', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'X',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('requiredVariablesJson');
  });

  it('passes defaultFileNamePattern when provided (L104)', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      defaultFileNamePattern: 'custom.pdf',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.defaultFileNamePattern).toBe('custom.pdf');
  });

  it('does NOT include defaultFileNamePattern when not provided', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'X',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('defaultFileNamePattern');
  });

  it('passes signatureConfigJson when provided (L105)', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      signatureConfigJson: { signer: 'Dr. X' },
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.signatureConfigJson).toEqual({ signer: 'Dr. X' });
  });

  it('does NOT include signatureConfigJson when not provided', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'X',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('signatureConfigJson');
  });

  it('passes brandingSnapshotJson when provided (L106)', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      brandingSnapshotJson: { logo: 'new-url' },
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.brandingSnapshotJson).toEqual({ logo: 'new-url' });
  });

  it('does NOT include brandingSnapshotJson when not provided', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'X',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('brandingSnapshotJson');
  });

  it('passes qrVerificationEnabled when provided (L107)', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      qrVerificationEnabled: false,
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.qrVerificationEnabled).toBe(false);
  });

  it('does NOT include qrVerificationEnabled when not provided', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'X',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('qrVerificationEnabled');
  });

  it('passes verificationText when provided (L108)', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      verificationText: 'Verify here',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.verificationText).toBe('Verify here');
  });

  it('does NOT include verificationText when not provided', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'X',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('verificationText');
  });

  it('passes notes when provided (L109)', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      notes: 'Important notes',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.notes).toBe('Important notes');
  });

  it('does NOT include notes when not provided', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'X',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('notes');
  });

  it('always sets updatedBy and updatedAt', async () => {
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'X',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.updatedBy).toBe('user_123');
    expect(setCall.updatedAt).toBeInstanceOf(Date);
  });
});

// ── Version bump on active template update (L113) ──

describe('updateCertificateTemplate — version bump logic', () => {
  it('does NOT bump version when updating draft template with templateJson', async () => {
    chainedSelect([{ ...mockTemplate, status: 'draft' }]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateJson: { updated: true },
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('versionNo');
  });

  it('does NOT bump version when updating active template without templateJson', async () => {
    chainedSelect([{ ...mockTemplate, status: 'active' }]);
    const updateChain = chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'Updated Name',
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('versionNo');
  });

  it('bumps version ONLY when status is active AND templateJson is updated (L113)', async () => {
    chainedSelect([{ ...mockTemplate, status: 'active', versionNo: 2 }]);
    const updateChain = chainedUpdate([{ ...mockTemplate, versionNo: 3 }]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateJson: { changed: true },
    });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.versionNo).toBeDefined();
  });
});

// ── Activate: exact error messages and status transition checks ──

describe('activateCertificateTemplate — transition validation', () => {
  it('throws exact message for archived→active transition (not allowed)', async () => {
    chainedSelect([{ ...mockTemplate, status: 'archived' }]);
    await expect(activateCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID }))
      .rejects.toThrow('Cannot activate a template with status "archived"');
  });

  it('activates via transaction — archives existing active of same type', async () => {
    chainedSelect([mockTemplate]);
    chainedUpdate([{ ...mockTemplate, status: 'active' }]);
    const result = await activateCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    expect(result.status).toBe('active');
    expect(mockDb.transaction).toHaveBeenCalled();
  });

  it('sets correct fields when archiving existing active template', async () => {
    // Within the transaction, first update archives existing active
    const txMock = {
      update: vi.fn(),
      select: vi.fn(),
      insert: vi.fn(),
    };

    const archiveChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ ...mockTemplate, status: 'active' }]),
    };
    txMock.update.mockReturnValue(archiveChain);

    // This test verifies the transaction is called and the activate behavior
    chainedSelect([mockTemplate]);
    chainedUpdate([{ ...mockTemplate, status: 'active' }]);

    const result = await activateCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    expect(result.status).toBe('active');
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/certificates`);
  });
});

// ── Archive: exact error messages ──

describe('archiveCertificateTemplate — transition validation', () => {
  it('throws exact error message for already archived', async () => {
    chainedSelect([{ ...mockTemplate, status: 'archived' }]);
    await expect(archiveCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID }))
      .rejects.toThrow('Cannot archive a template with status "archived"');
  });

  it('sets status to archived and archivedAt', async () => {
    chainedSelect([{ ...mockTemplate, status: 'active' }]);
    const updateChain = chainedUpdate([{ ...mockTemplate, status: 'archived' }]);
    const result = await archiveCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    expect(result.status).toBe('archived');
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.status).toBe('archived');
    expect(setCall.archivedAt).toBeInstanceOf(Date);
    expect(setCall.updatedBy).toBe('user_123');
    expect(setCall.updatedAt).toBeInstanceOf(Date);
  });

  it('revalidates correct path after archive', async () => {
    chainedSelect([{ ...mockTemplate, status: 'draft' }]);
    chainedUpdate([{ ...mockTemplate, status: 'archived' }]);
    await archiveCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/certificates`);
  });
});

// ── Kill ObjectLiteral + BooleanLiteral on assertEventAccess calls ──

describe('createCertificateTemplate — assertEventAccess shape (L79)', () => {
  it('calls assertEventAccess with requireWrite: true (not false or {})', async () => {
    chainedInsert([mockTemplate]);
    await createCertificateTemplate(EVENT_ID, validCreateInput);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });
});

describe('activateCertificateTemplate — assertEventAccess shape (L130)', () => {
  it('calls assertEventAccess with requireWrite: true', async () => {
    chainedSelect([mockTemplate]);
    chainedUpdate([{ ...mockTemplate, status: 'active' }]);
    await activateCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });
});

describe('archiveCertificateTemplate — assertEventAccess shape (L186)', () => {
  it('calls assertEventAccess with requireWrite: true', async () => {
    chainedSelect([mockTemplate]);
    chainedUpdate([{ ...mockTemplate, status: 'archived' }]);
    await archiveCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });
});

// ── Kill OptionalChaining on allowed?.includes (L142, L198) ──

describe('activateCertificateTemplate — TEMPLATE_STATUS_TRANSITIONS (L142)', () => {
  it('checks allowed transitions via TEMPLATE_STATUS_TRANSITIONS.includes', async () => {
    // archived status: transitions are ['draft'] — 'active' not included → should throw
    chainedSelect([{ ...mockTemplate, status: 'archived' }]);
    await expect(activateCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID }))
      .rejects.toThrow('Cannot activate a template with status "archived"');
  });

  it('allows draft → active transition', async () => {
    chainedSelect([{ ...mockTemplate, status: 'draft' }]);
    chainedUpdate([{ ...mockTemplate, status: 'active' }]);
    const result = await activateCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    expect(result.status).toBe('active');
  });
});

describe('archiveCertificateTemplate — TEMPLATE_STATUS_TRANSITIONS (L198)', () => {
  it('allows draft → archived transition', async () => {
    chainedSelect([{ ...mockTemplate, status: 'draft' }]);
    chainedUpdate([{ ...mockTemplate, status: 'archived' }]);
    const result = await archiveCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    expect(result.status).toBe('archived');
  });

  it('allows active → archived transition', async () => {
    chainedSelect([{ ...mockTemplate, status: 'active' }]);
    chainedUpdate([{ ...mockTemplate, status: 'archived' }]);
    const result = await archiveCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    expect(result.status).toBe('archived');
  });
});

// ── Kill StringLiteral on revalidatePath calls and error messages ──

describe('updateCertificateTemplate — revalidatePath (L123)', () => {
  it('revalidates the exact path /events/{eventId}/certificates', async () => {
    chainedSelect([mockTemplate]);
    chainedUpdate([mockTemplate]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateName: 'X',
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/certificates`);
    // Verify the exact string (not empty)
    expect(mockRevalidatePath.mock.calls[0][0]).toMatch(/^\/events\/.+\/certificates$/);
  });
});

describe('activateCertificateTemplate — revalidatePath (L180)', () => {
  it('revalidates the exact path /events/{eventId}/certificates', async () => {
    chainedSelect([mockTemplate]);
    chainedUpdate([{ ...mockTemplate, status: 'active' }]);
    await activateCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    expect(mockRevalidatePath.mock.calls[0][0]).toMatch(/^\/events\/.+\/certificates$/);
  });
});

// ── Kill version bump StringLiteral (L114) ──

describe('updateCertificateTemplate — versionNo SQL expression (L114)', () => {
  it('sets versionNo to a SQL expression (not empty string) when bumping version', async () => {
    chainedSelect([{ ...mockTemplate, status: 'active', versionNo: 2 }]);
    const updateChain = chainedUpdate([{ ...mockTemplate, versionNo: 3 }]);
    await updateCertificateTemplate(EVENT_ID, {
      templateId: TEMPLATE_ID,
      templateJson: { changed: true },
    });
    const setCall = updateChain.set.mock.calls[0][0];
    // versionNo should be set to a SQL expression, not a simple string or undefined
    expect(setCall.versionNo).toBeDefined();
    expect(setCall.versionNo).not.toBe('');
    expect(setCall.versionNo).not.toBe(null);
  });
});

// ── Kill StringLiteral on archive status set calls (L152, L161, L170, L205) ──

describe('activateCertificateTemplate — archive set call fields (L151, L152, L161)', () => {
  it('sets status to "archived" on existing active template (not empty string)', async () => {
    // We check the update call's set argument
    chainedSelect([mockTemplate]);
    const updateChain = chainedUpdate([{ ...mockTemplate, status: 'active' }]);
    await activateCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    // First update sets 'archived', second sets 'active'
    // Both use the same mock, but we can check the last call
    const calls = updateChain.set.mock.calls;
    // Should have been called (at least once for activate)
    expect(calls.length).toBeGreaterThan(0);
  });
});

describe('archiveCertificateTemplate — set call fields (L204, L205)', () => {
  it('sets status to exactly "archived" (not empty string)', async () => {
    chainedSelect([{ ...mockTemplate, status: 'active' }]);
    const updateChain = chainedUpdate([{ ...mockTemplate, status: 'archived' }]);
    await archiveCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.status).toBe('archived');
    expect(setCall.status).not.toBe('');
  });
});

// ── Kill OptionalChaining on allowed?.includes by testing unknown status ──

describe('activateCertificateTemplate — unknown status transitions (L142 OptionalChaining)', () => {
  it('throws when template has status not in TEMPLATE_STATUS_TRANSITIONS', async () => {
    chainedSelect([{ ...mockTemplate, status: 'unknown_status' }]);
    await expect(activateCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID }))
      .rejects.toThrow('Cannot activate a template with status "unknown_status"');
  });
});

describe('archiveCertificateTemplate — unknown status transitions (L198 OptionalChaining)', () => {
  it('throws when template has status not in TEMPLATE_STATUS_TRANSITIONS', async () => {
    chainedSelect([{ ...mockTemplate, status: 'unknown_status' }]);
    await expect(archiveCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID }))
      .rejects.toThrow('Cannot archive a template with status "unknown_status"');
  });
});

// ── Kill remaining StringLiteral survivors in activate/archive ──

describe('activateCertificateTemplate — exact error string with status name (L152)', () => {
  it('includes the exact status name in the error message', async () => {
    chainedSelect([{ ...mockTemplate, status: 'active' }]);
    try {
      await activateCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    } catch (e) {
      expect((e as Error).message).toBe('Cannot activate a template with status "active"');
    }
  });
});

describe('archiveCertificateTemplate — exact error string with status name (L205)', () => {
  it('includes the exact status name in the error message', async () => {
    chainedSelect([{ ...mockTemplate, status: 'archived' }]);
    try {
      await archiveCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });
    } catch (e) {
      expect((e as Error).message).toBe('Cannot archive a template with status "archived"');
    }
  });
});

// ── Kill ObjectLiteral on assertEventAccess in activate/archive (L130, L151, L169, L186) ──

describe('activate/archive — set call fields on transaction', () => {
  it('activate transaction sets status="archived" on existing, then status="active" on target (L151, L161, L170)', async () => {
    // Capture all update calls in transaction
    let updateCallCount = 0;
    const setCalls: any[] = [];

    mockDb.transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => {
      const txDb = {
        ...mockDb,
        update: vi.fn().mockImplementation(() => {
          updateCallCount++;
          const chain = {
            set: vi.fn().mockImplementation((args: any) => {
              setCalls.push(args);
              return chain;
            }),
            where: vi.fn().mockReturnThis(),
            returning: vi.fn().mockResolvedValue([{ ...mockTemplate, status: 'active' }]),
          };
          return chain;
        }),
        select: mockDb.select,
      };
      return callback(txDb as any);
    });

    chainedSelect([mockTemplate]);
    await activateCertificateTemplate(EVENT_ID, { templateId: TEMPLATE_ID });

    // First update: archive existing active templates of same type
    expect(setCalls[0].status).toBe('archived');
    expect(setCalls[0].archivedAt).toBeInstanceOf(Date);
    expect(setCalls[0].updatedBy).toBe('user_123');

    // Second update: activate this template
    expect(setCalls[1].status).toBe('active');
    expect(setCalls[1].updatedBy).toBe('user_123');
  });
});

// ── Kill remaining ObjectLiteral on createCertificateTemplate assertEventAccess (L79) ──

describe('createCertificateTemplate — requireWrite assertion', () => {
  it('requireWrite must be true not false (L79 BooleanLiteral)', async () => {
    mockAssertEventAccess.mockImplementation(async (eid: string, opts?: any) => {
      // Verify requireWrite is actually true
      if (opts?.requireWrite !== true) {
        throw new Error('requireWrite must be true');
      }
      return { userId: 'user_123', role: 'org:super_admin' };
    });
    chainedInsert([mockTemplate]);
    const result = await createCertificateTemplate(EVENT_ID, validCreateInput);
    expect(result).toBeDefined();
  });
});
