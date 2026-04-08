import { z } from 'zod';

// ── Check-in methods ──────────────────────────────────────────
export const CHECK_IN_METHODS = ['qr_scan', 'manual_search', 'kiosk', 'self_service'] as const;
export type CheckInMethod = (typeof CHECK_IN_METHODS)[number];

// ── QR scan input schema ──────────────────────────────────────
export const qrScanSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  qrPayload: z.string().min(1, 'QR payload is required').max(500),
  sessionId: z.string().uuid('Invalid session ID').nullable().optional(),
  deviceId: z.string().max(100).optional(),
});

// ── Manual check-in schema ────────────────────────────────────
export const manualCheckInSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  registrationId: z.string().uuid('Invalid registration ID'),
  sessionId: z.string().uuid('Invalid session ID').nullable().optional(),
});

// ── Attendance query schema ───────────────────────────────────
export const attendanceQuerySchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  sessionId: z.string().uuid('Invalid session ID').nullable().optional(),
  date: z.string().date('Invalid date format (YYYY-MM-DD)').optional(),
});

// ── Offline sync batch schema ─────────────────────────────────
export const offlineSyncItemSchema = z.object({
  qrPayload: z.string().min(1).max(500),
  sessionId: z.string().uuid().nullable().optional(),
  scannedAt: z.string().datetime('Invalid ISO datetime'),
  deviceId: z.string().max(100),
});

export const offlineSyncBatchSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  records: z.array(offlineSyncItemSchema).min(1).max(500),
});

// ── Person search for manual check-in ─────────────────────────
export const checkInSearchSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  query: z.string().trim().min(1, 'Search query is required').max(200),
});

export type QrScanInput = z.infer<typeof qrScanSchema>;
export type ManualCheckInInput = z.infer<typeof manualCheckInSchema>;
export type AttendanceQueryInput = z.infer<typeof attendanceQuerySchema>;
export type OfflineSyncBatchInput = z.infer<typeof offlineSyncBatchSchema>;
export type CheckInSearchInput = z.infer<typeof checkInSearchSchema>;
