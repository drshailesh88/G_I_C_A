'use server';

import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { assertEventAccess } from '@/lib/auth/event-access';
import { eventIdSchema } from '@/lib/validations/event';
import {
  updateBrandingSchema,
  eventBrandingSchema,
  DEFAULT_BRANDING,
  BRANDING_IMAGE_MIME_TYPES,
  BRANDING_IMAGE_MAX_SIZE,
  buildBrandingStorageKey,
  type EventBranding,
} from '@/lib/validations/branding';

type BrandingImageType = 'logo' | 'header';

const e2eBrandingImages = new Map<string, { data: Buffer; contentType: string }>();
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function useE2EBrandingStorage() {
  return process.env.E2E_USE_STUB_STORAGE === '1';
}

function toDataUrl(file: { data: Buffer; contentType: string }) {
  return `data:${file.contentType};base64,${file.data.toString('base64')}`;
}

function parseBrandingImageType(imageType: unknown): BrandingImageType {
  if (imageType === 'logo' || imageType === 'header') return imageType;
  throw new Error('Invalid branding image type');
}

function storageFieldForImageType(imageType: BrandingImageType) {
  return imageType === 'logo' ? 'logoStorageKey' : 'headerImageStorageKey';
}

function hasBytes(buffer: Buffer, bytes: number[], offset = 0) {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function hasScopedBrandingStorageKey(
  eventId: string,
  imageType: BrandingImageType,
  storageKey: string,
) {
  if (storageKey === '') return true;

  const prefix = `branding/${eventId}/${imageType}/`;
  if (!storageKey.startsWith(prefix)) return false;

  const filename = storageKey.slice(prefix.length);
  return (
    filename.length > 0 &&
    filename.length <= 140 &&
    !filename.includes('/') &&
    !filename.includes('\\') &&
    !filename.includes('..') &&
    /^[a-zA-Z0-9._-]+$/.test(filename)
  );
}

function assertScopedBrandingStorageKey(
  eventId: string,
  imageType: BrandingImageType,
  storageKey: string | undefined,
) {
  if (storageKey === undefined) return;
  if (!hasScopedBrandingStorageKey(eventId, imageType, storageKey)) {
    throw new Error(`Invalid ${imageType} storage key for event`);
  }
}

function sanitizeStoredBrandingForEvent(
  eventId: string,
  branding: Record<string, unknown>,
) {
  const sanitized = { ...branding };

  if (
    typeof sanitized.logoStorageKey !== 'string' ||
    !hasScopedBrandingStorageKey(eventId, 'logo', sanitized.logoStorageKey)
  ) {
    sanitized.logoStorageKey = '';
  }

  if (
    typeof sanitized.headerImageStorageKey !== 'string' ||
    !hasScopedBrandingStorageKey(eventId, 'header', sanitized.headerImageStorageKey)
  ) {
    sanitized.headerImageStorageKey = '';
  }

  return sanitized;
}

function assertSafeSvg(buffer: Buffer) {
  const text = buffer.toString('utf8').trim();
  if (!/(?:<\?xml[\s\S]*?)?<svg[\s>]/i.test(text)) {
    throw new Error('Invalid SVG image content');
  }

  if (
    /<script\b/i.test(text) ||
    /\son[a-z]+\s*=/i.test(text) ||
    /javascript\s*:/i.test(text) ||
    /<foreignObject\b/i.test(text) ||
    /<(?:iframe|object|embed)\b/i.test(text)
  ) {
    throw new Error('Invalid active SVG content');
  }
}

function assertImageContentMatchesMime(contentType: string, buffer: Buffer) {
  if (contentType === 'image/png' && !hasBytes(buffer, PNG_SIGNATURE)) {
    throw new Error('Invalid PNG image content');
  }

  if (contentType === 'image/jpeg' && !hasBytes(buffer, [0xff, 0xd8, 0xff])) {
    throw new Error('Invalid JPEG image content');
  }

  if (
    contentType === 'image/webp' &&
    !(hasBytes(buffer, [0x52, 0x49, 0x46, 0x46]) && hasBytes(buffer, [0x57, 0x45, 0x42, 0x50], 8))
  ) {
    throw new Error('Invalid WebP image content');
  }

  if (contentType === 'image/svg+xml') {
    assertSafeSvg(buffer);
  }
}

/**
 * Get the branding configuration for an event.
 * Returns defaults merged with stored values.
 */
export async function getEventBranding(eventId: string): Promise<EventBranding> {
  eventIdSchema.parse(eventId);
  await assertEventAccess(eventId);

  const [event] = await db
    .select({ branding: events.branding })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) throw new Error('Event not found');

  // Merge stored JSONB with defaults (stored values win)
  const stored = (event.branding ?? {}) as Record<string, unknown>;
  return eventBrandingSchema.parse({
    ...DEFAULT_BRANDING,
    ...sanitizeStoredBrandingForEvent(eventId, stored),
  });
}

/**
 * Update branding configuration for an event.
 * Merges provided fields with existing branding — does NOT replace the whole object.
 */
