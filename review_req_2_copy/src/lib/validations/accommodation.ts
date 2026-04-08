import { z } from 'zod';

// ── Record statuses ───────────────────────────────────────────
export const ACCOMMODATION_RECORD_STATUSES = ['draft', 'confirmed', 'sent', 'changed', 'cancelled'] as const;
export type AccommodationRecordStatus = (typeof ACCOMMODATION_RECORD_STATUSES)[number];

export const ACCOMMODATION_RECORD_TRANSITIONS: Record<AccommodationRecordStatus, AccommodationRecordStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['sent', 'changed', 'cancelled'],
  sent: ['changed', 'cancelled'],
  changed: ['confirmed', 'sent', 'cancelled'],
  cancelled: [],  // terminal — soft cancel only
};

// ── Room types ────────────────────────────────────────────────
export const ROOM_TYPES = ['single', 'double', 'twin', 'triple', 'suite', 'dormitory', 'other'] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

// ── Create accommodation record schema ────────────────────────
export const createAccommodationRecordSchema = z.object({
  personId: z.string().uuid('Invalid person ID'),
  registrationId: z.string().uuid('Invalid registration ID').optional().or(z.literal('')),
  hotelName: z.string().trim().min(1, 'Hotel name is required').max(300),
  hotelAddress: z.string().trim().max(500).optional().or(z.literal('')),
  hotelCity: z.string().trim().max(200).optional().or(z.literal('')),
  googleMapsUrl: z.string().trim().max(1000).optional().or(z.literal('')),
  roomType: z.enum(ROOM_TYPES).optional(),
  roomNumber: z.string().trim().max(50).optional().or(z.literal('')),
  sharedRoomGroup: z.string().trim().max(100).optional().or(z.literal('')),
  checkInDate: z.string().min(1, 'Check-in date is required'),
  checkOutDate: z.string().min(1, 'Check-out date is required'),
  bookingReference: z.string().trim().max(100).optional().or(z.literal('')),
  attachmentUrl: z.string().trim().max(500).optional().or(z.literal('')),
  specialRequests: z.string().trim().max(2000).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
}).refine(
  (data) => new Date(data.checkOutDate) > new Date(data.checkInDate),
  { message: 'Check-out must be after check-in', path: ['checkOutDate'] },
);

// ── Update accommodation record schema ────────────────────────
export const updateAccommodationRecordSchema = z.object({
  accommodationRecordId: z.string().uuid('Invalid accommodation record ID'),
  hotelName: z.string().trim().min(1).max(300).optional(),
  hotelAddress: z.string().trim().max(500).optional().or(z.literal('')),
  hotelCity: z.string().trim().max(200).optional().or(z.literal('')),
  googleMapsUrl: z.string().trim().max(1000).optional().or(z.literal('')),
  roomType: z.enum(ROOM_TYPES).optional(),
  roomNumber: z.string().trim().max(50).optional().or(z.literal('')),
  sharedRoomGroup: z.string().trim().max(100).optional().or(z.literal('')),
  checkInDate: z.string().optional(),
  checkOutDate: z.string().optional(),
  bookingReference: z.string().trim().max(100).optional().or(z.literal('')),
  attachmentUrl: z.string().trim().max(500).optional().or(z.literal('')),
  specialRequests: z.string().trim().max(2000).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

// ── Cancel accommodation record schema ────────────────────────
export const cancelAccommodationRecordSchema = z.object({
  accommodationRecordId: z.string().uuid('Invalid accommodation record ID'),
  reason: z.string().trim().max(500).optional().or(z.literal('')),
});

export const accommodationRecordIdSchema = z.string().uuid('Invalid accommodation record ID');

// ── Derived types ─────────────────────────────────────────────
export type CreateAccommodationRecordInput = z.infer<typeof createAccommodationRecordSchema>;
export type UpdateAccommodationRecordInput = z.infer<typeof updateAccommodationRecordSchema>;
export type CancelAccommodationRecordInput = z.infer<typeof cancelAccommodationRecordSchema>;

// ── Cascade trigger fields ────────────────────────────────────
export const ACCOM_CASCADE_TRIGGER_FIELDS = [
  'hotelName', 'checkInDate', 'checkOutDate', 'hotelCity', 'sharedRoomGroup',
] as const;

export function buildAccommodationChangeSummary(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const summary: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of ACCOM_CASCADE_TRIGGER_FIELDS) {
    const prev = previous[field] ?? null;
    const curr = current[field] ?? null;
    if (String(prev) !== String(curr)) {
      summary[field] = { from: prev, to: curr };
    }
  }
  return summary;
}

export function hasAccomCascadeTriggerChanges(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
): boolean {
  return Object.keys(buildAccommodationChangeSummary(previous, current)).length > 0;
}
