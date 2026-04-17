/**
 * Template Renderer
 *
 * Resolves the correct template (event override > global default),
 * validates required variables, injects event branding, and renders
 * content by replacing {{variable}} placeholders with provided values.
 */

import { db } from '@/lib/db';
import { notificationTemplates, events } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Channel, TemplateRenderResult } from './types';
import { interpolate, validateRequiredVariables } from './template-utils';
import {
  eventBrandingSchema,
  DEFAULT_BRANDING,
  type EventBranding,
} from '@/lib/validations/branding';

// Re-export pure utils for convenience
export { interpolate, validateRequiredVariables } from './template-utils';

export type RenderTemplateInput = {
  eventId: string;
  channel: Channel;
  templateKey: string;
  variables: Record<string, unknown>;
};

/** Branding variables injected into templates under the `branding` namespace */
export type BrandingTemplateVars = {
  logoUrl: string;
  headerImageUrl: string;
  primaryColor: string;
  secondaryColor: string;
  emailSenderName: string;
  emailFooterText: string;
  whatsappPrefix: string;
};

const eventIdSchema = z.string().uuid('Invalid event ID');
const templateKeySchema = z.string().trim().min(1).max(100);
const BRANDING_ASSET_TYPES = new Set(['logo', 'header']);

function validateEventId(eventId: string): string {
  const result = eventIdSchema.safeParse(eventId);
  if (!result.success) {
    throw new Error('Invalid event ID');
  }

  return result.data.toLowerCase();
}

function validateTemplateKey(templateKey: string): string {
  const result = templateKeySchema.safeParse(templateKey);
  if (!result.success) {
    throw new Error('Invalid template key');
  }

  return result.data;
}

function assertBrandingStorageKeyScope(
  eventId: string,
  storageKey: string,
  expectedAssetType: 'logo' | 'header',
): void {
  if (
    storageKey.length === 0
    || storageKey.length > 500
    || storageKey !== storageKey.trim()
    || storageKey.includes('\0')
  ) {
    throw new Error('Invalid branding storageKey');
  }

  const segments = storageKey.split('/');
  if (
    segments.length < 4
    || segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new Error('Invalid branding storageKey');
  }

  const [root, scopedEventId, assetType] = segments;
  if (
    root !== 'branding'
    || !BRANDING_ASSET_TYPES.has(assetType)
    || assetType !== expectedAssetType
  ) {
    throw new Error('Invalid branding storageKey');
  }

  if (scopedEventId.toLowerCase() !== eventId) {
    throw new Error('Branding storageKey is outside the active event scope');
  }
}

/**
 * Resolve template: event-specific override first, then global default.
 * Only active templates are considered.
 */
export async function resolveTemplate(
  eventId: string,
  channel: Channel,
  templateKey: string,
) {
  const scopedEventId = validateEventId(eventId);
  const scopedTemplateKey = validateTemplateKey(templateKey);

  // Try event-specific override first
  const eventTemplates = await db
    .select()
    .from(notificationTemplates)
    .where(
      and(
        eq(notificationTemplates.eventId, scopedEventId),
        eq(notificationTemplates.channel, channel),
        eq(notificationTemplates.templateKey, scopedTemplateKey),
        eq(notificationTemplates.status, 'active'),
      ),
    )
    .limit(1);

  if (eventTemplates.length > 0) {
    return eventTemplates[0];
  }

  // Fall back to global default (eventId is null)
  const globalTemplates = await db
    .select()
    .from(notificationTemplates)
    .where(
      and(
        isNull(notificationTemplates.eventId),
        eq(notificationTemplates.channel, channel),
        eq(notificationTemplates.templateKey, scopedTemplateKey),
        eq(notificationTemplates.status, 'active'),
      ),
    )
    .limit(1);

  return globalTemplates[0] ?? null;
}

/**
 * FIX #3: Parse branding with safe fallback — if stored branding has invalid
 * values (e.g., bad hex color), degrade to defaults instead of crashing.
 */
function safeParseBranding(raw: Record<string, unknown>): EventBranding {
  const result = eventBrandingSchema.safeParse(raw);
  if (result.success) return result.data;
  // Invalid stored branding → use defaults
  return eventBrandingSchema.parse(DEFAULT_BRANDING);
}

/** FIX #4: Strip CRLF and control characters from strings used in email headers */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

/**
 * Load event branding from DB, resolve image URLs, return as template variables.
 * Uses brandingMode from the template to determine which branding to use.
 */
