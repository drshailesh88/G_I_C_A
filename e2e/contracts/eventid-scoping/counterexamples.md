# Counterexamples — eventid-scoping
# Approved by: Shailesh Singh on 2026-04-14
# Status: FROZEN
#
# Version history:
#   v1 — 2026-04-14 — Initial contract.
#   v2 — 2026-04-14 — Schema alignment.
#   v3 — 2026-04-16 — CE14 restated for array-shaped travel: every row in the
#        travel array must be event-scoped; none may leak from another event.

## Counterexample 1: Cross-event GET returns data
**Never:** A user without any role row for Event B fetches `/events/B/*` and receives any data, or any status other than 404.
**Why:** Confidentiality breach; also reveals existence of Event B.
**Test:** Coord_A → GET `/events/B/people` → expect 404, empty body. Not 403. Not 200.

## Counterexample 2: Cross-event mutation succeeds
**Never:** POST/PATCH/DELETE to `/api/events/B/*` by a user with no role row for Event B creates/modifies data.
**Why:** Integrity breach.
**Test:** Coord_A → POST `/api/events/B/sessions` with valid body → expect 404; assert no row inserted in DB.

## Counterexample 3: Body eventId overrides URL eventId
**Never:** A request with URL `/events/A/...` and body `{ eventId: "B" }` writes data to Event B OR silently uses A without error.
**Why:** Parameter-smuggling attack / TOCTOU.
**Test:** Coord_A (member of both A and B) → POST `/api/events/A/sessions` with `{ eventId: "B", ... }` → expect 400 `{ error: "eventId mismatch" }`; assert Sentry event captured with `{ userId, urlEventId: "A", bodyEventId: "B", endpoint }`.

## Counterexample 4: Error message reveals existence
**Never:** A cross-event 404 response body contains the eventId, the word "access", "permission", "forbidden", or any hint that the event exists.
**Why:** Enumeration attack surface.
**Test:** Coord_A → GET `/events/B/people` → response body must not contain `B`, "access", "permission", "forbidden", or Event B's name.

## Counterexample 5: Repository query without eventId filter
**Never:** Any non-`people` repository method executes a query missing `WHERE event_id = $1`.
**Why:** Fundamental isolation breach.
**Test:** Mutation testing on `src/lib/db/queries/**` — removing a `where(eq(table.eventId, ...))` clause must cause at least one acceptance test to fail.

## Counterexample 6: Bulk export leaks other event's rows
**Never:** Export triggered under `/events/A/exports/*` includes a single row with `event_id != A`.
**Why:** Bulk leak worse than single record.
**Test:** Super Admin seeds data in Events A and B → Coord_A exports from A → assert ALL rows in the CSV/ZIP have `event_id = A`.

## Counterexample 7: Certificate number sequence crosses events
**Never:** Certificate numbers for Event A and Event B share a sequence (e.g., A issues #1, B issues #2, A issues #3).
**Why:** Certificate numbers are per-event identifiers; sharing breaks uniqueness-per-event.
**Test:** Issue N certs under Event A, issue N under Event B concurrently → sequences are independent (`certs where event_id=A` is {1..N}; same for B).

## Counterexample 8: Notification idempotency key collision
**Never:** The idempotency key for Event A's notification matches Event B's key for the same (userId, type, triggerId).
**Why:** Event B's send would be blocked (or vice versa).
**Test:** Construct keys for both; assert keys differ (contain respective eventId).

## Counterexample 9: Cascade handler processes wrong event
**Never:** A cascade handler triggered by `conference/travel.updated {eventId: A}` reads, writes, or notifies any row with `event_id = B`.
**Why:** Mass-wrong-data blast radius.
**Test:** Seed travel + accommodation rows in both events → emit event for A → observe only A's records were touched (via audit log + Redis key traces).

## Counterexample 10: Malformed eventId returns anything but 404
**Never:** Request to `/events/not-a-uuid/people` or `/events/00000000-0000-0000-0000-000000000000/people` (non-existent UUID) returns 400, 500, or a stack trace.
**Why:** Attackers probe for non-404 responses to fingerprint.
**Test:** Request each → expect 404 with generic body.

## Counterexample 11: Read-only sees unassigned events
**Never:** A read_only user sees events they are not assigned to in the events list or dropdown.
**Why:** D1 decision: read_only is per-event, not global observer.
**Test:** Seed read_only user with role on Event A only; log in; GET `/dashboard` → event list contains ONLY Event A.

## Counterexample 12: Super Admin access isn't logged
**Never:** A super_admin accessing another event's data leaves no audit trail.
**Why:** Auditable escape hatches are the only acceptable ones.
**Test:** Super admin GETs `/events/B/people` → audit log contains `{ actor_user_id, event_id: B, action: "read", resource: "people" }`.

## Counterexample 13: Role revocation takes effect lazily
**Never:** After revoking a coordinator's role on Event A, their next request to `/events/A/*` still succeeds due to session caching.
**Why:** Revocation must be immediate.
**Test:** Coord_A logs in, deletes their role row via admin, then makes a new request to `/events/A/people` → expect 404.

## Counterexample 14: People global data leaks event-scoped attributes
**Never:** Fetching a person from `/events/A/people/p1` returns fields like that person's travel/accommodation from Event B.
**Why:** Master person is global, but per-event attributes are scoped.
**Test:** Person `p1` has travel rows in both A and B; GET `/events/A/people/p1` → `body.travel` is an array; every row has `event_id=A`; no row has `event_id=B`. Same assertion for `body.sessions`.
