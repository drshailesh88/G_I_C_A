# events — Spec 008: Status Transition Actions (Gap Tests)

STATUS: PASS
TESTED: 14/14
PASS: 14
FAIL: 0
BLOCKED: 0
MODULE: events
TEST_TYPE: unit (vitest)
FILE: src/lib/actions/event.test.ts

---

### updateEventStatus — Valid Transitions
- [ ] **draft -> published succeeds** — event status "draft", call with "published", expect success `[CONFIRMED]`
- [ ] **draft -> cancelled succeeds** — event status "draft", call with "cancelled", expect success `[CONFIRMED]`
- [ ] **published -> completed succeeds** — event status "published", call with "completed", expect success `[CONFIRMED]`
- [ ] **published -> cancelled succeeds** — event status "published", call with "cancelled", expect success `[CONFIRMED]`
- [ ] **completed -> archived succeeds** — event status "completed", call with "archived", expect success `[CONFIRMED]`

### updateEventStatus — Blocked Transitions
- [ ] **draft -> completed blocked** — event status "draft", call with "completed", expect error `[CONFIRMED]`
- [ ] **draft -> archived blocked** — event status "draft", call with "archived", expect error `[CONFIRMED]`
- [ ] **published -> draft blocked** — event status "published", call with "draft", expect error `[CONFIRMED]`
- [ ] **archived -> any blocked** — event status "archived", call with "published", expect error `[CONFIRMED]`
- [ ] **cancelled -> any blocked** — event status "cancelled", call with "draft", expect error `[CONFIRMED]`

### updateEventStatus — Timestamp Side Effects
- [ ] **sets archivedAt on archive** — transition to "archived", verify updateData includes archivedAt `[CONFIRMED]`
- [ ] **sets cancelledAt on cancel** — transition to "cancelled", verify updateData includes cancelledAt `[CONFIRMED]`
- [ ] **revalidates /events and /events/{eventId}** — after successful transition, verify revalidatePath called twice `[CONFIRMED]`
- [ ] **sets updatedBy to current userId** — verify updateData.updatedBy === userId `[CONFIRMED]`
