import { z } from 'zod';

/** Hex color regex: #RRGGBB (case-insensitive) */
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color (e.g. #1E40AF)')
  .or(z.literal(''));

function defaultStringField(maxLength: number) {
  return z.preprocess(
    (value) => (value == null ? undefined : value),
    z.string().max(maxLength).optional().default(''),
  );
}

function defaultTrimmedStringField(maxLength: number) {
  return z.preprocess(
    (value) => (value == null ? undefined : value),
    z.string().trim().max(maxLength).optional().default(''),
  );
}

function defaultHexColorField(defaultValue: string) {
  return z.preprocess(
    (value) => (value == null ? undefined : value),
    hexColor.optional().default(defaultValue),
  );
}

/** Branding configuration shape stored in events.branding JSONB */
export const eventBrandingSchema = z.object({
  logoStorageKey: defaultStringField(500),
  headerImageStorageKey: defaultStringField(500),
  primaryColor: defaultHexColorField('#1E40AF'),
  secondaryColor: defaultHexColorField('#9333EA'),
  emailSenderName: defaultTrimmedStringField(100),
  emailFooterText: defaultTrimmedStringField(500),
  whatsappPrefix: defaultTrimmedStringField(200),
});

export type EventBranding = z.infer<typeof eventBrandingSchema>;

/** Update schema — all fields optional (partial update) */
export const updateBrandingSchema = z.object({
  logoStorageKey: z.string().max(500).optional(),
  headerImageStorageKey: z.string().max(500).optional(),
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
  emailSenderName: z.string().trim().max(100).optional(),
  emailFooterText: z.string().trim().max(500).optional(),
  whatsappPrefix: z.string().trim().max(200).optional(),
});

export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;

/** Default branding values for new events */
export const DEFAULT_BRANDING: EventBranding = {
  logoStorageKey: '',
  headerImageStorageKey: '',
  primaryColor: '#1E40AF',
  secondaryColor: '#9333EA',
  emailSenderName: '',
  emailFooterText: '',
  whatsappPrefix: '',
};

/** Allowed image MIME types for branding uploads */
export const BRANDING_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const;

/** Max branding image size: 5MB */
export const BRANDING_IMAGE_MAX_SIZE = 5 * 1024 * 1024;

/** Build R2 storage key for a branding image */
export function buildBrandingStorageKey(
  eventId: string,
  imageType: 'logo' | 'header',
  filename: string,
): string {
  const basename = filename
    .replace(/\0/g, '')
    .split(/[\\/]/)
    .pop() ?? '';
  const strippedLeadingDots = basename.replace(/^\.+/, '');
  const collapsedDots = strippedLeadingDots.replace(/\.{2,}/g, '.');
  const safe = collapsedDots.replace(/[^a-zA-Z0-9.\-]/g, '_').slice(0, 100) || 'file';
  const ts = Date.now().toString(36);
  return `branding/${eventId}/${imageType}/${ts}-${safe}`;
}
