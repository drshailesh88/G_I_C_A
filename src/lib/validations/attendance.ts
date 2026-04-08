import { z } from 'zod';

// ── Check-in methods ──────────────────────────────────────────
export const CHECK_IN_METHODS = ['qr_scan', 'manual_search', 'kiosk', 'self_service'] as const;
export type CheckInMethod = (typeof CHECK_IN_METHODS)[number];

const uuidSchema = (message: string) => z.string().trim().uuid(message);
const requiredTrimmedString = (message: string, max: number) =>
  z.string().trim().min(1, message).max(max);
const optionalDeviceIdSchema = requiredTrimmedString('Device ID is required', 100).optional();

// ── QR scan input schema ──────────────────────────────────────
export const qrScanSchema = z.object({
  eventId: uuidSchema('Invalid event ID'),
  qrPayload: requiredTrimmedString('QR payload is required', 500),
  sessionId: uuidSchema('Invalid session ID').nullable().optional(),
  deviceId: optionalDeviceIdSchema,
}).strict();

// ── Manual check-in schema ────────────────────────────────────
export const manualCheckInSchema = z.object({
  eventId: uuidSchema('Invalid event ID'),
  registrationId: uuidSchema('Invalid registration ID'),
  sessionId: uuidSchema('Invalid session ID').nullable().optional(),
}).strict();

// ── Attendance query schema ───────────────────────────────────
export const attendanceQuerySchema = z.object({
  eventId: uuidSchema('Invalid event ID'),
  sessionId: uuidSchema('Invalid session ID').nullable().optional(),
  date: z.string().trim().date('Invalid date format (YYYY-MM-DD)').optional(),
}).strict();

// ── Offline sync batch schema ─────────────────────────────────
export const offlineSyncItemSchema = z.object({
  qrPayload: requiredTrimmedString('QR payload is required', 500),
  sessionId: uuidSchema('Invalid session ID').nullable().optional(),
  scannedAt: z.string().trim().datetime('Invalid ISO datetime'),
  deviceId: requiredTrimmedString('Device ID is required', 100),
}).strict();

export const offlineSyncBatchSchema = z.object({
  eventId: uuidSchema('Invalid event ID'),
  records: z.array(offlineSyncItemSchema).min(1).max(500),
}).strict();

// ── Person search for manual check-in ─────────────────────────
export const checkInSearchSchema = z.object({
  eventId: uuidSchema('Invalid event ID'),
  query: requiredTrimmedString('Search query is required', 200),
}).strict();

export type QrScanInput = z.infer<typeof qrScanSchema>;
export type ManualCheckInInput = z.infer<typeof manualCheckInSchema>;
export type AttendanceQueryInput = z.infer<typeof attendanceQuerySchema>;
export type OfflineSyncBatchInput = z.infer<typeof offlineSyncBatchSchema>;
export type CheckInSearchInput = z.infer<typeof checkInSearchSchema>;
