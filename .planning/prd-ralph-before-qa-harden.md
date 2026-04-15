# PRD — Before-QA-Harden: Ralph builds to frozen contracts

**Target audience:** Ralph build loop
**Acceptance oracle:** 44 contract tests green + 10 cert mutation-kill tests green + full Stryker baseline completes (objective, testable). Mutation floors are a follow-up QA-harden pass, not Ralph's concern.
**Contract scope:** Features declared in `e2e/contracts/{eventid-scoping,certificates,cascade-idempotency}/` (v2 / v1 / v1 respectively). Anything outside the frozen contracts is out of scope.
**Source docs:** `.planning/data-requirements.md`, `research-hub/BACKEND_ARCHITECTURE_MAP.md`, `research-hub/DB_DECISIONS.md`, `research-hub/FRONTEND_ARCHITECTURE.md`, the 48-screen wireframe PDF (`research-hub/wireframes/`). No new assumptions.

---

## Problem Statement

As a PM, I have frozen three contract packs that define "correct" for my highest-risk surfaces — multi-tenant isolation, credential issuance, and cascade idempotency. Today's baseline shows **46 of 49 Playwright contract tests red** and **Stryker baseline blocked** by 10 pre-existing mutation-kill failures in `certificate-issuance.ts` + `certificate.ts`. The failures aren't bugs a QA healer can fix — they're entire feature surfaces that don't exist yet: certificate API endpoints, cascade handler wiring, tenancy error mapping, public registration, `audit_log` table. Until Ralph builds these, the QA pipeline can't measure anything meaningful.

## Solution

Ralph builds, in dependency order, the production code that satisfies the three frozen contract packs. A single flat user-story list, processed one story at a time. Each story lands behind a passing set of contract tests (or, for Block 1, passing mutation-kill tests). No story is marked done until its acceptance line in this PRD is green.

The block structure below is ordering only; Ralph does not run separate phases.

## User Stories

### Block 1 — Unblock Stryker baseline (cert code gaps)

1. As a mutation gate, I want `issueCertificate` to reject on conditions the existing mutation-kill tests require (missing template, revoked prerequisite, archived event, cross-event person), so that the 6 "promise resolved instead of rejecting" test cases in `src/lib/actions/certificate-issuance.mutation-kill.test.ts` pass.
2. As a mutation gate, I want `issueCertificate` to retry a failed transaction exactly once with the same input, so that the `expected +0 to be 2` test in `certificate-issuance.mutation-kill.test.ts` passes (driven by `data-requirements.md §18` — bulk gen idempotency + single-issue robustness).
3. As a mutation gate, I want `activateCertificateTemplate` to execute inside a transaction that first archives any existing active template for the same `(event_id, certificate_type)` and then activates the target template, so that the write-order assertion in `certificate.mutation-kill.test.ts` (`setCalls[0].status === 'archived'` then `setCalls[1].status === 'active'`) passes (driven by `data-requirements.md §17` — "One active template per (event_id, certificate_type)").
4. As a mutation gate, I want `issueCertificate` to return the new cert id on success, so that the `expected undefined to be 'new-cert-id'` test passes.
5. As a PM, I want the full Stryker baseline to complete after Block 1, populating `.quality/state.json` with per-module mutation scores for all 107 files in the critical_75 + business_60 mutation scope, so that we have a true "before" snapshot before QA-harden.

### Block 2 — Certificate API endpoints (unblock 15 certificate contract tests)

