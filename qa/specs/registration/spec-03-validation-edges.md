# Spec 03: Validation Edge Cases

## Source
- `src/lib/validations/registration.ts` — publicRegistrationSchema

## Checkpoints

### CP-19: Name at max length (200 chars) accepted
- Input: fullName = 'A'.repeat(200)
- Expected: passes validation

### CP-20: Name exceeding max length (201 chars) rejected
- Input: fullName = 'A'.repeat(201)
- Expected: fails validation

### CP-21: Invalid email format rejected
- Input: email = "not-an-email"
- Expected: fails validation

### CP-22: Age boundary — 0 rejected
- Input: age = 0
- Expected: fails validation (min is 1)

### CP-23: Age boundary — 1 accepted
- Input: age = 1
- Expected: passes validation

### CP-24: Age boundary — 120 accepted
- Input: age = 120
- Expected: passes validation

### CP-25: Empty string for optional fields accepted
- Input: designation='', specialty='', organization='', city=''
- Expected: passes validation

### CP-26: Preferences defaults to empty object
- Input: no preferences field provided
- Expected: parsed result has preferences = {}

### CP-27: Registration ID schema rejects non-UUID
- Input: "abc123"
- Expected: throws Zod error

### CP-28: updateRegistrationStatusSchema rejects non-UUID registrationId
- Input: {registrationId: "abc", newStatus: "confirmed"}
- Expected: fails validation
