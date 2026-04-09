# people — Spec 001: Validation Schemas (Gap Tests)

STATUS: PASS
TESTED: 22/22
PASS: 22
FAIL: 0
BLOCKED: 0
MODULE: people
TEST_TYPE: unit (vitest)
FILE: src/lib/validations/person.test.ts

---

### updatePersonSchema Validation
- [ ] **updatePersonSchema requires personId** — parse without personId, expect ZodError `[CONFIRMED]`
- [ ] **updatePersonSchema rejects invalid UUID** — parse with personId "not-a-uuid", expect ZodError `[CONFIRMED]`
- [ ] **updatePersonSchema accepts partial fields** — parse with only personId + fullName, expect success `[CONFIRMED]`
- [ ] **updatePersonSchema accepts empty update** — parse with only personId (no fields to update), expect success `[CONFIRMED]`
- [ ] **updatePersonSchema validates salutation enum** — parse with salutation "InvalidTitle", expect ZodError `[CONFIRMED]`
- [ ] **updatePersonSchema accepts valid salutation** — parse with salutation "Dr", expect success `[CONFIRMED]`

### createPersonSchema Edge Cases
- [ ] **fullName max length 200** — parse with 201-char fullName, expect ZodError `[CONFIRMED]`
- [ ] **fullName whitespace-only rejected** — parse with fullName "   ", expect ZodError (trim then min 1) `[CONFIRMED]`
- [ ] **email max length 254** — parse with 255-char email, expect ZodError `[CONFIRMED]`
- [ ] **designation max length 200** — parse with 201-char designation, expect ZodError `[CONFIRMED]`
- [ ] **specialty max length 200** — parse with 201-char specialty, expect ZodError `[CONFIRMED]`
- [ ] **organization max length 300** — parse with 301-char organization, expect ZodError `[CONFIRMED]`
- [ ] **city max length 100** — parse with 101-char city, expect ZodError `[CONFIRMED]`
- [ ] **tag item max length 50** — parse with one tag of 51 chars, expect ZodError `[CONFIRMED]`
- [ ] **empty string email treated as no-email** — parse with email "" and phone "+919876543210", expect success `[CONFIRMED]`
- [ ] **empty string phone treated as no-phone** — parse with phone "" and email "a@b.com", expect success `[CONFIRMED]`

### normalizePhone Edge Cases
- [ ] **international number (US)** — normalizePhone("+14155551234") returns "+14155551234" `[EMERGENT: libphonenumber-js]`
- [ ] **number with dashes** — normalizePhone("98765-43210") returns "+919876543210" `[EMERGENT: libphonenumber-js]`
- [ ] **number with parentheses** — normalizePhone("(098) 7654 3210") returns "+919876543210" `[EMERGENT: libphonenumber-js]`
- [ ] **empty string throws** — normalizePhone("") throws error `[CONFIRMED]`

### personSearchSchema Edge Cases
- [ ] **query max length 200** — parse with 201-char query, expect ZodError `[CONFIRMED]`
- [ ] **limit coerces string to number** — parse with limit "50" (string), expect limit === 50 `[CONFIRMED]`
