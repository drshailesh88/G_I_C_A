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
import { DEFAULT_BRANDING } from '@/lib/validations/branding';

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
        new Error('forbidden'),
      );

      await expect(
        updateEventBranding(EVENT_ID, { primaryColor: '#FF0000' }),
      ).rejects.toThrow('forbidden');
    });

    it('rejects direct cross-event logo storage keys before updating', async () => {
      await expect(
        updateEventBranding(EVENT_ID, {
          logoStorageKey: 'branding/550e8400-e29b-41d4-a716-446655440999/logo/stolen.png',
        }),
      ).rejects.toThrow(/invalid logo storage key/i);

      expect(mockDb.select).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('blocks stale branding saves that race with another update', async () => {
      mockDbSelectChain({
        branding: { primaryColor: '#112233' },
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const updateChain = mockDbUpdateChain();
      updateChain.returning.mockResolvedValueOnce([]);

      await expect(
        updateEventBranding(EVENT_ID, { secondaryColor: '#445566' }),
      ).rejects.toThrow(/stale|concurrent|conflict/i);

      expect(mockRevalidatePath).not.toHaveBeenCalled();
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

      const file = new File([validPngBytes()], 'logo.png', { type: 'image/png' });
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

    it('rejects runtime-invalid image types before auth or storage work', async () => {
      const file = new File(['data'], 'logo.png', { type: 'image/png' });
      const formData = new FormData();
      formData.append('file', file);

      await expect(
        uploadBrandingImage(EVENT_ID, '../../header' as never, formData),
      ).rejects.toThrow(/invalid branding image type/i);

      expect(mockAssertEventAccess).not.toHaveBeenCalled();
      expect(mockStorageUpload).not.toHaveBeenCalled();
    });

    it('rejects spoofed PNG uploads whose bytes are not PNG data', async () => {
      const file = new File(['not actually a png'], 'logo.png', { type: 'image/png' });
      const formData = new FormData();
      formData.append('file', file);

      await expect(
        uploadBrandingImage(EVENT_ID, 'logo', formData),
      ).rejects.toThrow(/invalid PNG image content/i);

      expect(mockStorageUpload).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('rejects active SVG payloads before upload', async () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>';
      const file = new File([svg], 'logo.svg', { type: 'image/svg+xml' });
      const formData = new FormData();
      formData.append('file', file);

      await expect(
        uploadBrandingImage(EVENT_ID, 'logo', formData),
      ).rejects.toThrow(/active SVG content/i);

      expect(mockStorageUpload).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteBrandingImage', () => {
    it('deletes logo from R2 and clears storage key', async () => {
      // getEventBranding select + updateEventBranding select
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{
          branding: { logoStorageKey: `branding/${EVENT_ID}/logo/old.png` },
        }]),
      };
      mockDb.select.mockReturnValue(selectChain);
      mockDbUpdateChain();
      mockStorageDelete.mockResolvedValue(undefined);

      const result = await deleteBrandingImage(EVENT_ID, 'logo');

      expect(result.success).toBe(true);
      expect(mockStorageDelete).toHaveBeenCalledWith(`branding/${EVENT_ID}/logo/old.png`);
    });
  });

  describe('getBrandingImageUrls', () => {
    it('returns signed URLs for stored images', async () => {
      mockDbSelectChain({
        branding: {
          logoStorageKey: `branding/${EVENT_ID}/logo/logo.png`,
          headerImageStorageKey: `branding/${EVENT_ID}/header/header.png`,
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

    it('does not sign stored image keys outside the active event scope', async () => {
      mockDbSelectChain({
        branding: {
          logoStorageKey: 'branding/550e8400-e29b-41d4-a716-446655440999/logo/stolen.png',
          headerImageStorageKey: 'branding/550e8400-e29b-41d4-a716-446655440999/header/stolen.png',
        },
      });

      const result = await getBrandingImageUrls(EVENT_ID);

      expect(result.logoUrl).toBeNull();
      expect(result.headerImageUrl).toBeNull();
      expect(mockStorageGetSignedUrl).not.toHaveBeenCalled();
    });
  });
});
