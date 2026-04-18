# Packet PKT-A-002 — p1-event-edit-settings

| Field | Value |
|-------|-------|
| Packet ID | `PKT-A-002` |
| Story ID | `p1-event-edit-settings` |
| Bucket | `A` |
| Module | `events` |
| Status | `READY` |

## Goal

Implement the event settings/edit page at `/events/[eventId]/settings` and the
backing update action for event name, dates, venue, and module toggles.

## Oracle Sources

- PRD: [`.planning/prd.md:51`](</Users/shaileshsingh/G_I_C_A/.planning/prd.md:51>)
- Workspace settings dead-link: [`src/app/(app)/events/[eventId]/event-workspace-client.tsx:123`](</Users/shaileshsingh/G_I_C_A/src/app/(app)/events/[eventId]/event-workspace-client.tsx:123>)
- Existing event read/update-status actions: [`src/lib/actions/event.ts:219`](</Users/shaileshsingh/G_I_C_A/src/lib/actions/event.ts:219>)

## Problem Statement

The workspace already exposes a settings icon, but the route does not exist and
there is no `updateEvent` style action for post-creation editing.

## Allowed Write Scope

- `src/app/(app)/events/[eventId]/settings/**`
- `src/lib/actions/event.ts`
- `src/lib/validations/event.ts` if needed
- tests directly covering the event settings flow

## Forbidden Write Scope

- event assignment UX
- registration settings beyond linking to the dedicated registration packet
- schema changes
- shared auth helpers unless strictly required

## Non-Goals

- event duplication
- ownership transfer
- feature flags system
- redesign of event workspace

## Frozen Build Requirements

1. `/events/[eventId]/settings` route exists and is reachable from the workspace icon.
2. Authorized event admins can edit event name, description, dates, venue fields, and module toggles.
3. Input is validated before persistence.
4. Event-scoped access is enforced.
5. Successful edits persist and are visible after reload.

## Acceptance Checks

- Settings page loads for an accessible event and rejects inaccessible events.
- Saving valid changes updates the event and returns to a consistent state on reload.
- Invalid dates or malformed payloads are rejected cleanly.
- Existing event status transitions remain unchanged.

## Tracking

- Linear issue: to be created by `watch-packets.sh`
- Build commit prefix: `RPKT: PKT-A-002 - ...`
- QA commit prefix: `QPKT: PKT-A-002 - ...`
