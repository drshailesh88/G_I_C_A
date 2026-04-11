import { z } from 'zod';

// ── Registration statuses ──────────────────────────────────────
export const REGISTRATION_STATUSES = ['pending', 'confirmed', 'waitlisted', 'declined', 'cancelled'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

// ── Status transitions ─────────────────────────────────────────
export const REGISTRATION_TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  pending: ['confirmed', 'waitlisted', 'declined', 'cancelled'],
  confirmed: ['cancelled'],
  waitlisted: ['confirmed', 'declined', 'cancelled'],
  declined: [],        // terminal
  cancelled: [],       // terminal
};

// ── Registration categories ────────────────────────────────────
export const REGISTRATION_CATEGORIES = ['delegate', 'faculty', 'invited_guest', 'sponsor', 'volunteer'] as const;
export type RegistrationCategory = (typeof REGISTRATION_CATEGORIES)[number];

// ── Public registration form schema ────────────────────────────
export const publicRegistrationSchema = z.object({
  fullName: z.string().trim().min(1, 'Name is required').max(200),
  email: z.string().email('Invalid email').max(254),
  phone: z.string().min(1, 'Mobile number is required').max(20),
  designation: z.string().max(200).optional().or(z.literal('')),
  specialty: z.string().max(200).optional().or(z.literal('')),
  organization: z.string().max(300).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  age: z.coerce.number().int().min(1).max(120).optional(),
  preferences: z.record(z.string(), z.unknown()).default({}),
});

// ── Admin registration management schema ───────────────────────
export const updateRegistrationStatusSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  registrationId: z.string().uuid('Invalid registration ID'),
  newStatus: z.enum(REGISTRATION_STATUSES),
});

export const registrationIdSchema = z.string().uuid('Invalid registration ID');

// ── Registration number generator ──────────────────────────────
// Format: GEM2026-DEL-00412
export function generateRegistrationNumber(
  eventSlug: string,
  category: RegistrationCategory,
  sequence: number,
): string {
  const prefix = eventSlug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const catCode = category.slice(0, 3).toUpperCase();
  const seq = String(sequence).padStart(5, '0');
  return `${prefix}-${catCode}-${seq}`;
}

// ── QR token generator ─────────────────────────────────────────
export function generateQrToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  for (let i = 0; i < 32; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

export type PublicRegistrationInput = z.infer<typeof publicRegistrationSchema>;
export type UpdateRegistrationStatusInput = z.infer<typeof updateRegistrationStatusSchema>;
