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
  departureAtUtc: z.string().optional().or(z.literal('')),
  arrivalAtUtc: z.string().optional().or(z.literal('')),
  carrierName: z.string().trim().max(200).optional().or(z.literal('')),
  serviceNumber: z.string().trim().max(50).optional().or(z.literal('')),
  pnrOrBookingRef: z.string().trim().max(50).optional().or(z.literal('')),
  seatOrCoach: z.string().trim().max(50).optional().or(z.literal('')),
  terminalOrGate: z.string().trim().max(100).optional().or(z.literal('')),
  attachmentUrl: z.string().trim().max(500).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
}).refine(
  (data) => {
    if (data.departureAtUtc && data.arrivalAtUtc) {
      return new Date(data.arrivalAtUtc) > new Date(data.departureAtUtc);
    }
    return true;
  },
  { message: 'Arrival must be after departure', path: ['arrivalAtUtc'] },
);

// ── Update travel record schema ───────────────────────────────
export const updateTravelRecordSchema = z.object({
  travelRecordId: z.string().uuid('Invalid travel record ID'),
  direction: z.enum(TRAVEL_DIRECTIONS).optional(),
  travelMode: z.enum(TRAVEL_MODES).optional(),
  fromCity: z.string().trim().min(1).max(200).optional(),
  fromLocation: z.string().trim().max(300).optional().or(z.literal('')),
  toCity: z.string().trim().min(1).max(200).optional(),
  toLocation: z.string().trim().max(300).optional().or(z.literal('')),
  departureAtUtc: z.string().optional().or(z.literal('')),
  arrivalAtUtc: z.string().optional().or(z.literal('')),
  carrierName: z.string().trim().max(200).optional().or(z.literal('')),
  serviceNumber: z.string().trim().max(50).optional().or(z.literal('')),
  pnrOrBookingRef: z.string().trim().max(50).optional().or(z.literal('')),
  seatOrCoach: z.string().trim().max(50).optional().or(z.literal('')),
  terminalOrGate: z.string().trim().max(100).optional().or(z.literal('')),
  attachmentUrl: z.string().trim().max(500).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
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
  departureAtUtc: z.string().optional().or(z.literal('')),
  arrivalAtUtc: z.string().optional().or(z.literal('')),
  carrierName: z.string().optional().or(z.literal('')),
  serviceNumber: z.string().optional().or(z.literal('')),
  pnrOrBookingRef: z.string().optional().or(z.literal('')),
  terminalOrGate: z.string().optional().or(z.literal('')),
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
