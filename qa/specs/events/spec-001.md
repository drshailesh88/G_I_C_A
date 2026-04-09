# events — Spec 001: Validation Schemas

STATUS: PENDING
TESTED: 0/24
PASS: 0
FAIL: 0
BLOCKED: 0
MODULE: events
TEST_TYPE: unit (vitest)
FILE: src/lib/validations/event.test.ts

---

### createEventSchema — Required Fields
- [ ] **name required** — parse with name "", expect ZodError `[CONFIRMED]`
- [ ] **name whitespace-only rejected** — parse with name "   ", expect ZodError (trim then min 1) `[CONFIRMED]`
- [ ] **name max 200 chars** — parse with 201-char name, expect ZodError `[CONFIRMED]`
- [ ] **startDate required** — parse without startDate, expect ZodError `[CONFIRMED]`
- [ ] **endDate required** — parse without endDate, expect ZodError `[CONFIRMED]`
- [ ] **venueName required** — parse with venueName "", expect ZodError `[CONFIRMED]`
- [ ] **venueName whitespace-only rejected** — parse with venueName "   ", expect ZodError `[CONFIRMED]`
- [ ] **venueName max 300 chars** — parse with 301-char venueName, expect ZodError `[CONFIRMED]`

### createEventSchema — Optional Fields
- [ ] **venueAddress max 500 chars** — parse with 501-char venueAddress, expect ZodError `[CONFIRMED]`
- [ ] **venueCity max 100 chars** — parse with 101-char venueCity, expect ZodError `[CONFIRMED]`
- [ ] **venueMapUrl validates as URL** — parse with venueMapUrl "not-a-url", expect ZodError `[CONFIRMED]`
- [ ] **venueMapUrl accepts empty string** — parse with venueMapUrl "", expect success `[CONFIRMED]`
- [ ] **venueMapUrl accepts valid URL** — parse with venueMapUrl "https://maps.google.com/test", expect success `[CONFIRMED]`
- [ ] **description max 2000 chars** — parse with 2001-char description, expect ZodError `[CONFIRMED]`
- [ ] **description optional (omit)** — parse without description, expect success `[CONFIRMED]`
- [ ] **timezone defaults to Asia/Kolkata** — parse without timezone, expect timezone === "Asia/Kolkata" `[CONFIRMED]`

### createEventSchema — Date Refinement
- [ ] **end date before start date rejected** — parse with endDate < startDate, expect ZodError with path "endDate" `[CONFIRMED]`
- [ ] **same-day event accepted** — parse with startDate === endDate, expect success `[CONFIRMED]`
- [ ] **end date after start date accepted** — parse with endDate > startDate, expect success `[CONFIRMED]`

### moduleTogglesSchema
- [ ] **all 7 keys default to true** — parse empty object {}, verify all MODULE_KEYS are true `[CONFIRMED]`
- [ ] **individual toggle can be false** — parse with scientific_program: false, expect that key false `[CONFIRMED]`
- [ ] **accepts partial toggles** — parse with only 2 keys provided, rest default to true `[CONFIRMED]`

### eventIdSchema
- [ ] **rejects non-UUID** — parse "not-a-uuid", expect ZodError `[CONFIRMED]`
- [ ] **accepts valid UUID** — parse "11111111-1111-1111-1111-111111111111", expect success `[CONFIRMED]`
