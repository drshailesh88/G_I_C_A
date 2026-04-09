# Spec 04: Search, Records & Statistics

## Source
- `src/lib/actions/checkin-search.ts` — searchRegistrationsForCheckIn
- `src/lib/actions/attendance.ts` — listAttendanceRecords, getAttendanceStats, getConfirmedRegistrationCount

## Checkpoints

### CP-01: Search returns matching registrations with check-in status
- Input: query matching a person name
- Expected: array with registrationId, fullName, alreadyCheckedIn flag

### CP-02: Search marks already-checked-in registrations
- Input: query returns mix of checked-in and not
- Expected: alreadyCheckedIn=true for checked-in, false for others

### CP-03: Search escapes SQL LIKE wildcards
- Input: query containing %, _, \
- Expected: characters escaped before wrapping in ILIKE wildcards

### CP-04: Search limits results to 20
- Input: query matching 50+ registrations
- Expected: max 20 returned

### CP-05: Search is session-aware for attendance lookup
- Input: sessionId provided → checks session-level attendance
- Expected: alreadyCheckedIn reflects session-level check-in

### CP-06: Search skips attendance lookup when no results
- Input: query matching zero registrations
- Expected: no attendance query executed

### CP-07: listAttendanceRecords filters by sessionId
- Input: sessionId filter
- Expected: only records for that session

### CP-08: listAttendanceRecords filters by date (IST boundaries)
- Input: date="2025-01-15"
- Expected: records where checkInAt AT TIME ZONE 'Asia/Kolkata' falls on that date

### CP-09: listAttendanceRecords limits to 500
- Input: event with 1000+ records
- Expected: max 500 returned

### CP-10: getAttendanceStats returns by-method and by-session breakdowns
- Input: event with QR and manual check-ins across sessions
- Expected: byMethod and bySession maps with correct counts

### CP-11: getAttendanceStats maps null sessionId to "event_level"
- Input: records with null sessionId
- Expected: bySession has "event_level" key

### CP-12: getAttendanceStats runs in single transaction
- Input: any query
- Expected: all three queries (total, by-method, by-session) in one transaction

### CP-13: getConfirmedRegistrationCount counts only confirmed
- Input: event with mix of confirmed/pending/cancelled registrations
- Expected: count of only confirmed ones

### CP-14: All read actions allow read-only access
- Input: user with read-only role
- Expected: assertEventAccess(eventId, { requireWrite: false }) passes

### CP-15: All actions validate input with Zod
- Input: invalid input shapes
- Expected: Zod parse throws
