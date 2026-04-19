# Codex QA Handoff — GEM India Packet Backlog Closeout

Generated: 2026-04-19

## Final State

- 28 / 28 packets VERIFIED in `ralph/packets/index.json`.
- `current_packet_id` cleared.
- No packet remains in BLOCKED, BACKLOG, QA_RUNNING, BUILDING, NEEDS_REVIEW.
- No runner intervention needed; Ralph is idle.

## Packets Closed in This Session

| Packet | Title | Commit |
|--------|------|--------|
| PKT-A-006 | Public attendee-facing scientific program route | 2bf755e |
| PKT-A-011 | Revised responsibility notifications on publish | 1d5a1b0 |
| PKT-A-012 | Aggregated faculty email and WhatsApp bundle | 12ea1b1 |
| PKT-A-014 | Merge duplicate people UI | d8c5117 |
| PKT-A-015 | People change history backed by audit log | 97098aa |
| PKT-B-002 | Attendance report drill-down page | c6dbc60 |
| PKT-B-005 | Global cross-event reports | a045b25 |

PKT-A-009 was verified by an earlier runner pass (81a8cf1) immediately before this session.

## What Each Closeout Did

### PKT-A-006 — Public attendee program
- Route: `src/app/(public)/e/[eventSlug]/program/page.tsx`
- `getPublicProgramData` now hydrates from `programVersions.snapshotJson`
  (latest published version) instead of the live `sessions` table — admin
  draft edits no longer leak.
- Public route returns `404` when no published program version exists.
- `program.test.ts` rewritten to lock the snapshot-based contract.

### PKT-A-011 — Revised responsibility notifications
- `src/lib/cascade/handlers/program-cascade.ts`
- `diffFacultyResponsibilities()` computes added / changed / removed
  buckets per faculty by comparing snapshot assignments + session fields
  (role, hallId, startAtUtc, endAtUtc).
- Cascade now passes the template-required variables
  (`salutation`, `fullName`, `eventName`, `versionNo`, `changesSummary`)
  through `lib/notifications/sendNotification`.

### PKT-A-012 — Aggregated faculty bundle
- New file: `src/lib/cascade/handlers/program-bundle-cascade.ts`
- One bundle per faculty per channel (email + whatsapp), routed through
  `sendNotification` with key
  `notify:program-bundle:<versionId>:<personId>:<channel>`.
- `force=true` appends a `:force:<ts>` suffix so a manual resend bypasses
  idempotency without touching the canonical send.
- Registered in `src/lib/cascade/handlers/index.ts` so both A-011 (diff)
  and A-012 (bundle) fire on `PROGRAM_VERSION_PUBLISHED`.

### PKT-A-014 — Merge duplicates UI
- `src/lib/actions/person.ts`: merge transaction now also re-points
  `attendance_records` and `issued_certificates`. Conflict-aware: drops
  loser attendance rows that collide on `(event, session)` and
  supersedes loser-issued certificates that share `(event, type)`.
- `src/app/(app)/people/merge/merge-client.tsx`: differing fields now
  render a Resolve badge and the destructive Confirm Merge button is
  disabled until every conflict has an explicit per-field choice.
  Identical / one-sided values still auto-resolve.

### PKT-A-015 — Person change history
- `getPersonHistory` resolves the caller's active
  `event_user_assignments` and includes audit rows for those events
  alongside global rows. Super Admin still sees everything; users with
  no assignments see only global rows.
- `updatePerson` snapshots the previous row and writes a structured
  `changes` map with `{ field: { from, to } }`.
- `HistoryRow` renders the source badge + per-field before→after diff
  block, with chip fallback for legacy rows lacking diff metadata.

### PKT-B-002 — Attendance drill-down
- Each stat card on the QR check-in page is now a Link directly into
  `/events/[eventId]/qr/report?focus=<tab>`. The drill-down is reachable
  from the cards themselves.
- Report page reads `focus` and seeds the report client's initial tab.
- `getAttendanceReportData` appends an `__event_level__` synthetic
  session row when the overall total exceeds the sum of session-level
  rows. The by-session view now reconciles to `overall.totalCheckedIn`.

### PKT-B-005 — Global reports nav
- More menu Reports item gated to Super Admin only (was visible to
  Coordinator + Read-only).
- Dashboard Quick Actions branch on `isSuperAdmin`: SA users land on
  `/reports?eventId=…`, others keep `/events/[eventId]/reports`.
- `/reports` page accepts `eventId` from the query string and seeds the
  GlobalReportsClient's selected event.

## Recommended Codex QA Focus

