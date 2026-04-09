# Spec 03: Batch Offline Sync

## Source
- `src/lib/actions/batch-sync.ts` — processBatchSync
- `src/lib/attendance/offline-queue.ts` — queue operations

## Checkpoints

### CP-01: Syncs single valid record successfully
- Input: batch with one valid QR payload
- Expected: synced=1, result type='success'

### CP-02: Invalid QR payload counted as error
- Input: batch with unparseable payload
- Expected: errors=1, result type='invalid'

### CP-03: Wrong event ID counted as error
- Input: QR payload with different eventId
- Expected: errors=1, result type='invalid'

### CP-04: Duplicate insert caught and counted
- Input: record that already exists (23505)
- Expected: duplicates=1, result type='duplicate'

### CP-05: Mixed batch — one failure doesn't abort others
- Input: [valid, invalid, valid, duplicate]
- Expected: synced=2, errors=1, duplicates=1

### CP-06: Ineligible registration counted as error
- Input: QR for pending registration
- Expected: errors=1, result type='ineligible'

### CP-07: scannedAt preserved as checkInAt
- Input: record with specific scannedAt timestamp
- Expected: attendance.checkInAt = new Date(scannedAt)

### CP-08: deviceId preserved in attendance record
- Input: record with deviceId
- Expected: attendance.offlineDeviceId = deviceId

### CP-09: syncedAt set on batch processing time
- Input: any batch
- Expected: attendance.syncedAt = batch processing timestamp

### CP-10: RBAC — batch sync requires write access
- Input: user without write permission
- Expected: assertEventAccess throws

### CP-11: Zod validation — rejects empty records array
- Input: { eventId, records: [] }
- Expected: Zod parse throws

### CP-12: Database error (non-duplicate) during insert
- Input: DB throws non-23505 error
- Expected: errors++, result type='invalid', message="Database error during sync."

### CP-13: Registration lookup failure doesn't abort batch
- Input: DB throws during SELECT for one record
- Expected: that record errors, later records still processed

### CP-14: Person lookup failure doesn't abort batch
- Input: DB throws during person SELECT
- Expected: that record errors, later records still processed

### CP-15: Event ID comparison is case-insensitive
- Input: QR eventId in uppercase, route eventId in lowercase
- Expected: passes validation, processes normally
