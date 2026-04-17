import { z } from 'zod';
import { normalizePhone } from './person';

const DANGEROUS_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_PREFERENCES_DEPTH = 8;

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateJsonValue(
  value: unknown,
  ctx: z.RefinementCtx,
  path: (string | number)[],
  seen: Set<object>,
  depth = 0,
): void {
  if (depth > MAX_PREFERENCES_DEPTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Preferences cannot be nested deeper than ${MAX_PREFERENCES_DEPTH} levels`,
      path,
    });
    return;
  }

  if (value === null) {
    return;
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return;
    case 'number':
      if (Number.isFinite(value)) {
        return;
      }
      break;
    case 'bigint':
    case 'function':
    case 'symbol':
    case 'undefined':
      break;
    case 'object': {
      if (seen.has(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Preferences must not contain circular references',
          path,
        });
        return;
      }

      seen.add(value);

      if (Array.isArray(value)) {
        for (const [index, item] of value.entries()) {
          validateJsonValue(item, ctx, [...path, index], seen, depth + 1);
        }
        seen.delete(value);
        return;
      }

      if (!isPlainObject(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Preferences must be plain JSON-compatible objects',
          path,
        });
        seen.delete(value);
        return;
      }

      for (const [key, item] of Object.entries(value)) {
        if (DANGEROUS_OBJECT_KEYS.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Preferences cannot contain reserved key "${key}"`,
            path: [...path, key],
          });
          continue;
        }

        validateJsonValue(item, ctx, [...path, key], seen, depth + 1);
      }

      seen.delete(value);
      return;
    }
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Preferences must contain only JSON-compatible values',
    path,
  });
}

const requiredPhoneSchema = z.preprocess(
  trimString,
  z
    .string()
    .min(1, 'Mobile number is required')
    .max(20)
    .refine((value) => {
      try {
        normalizePhone(value);
        return true;
      } catch {
        return false;
      }
    }, 'Invalid phone number'),
);

const trimmedOptionalString = (max: number) => z.preprocess(
  trimString,
  z.union([z.literal(''), z.string().max(max)]).optional(),
);

const optionalAgeSchema = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    if (/^\d+$/.test(trimmed)) {
      return Number(trimmed);
    }
  }

  return value;
}, z.number().int().min(1).max(120).optional());

const preferencesSchema = z
  .preprocess((value) => value ?? {}, z.unknown())
  .superRefine((value, ctx) => {
    if (!isPlainObject(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Preferences must be a plain object',
        path: [],
      });
      return;
    }

    validateJsonValue(value, ctx, [], new Set<object>());
  })
  .transform((value) => value as Record<string, JsonValue>);

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
  email: z.preprocess(trimString, z.string().email('Invalid email').max(254)),
  phone: requiredPhoneSchema,
  designation: trimmedOptionalString(200),
  specialty: trimmedOptionalString(200),
  organization: trimmedOptionalString(300),
  city: trimmedOptionalString(100),
  age: optionalAgeSchema,
  preferences: preferencesSchema,
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
