'use server';

import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
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
  return eventBrandingSchema.parse({ ...DEFAULT_BRANDING, ...stored });
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

  // Read current branding
  const [event] = await db
    .select({ branding: events.branding })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) throw new Error('Event not found');

  const current = (event.branding ?? {}) as Record<string, unknown>;

  // Merge: only update fields that were actually provided
  const merged = { ...current };
  for (const [key, value] of Object.entries(validated)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  await db
    .update(events)
    .set({
      branding: merged,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));

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
  const storageKey = buildBrandingStorageKey(eventId, imageType, file.name);

  // Dynamic import to allow test mocking
  const { createR2Provider } = await import('@/lib/certificates/storage');
  const storage = createR2Provider();
  await storage.upload(storageKey, buffer, file.type);

  // Update branding with the new storage key
  const fieldKey = imageType === 'logo' ? 'logoStorageKey' : 'headerImageStorageKey';
  await updateEventBranding(eventId, { [fieldKey]: storageKey });

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
  await assertEventAccess(eventId, { requireWrite: true });

  const branding = await getEventBranding(eventId);
  const fieldKey = imageType === 'logo' ? 'logoStorageKey' : 'headerImageStorageKey';
  const storageKey = branding[fieldKey];

  if (storageKey) {
    const { createR2Provider } = await import('@/lib/certificates/storage');
    const storage = createR2Provider();
    await storage.delete(storageKey);
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
    const { createR2Provider } = await import('@/lib/certificates/storage');
    const storage = createR2Provider();
    logoUrl = await storage.getSignedUrl(branding.logoStorageKey, 3600);
  }

  if (branding.headerImageStorageKey) {
    const { createR2Provider } = await import('@/lib/certificates/storage');
    const storage = createR2Provider();
    headerImageUrl = await storage.getSignedUrl(branding.headerImageStorageKey, 3600);
  }

  return { logoUrl, headerImageUrl };
}