6. As a Coordinator, I want `POST /api/events/[eventId]/certificates` to issue a single certificate with `certificate_number` formatted `<EVENT_PREFIX>-<TYPE_CODE>-<ZERO_PADDED_SEQ>`, monotonic per `(event_id, certificate_type)` with gaps allowed, so that Example 1 of the certificates contract passes.
7. As a Coordinator, I want the issuance to capture `template_snapshot_json` and `rendered_variables_json` at issue time and guarantee immutability of both across subsequent template or person edits, so that counterexamples CE11 + CE12 hold.
8. As a Coordinator, I want `POST /api/events/[eventId]/certificates/[certId]/regenerate` to insert a new issued row with `supersedes_id` set, mark the prior row `status='superseded'` with `superseded_by_id`, and NEVER mark the prior row `revoked`, so that Example 2 + Example 8 pass.
9. As a Super Admin, I want `POST /api/events/[eventId]/certificates/[certId]/revoke` to require a non-empty `reason` body field and set `status='revoked' + revoked_at + revoked_by + revoke_reason`, rejecting empty/whitespace reasons with HTTP 400, so that Example 3 and CE15 pass.
10. As a Coordinator, I want `POST /api/events/[eventId]/certificates/bulk` to acquire an Upstash lock `lock:certificates:generate:{eventId}:{type}` with 5-minute TTL, release the lock on completion (success or failure), and return HTTP 409 `{ error: "generation in progress", lock_holder, started_at, expires_at }` for concurrent requests, so that Example 5 passes.
11. As a bulk-generation operator, I want per-certificate atomicity: if cert N fails, certs 1..N-1 remain `issued` and retryable, with zero rows in a non-terminal intermediate status, so that CE9 + CE20 hold.
12. As a CME certificate issuer, I want issuance to require all four CME fields (`cme_credit_hours > 0 AND <= event duration hours`, non-empty `accrediting_body_name`, `accreditation_code`, `cme_claim_text`) and reject missing/invalid with HTTP 400, so that Example 6 + CE10 pass (spec anchor: `data-requirements.md §18` CME checklist).
13. As an anonymous verifier, I want `GET /verify/[token]` to return only `{ status, certificate_number, certificate_type, person_name, event_name, issued_at }` plus `revoked_at + revoke_reason` when revoked, plus `superseded_by_certificate_number` when superseded, with zero PII beyond what is printed on the certificate and zero download URLs in the response body, so that Example 7, Example 11, CE4, CE5, CE6, CE13 pass.
14. As a Super Admin, I want `GET /api/events/[eventId]/certificates/[certId]/download` to return a short-TTL signed R2 URL for any certificate status including `revoked`, while non-super-admin roles receive 404 for revoked certificates, so that CE17 passes.
15. As an Ops or Read-only user, I want every certificate mutation endpoint to return HTTP 403 `{ error: "forbidden" }`, so that CE14 passes (spec anchor: `data-requirements.md §18` "Ops and Read-only: no certificate management").
16. As an archived-event admin, I want any issuance attempt on an event with `status='archived'` to return HTTP 400 or 404 with zero rows inserted, so that CE19 passes.
17. As a Coordinator, I want every issuance attempt for a person missing an `event_people` row to return HTTP 400 "person not attached to event" with zero rows inserted, so that CE16 passes.

### Block 3 — Tenancy surfaces (unblock 15 eventid-scoping contract tests)

18. As the tenancy layer, I want `assertEventAccess` to return HTTP 404 (not throw a generic `Forbidden` Error) when the current user has no Clerk super_admin role AND no active `event_user_assignments` row for the target event, so that every counterexample CE1, CE2, CE4, CE10, CE11, CE14 in eventid-scoping contracts resolves to 404.
19. As the tenancy layer, I want `assertEventAccess` with `requireWrite: true` to return HTTP 403 `{ error: "forbidden" }` when the user IS assigned to the event but their Clerk role is `org:read_only`, so that Invariant-5 holds.
20. As the tenancy layer, I want every server action and API route that accepts a body-supplied `eventId` to reject with HTTP 400 `{ error: "eventId mismatch" }` and emit a Sentry breadcrumb `{ userId, urlEventId, bodyEventId, endpoint }` when the body's `eventId` differs from the URL path parameter, so that CE3 passes.
21. As the tenancy layer, I want cross-event 404 response bodies to contain zero event-identifying strings (no `eventId`, no event name, no words "access"/"permission"/"forbidden"), so that CE4 passes.
22. As a Coordinator of Event A, I want `/events/A/people` to return a list of rows filtered by `event_id=A` from the delegates/registrations surface, so that Example 1 passes.
23. As a Super Admin, I want `/events/B/people` to return rows for Event B without needing an `event_user_assignments` row, so that Example 2 passes.
24. As a Read-only user, I want `/events/A/accommodation` to render with all write buttons visible but disabled (`aria-disabled="true"`) while mutation endpoints return HTTP 403, so that Example 4 passes.
25. As the tenancy layer, I want `POST /api/events/[eventId]/sessions` to exist, derive `eventId` from the URL path only, reject body `eventId` mismatches, and write the row with `event_id = <urlEventId>`, so that Example 7 and CE2 can exercise a real endpoint.
26. As the tenancy layer, I want `GET /api/events/[eventId]/people/[personId]` to return person master fields plus only Event-A-scoped attributes (travel, sessions, registration filtered by `event_id=A`), so that CE14 passes.
27. As an anonymous user, I want `GET /register/[eventId]` to render a public registration form for any active event with no auth challenge, so that Example 5 passes (spec anchor: `research-hub/FRONTEND_ARCHITECTURE.md §4` URL state for `eventId`).