export async function updateEventBranding(
  eventId: string,
  input: unknown,
): Promise<{ success: true; branding: EventBranding }> {
  eventIdSchema.parse(eventId);
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = updateBrandingSchema.parse(input);
  assertScopedBrandingStorageKey(eventId, 'logo', validated.logoStorageKey);
  assertScopedBrandingStorageKey(eventId, 'header', validated.headerImageStorageKey);

  // Read current branding
  const [event] = await db
    .select({ branding: events.branding, updatedAt: events.updatedAt })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) throw new Error('Event not found');

  const current = sanitizeStoredBrandingForEvent(
    eventId,
    (event.branding ?? {}) as Record<string, unknown>,
  );

  // Merge: only update fields that were actually provided
  const merged = { ...current };
  for (const [key, value] of Object.entries(validated)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  const updateFilters = [eq(events.id, eventId)];
  if (event.updatedAt) {
    updateFilters.push(eq(events.updatedAt, event.updatedAt));
  }

  const [updated] = await db
    .update(events)
    .set({
      branding: merged,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(and(...updateFilters))
    .returning({ id: events.id });

  if (!updated) {
    throw new Error('Stale branding update conflict: event was concurrently modified');
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath('/branding');

  const result = eventBrandingSchema.parse({ ...DEFAULT_BRANDING, ...merged });
  return { success: true, branding: result };
}

/**
 * Upload a branding image (logo or header) to R2.
 * Returns the storage key to persist in branding config.
 */
export async function uploadBrandingImage(
  eventId: string,
  imageType: 'logo' | 'header',
  formData: FormData,
): Promise<{ storageKey: string; signedUrl: string }> {
  eventIdSchema.parse(eventId);
  const parsedImageType = parseBrandingImageType(imageType);
  await assertEventAccess(eventId, { requireWrite: true });

  const file = formData.get('file') as File | null;
  if (!file) throw new Error('No file provided');

  // Validate MIME type
  if (!BRANDING_IMAGE_MIME_TYPES.includes(file.type as (typeof BRANDING_IMAGE_MIME_TYPES)[number])) {
    throw new Error(`Invalid file type: ${file.type}. Allowed: ${BRANDING_IMAGE_MIME_TYPES.join(', ')}`);
  }

  // Validate file size
  if (file.size > BRANDING_IMAGE_MAX_SIZE) {
    throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum: 5MB`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  assertImageContentMatchesMime(file.type, buffer);
  const storageKey = buildBrandingStorageKey(eventId, parsedImageType, file.name);
  const fieldKey = storageFieldForImageType(parsedImageType);

  if (useE2EBrandingStorage()) {
    e2eBrandingImages.set(storageKey, { data: buffer, contentType: file.type });
    try {
      await updateEventBranding(eventId, { [fieldKey]: storageKey });
    } catch (error) {
      e2eBrandingImages.delete(storageKey);
      throw error;
    }
    return { storageKey, signedUrl: toDataUrl({ data: buffer, contentType: file.type }) };
  }

  // Dynamic import to allow test mocking
  const { createR2Provider } = await import('@/lib/certificates/storage');
  const storage = createR2Provider();
  await storage.upload(storageKey, buffer, file.type);

  // Update branding with the new storage key
  try {
    await updateEventBranding(eventId, { [fieldKey]: storageKey });
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }

  // Return signed URL for immediate display
  const signedUrl = await storage.getSignedUrl(storageKey, 3600);
  return { storageKey, signedUrl };
}

/**
 * Delete a branding image from R2 and clear the storage key.
 */
export async function deleteBrandingImage(
  eventId: string,
  imageType: 'logo' | 'header',
): Promise<{ success: true }> {
  eventIdSchema.parse(eventId);
  const parsedImageType = parseBrandingImageType(imageType);
  await assertEventAccess(eventId, { requireWrite: true });

  const branding = await getEventBranding(eventId);
  const fieldKey = storageFieldForImageType(parsedImageType);
  const storageKey = branding[fieldKey];

  if (storageKey) {
    if (useE2EBrandingStorage()) {
      e2eBrandingImages.delete(storageKey);
    } else {
      const { createR2Provider } = await import('@/lib/certificates/storage');
      const storage = createR2Provider();
      await storage.delete(storageKey);
    }
  }

  await updateEventBranding(eventId, { [fieldKey]: '' });
  return { success: true };
}

/**
 * Get signed URLs for branding images (for display in the UI).
 */
export async function getBrandingImageUrls(eventId: string): Promise<{
  logoUrl: string | null;
  headerImageUrl: string | null;
}> {
  const branding = await getEventBranding(eventId);

  let logoUrl: string | null = null;
  let headerImageUrl: string | null = null;

  if (branding.logoStorageKey) {
    if (!hasScopedBrandingStorageKey(eventId, 'logo', branding.logoStorageKey)) {
      logoUrl = null;
    } else if (useE2EBrandingStorage()) {
      const file = e2eBrandingImages.get(branding.logoStorageKey);
      logoUrl = file ? toDataUrl(file) : null;
    } else {
      const { createR2Provider } = await import('@/lib/certificates/storage');
      const storage = createR2Provider();
      logoUrl = await storage.getSignedUrl(branding.logoStorageKey, 3600);
    }
  }

  if (branding.headerImageStorageKey) {
    if (!hasScopedBrandingStorageKey(eventId, 'header', branding.headerImageStorageKey)) {
      headerImageUrl = null;
    } else if (useE2EBrandingStorage()) {
      const file = e2eBrandingImages.get(branding.headerImageStorageKey);
      headerImageUrl = file ? toDataUrl(file) : null;
    } else {
      const { createR2Provider } = await import('@/lib/certificates/storage');
      const storage = createR2Provider();
      headerImageUrl = await storage.getSignedUrl(branding.headerImageStorageKey, 3600);
    }
  }

  return { logoUrl, headerImageUrl };
}
