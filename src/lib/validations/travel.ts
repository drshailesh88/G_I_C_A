import { z } from 'zod';

// ── Travel directions ─────────────────────────────────────────
export const TRAVEL_DIRECTIONS = ['inbound', 'outbound', 'intercity', 'other'] as const;
export type TravelDirection = (typeof TRAVEL_DIRECTIONS)[number];

// ── Travel modes ──────────────────────────────────────────────
export const TRAVEL_MODES = ['flight', 'train', 'car', 'bus', 'self_arranged', 'other'] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

// ── Record statuses ───────────────────────────────────────────
export const TRAVEL_RECORD_STATUSES = ['draft', 'confirmed', 'sent', 'changed', 'cancelled'] as const;
export type TravelRecordStatus = (typeof TRAVEL_RECORD_STATUSES)[number];

// ── Status transitions ────────────────────────────────────────
export const TRAVEL_RECORD_TRANSITIONS: Record<TravelRecordStatus, TravelRecordStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['sent', 'changed', 'cancelled'],
  sent: ['changed', 'cancelled'],
  changed: ['confirmed', 'sent', 'cancelled'],
  cancelled: [],  // terminal — soft cancel only
};

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function parseUtcTimestamp(value: string): Date | null {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.(\d{1,3}))?Z$/,
  );

  if (!match) {
    return null;
  }

  const [, yearPart, monthPart, dayPart, hourPart, minutePart, secondPart, , millisPart] = match;
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  const second = Number(secondPart);
  const millisecond = millisPart ? Number(millisPart.padEnd(3, '0')) : 0;

  if (
    month < 1 || month > 12
    || day < 1 || day > 31
    || hour > 23
    || minute > 59
    || second > 59
  ) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
    || parsed.getUTCHours() !== hour
    || parsed.getUTCMinutes() !== minute
    || parsed.getUTCSeconds() !== second
    || parsed.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }

  return parsed;
}

function isValidUtcTimestamp(value: string): boolean {
  return parseUtcTimestamp(value) !== null;
}

function getTimestampMillis(value: string): number | null {
  return parseUtcTimestamp(value)?.getTime() ?? null;
}

const optionalUtcTimestampSchema = (label: string) =>
  z.preprocess(
    trimString,
    z.union([
      z.literal(''),
      z
        .string()
        .min(1, `${label} must be a valid UTC timestamp`)
        .refine(isValidUtcTimestamp, `${label} must be a valid UTC timestamp`),
    ]).optional(),
  );

// ── Create travel record schema ───────────────────────────────
export const createTravelRecordSchema = z.object({
  personId: z.string().uuid('Invalid person ID'),
  registrationId: z.string().uuid('Invalid registration ID').optional().or(z.literal('')),
  direction: z.enum(TRAVEL_DIRECTIONS),
  travelMode: z.enum(TRAVEL_MODES),
  fromCity: z.string().trim().min(1, 'From city is required').max(200),
  fromLocation: z.string().trim().max(300).optional().or(z.literal('')),
  toCity: z.string().trim().min(1, 'To city is required').max(200),
  toLocation: z.string().trim().max(300).optional().or(z.literal('')),
  departureAtUtc: optionalUtcTimestampSchema('Departure time'),
  arrivalAtUtc: optionalUtcTimestampSchema('Arrival time'),
  carrierName: z.string().trim().max(200).optional().or(z.literal('')),
  serviceNumber: z.string().trim().max(50).optional().or(z.literal('')),
  pnrOrBookingRef: z.string().trim().max(50).optional().or(z.literal('')),
  seatOrCoach: z.string().trim().max(50).optional().or(z.literal('')),
  terminalOrGate: z.string().trim().max(100).optional().or(z.literal('')),
  attachmentUrl: z.string().trim().max(500).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  if (!data.departureAtUtc || !data.arrivalAtUtc) {
    return;
  }

  const departureMillis = getTimestampMillis(data.departureAtUtc);
  const arrivalMillis = getTimestampMillis(data.arrivalAtUtc);

  if (
    departureMillis !== null
    && arrivalMillis !== null
    && arrivalMillis <= departureMillis
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Arrival must be after departure',
      path: ['arrivalAtUtc'],
    });
  }
});