### Block 4 — Cascade wiring (unblock 14 cascade-idempotency contract tests)

28. As the notifications layer, I want every send to be keyed by `notification:{userId}:{eventId}:{type}:{triggerId}:{channel}` where `channel ∈ {email, whatsapp}`, so that Invariant-1, CE1, CE12 all hold.
29. As the notifications layer, I want `notification_log` to have exactly one row per idempotency key, with `attempts++` on each send attempt (never insert-per-attempt, never reset, never decrement), so that Invariants 3 + 4, and CE4, CE18 hold.
30. As the notifications layer, I want 3-attempt retry with exponential backoff; on final failure, set `status='failed'`, populate `last_error`, emit a Sentry event `cascade-dispatch-failure`, and create an active `red_flags` row of type `system_dispatch_failure` scoped to the trigger entity, with zero end-user notification of the failure, so that CE15 + CE16 hold.
31. As the cascade emitter, I want a 5-second debounce per `(eventId, sourceEntityType, sourceEntityId)` keyed on Upstash so that two mutations within the window coalesce into one event with a merged `changeSummary`, so that Example 3 + CE2 + CE14 pass.
32. As the cascade emitter, I want variable-substitution values (flight times, hotel names, etc.) captured as a snapshot at emit time and reused across retry attempts, so that CE7 + CE20 hold.
33. As cascade handlers, I want each of the 7 cascade events declared in `e2e/contracts/cascade-idempotency/api-contract.json` wired to its declared handlers (travel.created→notify-delegate-itinerary; travel.updated→flag-accommodation + recalculate-transport + notify-delegate-revised; accommodation.created→notify-delegate-accommodation; accommodation.updated→flag-transport + notify-delegate-accommodation-update; registration.created→send-confirmation + assign-qr; session.updated→notify-affected-faculty; certificate.generated→notify-recipient-certificate), so that fan-out + independent-failure holds (Invariant 8, CE6 + CE17).
34. As cascade handlers, I want each handler to Zod-validate its payload on entry and dead-letter (non-retriable) on malformed input, emitting a Sentry event with the raw payload and no retry, so that Example 9 + CE10 hold.
35. As cascade handlers, I want red-flag creation to be an upsert keyed on `(event_id, target_entity_type, target_entity_id, flag_type)` (one active unresolved row), so that CE8 + Invariant 17 hold (spec anchor: `data-requirements.md §19`).
36. As cascade handlers, I want every query (except `people` master reads) to filter by the cascade's `eventId` and never write to any table where `event_id` differs, so that CE9 + CE19 + Invariant 13 hold.
37. As the event lifecycle, I want in-flight cascades to complete normally even if the event transitions to `archived` mid-run; only NEW mutations are blocked at the server-action level, so that Example 10 + CE17 pass.

### Block 5 — Phase 2c infrastructure + audit log

38. As a compliance auditor, I want an `audit_log` table and an audit-write path invoked on every mutation, capturing `{ actor_user_id, event_id, action, resource, resource_id, timestamp, meta }`, so that eventid-scoping CE12 and certificates Invariant 20 can be verified against real rows (spec anchor: `BACKEND_ARCHITECTURE_MAP.md` Audit Log section, `research-hub/DB_DECISIONS.md §4` Immutable audit).
39. As a test probe, I want `/api/test/audit-log` to return rows matching any combination of `event_id`, `actor_username` (via join to Clerk), `resource`, `cert_id`, so that CE12 and CE14 in certificates exercise against real audit data.
40. As a test probe, I want a provider-mode shim in `lib/notifications/` that switches Resend and Evolution API transports between `normal | fail | failN=<n> | flaky` based on Redis keys set via `POST /api/test/provider-mode`, recording every sent body in `test:last-sent:{triggerId}:{channel}` keys for later retrieval, so that all cascade-idempotency retry/failure scenarios can be exercised deterministically.
41. As a test probe, I want `/api/test/inngest-events` and `/api/test/inngest-attempts` backed by a captured-events store (write-on-emit, write-on-handler-invoke) and `/api/test/inngest-replay` to dispatch a prior captured event unchanged, so that Example 5 (duplicate cascade no-op), CE10 (dead-letter attempts count), and CE11 (replay test) pass.
42. As a test probe, I want `/api/test/sentry-events?kind=<category>&triggerId=<id>&endpoint=<path>` backed by a Sentry test transport that buffers captured events in-process, so that CE3 (eventId-mismatch Sentry event), CE15 (cascade-dispatch-failure), and CE10 (cascade-payload-invalid) pass.

