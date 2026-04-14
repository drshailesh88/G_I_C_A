# Invariants — eventid-scoping
# Approved by: Shailesh Singh on 2026-04-14
# Status: FROZEN

1. Every non-`people` repository query filters by `eventId`. ALWAYS true.
2. Every server action derives `eventId` from URL path params, never from request body. ALWAYS true.
3. If a request body contains an `eventId` that differs from the URL `eventId`, the server rejects with HTTP 400 `{ error: "eventId mismatch" }` and emits a Sentry event with `{ userId, urlEventId, bodyEventId, endpoint }`. ALWAYS true.
4. Super Admin (`event_user_roles.event_id IS NULL`) bypasses tenancy isolation; every other role requires a matching row with the specific `event_id`. ALWAYS true.
5. For cross-event (unmembered) access attempts, the server responds with HTTP 404 and a body containing no event-identifying information. ALWAYS true. NEVER 403 for unmembered.
6. For a user WHO IS a member of an event, mutation endpoints may return HTTP 403 `{ error: "forbidden" }` based on role (e.g., read_only). ALWAYS true; 403 is reserved for role-based denial within an assigned event.
7. Read-only role scope is per-event: a read_only user sees only events listed in their `event_user_roles`. ALWAYS true.
8. Every cascade event payload (Inngest) carries an `eventId` field, and every handler filters every downstream query by that `eventId`. ALWAYS true.
9. Every audit log row records the same `event_id` as the mutation it audits; super_admin cross-event access is also recorded. ALWAYS true.
10. Notification idempotency keys include the `eventId` segment: `notification:{userId}:{eventId}:{type}:{triggerId}`. Keys across different events never collide for the same (userId, type, triggerId). ALWAYS true.
11. The `people` table is the ONLY globally scoped event-relevant table. All other event-relevant tables contain an `event_id` column AND are filtered by it. ALWAYS true.
12. Certificate number sequences are per-event; two events never share a sequence. ALWAYS true.
13. Malformed or non-existent `eventId` in a URL results in HTTP 404 (no 400, no 500, no stack trace). ALWAYS true.
14. Role revocation is effective on the next request; no session or in-process cache serves a stale membership. ALWAYS true.
15. Cross-event reporting surfaces are super_admin-only AND carry an explicit "Cross-event view" label in the UI. ALWAYS true.