// ── Update travel record schema ───────────────────────────────
export const updateTravelRecordSchema = z.object({
  travelRecordId: z.string().uuid('Invalid travel record ID'),
  direction: z.enum(TRAVEL_DIRECTIONS).optional(),
  travelMode: z.enum(TRAVEL_MODES).optional(),
  fromCity: z.string().trim().min(1).max(200).optional(),
  fromLocation: z.string().trim().max(300).optional().or(z.literal('')),
  toCity: z.string().trim().min(1).max(200).optional(),
  toLocation: z.string().trim().max(300).optional().or(z.literal('')),
  departureAtUtc: optionalUtcTimestampSchema('Departure time'),
  arrivalAtUtc: optionalUtcTimestampSchema('Arrival time'),
  carrierName: z.string().trim().max(200).optional().or(z.literal('')),
  serviceNumber: z.string().trim().max(50).optional().or(z.literal('')),
  pnrOrBookingRef: z.string().trim().max(50).optional().or(z.literal('')),
  seatOrCoach: z.string().trim().max(50).optional().or(z.literal('')),
  terminalOrGate: z.string().trim().max(100).optional().or(z.literal('')),
  attachmentUrl: z.string().trim().max(500).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  if (!data.departureAtUtc || !data.arrivalAtUtc) {
    return;
  }

  const departureMillis = getTimestampMillis(data.departureAtUtc);
  const arrivalMillis = getTimestampMillis(data.arrivalAtUtc);

  if (
    departureMillis !== null
    && arrivalMillis !== null
    && arrivalMillis <= departureMillis
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Arrival must be after departure',
      path: ['arrivalAtUtc'],
    });
  }
});

// ── Cancel travel record schema ───────────────────────────────
export const cancelTravelRecordSchema = z.object({
  travelRecordId: z.string().uuid('Invalid travel record ID'),
  reason: z.string().trim().max(500).optional().or(z.literal('')),
});

// ── CSV import row schema ─────────────────────────────────────
export const travelCsvRowSchema = z.object({
  personEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  personPhone: z.string().optional().or(z.literal('')),
  personName: z.string().optional().or(z.literal('')),
  direction: z.enum(TRAVEL_DIRECTIONS),
  travelMode: z.enum(TRAVEL_MODES),
  fromCity: z.string().trim().min(1, 'From city is required'),
  toCity: z.string().trim().min(1, 'To city is required'),
  fromLocation: z.string().optional().or(z.literal('')),
  toLocation: z.string().optional().or(z.literal('')),
  departureAtUtc: optionalUtcTimestampSchema('Departure time'),
  arrivalAtUtc: optionalUtcTimestampSchema('Arrival time'),
  carrierName: z.string().optional().or(z.literal('')),
  serviceNumber: z.string().optional().or(z.literal('')),
  pnrOrBookingRef: z.string().optional().or(z.literal('')),
  terminalOrGate: z.string().optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  if (!data.departureAtUtc || !data.arrivalAtUtc) {
    return;
  }

  const departureMillis = getTimestampMillis(data.departureAtUtc);
  const arrivalMillis = getTimestampMillis(data.arrivalAtUtc);

  if (
    departureMillis !== null
    && arrivalMillis !== null
    && arrivalMillis <= departureMillis
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Arrival must be after departure',
      path: ['arrivalAtUtc'],
    });
  }
});

export const travelRecordIdSchema = z.string().uuid('Invalid travel record ID');

// ── Derived types ─────────────────────────────────────────────
export type CreateTravelRecordInput = z.infer<typeof createTravelRecordSchema>;
export type UpdateTravelRecordInput = z.infer<typeof updateTravelRecordSchema>;
export type CancelTravelRecordInput = z.infer<typeof cancelTravelRecordSchema>;
export type TravelCsvRow = z.infer<typeof travelCsvRowSchema>;

// ── Change detection for cascade ──────────────────────────────
/** Fields that trigger cascade events when changed */
export const CASCADE_TRIGGER_FIELDS = [
  'arrivalAtUtc', 'departureAtUtc', 'fromCity', 'toCity', 'terminalOrGate', 'direction',
] as const;

/** Build a human-readable change summary for cascade events */
export function buildTravelChangeSummary(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const summary: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of CASCADE_TRIGGER_FIELDS) {
    const prev = previous[field] ?? null;
    const curr = current[field] ?? null;
    if (String(prev) !== String(curr)) {
      summary[field] = { from: prev, to: curr };
    }
  }
  return summary;
}

/** Check if a travel update has cascade-triggering changes */
export function hasCascadeTriggerChanges(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
): boolean {
  return Object.keys(buildTravelChangeSummary(previous, current)).length > 0;
}
