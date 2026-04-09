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

/**
 * Resolve template: event-specific override first, then global default.
 * Only active templates are considered.
 */
export async function resolveTemplate(
  eventId: string,
  channel: Channel,
  templateKey: string,
) {
  // Try event-specific override first
  const eventTemplates = await db
    .select()
    .from(notificationTemplates)
    .where(
      and(
        eq(notificationTemplates.eventId, eventId),
        eq(notificationTemplates.channel, channel),
        eq(notificationTemplates.templateKey, templateKey),
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
        eq(notificationTemplates.templateKey, templateKey),
        eq(notificationTemplates.status, 'active'),
      ),
    )
    .limit(1);

  return globalTemplates[0] ?? null;
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
  let branding: EventBranding;

  if (brandingMode === 'custom' && customBrandingJson) {
    // Use template-level custom branding
    branding = eventBrandingSchema.parse({ ...DEFAULT_BRANDING, ...(customBrandingJson as Record<string, unknown>) });
  } else {
    // Default: load from event's branding JSONB
    const [event] = await db
      .select({ branding: events.branding })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    const stored = (event?.branding ?? {}) as Record<string, unknown>;
    branding = eventBrandingSchema.parse({ ...DEFAULT_BRANDING, ...stored });
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
      logoUrl = await resolveUrl(branding.logoStorageKey, BRANDING_URL_EXPIRY);
    }
    if (branding.headerImageStorageKey) {
      headerImageUrl = await resolveUrl(branding.headerImageStorageKey, BRANDING_URL_EXPIRY);
    }
  }

  return {
    logoUrl,
    headerImageUrl,
    primaryColor: branding.primaryColor,
    secondaryColor: branding.secondaryColor,
    emailSenderName: branding.emailSenderName,
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
  const template = await resolveTemplate(
    input.eventId,
    input.channel,
    input.templateKey,
  );

  if (!template) {
    throw new Error(
      `No active template found for key="${input.templateKey}" channel="${input.channel}" eventId="${input.eventId}"`,
    );
  }

  // Load event branding based on template's brandingMode
  const brandingVars = await loadEventBranding(
    input.eventId,
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