## Implementation Decisions

- **Module boundaries**: every story stays inside an existing module or adds a new file within the module's directory. No cross-module edits unless explicitly scoped (e.g., Story 38 adds `audit_log` schema to `src/lib/db/schema/` and audit-write helpers to `src/lib/audit/`).
- **Role model** (v2 schema alignment): Clerk owns global roles (`org:super_admin`, `org:event_coordinator`, `org:ops`, `org:read_only`), checked via `has({ role })`. Per-event scope lives in `event_user_assignments(event_id, auth_user_id, assignment_type ∈ {owner, collaborator})`. Super Admin bypasses assignment lookup.
- **EventId source of truth**: URL path parameter. Body `eventId` is advisory; mismatch rejected with 400 + Sentry.
- **HTTP response matrix**: 404 for cross-event access (never reveal existence), 403 for role-denial within an assigned event, 400 for validation errors, 409 for bulk-gen lock contention.
- **Notification idempotency key**: `notification:{userId}:{eventId}:{type}:{triggerId}:{channel}` where `channel ∈ {email, whatsapp}`. One row per key; retries update in place.
- **Debounce store**: Upstash Redis with 5-second TTL keyed on `(eventId, sourceEntityType, sourceEntityId)`.
- **Bulk-gen lock**: Upstash key `lock:certificates:generate:{eventId}:{type}` with 5-minute TTL, early release on completion.
- **Certificate number format**: `<EVENT_PREFIX><YEAR>-<TYPE_CODE>-<ZERO_PADDED_SEQ>` (e.g. `GEM2026-ATT-00412`). Globally unique via prefix; monotonic per `(event, type)` with gaps; never reissued.
- **Snapshot immutability**: `template_snapshot_json` + `rendered_variables_json` captured at issuance, never mutated on subsequent template or master-data edits.
- **Certificate states**: `issued | superseded | revoked`. Regeneration creates supersession (non-revoke). Revocation is separate and requires reason.
- **Public verify payload shape** (frozen): `{ status, certificate_number, certificate_type, person_name, event_name, issued_at }` + `{ revoked_at, revoke_reason }` when revoked + `{ superseded_by_certificate_number }` when superseded. No download URL. No PII beyond what's on the certificate.
- **Cascade retry policy**: 3 attempts, exponential backoff (Inngest default). Final failure: Sentry + `notification_log.failed` + `system_dispatch_failure` red flag. No user-facing failure notification.
- **Cascade payload validation**: Zod schemas at handler entry. Malformed → dead-letter on first attempt (non-retriable).
- **Handler idempotency**: domain-level (red-flag upsert, last-write-wins transport recalc). Notifications use Redis key; handlers do not have their own dedup keys.
- **Audit rows scope**: same `event_id` as the mutated entity. Super Admin cross-event access also recorded.
- **Signed URLs**: short TTL, generated on demand; no permanent public URLs stored on certificate rows. Revoked cert signed URLs available to super_admin only.
- **Existing event module toggles** (from `data-requirements.md §89`): archived events are fully read-only for mutations; reads and verify endpoints continue to serve.

## Testing Decisions

