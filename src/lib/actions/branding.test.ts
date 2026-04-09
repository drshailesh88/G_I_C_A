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
  getEventBranding,
  updateEventBranding,
  uploadBrandingImage,
  deleteBrandingImage,
  getBrandingImageUrls,
} from './branding';
import { DEFAULT_BRANDING } from '@/lib/validations/branding';

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

describe('6B-1: Branding Configuration CRUD', () => {
  describe('getEventBranding', () => {
    it('returns default branding when event has empty branding JSON', async () => {
      mockDbSelectChain({ branding: {} });

      const result = await getEventBranding(EVENT_ID);

      expect(result).toEqual(DEFAULT_BRANDING);
      expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID);
    });

    it('returns stored branding merged with defaults', async () => {
      mockDbSelectChain({
        branding: {
          primaryColor: '#FF0000',
          emailSenderName: 'GEM Conference',
        },
      });

      const result = await getEventBranding(EVENT_ID);

      expect(result.primaryColor).toBe('#FF0000');
      expect(result.emailSenderName).toBe('GEM Conference');
      // Defaults for unset fields
      expect(result.secondaryColor).toBe('#9333EA');
      expect(result.logoStorageKey).toBe('');
    });

    it('throws on invalid eventId', async () => {
      await expect(getEventBranding('not-a-uuid')).rejects.toThrow();
    });
  });

  describe('updateEventBranding', () => {
    it('persists color changes to the database', async () => {
      // First select (read current branding)
      const selectChain = mockDbSelectChain({ branding: {} });
      const updateChain = mockDbUpdateChain();

      const result = await updateEventBranding(EVENT_ID, {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      });

      expect(result.success).toBe(true);
      expect(result.branding.primaryColor).toBe('#FF5733');
      expect(result.branding.secondaryColor).toBe('#33FF57');
      expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          branding: expect.objectContaining({
            primaryColor: '#FF5733',
            secondaryColor: '#33FF57',
          }),
        }),
      );
      expect(mockRevalidatePath).toHaveBeenCalled();
    });

    it('merges partial updates with existing branding', async () => {
      mockDbSelectChain({
        branding: {
          primaryColor: '#FF0000',
          emailSenderName: 'Existing Name',
        },
      });
      mockDbUpdateChain();

      const result = await updateEventBranding(EVENT_ID, {
        secondaryColor: '#00FF00',
      });

      expect(result.branding.primaryColor).toBe('#FF0000'); // preserved
      expect(result.branding.secondaryColor).toBe('#00FF00'); // updated
      expect(result.branding.emailSenderName).toBe('Existing Name'); // preserved
    });

    it('persists email sender name and footer text', async () => {
      mockDbSelectChain({ branding: {} });
      const updateChain = mockDbUpdateChain();

      await updateEventBranding(EVENT_ID, {
        emailSenderName: 'GEM India 2026',
        emailFooterText: 'Organized by GEM Foundation',
      });

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          branding: expect.objectContaining({
            emailSenderName: 'GEM India 2026',
            emailFooterText: 'Organized by GEM Foundation',
          }),
        }),
      );
    });

    it('rejects invalid hex color', async () => {
      await expect(
        updateEventBranding(EVENT_ID, { primaryColor: 'not-a-color' }),
      ).rejects.toThrow();
    });

    it('blocks read-only users from updating', async () => {
      mockAssertEventAccess.mockRejectedValue(
        new Error('Forbidden: read-only users cannot perform write operations'),
      );

      await expect(
        updateEventBranding(EVENT_ID, { primaryColor: '#FF0000' }),
      ).rejects.toThrow('read-only');
    });
  });

  describe('uploadBrandingImage', () => {
    it('uploads logo to R2 and saves storage key', async () => {
      // Mock for uploadBrandingImage -> calls updateEventBranding internally
      // First call: read branding in uploadBrandingImage
      // Second call: read branding in updateEventBranding
      let selectCallCount = 0;
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          selectCallCount++;
          return Promise.resolve([{ branding: {} }]);
        }),
      };
      mockDb.select.mockReturnValue(selectChain);
      mockDbUpdateChain();

      mockStorageUpload.mockResolvedValue({
        storageKey: 'branding/test/logo/abc.png',
        fileSizeBytes: 1024,
        fileChecksumSha256: 'abc123',
      });
      mockStorageGetSignedUrl.mockResolvedValue('https://r2.example.com/signed-logo-url');

      const file = new File(['fake-image-data'], 'logo.png', { type: 'image/png' });
      const formData = new FormData();
      formData.append('file', file);

      const result = await uploadBrandingImage(EVENT_ID, 'logo', formData);

      expect(result.signedUrl).toBe('https://r2.example.com/signed-logo-url');
      expect(result.storageKey).toMatch(/^branding\//);
      expect(mockStorageUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^branding\/.+\/logo\/.+-logo\.png$/),
        expect.any(Buffer),
        'image/png',
      );
    });

    it('rejects files exceeding 5MB', async () => {
      // Create a file larger than 5MB
      const bigContent = new Uint8Array(6 * 1024 * 1024);
      const file = new File([bigContent], 'big.png', { type: 'image/png' });
      const formData = new FormData();
      formData.append('file', file);

      await expect(
        uploadBrandingImage(EVENT_ID, 'logo', formData),
      ).rejects.toThrow('File too large');
    });

    it('rejects invalid MIME types', async () => {
      const file = new File(['data'], 'script.js', { type: 'application/javascript' });
      const formData = new FormData();
      formData.append('file', file);

      await expect(
        uploadBrandingImage(EVENT_ID, 'logo', formData),
      ).rejects.toThrow('Invalid file type');
    });
  });

  describe('deleteBrandingImage', () => {
    it('deletes logo from R2 and clears storage key', async () => {
      // getEventBranding select + updateEventBranding select
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{
          branding: { logoStorageKey: 'branding/test/logo/old.png' },
        }]),
      };
      mockDb.select.mockReturnValue(selectChain);
      mockDbUpdateChain();
      mockStorageDelete.mockResolvedValue(undefined);

      const result = await deleteBrandingImage(EVENT_ID, 'logo');

      expect(result.success).toBe(true);
      expect(mockStorageDelete).toHaveBeenCalledWith('branding/test/logo/old.png');
    });
  });

  describe('getBrandingImageUrls', () => {
    it('returns signed URLs for stored images', async () => {
      mockDbSelectChain({
        branding: {
          logoStorageKey: 'branding/test/logo/logo.png',
          headerImageStorageKey: 'branding/test/header/header.png',
        },
      });
      mockStorageGetSignedUrl
        .mockResolvedValueOnce('https://r2.example.com/signed-logo')
        .mockResolvedValueOnce('https://r2.example.com/signed-header');

      const result = await getBrandingImageUrls(EVENT_ID);

      expect(result.logoUrl).toBe('https://r2.example.com/signed-logo');
      expect(result.headerImageUrl).toBe('https://r2.example.com/signed-header');
    });

    it('returns null URLs when no images are stored', async () => {
      mockDbSelectChain({ branding: {} });

      const result = await getBrandingImageUrls(EVENT_ID);

      expect(result.logoUrl).toBeNull();
      expect(result.headerImageUrl).toBeNull();
      expect(mockStorageGetSignedUrl).not.toHaveBeenCalled();
    });
  });
});
