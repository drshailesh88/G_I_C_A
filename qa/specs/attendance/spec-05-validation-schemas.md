# Spec 05: Zod Validation Schemas

## Source
- `src/lib/validations/attendance.ts` — all schemas

## Checkpoints

### CP-01: qrScanSchema accepts valid input with all fields
- Input: { eventId: uuid, qrPayload: "...", sessionId: uuid, deviceId: "..." }
- Expected: passes validation

### CP-02: qrScanSchema accepts null sessionId
- Input: { eventId, qrPayload, sessionId: null }
- Expected: passes validation

### CP-03: qrScanSchema rejects invalid eventId
- Input: eventId="not-a-uuid"
- Expected: validation error

### CP-04: qrScanSchema rejects empty/whitespace qrPayload
- Input: qrPayload="" or "   "
- Expected: validation error

### CP-05: qrScanSchema rejects extra properties (strict mode)
- Input: { ...valid, extraField: "hack" }
- Expected: validation error

### CP-06: manualCheckInSchema accepts valid input
- Input: { eventId: uuid, registrationId: uuid }
- Expected: passes

### CP-07: manualCheckInSchema rejects invalid registrationId
- Input: registrationId="bad"
- Expected: validation error

### CP-08: attendanceQuerySchema accepts eventId only
- Input: { eventId: uuid }
- Expected: passes

### CP-09: attendanceQuerySchema accepts date filter
- Input: { eventId, date: "2025-01-15" }
- Expected: passes

### CP-10: attendanceQuerySchema rejects invalid date format
- Input: date="15-01-2025"
- Expected: validation error

### CP-11: offlineSyncBatchSchema accepts valid batch
- Input: { eventId, records: [{ qrPayload, scannedAt, deviceId }] }
- Expected: passes

### CP-12: offlineSyncBatchSchema rejects empty records
- Input: { eventId, records: [] }
- Expected: validation error (min 1)

### CP-13: offlineSyncBatchSchema rejects >500 records
- Input: records array with 501 items
- Expected: validation error (max 500)

### CP-14: checkInSearchSchema trims and validates query
- Input: query="  john  " → trimmed to "john"
- Expected: passes, trimmed value used

### CP-15: checkInSearchSchema rejects query over 200 chars
- Input: query with 201 characters
- Expected: validation error

### CP-16: offlineSyncItemSchema rejects whitespace-only deviceId
- Input: deviceId="   "
- Expected: validation error

### CP-17: offlineSyncItemSchema validates scannedAt as ISO datetime
- Input: scannedAt="not-a-date"
- Expected: validation error
