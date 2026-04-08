import { z } from 'zod';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

// ── Phone normalization ────────────────────────────────────────
export function normalizePhone(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned) return '';

  // Default to India (+91) if no country code
  const parsed = parsePhoneNumber(cleaned, 'IN');
  if (!parsed || !parsed.isValid()) {
    throw new Error(`Invalid phone number: ${cleaned}`);
  }
  return parsed.number; // E.164 format
}

// ── Salutation values ──────────────────────────────────────────
export const SALUTATIONS = ['Dr', 'Prof', 'Mr', 'Mrs', 'Ms', 'Mx', 'Other'] as const;
export type Salutation = (typeof SALUTATIONS)[number];

// ── Person categories (used in saved views) ────────────────────
export const PERSON_CATEGORIES = ['faculty', 'delegate', 'sponsor', 'vip', 'volunteer'] as const;

// ── Create / Update schemas ────────────────────────────────────
export const createPersonSchema = z.object({
  salutation: z.enum(SALUTATIONS).optional(),
  fullName: z.string().trim().min(1, 'Full name is required').max(200),
  email: z.string().email('Invalid email').max(254).optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
  designation: z.string().max(200).optional().or(z.literal('')),
  specialty: z.string().max(200).optional().or(z.literal('')),
  organization: z.string().max(300).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  tags: z.array(z.string().max(50)).max(20).default([]),
}).refine(
  (data) => (data.email && data.email.length > 0) || (data.phone && data.phone.length > 0),
  { message: 'At least one of email or mobile is required', path: ['email'] },
);

// Base shape without the refinement — used for partial updates
const personFieldsSchema = z.object({
  salutation: z.enum(SALUTATIONS).optional(),
  fullName: z.string().trim().min(1, 'Full name is required').max(200),
  email: z.string().email('Invalid email').max(254).optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
  designation: z.string().max(200).optional().or(z.literal('')),
  specialty: z.string().max(200).optional().or(z.literal('')),
  organization: z.string().max(300).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

export const updatePersonSchema = personFieldsSchema.partial().extend({
  personId: z.string().uuid('Invalid person ID'),
});

export const personIdSchema = z.string().uuid('Invalid person ID');

// ── Search schema ──────────────────────────────────────────────
export const personSearchSchema = z.object({
  query: z.string().max(200).optional(),
  organization: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  specialty: z.string().max(200).optional(),
  tag: z.string().max(50).optional(),
  view: z.enum(['all', 'faculty', 'delegates', 'sponsors', 'vips', 'recent']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;
export type PersonSearchInput = z.infer<typeof personSearchSchema>;
