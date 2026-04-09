# Spec 01: Registration Flow — Gap Coverage

## Source
- `src/lib/actions/registration.ts` — registerForEvent()
- `src/lib/validations/registration.ts` — schemas

## Checkpoints

### CP-01: Feature flag closed rejects registration
- Input: eventId with `registration_open` flag returning false
- Expected: throws "Registration is currently closed for this event"

### CP-02: Capacity full without waitlist rejects
- Input: event with maxCapacity=10, current count >= 10, enableWaitlist=false
- Expected: throws "Event has reached maximum capacity"

### CP-03: Capacity full with waitlist → status waitlisted
- Input: event with maxCapacity=10, current count >= 10, enableWaitlist=true
- Expected: registration created with status "waitlisted"

### CP-04: requiresApproval → status pending
- Input: event with requiresApproval=true in registrationSettings
- Expected: registration created with status "pending"

### CP-05: Duplicate registration rejected
- Input: same person already registered for the event
- Expected: throws "You are already registered for this event"

### CP-06: Person deduplication reuses existing person
- Input: findDuplicatePerson returns existing person record
- Expected: no new person inserted, existing personId used

### CP-07: getRegistrationPublic returns non-sensitive fields
- Input: valid registration ID
- Expected: returns {id, registrationNumber, status, qrCodeToken, category}

### CP-08: getRegistrationPublic rejects invalid UUID
- Input: "not-a-uuid"
- Expected: throws (Zod validation error)

### CP-09: getRegistrationPublic throws for missing registration
- Input: valid UUID that doesn't exist
- Expected: throws "Registration not found"
