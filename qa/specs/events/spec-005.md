# events — Spec 005: withEventScope Utility

STATUS: PENDING
TESTED: 0/6
PASS: 0
FAIL: 0
BLOCKED: 0
MODULE: events
TEST_TYPE: unit (vitest)
FILE: src/lib/db/with-event-scope.test.ts

---

### withEventScope
- [ ] **throws on empty eventId** — call withEventScope(column, ""), expect error "eventId is required" `[CONFIRMED]`
- [ ] **throws on undefined eventId** — call withEventScope(column, undefined as any), expect error `[CONFIRMED]`
- [ ] **returns single eq condition with no extras** — call with just eventId, verify returns eq(column, eventId) `[CONFIRMED]`
- [ ] **composes eventId with one additional condition** — call with one extra SQL condition, verify and() with 2 conditions `[CONFIRMED]`
- [ ] **composes eventId with multiple conditions** — call with 2 extra conditions, verify and() with 3 conditions `[CONFIRMED]`
- [ ] **filters out undefined conditions** — call with one undefined + one valid, verify and() with 2 conditions `[CONFIRMED]`