- **Contract tests are the primary oracle.** Ralph does NOT edit `e2e/contracts/**` — those paths are locked. A story is "done" when the specific contract test(s) it unblocks turn green without modifying the test file.
- **Mutation-kill tests in `src/lib/actions/certificate*.mutation-kill.test.ts` are the Block 1 oracle.** Ralph modifies the production code (not the tests) until the 10 failing cases pass.
- **Good test definition** (enforced by the "Anti-Cheating Rule" in `CLAUDE.md` + `docs/TEST_GOVERNANCE.md`): tests assert external behaviour (persisted DB state, API response status + body, URL transitions, multi-element DOM state, accessibility attributes). Tests never assert implementation details.
- **No new Ralph-authored tests on frozen-contract paths.** If a contract needs amending, bump the contract version first (per `contract-pack` skill rules); Ralph does not do this unilaterally.
- **New Vitest unit tests** are welcome for any new helper module Ralph introduces (cert number formatter, idempotency-key builder, debounce window helper, audit-write helper). Scope them to external behaviour.
- **Prior art for tests**: `src/lib/cascade/handlers/travel-cascade.test.ts` (cascade handler pattern — already 97% mutation score), `src/lib/validations/travel.ts` test suite (Zod validation pattern), `src/lib/actions/travel.ts` test suite (server-action pattern — 99% mutation score). These are the style reference.
- **Deep-module opportunities flagged for Ralph**: certificate-number formatter, idempotency-key builder, cascade-debounce window manager, audit-write helper, Zod cascade-payload validators, provider-mode switch. Each is a small surface with a simple interface — test in isolation.

## Out of Scope

- Anything outside the three frozen contract packs (eventid-scoping v2, certificates v1, cascade-idempotency v1).
- `session.cancelled` cascade event — not declared in any frozen contract. Requires contract amendment before Ralph touches it.
- Acceptance tests for `registration.created`, `session.updated`, `certificate.generated` cascade handlers — declared in `api-contract.json` but not exercised by specific Playwright cases. Follow-up "contract v3 coverage expansion" after Ralph ships.
- `E2E_OPS_A` test user — deferred until Clerk free-tier is upgraded; Ralph should not design around the 5-membership cap.
- Mutation-floor ratchet — QA-harden pass after Ralph ships.
- UI polish, copy, branding, pixel-perfect design — this PRD is behind the API / cascade / auth surfaces; UI is a separate track once endpoints exist.
- Migration from Evolution API to WABA — abstraction exists in `lib/notifications/`; swap is a later ticket.
- Cross-event super-admin reporting UI — declared in `research-hub/DB_DECISIONS.md §5` as super-admin-only and labeled, but no contract test exists yet.
- Any rework of the existing `event_user_assignments` → `event_user_roles` schema rename. v2 contract alignment already absorbed the real schema name.

## Further Notes

- **Dependency-ordered flat list**: Ralph processes Stories 1→42 in order. Block 1 must land first because Stryker baseline is gated on it. Within Block 4, Story 28 (idempotency-key shape) and Story 29 (notification_log row-per-key semantics) land before the handler-specific stories 33–37.
- **Parallel-safe boundaries inside blocks**: Story 27 (`/register/[eventId]`) and Story 38 (`audit_log` table) can be picked up by parallel Ralph workers if you choose that workflow; they have no shared files.
- **Fixture gaps that Ralph's work closes automatically**: once Block 4 + Block 5 land, the Phase 2c probe endpoints (`/api/test/{provider-mode,sentry-events,inngest-events,inngest-replay,audit-log}`) become useful — most return stubs today.
- **Contract-test run command** (for Ralph's "is it green yet?" loop):
  ```
  DB_TEST=$(grep '^DATABASE_URL_TEST=' .env.test.local | cut -d= -f2-)
  E2E_TEST_MODE=1 DATABASE_URL="$DB_TEST" PORT=4000 npm run dev  # in one terminal
  E2E_CLERK_USER_USERNAME=e2e-super@gmail.com \
  E2E_CLERK_USER_PASSWORD=TestSuperAdmin!2026Q2 \
    npx playwright test e2e/contracts --project=phone --reporter=list
  ```
- **Baseline re-run command** (after Block 1):
  ```
  DATABASE_URL="$DB_TEST" npx tsx qa/controller.ts baseline
  ```
- **Done-line for this PRD**:
  1. `npm run test:run` → 0 failures (was 10).
  2. `DATABASE_URL="$DB_TEST" npx tsx qa/controller.ts baseline` → exits 0 and populates per-module scores for ~107 files.
  3. Playwright `e2e/contracts` full run → 44/44 contract tests green (plus the 2 existing passing setup steps).
  4. `qa-doctor: OK (0)`.
  5. Commit stack is reviewable — one logical change per commit, matching story numbers where possible.
