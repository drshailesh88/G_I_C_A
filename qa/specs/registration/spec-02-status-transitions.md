# Spec 02: Status Transitions — Gap Coverage

## Source
- `src/lib/actions/registration.ts` — updateRegistrationStatus()
- `src/lib/validations/registration.ts` — REGISTRATION_TRANSITIONS

## Checkpoints

### CP-10: cancelledAt timestamp set when transitioning to cancelled
- Input: pending registration → cancelled
- Expected: update payload includes cancelledAt as Date

### CP-11: waitlisted → confirmed allowed
- Input: waitlisted registration, newStatus=confirmed
- Expected: returns updated registration with status=confirmed

### CP-12: waitlisted → declined allowed
- Input: waitlisted registration, newStatus=declined
- Expected: returns updated registration with status=declined

### CP-13: waitlisted → cancelled allowed
- Input: waitlisted registration, newStatus=cancelled
- Expected: returns updated registration with status=cancelled

### CP-14: pending → declined allowed
- Input: pending registration, newStatus=declined
- Expected: returns updated with status=declined

### CP-15: pending → cancelled allowed
- Input: pending registration, newStatus=cancelled
- Expected: returns updated with status=cancelled, cancelledAt set

### CP-16: pending → waitlisted allowed
- Input: pending registration, newStatus=waitlisted
- Expected: returns updated with status=waitlisted

### CP-17: confirmed → confirmed blocked
- Input: confirmed registration, newStatus=confirmed
- Expected: throws "Cannot transition"

### CP-18: assertEventAccess called with requireWrite
- Input: any valid status transition
- Expected: assertEventAccess called with (eventId, {requireWrite: true})
