import { z } from 'zod';

// Valid lifecycle states
export const EVENT_STATUSES = ['draft', 'published', 'completed', 'archived', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

// Valid state transitions
export const EVENT_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ['published', 'cancelled'],
  published: ['completed', 'cancelled'],
  completed: ['archived'],
  archived: [],         // terminal
  cancelled: [],        // terminal
};

// Module toggle keys
export const MODULE_KEYS = [
  'scientific_program',
  'registration',
  'travel_accommodation',
  'certificates',
  'qr_checkin',
  'transport_planning',
  'communications',
] as const;

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function requiredDateSchema(fieldLabel: string) {
  return z
    .string()
    .trim()
    .min(1, `${fieldLabel} is required`)
    .refine(isValidDateOnly, `${fieldLabel} must be a valid date in YYYY-MM-DD format`);
}

const optionalDateSchema = z
  .string()
  .trim()
  .refine(isValidDateOnly, 'Date must be a valid date in YYYY-MM-DD format');

const timeZoneSchema = z
  .string()
  .trim()
  .min(1, 'Timezone is required')
  .max(100)
  .refine(isValidTimeZone, 'Timezone must be a valid IANA timezone');

export const moduleTogglesSchema = z.object(
  Object.fromEntries(MODULE_KEYS.map((key) => [key, z.boolean().default(true)])) as Record<
    (typeof MODULE_KEYS)[number],
    z.ZodDefault<z.ZodBoolean>
  >,
);

export const createEventSchema = z.object({
  name: z.string().trim().min(1, 'Event name is required').max(200),
  startDate: requiredDateSchema('Start date'),
  endDate: requiredDateSchema('End date'),
  timezone: timeZoneSchema.default('Asia/Kolkata'),
  venueName: z.string().trim().min(1, 'Venue is required').max(300),
  venueAddress: z.string().max(500).optional(),
  venueCity: z.string().max(100).optional(),
  venueMapUrl: z.string().url().optional().or(z.literal('')),
  description: z.string().max(2000).optional(),
  moduleToggles: moduleTogglesSchema,
}).refine(
  (data) => data.endDate >= data.startDate,
  { message: 'End date must be on or after start date', path: ['endDate'] },
);

export const eventIdSchema = z.string().uuid('Invalid event ID');

export const updateEventStatusSchema = z.object({
  eventId: eventIdSchema,
  newStatus: z.enum(EVENT_STATUSES),
});

export const updateEventSchema = createEventSchema;

export const registrationSettingsSchema = z.object({
  approvalRequired: z.boolean().default(false),
  maxCapacity: z.number().int().min(1).nullable().optional().transform((v) => v ?? null),
  waitlistEnabled: z.boolean().default(false),
  cutoffDate: optionalDateSchema.nullable().optional().transform((v) => v ?? null),
  preferenceFields: z.object({
    dietaryNeeds: z.boolean().default(true),
    travelPreferences: z.boolean().default(true),
    accessibilityRequirements: z.boolean().default(true),
  }).default({}),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type UpdateEventStatusInput = z.infer<typeof updateEventStatusSchema>;
export type RegistrationSettings = z.infer<typeof registrationSettingsSchema>;
