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
  updateEventBranding,
  uploadBrandingImage,
  deleteBrandingImage,
} from './branding';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

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
    where: vi.fn().mockResolvedValue(undefined),
  };
  mockDb.update.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
});

/**
 * Round 2 mutation-killing tests for actions/branding.ts
 * Targeting specific survivors from Round 1:
 * - L54 ObjectLiteral (db.select arg shape)
 * - L66 ConditionalExpression (undefined skip)
 * - L97/L137 BooleanLiteral/ObjectLiteral (requireWrite)
 * - L104 StringLiteral (MIME type list in error)
 * - L109 ArithmeticOperator (size calc in error)
 * - L121 ConditionalExpression/StringLiteral (fieldKey mapping)
 */

// ─── L66: value !== undefined → true (merge should skip undefined) ────

describe('updateEventBranding: undefined merge behavior', () => {
  it('does NOT overwrite existing fields with undefined values from partial input', async () => {
    // Store existing branding with a whatsappPrefix
    mockDbSelectChain({
      branding: { whatsappPrefix: 'EXISTING', primaryColor: '#AABBCC' },
    });
    const updateChain = mockDbUpdateChain();

    // Only update primaryColor — whatsappPrefix should NOT be in validated output
    // since it wasn't provided. The merge loop should skip undefined entries.
    await updateEventBranding(EVENT_ID, { primaryColor: '#112233' });

    const setArg = updateChain.set.mock.calls[0][0];
    // whatsappPrefix must be preserved from existing branding
    expect(setArg.branding.whatsappPrefix).toBe('EXISTING');
    // primaryColor should be updated
    expect(setArg.branding.primaryColor).toBe('#112233');
  });
});

// ─── L97: uploadBrandingImage assertEventAccess first call ────────────

describe('uploadBrandingImage: requireWrite enforcement', () => {
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

  it('first assertEventAccess call passes requireWrite: true (not false, not empty)', async () => {
    setupUploadMocks();
    const file = new File(['data'], 'logo.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', file);

    await uploadBrandingImage(EVENT_ID, 'logo', formData);

    // uploadBrandingImage calls assertEventAccess FIRST, then updateEventBranding calls it again
    // Check the FIRST call specifically
    const firstCall = mockAssertEventAccess.mock.calls[0];
    expect(firstCall[0]).toBe(EVENT_ID);
    expect(firstCall[1]).toEqual({ requireWrite: true });
    // Verify it's not an empty object
    expect(firstCall[1]).toHaveProperty('requireWrite', true);
  });

  it('error message for invalid MIME includes allowed types list (L104)', async () => {
    const file = new File(['data'], 'bad.gif', { type: 'image/gif' });
    const formData = new FormData();
    formData.append('file', file);

    try {
      await uploadBrandingImage(EVENT_ID, 'logo', formData);
      expect.fail('should have thrown');
    } catch (err: unknown) {
      const msg = (err as Error).message;
      // Must include the comma-joined MIME type list
      expect(msg).toContain('image/png');
      expect(msg).toContain('image/jpeg');
      expect(msg).toContain('image/webp');
      expect(msg).toContain('image/svg+xml');
    }
  });

  it('error message shows correct MB size for oversized file (L109 ArithmeticOperator)', async () => {
    // 6MB file = 6.0MB in error message
    const size = 6 * 1024 * 1024;
    const file = new File([new Uint8Array(size)], 'big.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', file);

    try {
      await uploadBrandingImage(EVENT_ID, 'logo', formData);
      expect.fail('should have thrown');
    } catch (err: unknown) {
      const msg = (err as Error).message;
      // Should show "6.0MB" — if arithmetic is mutated, it would show wrong value
      expect(msg).toContain('6.0');
      expect(msg).toContain('Maximum: 5MB');
    }
  });

  it('logo imageType sets logoStorageKey not headerImageStorageKey (L121)', async () => {
    setupUploadMocks();
    const file = new File(['data'], 'logo.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', file);

    await uploadBrandingImage(EVENT_ID, 'logo', formData);

    // Check what was passed to updateEventBranding via the DB update call
    // updateEventBranding is called after upload, which calls db.update
    const updateCalls = mockDb.update.mock.results;
    expect(updateCalls.length).toBeGreaterThan(0);
    const lastUpdateSet = updateCalls[updateCalls.length - 1].value.set.mock.calls[0][0];
    expect(lastUpdateSet.branding).toHaveProperty('logoStorageKey');
    expect(lastUpdateSet.branding.logoStorageKey).toMatch(/^branding\//);
  });

  it('header imageType sets headerImageStorageKey not logoStorageKey (L121)', async () => {
    setupUploadMocks();
    const file = new File(['data'], 'banner.jpg', { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('file', file);

    await uploadBrandingImage(EVENT_ID, 'header', formData);

    const updateCalls = mockDb.update.mock.results;
    expect(updateCalls.length).toBeGreaterThan(0);
    const lastUpdateSet = updateCalls[updateCalls.length - 1].value.set.mock.calls[0][0];
    expect(lastUpdateSet.branding).toHaveProperty('headerImageStorageKey');
    expect(lastUpdateSet.branding.headerImageStorageKey).toMatch(/^branding\//);
  });
});

// ─── L137: deleteBrandingImage assertEventAccess ──────────────────────

describe('deleteBrandingImage: requireWrite enforcement', () => {
  it('first assertEventAccess call passes requireWrite: true (L137)', async () => {
    mockDbSelectChain({ branding: { logoStorageKey: 'some/key' } });
    mockDbUpdateChain();
    mockStorageDelete.mockResolvedValue(undefined);

    await deleteBrandingImage(EVENT_ID, 'logo');

    // First call is from deleteBrandingImage itself
    const firstCall = mockAssertEventAccess.mock.calls[0];
    expect(firstCall[1]).toEqual({ requireWrite: true });
    expect(firstCall[1]).toHaveProperty('requireWrite', true);
  });
});

// ─── L54: db.select arg shape ─────────────────────────────────────────

describe('updateEventBranding: db.select argument shape', () => {
  it('selects branding field from events table', async () => {
    const chain = mockDbSelectChain({ branding: {} });
    mockDbUpdateChain();

    await updateEventBranding(EVENT_ID, { primaryColor: '#FF0000' });

    // db.select should be called with an object containing 'branding'
    const selectArg = mockDb.select.mock.calls[0][0];
    expect(selectArg).toBeDefined();
    expect(selectArg).not.toEqual({});
    expect(selectArg).toHaveProperty('branding');
  });
});
