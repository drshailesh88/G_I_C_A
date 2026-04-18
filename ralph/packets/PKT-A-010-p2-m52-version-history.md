# Packet PKT-A-010 — p2-m52-version-history

| Field | Value |
|-------|-------|
| Packet ID | `PKT-A-010` |
| Story ID | `p2-m52-version-history` |
| Bucket | `A` |
| Module | `program` |
| Status | `READY` |

## Goal

Build the Program Version History / Program Changes page so Event Coordinators
can view published program versions, inspect structured change summaries, and
use that page as the base surface for the later revised-email preview flow.

## Oracle Sources

- PRD versioning requirement: [`.planning/prd.md:58`](</Users/shaileshsingh/G_I_C_A/.planning/prd.md:58>)
- PRD user story for structured diff on publish: [`.planning/prd.md:83`](</Users/shaileshsingh/G_I_C_A/.planning/prd.md:83>)
- Handoff screen: [`research-hub/PROJECT_HANDOFF.md:62`](</Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md:62>)
- Workspace entrypoint already shipped: [event-workspace-client.tsx](/Users/shaileshsingh/G_I_C_A/src/app/(app)/events/[eventId]/event-workspace-client.tsx:64)
- Existing backend actions: [program.ts](/Users/shaileshsingh/G_I_C_A/src/lib/actions/program.ts:1078)

## Existing Assets Already In Repo

- `publishProgramVersion(eventId, input)` already creates `program_versions`
  rows with:
  - `versionNo`
  - `snapshotJson`
  - `changesSummaryJson`
  - `changesDescription`
  - `affectedPersonIdsJson`
  - `publishReason`
- `getProgramVersions(eventId)` already returns versions ordered by latest first.
- `getProgramVersion(eventId, versionId)` already returns a single version.

This packet is therefore a UI/page integration packet, not a schema packet.

## Allowed Write Scope

- `src/app/(app)/events/[eventId]/changes/**`
- `src/lib/actions/program.ts` only if small page-facing helper additions are needed
- packet-focused tests for the changes page

## Forbidden Write Scope

- notification sending logic for revised faculty emails
- template editor / communications work
- schema changes
- changing unrelated schedule/session flows

## Non-Goals

- full email preview UI (`PKT-C-003`)
- “Send All” revised emails (`PKT-C-003` / `PKT-A-011`)
- deep compare of every field in every session object
- replacing the existing publish backend

## Frozen Build Requirements

1. Route exists at `/events/[eventId]/changes`.
2. The existing “Changes” tile in the event workspace must land on this page.
3. Page loads published versions for the current event using the existing
   versioning actions.
4. Versions are shown newest first with visible version number and publish
   metadata.
5. Each version row/card shows the structured change summary already stored in
   `changesSummaryJson`:
   - added sessions count
   - removed sessions count
   - total sessions
   - total assignments
6. The page surfaces `changesDescription` and/or `publishReason` when present.
7. Empty state is handled gracefully when no versions exist yet.
8. Event access must follow the project’s normal event-scope rules; inaccessible
   events must not leak cross-event details.

## Acceptance Checks

- Visiting `/events/[eventId]/changes` from the workspace shows a real page, not
  a 404.
- Latest version appears first.
- Structured counts are rendered from real stored version data.
- Empty state appears for events with no versions yet.
- Page stays event-scoped and uses the current event id only.

## Tracking

- Linear issue: to be created by `watch-packets.sh`
- Build commit prefix: `RPKT: PKT-A-010 - ...`
- QA commit prefix: `QPKT: PKT-A-010 - ...`
