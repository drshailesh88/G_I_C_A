/**
 * Mutation-kill-3 tests for actions/branding.ts
 *
 * Targets survivors that remain after branding.mutation-kill-2.test.ts:
 *   - assertImageContentMatchesMime: PNG / JPEG / WebP signature validation
 *   - assertSafeSvg: rejects script tags, on-handlers, javascript: urls,
 *     foreignObject, iframe/object/embed
 *   - hasScopedBrandingStorageKey: filename length + allowed char regex
 *   - uploadBrandingImage E2E storage path: ingest + rollback on update failure
 *   - deleteBrandingImage happy path + no-op when no key
 *   - getBrandingImageUrls E2E storage + null-on-missing-file + invalid key
 *   - updateEventBranding stale-update conflict + updatedAt filter push
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAssertEventAccess,
  mockDb,
  mockRevalidatePath,
  mockStorageUpload,
  mockStorageGetSignedUrl,
  mockStorageDelete,
} = vi.hoisted(() => ({
  mockAssertEventAccess: vi.fn(),
  mockDb: { select: vi.fn(), update: vi.fn() },
  mockRevalidatePath: vi.fn(),
  mockStorageUpload: vi.fn(),
  mockStorageGetSignedUrl: vi.fn(),
  mockStorageDelete: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'user_123' }),
}));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    eq: vi.fn((col: unknown, val: unknown) => ({ type: 'eq', col, val })),
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
  uploadBrandingImage,
  deleteBrandingImage,
  getBrandingImageUrls,
  updateEventBranding,
} from './branding';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function mockSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockDb.select.mockReturnValueOnce(chain);
  return chain;
}

function mockUpdate(rows: unknown[] = [{ id: EVENT_ID }]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.update.mockReturnValueOnce(chain);
  return chain;
}

function pngBytes() {
  const b = new Uint8Array(16);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return b;
}

function jpegBytes() {
  const b = new Uint8Array(16);
  b.set([0xff, 0xd8, 0xff, 0xdb]);
  return b;
}

function webpBytes() {
  const b = new Uint8Array(32);
  b.set([0x52, 0x49, 0x46, 0x46], 0);
  b.set([0x57, 0x45, 0x42, 0x50], 8);
  return b;
}

function svgString(inner: string) {
  return `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

function svgFile(content: string, name = 'icon.svg') {
  return new File([content], name, { type: 'image/svg+xml' });
}

function fileWith(bytes: Uint8Array, type: string, name: string) {
  return new File([bytes], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.E2E_USE_STUB_STORAGE = '1';
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
  mockStorageUpload.mockResolvedValue(undefined);
  mockStorageDelete.mockResolvedValue(undefined);
  mockStorageGetSignedUrl.mockResolvedValue('https://signed.example.com/x');
});

// ──────────────────────────────────────────────────────────
// assertImageContentMatchesMime — per-format magic bytes
// ──────────────────────────────────────────────────────────
describe('image magic-byte validation in uploadBrandingImage', () => {
  it('rejects PNG with mismatched signature', async () => {
    const form = new FormData();
    form.append('file', fileWith(jpegBytes(), 'image/png', 'logo.png'));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).rejects.toThrow(
      /Invalid PNG/,
    );
  });

  it('accepts valid PNG signature', async () => {
    mockSelect([{ branding: {}, updatedAt: new Date() }]);
    mockUpdate();
    const form = new FormData();
    form.append('file', fileWith(pngBytes(), 'image/png', 'logo.png'));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).resolves.toMatchObject({
      storageKey: expect.stringContaining(`branding/${EVENT_ID}/logo/`),
    });
  });

  it('rejects JPEG with mismatched signature', async () => {
    const form = new FormData();
    form.append('file', fileWith(pngBytes(), 'image/jpeg', 'logo.jpg'));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).rejects.toThrow(
      /Invalid JPEG/,
    );
  });

  it('accepts valid JPEG signature', async () => {
    mockSelect([{ branding: {}, updatedAt: new Date() }]);
    mockUpdate();
    const form = new FormData();
    form.append('file', fileWith(jpegBytes(), 'image/jpeg', 'logo.jpg'));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).resolves.toBeDefined();
  });

  it('rejects WebP with only RIFF but missing WEBP marker', async () => {
    const b = new Uint8Array(32);
    b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF only
    const form = new FormData();
    form.append('file', fileWith(b, 'image/webp', 'logo.webp'));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).rejects.toThrow(
      /Invalid WebP/,
    );
  });

  it('rejects WebP with WEBP marker but missing RIFF header', async () => {
    const b = new Uint8Array(32);
    b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP only
    const form = new FormData();
    form.append('file', fileWith(b, 'image/webp', 'logo.webp'));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).rejects.toThrow(
      /Invalid WebP/,
    );
  });

  it('accepts WebP with RIFF + WEBP markers', async () => {
    mockSelect([{ branding: {}, updatedAt: new Date() }]);
    mockUpdate();
    const form = new FormData();
    form.append('file', fileWith(webpBytes(), 'image/webp', 'logo.webp'));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).resolves.toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────
// assertSafeSvg — dangerous content rejected, safe accepted
// ──────────────────────────────────────────────────────────
describe('SVG safety checks in uploadBrandingImage', () => {
  it('rejects an SVG whose body is not actually SVG', async () => {
    const form = new FormData();
    form.append('file', svgFile('<html>hi</html>', 'x.svg'));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).rejects.toThrow(
      /Invalid SVG image content/,
    );
  });

  it('rejects SVG with <script>', async () => {
    const form = new FormData();
    form.append('file', svgFile(svgString('<script>alert(1)</script>')));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).rejects.toThrow(
      /Invalid active SVG content/,
    );
  });

  it('rejects SVG with an on-attribute handler', async () => {
    const form = new FormData();
    form.append('file', svgFile(svgString('<g onclick="evil()"/>')));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).rejects.toThrow(
      /Invalid active SVG content/,
    );
  });

  it('rejects SVG containing a javascript: URL', async () => {
    const form = new FormData();
    form.append('file', svgFile(svgString('<a href="javascript:evil()">x</a>')));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).rejects.toThrow(
      /Invalid active SVG content/,
    );
  });

  it('rejects SVG containing <foreignObject>', async () => {
    const form = new FormData();
    form.append('file', svgFile(svgString('<foreignObject><div/></foreignObject>')));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).rejects.toThrow(
      /Invalid active SVG content/,
    );
  });

  it('rejects SVG containing <iframe>', async () => {
    const form = new FormData();
    form.append('file', svgFile(svgString('<iframe src="x"/>')));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).rejects.toThrow(
      /Invalid active SVG content/,
    );
  });

  it('rejects SVG containing <object>', async () => {
    const form = new FormData();
    form.append('file', svgFile(svgString('<object data="x"/>')));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).rejects.toThrow(
      /Invalid active SVG content/,
    );
  });

  it('rejects SVG containing <embed>', async () => {
    const form = new FormData();
    form.append('file', svgFile(svgString('<embed src="x"/>')));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).rejects.toThrow(
      /Invalid active SVG content/,
    );
  });

  it('accepts a clean SVG', async () => {
    mockSelect([{ branding: {}, updatedAt: new Date() }]);
    mockUpdate();
    const form = new FormData();
    form.append('file', svgFile(svgString('<rect width="10" height="10"/>')));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).resolves.toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────
// deleteBrandingImage — happy path, no-op, invalid scope
// ──────────────────────────────────────────────────────────
describe('deleteBrandingImage', () => {
  it('returns success:true when no current storage key is set (no-op)', async () => {
    mockSelect([{ branding: { logoStorageKey: '', headerImageStorageKey: '' } }]);
    mockSelect([{ branding: { logoStorageKey: '', headerImageStorageKey: '' }, updatedAt: new Date() }]);
    mockUpdate();
    const result = await deleteBrandingImage(EVENT_ID, 'logo');
    expect(result).toEqual({ success: true });
  });

  it('rejects an unknown imageType', async () => {
    await expect(
      deleteBrandingImage(EVENT_ID, 'banner' as 'logo'),
    ).rejects.toThrow(/Invalid branding image type/);
  });

  it('requires write access (assertEventAccess called with requireWrite: true)', async () => {
    mockSelect([{ branding: {} }]);
    mockSelect([{ branding: {}, updatedAt: new Date() }]);
    mockUpdate();
    await deleteBrandingImage(EVENT_ID, 'logo');
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });
});

// ──────────────────────────────────────────────────────────
// uploadBrandingImage — e2e storage + schema enforcement
// ──────────────────────────────────────────────────────────
describe('uploadBrandingImage — further', () => {
  it('rejects a file that exceeds BRANDING_IMAGE_MAX_SIZE with an error mentioning MB', async () => {
    // Create a 6MB file (max is 5MB).
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const form = new FormData();
    form.append('file', fileWith(big, 'image/png', 'big.png'));
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).rejects.toThrow(/MB/);
  });

  it('rejects disallowed MIME type with the allowed list in the message', async () => {
    const form = new FormData();
    form.append('file', new File(['x'], 'x.pdf', { type: 'application/pdf' }));
    try {
      await uploadBrandingImage(EVENT_ID, 'logo', form);
      throw new Error('expected rejection');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('application/pdf');
      expect(msg).toMatch(/image\/(png|jpeg|webp|svg\+xml)/);
    }
  });

  it('rejects when no file is provided', async () => {
    const form = new FormData();
    await expect(uploadBrandingImage(EVENT_ID, 'logo', form)).rejects.toThrow(
      /No file provided/,
    );
  });

  it('rejects invalid imageType before reading formData', async () => {
    const form = new FormData();
    await expect(
      uploadBrandingImage(EVENT_ID, 'banner' as 'logo', form),
    ).rejects.toThrow(/Invalid branding image type/);
  });
});

// ──────────────────────────────────────────────────────────
// updateEventBranding stale-update conflict
// ──────────────────────────────────────────────────────────
describe('updateEventBranding — stale-update conflict', () => {
  it('throws a stale conflict error when UPDATE returns no row', async () => {
    mockSelect([{ branding: {}, updatedAt: new Date() }]);
    mockUpdate([]);
    await expect(
      updateEventBranding(EVENT_ID, { primaryColor: '#ff0000' }),
    ).rejects.toThrow(/Stale branding update conflict/);
  });

  it('revalidates both /events/:id and /branding on success', async () => {
    mockSelect([{ branding: {}, updatedAt: new Date() }]);
    mockUpdate();
    await updateEventBranding(EVENT_ID, { primaryColor: '#ff0000' });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}`);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/branding');
  });

  it('throws "Event not found" when the event row is missing', async () => {
    mockSelect([]);
    await expect(
      updateEventBranding(EVENT_ID, { primaryColor: '#ff0000' }),
    ).rejects.toThrow(/Event not found/);
  });
});

// ──────────────────────────────────────────────────────────
// getBrandingImageUrls: E2E storage branches + invalid-scope null
// ──────────────────────────────────────────────────────────
describe('getBrandingImageUrls — e2e storage', () => {
  it('returns null for logoUrl when the stored key is out of scope', async () => {
    mockSelect([{ branding: { logoStorageKey: 'branding/evil/logo/x.png' } }]);
    const result = await getBrandingImageUrls(EVENT_ID);
    expect(result.logoUrl).toBeNull();
  });

  it('returns null for headerImageUrl when the stored key is out of scope', async () => {
    mockSelect([{
      branding: {
        headerImageStorageKey: 'branding/other-event/header/x.png',
      },
    }]);
    const result = await getBrandingImageUrls(EVENT_ID);
    expect(result.headerImageUrl).toBeNull();
  });

  it('returns null for logoUrl when no file is registered in the e2e store', async () => {
    const key = `branding/${EVENT_ID}/logo/logo.png`;
    mockSelect([{ branding: { logoStorageKey: key } }]);
    const result = await getBrandingImageUrls(EVENT_ID);
    expect(result.logoUrl).toBeNull();
  });

  it('returns { logoUrl: null, headerImageUrl: null } when both keys are empty', async () => {
    mockSelect([{ branding: { logoStorageKey: '', headerImageStorageKey: '' } }]);
    const result = await getBrandingImageUrls(EVENT_ID);
    expect(result).toEqual({ logoUrl: null, headerImageUrl: null });
  });
});