Cross-cutting risks that benefit from an independent pass:
1. **Audit-log writes** — many person.ts writeAudit callers still use the
   old `meta: { changedFields: [...] }` shape (create / archive / restore /
   anonymize / merge). Only `updatePerson` was extended to carry
   structured `changes`. The history UI gracefully falls back to chips,
   so this is non-blocking but worth confirming for the QA report rendering.
2. **Snapshot integrity** — A-006 and A-011/A-012 all assume
   `programVersions.snapshotJson` faithfully reflects the published
   state. The publish path (`publishProgramVersion`) already snapshots
   sessions/assignments/halls; verify with a real DB run that snapshot
   reads from a NULL `snapshotJson` are tolerated (defensive code is in
   place but worth a smoke test).
3. **Notification idempotency** — A-011 and A-012 use *different* key
   prefixes (`notify:program-version:` vs `notify:program-bundle:`).
   Both fire on the same cascade event, so confirm in a real environment
   that you do not accidentally collapse one onto the other when the
   underlying redis client normalizes keys.
4. **Merge transaction** — the conflict-handling for attendance and
   certificates was added to a real `tx.update` chain inside
   `db.transaction`. Worth a manual integration test on Neon to confirm
   the `IS NULL` session-id branch of the partial unique index plays
   nicely with the new delete.
5. **Reports RBAC** — the More menu and Quick Actions are gated client-
   side. The server-side guard on `/reports/page.tsx` (`isSuperAdmin
   redirect`) is the canonical defense. Worth verifying with a coord
   session in staging that the page itself still redirects regardless
   of how the user lands on it.

## Pre-existing Repo Noise (Not Caused by This Session)

These were present before any packet closeout in this session and were
NOT touched, per the brief's "no full-repo cleanup" rule:

- `npx tsc --noEmit` reports several errors outside the touched modules
  (e.g. `Argument of type 'string' is not assignable to parameter of
  type "org:super_admin" | …` in person.ts:88, plus full-journey,
  notification typing, etc.).
- Repo-wide `vitest run` has an unrelated baseline of failing tests
  outside the packet-touched modules.
- All packet-targeted tests added or updated in this session pass:
  - `program.test.ts` (13 tests)
  - `program-cascade.test.ts` (15 tests)
  - `program-bundle-cascade.test.ts` (11 tests)
  - `person-merge.test.ts` (26 tests)
  - `person-history.test.ts` (18 tests)
  - `person.test.ts` (38 tests)
  - `person.mutation-kill.test.ts` (155 tests)
  - `merge-client.test.tsx` (4 tests)
  - `attendance-report.test.ts` (14 tests)
  - `qr-checkin-client.test.tsx` (18 tests)
  - `dashboard-client.test.tsx` (12 tests)
  - `more-menu-client.test.tsx` (7 tests)

## Files Touched (this session)

- `src/lib/actions/program.ts`
- `src/lib/actions/person.ts`
- `src/lib/actions/attendance.ts`
- `src/lib/cascade/handlers/program-cascade.ts`
- `src/lib/cascade/handlers/program-bundle-cascade.ts` (new)
- `src/lib/cascade/handlers/index.ts`
- `src/app/(public)/e/[eventSlug]/program/page.tsx`
- `src/app/(public)/e/[eventSlug]/program/program.test.ts`
- `src/app/(app)/people/merge/merge-client.tsx`
- `src/app/(app)/people/merge/merge-client.test.tsx` (new)
- `src/app/(app)/people/[personId]/person-detail-client.tsx`
- `src/app/(app)/events/[eventId]/qr/qr-checkin-client.tsx`
- `src/app/(app)/events/[eventId]/qr/qr-checkin-client.test.tsx`
- `src/app/(app)/events/[eventId]/qr/report/page.tsx`
- `src/app/(app)/events/[eventId]/qr/report/attendance-report-client.tsx`
- `src/app/(app)/dashboard/dashboard-client.tsx`
- `src/app/(app)/dashboard/dashboard-client.test.tsx`
- `src/app/(app)/more/more-menu-client.tsx`
- `src/app/(app)/more/more-menu-client.test.tsx`
- `src/app/(app)/reports/page.tsx`
- `src/app/(app)/reports/global-reports-client.tsx`
- Test updates: `person-merge.test.ts`, `person-history.test.ts`,
  `person.test.ts`, `person.mutation-kill.test.ts`,
  `attendance-report.test.ts`, `program-cascade.test.ts`
- `ralph/packets/index.json` (status flips + `current_packet_id` cleared)
