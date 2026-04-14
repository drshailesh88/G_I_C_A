# Examples — eventid-scoping (multi-tenant isolation)
# Approved by: Shailesh Singh on 2026-04-14
# Status: FROZEN — do not edit without explicit PM approval + version bump

Cross-cutting tenancy invariant: every event-scoped surface filters by the
active event; `people` is the only global table; super_admin with
`event_user_roles.event_id = NULL` is the documented escape hatch.

## Example 1: Coordinator views their event
**Given:** User `coord_A` has `event_user_roles(event_id=A, role=event_coordinator)` and no row for Event B.
**When:** They GET `/events/A/people`.
**Then:**
- Response is 200.
- Every delegate row returned has `event_id=A` (verified via `/api/test/state?entity=delegates&eventId=A`).
- Page reload returns the same list (persisted state).

## Example 2: Super Admin crosses events
**Given:** User `super` has `event_user_roles(event_id=NULL, role=super_admin)`.
**When:** They GET `/events/B/people`.
**Then:**
- Response is 200.
- Delegates returned all have `event_id=B`.
- No membership row for event B was required.

## Example 3: Multi-event coordinator switches context
**Given:** User `multi` has coordinator rows for both Event A and Event B.
**When:** They GET `/events/A/travel`, then GET `/events/B/travel` in the same session.
**Then:**
- Each response contains only that event's records.
- No row bleeds across the responses.
- Switching events does not require re-login.

## Example 4: Read-only user reads assigned event
**Given:** User `readonly_A` has `event_user_roles(event_id=A, role=read_only)`.
**When:** They GET `/events/A/accommodation`.
**Then:**
- Response is 200 with accommodation rows for Event A.
- Every mutation button in the UI is rendered but disabled (aria-disabled="true").
- Submitting a mutation via API (POST/PATCH/DELETE) returns 403 `{ error: "forbidden" }`.

## Example 5: Public registration, no auth
**Given:** No logged-in user; URL `/register/[eventId]` where eventId is a valid active event.
**When:** GET `/register/A`.
**Then:**
- Response is 200; registration form renders.
- No auth challenge; server trusts URL eventId (pre-auth surface).
- Submitting the form creates `registrations.event_id = A`.

## Example 6: Inngest cascade handler scopes to payload eventId
**Given:** Inngest sends `conference/travel.updated` with `{ eventId: A, travelId, changes }`.
**When:** Handler runs.
**Then:**
- Every downstream query (accommodation flag, transport recalc, delegate lookup) filters by `eventId=A`.
- No side-effect reaches any Event B row.
- Handler re-runs (same eventId + idempotency key) are no-ops.

## Example 7: Server action derives eventId from URL, ignores body
**Given:** User `coord_A` submits a createSession form from `/events/A/sessions/new`.
**When:** Server action runs with form data.
**Then:**
- The inserted row has `event_id=A` (from URL params), even if the body omitted eventId.
- Audit log row for this mutation has `event_id=A`.

## Example 8: Notification idempotency key per event
**Given:** Two events A and B; both trigger a `travel_confirmed` notification for the same `(userId, type, triggerId)` tuple.
**When:** `notifications.send()` is called twice, once per event.
**Then:**
- Two notifications are sent (keys `notification:{userId}:A:travel_confirmed:{triggerId}` and `...:B:...` differ).
- Replaying either trigger is a no-op (existing key blocks).

## Example 9: People table is global; junction is scoped
**Given:** Person `p1` exists globally and has `event_people(event_id=A, person_id=p1)` and `event_people(event_id=B, person_id=p1)`.
**When:** Coordinator of A opens `/events/A/people/p1`.
**Then:**
- Person master fields (name, email, phone) are shown.
- Event-specific attributes (registration, travel, sessions) come only from Event A's scoped tables.
- Event B attributes of the same person are NOT visible.

## Example 10: Cross-event reporting is super-admin labeled
**Given:** Super Admin opens a cross-event report.
**When:** They view the report.
**Then:**
- Response is 200.
- Page is explicitly labeled "Cross-event view" in the UI (aria-label and visible heading).
- Non-super-admin navigating to the same route receives 404.
