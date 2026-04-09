# events — Spec 002: Event Status Lifecycle

STATUS: PASS
TESTED: 16/16
PASS: 16
FAIL: 0
BLOCKED: 0
MODULE: events
TEST_TYPE: unit (vitest)
FILE: src/lib/validations/event.test.ts

---

### EVENT_TRANSITIONS State Machine
- [ ] **draft -> published allowed** — EVENT_TRANSITIONS.draft includes "published" `[CONFIRMED]`
- [ ] **draft -> cancelled allowed** — EVENT_TRANSITIONS.draft includes "cancelled" `[CONFIRMED]`
- [ ] **draft -> completed blocked** — EVENT_TRANSITIONS.draft does NOT include "completed" `[CONFIRMED]`
- [ ] **draft -> archived blocked** — EVENT_TRANSITIONS.draft does NOT include "archived" `[CONFIRMED]`
- [ ] **published -> completed allowed** — EVENT_TRANSITIONS.published includes "completed" `[CONFIRMED]`
- [ ] **published -> cancelled allowed** — EVENT_TRANSITIONS.published includes "cancelled" `[CONFIRMED]`
- [ ] **published -> draft blocked** — EVENT_TRANSITIONS.published does NOT include "draft" `[CONFIRMED]`
- [ ] **completed -> archived allowed** — EVENT_TRANSITIONS.completed === ["archived"] `[CONFIRMED]`
- [ ] **completed -> published blocked** — EVENT_TRANSITIONS.completed does NOT include "published" `[CONFIRMED]`
- [ ] **archived is terminal** — EVENT_TRANSITIONS.archived === [] `[CONFIRMED]`
- [ ] **cancelled is terminal** — EVENT_TRANSITIONS.cancelled === [] `[CONFIRMED]`
- [ ] **every status has a transitions entry** — all 5 statuses exist as keys `[CONFIRMED]`

### updateEventStatusSchema
- [ ] **rejects invalid eventId** — parse with eventId "bad", expect ZodError `[CONFIRMED]`
- [ ] **rejects unknown status** — parse with newStatus "unknown", expect ZodError `[CONFIRMED]`
- [ ] **accepts valid transition input** — parse with valid UUID + "published", expect success `[CONFIRMED]`
- [ ] **accepts all 5 valid statuses** — parse each of draft/published/completed/archived/cancelled `[CONFIRMED]`
