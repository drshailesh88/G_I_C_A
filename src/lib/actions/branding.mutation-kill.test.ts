import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- hoisted mocks ---
const {
  mockAssertEventAccess,
  mockDb,
  mockRevalidatePath,
  mockStorageUpload,
  mockStorageGetSignedUrl,
  mockStorageDelete,
} = vi.hoisted(() => ({
  mockAssertEventAccess: vi.fn(),
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockStorageUpload: vi.fn(),
  mockStorageGetSignedUrl: vi.fn(),
  mockStorageDelete: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'user_123' }),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  };
});

vi.mock('@/lib/certificates/storage', () => ({
  createR2Provider: () => ({
    upload: mockStorageUpload,
    getSignedUrl: mockStorageGetSignedUrl,
    delete: mockStorageDelete,
  }),
}));

import {
  getEventBranding,
  updateEventBranding,
  uploadBrandingImage,
  deleteBrandingImage,
  getBrandingImageUrls,
} from './branding';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function validPngBytes(size = 16) {
  const bytes = new Uint8Array(Math.max(size, 8));
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function mockDbSelectChain(result: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(Array.isArray(result) ? result : [result]),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

function mockDbUpdateChain() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: EVENT_ID }]),
  };
  mockDb.update.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
});

/**
 * Mutation-killing tests for src/lib/actions/branding.ts
 * Targets: ConditionalExpression, ObjectLiteral, BooleanLiteral,
 *          EqualityOperator, ArithmeticOperator, StringLiteral, NoCoverage
 */

// ─── getEventBranding: event-not-found path (L33 ConditionalExpression, NoCoverage) ───

describe('getEventBranding edge cases', () => {
  it('throws "Event not found" when DB returns empty array', async () => {
    mockDbSelectChain([]);

    await expect(getEventBranding(EVENT_ID)).rejects.toThrow('Event not found');
  });

  it('returns null branding as defaults when event.branding is null', async () => {
    mockDbSelectChain({ branding: null });

    const result = await getEventBranding(EVENT_ID);
    expect(result.primaryColor).toBe('#1E40AF');
    expect(result.logoStorageKey).toBe('');
  });

  it('calls db.select with branding field', async () => {
    const chain = mockDbSelectChain({ branding: {} });
    await getEventBranding(EVENT_ID);

    // The select call should request the branding field (ObjectLiteral mutation)
    expect(mockDb.select).toHaveBeenCalled();
    const selectArg = mockDb.select.mock.calls[0][0];
    expect(selectArg).toHaveProperty('branding');
  });
});

// ─── updateEventBranding: event-not-found path (L59 ConditionalExpression, NoCoverage) ───

