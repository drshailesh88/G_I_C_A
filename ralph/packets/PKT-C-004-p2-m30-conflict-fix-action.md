# Packet PKT-C-004 — p2-m30-conflict-fix-action

| Field | Value |
|-------|-------|
| Packet ID | `PKT-C-004` |
| Story ID | `p2-m30-conflict-fix-action` |
| Bucket | `C -> buildable` |
| Module | `program` |
| Status | `READY` |

## Goal

Add the “Fix” CTA flow from the schedule-grid conflict banner into the session
edit experience using the frozen destination-state design.

## Oracle Sources

- Design decisions: [`.planning/wireframes/bucket-c-design-decisions.md:62`](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/bucket-c-design-decisions.md:62>)
- Mobile export: [PKT-C-004-conflict-fix-mobile.png](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/exports/PKT-C-004-conflict-fix-mobile.png>)
- Desktop export: [PKT-C-004-conflict-fix-desktop.png](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/exports/PKT-C-004-conflict-fix-desktop.png>)
- Conflict banner exists: [`src/app/(app)/events/[eventId]/schedule/schedule-grid-client.tsx:624`](</Users/shaileshsingh/G_I_C_A/src/app/(app)/events/[eventId]/schedule/schedule-grid-client.tsx:624>)

## Allowed Write Scope

- `src/app/(app)/events/[eventId]/schedule/**`
- `src/app/(app)/events/[eventId]/sessions/**`
- program tests for conflict navigation/edit state

## Forbidden Write Scope

- schema changes
- reworking conflict detection algorithm
- unrelated schedule-grid redesign

## Non-Goals

- conflict resolution automation
- additional conflict analytics

## Frozen Build Requirements

1. Conflict banner includes an orange “Fix” CTA.
2. Fix navigates to `/events/[eventId]/sessions/[sessionId]?conflict=true` for the second conflicting session.
3. Session edit UI shows warning highlight on time slot and faculty fields.
4. Mobile shows an alert banner at top of edit sheet.
5. Desktop shows a side-by-side read-only conflict card and editable form.
6. After save, navigation returns to schedule grid.

## Acceptance Checks

- Fix CTA appears when conflicts exist.
- Navigation targets the correct conflicting session.
- Conflict warning state is visible in the edit form.
- Returning after save resolves or preserves banner state correctly.

## Tracking

- Linear issue: to be created by `watch-packets.sh`
- Build commit prefix: `RPKT: PKT-C-004 - ...`
- QA commit prefix: `QPKT: PKT-C-004 - ...`
