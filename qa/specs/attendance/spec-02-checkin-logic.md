# Spec 02: Check-in Processing Logic

## Source
- `src/lib/actions/checkin.ts` — processQrScan, processManualCheckIn
- `src/lib/attendance/qr-utils.ts` — checkRegistrationEligibility, determineScanResult

## Checkpoints

### CP-01: QR scan — successful check-in for confirmed registration
- Input: valid QR payload, confirmed registration, no prior attendance
- Expected: type='success', attendance record inserted with checkInMethod='qr_scan'

### CP-02: QR scan — invalid/unparseable payload returns invalid
- Input: garbage QR payload
- Expected: type='invalid'

### CP-03: QR scan — event ID mismatch returns invalid
- Input: QR with different eventId than current context
- Expected: type='invalid', message mentions "different event"

### CP-04: QR scan — registration not found returns invalid
- Input: valid QR format but token not in DB
- Expected: type='invalid', message mentions "not recognized"

### CP-05: QR scan — duplicate detection returns duplicate
- Input: person already checked in at event level
- Expected: type='duplicate'

### CP-06: QR scan — session-level duplicate detection
- Input: person already checked in for specific session
- Expected: type='duplicate', message mentions "this session"

### CP-07: QR scan — ineligible registration (pending/cancelled/waitlisted)
- Input: registration with non-confirmed status
- Expected: type='ineligible', includes person details

### CP-08: QR scan — concurrent insert conflict caught as duplicate
- Input: race condition — 23505 error on insert
- Expected: returns duplicate (not throws)

### CP-09: Manual check-in — successful with manual_search method
- Input: valid registrationId, confirmed registration
- Expected: type='success', checkInMethod='manual_search'

### CP-10: Manual check-in — registration not found
- Input: non-existent registrationId
- Expected: type='invalid'

### CP-11: Manual check-in — duplicate detection
- Input: person already checked in
- Expected: type='duplicate'

### CP-12: RBAC — check-in requires write access
- Input: user without write permission
- Expected: assertEventAccess throws

### CP-13: Zod validation — rejects invalid input shapes
- Input: missing fields, wrong types
- Expected: Zod parse throws

### CP-14: Deterministic ID generation
- Input: same eventId + personId + sessionId
- Expected: buildAttendanceRecordId returns same UUID every time

### CP-15: Event-level vs session-level duplicate conditions
- Input: null sessionId → isNull condition; non-null → eq condition
- Expected: correct SQL conditions generated

### CP-16: Path revalidation on successful check-in
- Input: successful QR or manual check-in
- Expected: revalidatePath called with /events/{eventId}/qr

### CP-17: checkRegistrationEligibility — cancelledAt overrides confirmed status
- Input: status='confirmed', cancelledAt=new Date()
- Expected: { eligible: false, reason mentions "cancelled" }

### CP-18: determineScanResult — returns person details for non-invalid types
- Input: all result types with registration data
- Expected: personName, registrationNumber, category present for success/duplicate/ineligible
