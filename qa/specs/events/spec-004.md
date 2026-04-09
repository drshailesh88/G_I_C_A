# events — Spec 004: Server Actions (event.ts)

STATUS: PASS
TESTED: 28/28
PASS: 28
FAIL: 0
BLOCKED: 0
MODULE: events
TEST_TYPE: unit (vitest)
FILE: src/lib/actions/event.test.ts

---

### createEvent
- [ ] **rejects unauthenticated user** — mockAuth returns null userId, expect "Unauthorized" `[CONFIRMED]`
- [ ] **rejects malformed moduleToggles JSON** — formData moduleToggles="{", expect ZodError `[CONFIRMED]`
- [ ] **rejects empty name** — formData name="", expect ZodError `[CONFIRMED]`
- [ ] **rejects endDate before startDate** — endDate < startDate, expect ZodError `[CONFIRMED]`
- [ ] **creates event with all required fields** — valid formData, verify db.insert called with correct values `[CONFIRMED]`
- [ ] **auto-generates slug from name** — verify slug includes slugified name `[CONFIRMED]`
- [ ] **sets initial status to draft** — verify status: "draft" in insert payload `[CONFIRMED]`
- [ ] **assigns creator as owner** — verify eventUserAssignments insert with assignmentType: "owner" `[CONFIRMED]`
- [ ] **sets createdBy and updatedBy to userId** — verify audit fields `[CONFIRMED]`
- [ ] **revalidates /events and /dashboard** — verify revalidatePath called twice `[CONFIRMED]`
- [ ] **returns event id** — verify return { id } `[CONFIRMED]`

### getEvents
- [ ] **rejects unauthenticated user** — getEventListContext returns empty userId, expect "Unauthorized" `[CONFIRMED]`
- [ ] **super admin sees all events (no join)** — isSuperAdmin: true, verify select().from() without join `[CONFIRMED]`
- [ ] **non-super-admin uses innerJoin** — isSuperAdmin: false, verify innerJoin called `[CONFIRMED]`
- [ ] **orders by startDate desc** — verify orderBy `[CONFIRMED]`

### getEvent
- [ ] **rejects invalid UUID** — pass "not-a-uuid", expect ZodError `[CONFIRMED]`
- [ ] **calls assertEventAccess before querying** — verify assertEventAccess called with eventId `[CONFIRMED]`
- [ ] **throws "Event not found" for missing event** — empty db result, expect error `[CONFIRMED]`
- [ ] **returns event when authorized** — valid access + event exists, expect event object `[CONFIRMED]`
- [ ] **denies access when assertEventAccess rejects** — mockAssertEventAccess throws, expect /forbidden/i `[CONFIRMED]`

### getEventBySlug
- [ ] **rejects empty slug** — pass "", expect error `[CONFIRMED]`
- [ ] **rejects slug over 100 chars** — pass 101-char slug, expect error `[CONFIRMED]`
- [ ] **hides draft events from public** — db returns event with status: "draft", expect "Event not found" `[CONFIRMED]`
- [ ] **returns published event** — db returns event with status: "published", expect success `[CONFIRMED]`
- [ ] **throws for non-existent slug** — empty db result, expect "Event not found" `[CONFIRMED]`

### updateEventStatus
- [ ] **requires write access (blocks read-only)** — assertEventAccess called with requireWrite: true `[CONFIRMED]`
- [ ] **blocks invalid transitions** — draft -> archived, expect error with "Cannot transition" `[CONFIRMED]`
- [ ] **detects concurrent modification** — post-update verification fails, expect /stale|concurrent/i `[CONFIRMED]`
