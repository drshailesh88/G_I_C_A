# events — Spec 007: Slugify & Data Helpers

STATUS: PENDING
TESTED: 0/9
PASS: 0
FAIL: 0
BLOCKED: 0
MODULE: events
TEST_TYPE: unit (vitest)
FILE: src/lib/actions/event.test.ts

---

### slugify (tested via createEvent slug generation)
- [ ] **lowercases name** — event name "GEM India", verify slug is lowercase `[CONFIRMED]`
- [ ] **replaces non-alphanumeric with hyphens** — event name "A & B @ C!", verify hyphens `[CONFIRMED]`
- [ ] **strips leading/trailing hyphens** — event name "-test-", verify no leading/trailing hyphens `[CONFIRMED]`
- [ ] **truncates to 80 chars** — event name 100 chars long, verify slug portion <= 80 chars `[CONFIRMED]`
- [ ] **appends timestamp suffix** — verify slug ends with base36 timestamp `[CONFIRMED]`

### safeJsonParse (tested via createEvent)
- [ ] **parses valid JSON** — moduleToggles '{"scientific_program":true}', expect no error `[CONFIRMED]`
- [ ] **throws ZodError on malformed JSON** — moduleToggles '{', expect ZodError with path ["moduleToggles"] `[CONFIRMED]`
- [ ] **throws ZodError with correct field path** — verify ZodError.issues[0].path includes fieldPath `[CONFIRMED]`

### getOrCreateDefaultOrg (tested via createEvent)
- [ ] **returns existing org if one exists** — mock db returning org, verify no insert `[CONFIRMED]`