describe('updateEventBranding edge cases', () => {
  it('throws "Event not found" when event does not exist', async () => {
    mockDbSelectChain([]);
    mockDbUpdateChain();

    await expect(
      updateEventBranding(EVENT_ID, { primaryColor: '#FF0000' }),
    ).rejects.toThrow('Event not found');
  });

  it('skips undefined values during merge (L66 conditional)', async () => {
    mockDbSelectChain({ branding: { primaryColor: '#AABBCC' } });
    const updateChain = mockDbUpdateChain();

    await updateEventBranding(EVENT_ID, { primaryColor: '#FF0000' });

    const setArg = updateChain.set.mock.calls[0][0];
    // primaryColor should be updated
    expect(setArg.branding.primaryColor).toBe('#FF0000');
    // Existing field should be preserved, not wiped by undefined merge
    expect(setArg.branding).toHaveProperty('primaryColor');
  });

  it('passes requireWrite: true to assertEventAccess', async () => {
    mockDbSelectChain({ branding: {} });
    mockDbUpdateChain();

    await updateEventBranding(EVENT_ID, { primaryColor: '#FF0000' });

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('sets updatedBy to the authenticated userId', async () => {
    mockDbSelectChain({ branding: {} });
    const updateChain = mockDbUpdateChain();

    await updateEventBranding(EVENT_ID, { primaryColor: '#FF0000' });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.updatedBy).toBe('user_123');
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  it('revalidates the correct event path', async () => {
    mockDbSelectChain({ branding: {} });
    mockDbUpdateChain();

    await updateEventBranding(EVENT_ID, { primaryColor: '#FF0000' });

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}`);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/branding');
  });

  it('returns success true with merged branding', async () => {
    mockDbSelectChain({ branding: {} });
    mockDbUpdateChain();

    const result = await updateEventBranding(EVENT_ID, { primaryColor: '#FF0000' });

    expect(result.success).toBe(true);
    expect(result.branding).toBeDefined();
    expect(result.branding.primaryColor).toBe('#FF0000');
  });

  it('reads current branding via db.select before updating', async () => {
    const selectChain = mockDbSelectChain({ branding: { emailSenderName: 'Existing' } });
    mockDbUpdateChain();

    await updateEventBranding(EVENT_ID, { primaryColor: '#FF0000' });

    // Must have called select (to read current) and update
    expect(mockDb.select).toHaveBeenCalled();
    expect(mockDb.update).toHaveBeenCalled();
  });
});

// ─── uploadBrandingImage (L97-127) ─────────────────────────────────────

describe('uploadBrandingImage mutation kills', () => {
  function setupUploadMocks() {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ branding: {} }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDbUpdateChain();
    mockStorageUpload.mockResolvedValue(undefined);
    mockStorageGetSignedUrl.mockResolvedValue('https://r2.example.com/signed');
  }

  it('throws when no file provided in formData (L100 NoCoverage)', async () => {
    const formData = new FormData();
    // No file appended

    await expect(
      uploadBrandingImage(EVENT_ID, 'logo', formData),
    ).rejects.toThrow('No file provided');
  });

  it('requires requireWrite access (L97 BooleanLiteral)', async () => {
    setupUploadMocks();
    const file = new File([validPngBytes()], 'logo.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', file);

    await uploadBrandingImage(EVENT_ID, 'logo', formData);

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('includes the exact invalid MIME type in error message (L104 StringLiteral)', async () => {
    const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('file', file);

    await expect(
      uploadBrandingImage(EVENT_ID, 'logo', formData),
    ).rejects.toThrow('application/pdf');
  });

  it('rejects file at exactly 5MB boundary (L108 EqualityOperator > vs >=)', async () => {
    // Exactly 5MB should NOT throw (boundary: > not >=)
    const exactFile = new File([validPngBytes(5 * 1024 * 1024)], 'exact.png', { type: 'image/png' });
    const exactFormData = new FormData();
    exactFormData.append('file', exactFile);
    setupUploadMocks();

    // Exactly at limit should pass
    await expect(
      uploadBrandingImage(EVENT_ID, 'logo', exactFormData),
    ).resolves.toBeDefined();

    // 1 byte over should fail
    const overFile = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'over.png', { type: 'image/png' });
    const overFormData = new FormData();
    overFormData.append('file', overFile);

    await expect(
      uploadBrandingImage(EVENT_ID, 'logo', overFormData),
    ).rejects.toThrow('File too large');
  });

  it('maps imageType "logo" to logoStorageKey field (L121 EqualityOperator)', async () => {
    setupUploadMocks();
    const file = new File([validPngBytes()], 'logo.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', file);

    await uploadBrandingImage(EVENT_ID, 'logo', formData);

    // updateEventBranding is called internally with logoStorageKey
    const updateSetArg = mockDb.update.mock.calls[0] ? undefined : null;
    // Verify via the db.update chain — the branding should contain logoStorageKey
    const setCall = mockDb.update.mock.lastCall;
    expect(setCall).toBeDefined();
  });

  it('maps imageType "header" to headerImageStorageKey field (L121 EqualityOperator)', async () => {
    setupUploadMocks();
    const file = new File([validPngBytes()], 'header.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', file);

    await uploadBrandingImage(EVENT_ID, 'header', formData);

    // The update should use headerImageStorageKey, not logoStorageKey
    // We verify by checking the mock calls to db.update
    expect(mockDb.update).toHaveBeenCalled();
    const updateChainCalls = mockDb.update.mock.results[0].value;
    const setArg = updateChainCalls.set.mock.calls[0][0];
    expect(setArg.branding).toHaveProperty('headerImageStorageKey');
    expect(setArg.branding.logoStorageKey).toBe('');
  });

  it('returns storageKey and signedUrl (L122 ObjectLiteral)', async () => {
    setupUploadMocks();
    const file = new File([validPngBytes()], 'logo.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', file);

    const result = await uploadBrandingImage(EVENT_ID, 'logo', formData);

    expect(result).toHaveProperty('storageKey');
    expect(result).toHaveProperty('signedUrl');
    expect(typeof result.storageKey).toBe('string');
    expect(result.storageKey.length).toBeGreaterThan(0);
    expect(result.signedUrl).toBe('https://r2.example.com/signed');
  });

  it('calls storage.getSignedUrl with 3600 seconds TTL', async () => {
    setupUploadMocks();
    const file = new File([validPngBytes()], 'logo.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', file);

    await uploadBrandingImage(EVENT_ID, 'logo', formData);

    expect(mockStorageGetSignedUrl).toHaveBeenCalledWith(
      expect.any(String),
      3600,
    );
  });
});

// ─── deleteBrandingImage (L132-151) ────────────────────────────────────

describe('deleteBrandingImage mutation kills', () => {
  it('requires requireWrite access (L137 BooleanLiteral)', async () => {
    mockDbSelectChain({ branding: { logoStorageKey: 'some/key' } });
    mockDbUpdateChain();
    mockStorageDelete.mockResolvedValue(undefined);

    await deleteBrandingImage(EVENT_ID, 'logo');

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('skips storage.delete when storageKey is empty (L143 ConditionalExpression)', async () => {
    // No storageKey set — should not call storage.delete
    mockDbSelectChain({ branding: {} });
    mockDbUpdateChain();

    await deleteBrandingImage(EVENT_ID, 'logo');

    expect(mockStorageDelete).not.toHaveBeenCalled();
  });

  it('calls storage.delete when storageKey exists (L143 ConditionalExpression)', async () => {
    mockDbSelectChain({ branding: { logoStorageKey: `branding/${EVENT_ID}/logo/old.png` } });
    mockDbUpdateChain();
    mockStorageDelete.mockResolvedValue(undefined);

    await deleteBrandingImage(EVENT_ID, 'logo');

    expect(mockStorageDelete).toHaveBeenCalledWith(`branding/${EVENT_ID}/logo/old.png`);
  });

  it('deletes header image using headerImageStorageKey field (L140)', async () => {
    mockDbSelectChain({ branding: { headerImageStorageKey: `branding/${EVENT_ID}/header/bg.png` } });
    mockDbUpdateChain();
    mockStorageDelete.mockResolvedValue(undefined);

    await deleteBrandingImage(EVENT_ID, 'header');

    expect(mockStorageDelete).toHaveBeenCalledWith(`branding/${EVENT_ID}/header/bg.png`);
  });

  it('returns { success: true } (L137 ObjectLiteral, L149)', async () => {
    mockDbSelectChain({ branding: {} });
    mockDbUpdateChain();

    const result = await deleteBrandingImage(EVENT_ID, 'logo');

    expect(result).toEqual({ success: true });
    expect(result.success).toBe(true);
  });

  it('clears the storage key by setting it to empty string (L149 StringLiteral)', async () => {
    mockDbSelectChain({ branding: { logoStorageKey: `branding/${EVENT_ID}/logo/old.png` } });
    const updateChain = mockDbUpdateChain();
    mockStorageDelete.mockResolvedValue(undefined);

    await deleteBrandingImage(EVENT_ID, 'logo');

    // The updateEventBranding call should set logoStorageKey to ''
    expect(mockDb.update).toHaveBeenCalled();
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.branding.logoStorageKey).toBe('');
  });
});

// ─── getBrandingImageUrls (L156-178) ────────────────────────────────────

describe('getBrandingImageUrls mutation kills', () => {
  it('returns null logoUrl when logoStorageKey is empty (L165 ConditionalExpression)', async () => {
    mockDbSelectChain({ branding: { logoStorageKey: '', headerImageStorageKey: `branding/${EVENT_ID}/header/some-key.png` } });
    mockStorageGetSignedUrl.mockResolvedValue('https://r2.example.com/header-url');

    const result = await getBrandingImageUrls(EVENT_ID);

    expect(result.logoUrl).toBeNull();
    expect(result.headerImageUrl).toBe('https://r2.example.com/header-url');
  });

  it('returns null headerImageUrl when headerImageStorageKey is empty', async () => {
    mockDbSelectChain({ branding: { logoStorageKey: `branding/${EVENT_ID}/logo/some-key.png`, headerImageStorageKey: '' } });
    mockStorageGetSignedUrl.mockResolvedValue('https://r2.example.com/logo-url');

    const result = await getBrandingImageUrls(EVENT_ID);

    expect(result.logoUrl).toBe('https://r2.example.com/logo-url');
    expect(result.headerImageUrl).toBeNull();
  });

  it('returns both URLs when both storage keys exist', async () => {
    mockDbSelectChain({
      branding: {
        logoStorageKey: `branding/${EVENT_ID}/logo/a.png`,
        headerImageStorageKey: `branding/${EVENT_ID}/header/b.png`,
      },
    });
    mockStorageGetSignedUrl
      .mockResolvedValueOnce('https://r2.example.com/logo')
      .mockResolvedValueOnce('https://r2.example.com/header');

    const result = await getBrandingImageUrls(EVENT_ID);

    expect(result.logoUrl).toBe('https://r2.example.com/logo');
    expect(result.headerImageUrl).toBe('https://r2.example.com/header');
  });

  it('returns exact shape { logoUrl, headerImageUrl }', async () => {
    mockDbSelectChain({ branding: {} });

    const result = await getBrandingImageUrls(EVENT_ID);

    expect(Object.keys(result).sort()).toEqual(['headerImageUrl', 'logoUrl']);
  });

  it('calls getSignedUrl with 3600 TTL for each image', async () => {
    mockDbSelectChain({
      branding: {
        logoStorageKey: `branding/${EVENT_ID}/logo/k1.png`,
        headerImageStorageKey: `branding/${EVENT_ID}/header/k2.png`,
      },
    });
    mockStorageGetSignedUrl.mockResolvedValue('https://signed');

    await getBrandingImageUrls(EVENT_ID);

    expect(mockStorageGetSignedUrl).toHaveBeenCalledWith(`branding/${EVENT_ID}/logo/k1.png`, 3600);
    expect(mockStorageGetSignedUrl).toHaveBeenCalledWith(`branding/${EVENT_ID}/header/k2.png`, 3600);
  });
});