export async function loadEventBranding(
  eventId: string,
  brandingMode: string,
  customBrandingJson: unknown,
  /** Injected for testability — resolves an R2 storageKey to a signed URL */
  getSignedUrlFn?: (storageKey: string, expirySeconds: number) => Promise<string>,
): Promise<BrandingTemplateVars> {
  const scopedEventId = validateEventId(eventId);
  let branding: EventBranding;

  if (brandingMode === 'custom') {
    // FIX #2: Custom mode with null JSON → use defaults, not event branding
    const customData = customBrandingJson
      ? (customBrandingJson as Record<string, unknown>)
      : {};
    branding = safeParseBranding({ ...DEFAULT_BRANDING, ...customData });
  } else {
    // Default: load from event's branding JSONB
    const [event] = await db
      .select({ branding: events.branding })
      .from(events)
      .where(eq(events.id, scopedEventId))
      .limit(1);

    // FIX #1: Missing event row → throw instead of silently using defaults
    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    const stored = (event.branding ?? {}) as Record<string, unknown>;
    // FIX #3: Invalid stored branding → degrade to defaults, don't crash
    branding = safeParseBranding({ ...DEFAULT_BRANDING, ...stored });
  }

  // Resolve storage keys to signed URLs
  let logoUrl = '';
  let headerImageUrl = '';

  if (branding.logoStorageKey || branding.headerImageStorageKey) {
    const resolveUrl = getSignedUrlFn ?? (async (key: string, expiry: number) => {
      const { createR2Provider } = await import('@/lib/certificates/storage');
      const r2 = createR2Provider();
      return r2.getSignedUrl(key, expiry);
    });

    const BRANDING_URL_EXPIRY = 3600; // 1 hour

    if (branding.logoStorageKey) {
      assertBrandingStorageKeyScope(scopedEventId, branding.logoStorageKey, 'logo');
      logoUrl = await resolveUrl(branding.logoStorageKey, BRANDING_URL_EXPIRY);
    }
    if (branding.headerImageStorageKey) {
      assertBrandingStorageKeyScope(scopedEventId, branding.headerImageStorageKey, 'header');
      headerImageUrl = await resolveUrl(branding.headerImageStorageKey, BRANDING_URL_EXPIRY);
    }
  }

  return {
    logoUrl,
    headerImageUrl,
    primaryColor: branding.primaryColor,
    secondaryColor: branding.secondaryColor,
    // FIX #4: Sanitize emailSenderName to prevent CRLF header injection
    emailSenderName: sanitizeHeaderValue(branding.emailSenderName),
    emailFooterText: branding.emailFooterText,
    whatsappPrefix: branding.whatsappPrefix,
  };
}

/**
 * Render a template: resolve, validate, inject branding, interpolate.
 *
 * Returns rendered content plus branding metadata for the send layer
 * (e.g., fromDisplayName for emails, whatsappPrefix for WhatsApp).
 */
export async function renderTemplate(
  input: RenderTemplateInput,
  overrides?: {
    /** Injected for testability — resolves an R2 storageKey to a signed URL */
    getSignedUrlFn?: (storageKey: string, expirySeconds: number) => Promise<string>;
  },
): Promise<TemplateRenderResult & {
  templateId: string;
  templateVersionNo: number;
  brandingVars: BrandingTemplateVars;
}> {
  const scopedEventId = validateEventId(input.eventId);
  const scopedTemplateKey = validateTemplateKey(input.templateKey);

  const template = await resolveTemplate(
    scopedEventId,
    input.channel,
    scopedTemplateKey,
  );

  if (!template) {
    throw new Error(
      `No active template found for key="${scopedTemplateKey}" channel="${input.channel}" eventId="${scopedEventId}"`,
    );
  }

  // Load event branding based on template's brandingMode
  const brandingVars = await loadEventBranding(
    scopedEventId,
    template.brandingMode,
    template.customBrandingJson,
    overrides?.getSignedUrlFn,
  );

  // Merge branding into template variables (branding.* namespace)
  const mergedVars: Record<string, unknown> = {
    ...input.variables,
    branding: brandingVars,
  };

  // Validate required variables (against merged set — branding vars are always available)
  const requiredVars = (template.requiredVariablesJson as string[]) ?? [];
  const missing = validateRequiredVariables(requiredVars, mergedVars);
  if (missing.length > 0) {
    throw new Error(
      `Missing required template variables: ${missing.join(', ')}`,
    );
  }

  // Render
  let body = interpolate(template.bodyContent, mergedVars);
  const subject = template.subjectLine
    ? interpolate(template.subjectLine, mergedVars)
    : null;

  // For WhatsApp: prepend whatsappPrefix if set
  if (input.channel === 'whatsapp' && brandingVars.whatsappPrefix) {
    body = `${brandingVars.whatsappPrefix}\n\n${body}`;
  }

  return {
    templateId: template.id,
    templateVersionNo: template.versionNo,
    subject,
    body,
    variables: mergedVars,
    brandingVars,
  };
}
