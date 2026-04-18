# Packet PKT-C-005 — p6-d8-notification-drawer

| Field | Value |
|-------|-------|
| Packet ID | `PKT-C-005` |
| Story ID | `p6-d8-notification-drawer` |
| Bucket | `C -> buildable` |
| Module | `dashboard` |
| Status | `READY` |

## Goal

Build the notification drawer launched from the dashboard bell icon using the
frozen mobile and desktop wireframes.

## Oracle Sources

- Design decisions: [`.planning/wireframes/bucket-c-design-decisions.md:76`](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/bucket-c-design-decisions.md:76>)
- Mobile export: [PKT-C-005-notification-drawer-mobile.png](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/exports/PKT-C-005-notification-drawer-mobile.png>)
- Desktop export: [PKT-C-005-notification-drawer-desktop.png](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/exports/PKT-C-005-notification-drawer-desktop.png>)
- Bell entry point: [`src/app/(app)/dashboard/dashboard-client.tsx:114`](</Users/shaileshsingh/G_I_C_A/src/app/(app)/dashboard/dashboard-client.tsx:114>)

## Allowed Write Scope

- `src/app/(app)/dashboard/**`
- event communications query/action layer if needed for recent notification fetch
- notification drawer tests

## Forbidden Write Scope

- full communications history page redesign
- real-time websocket system
- schema changes

## Non-Goals

- per-item drill-through
- live push updates
- read/unread overhaul beyond defined drawer behavior

## Frozen Build Requirements

1. Mobile uses a bottom sheet; desktop uses a right-side 360px drawer.
2. Feed source is recent `notification_log` entries filtered by event and limited to 20.
3. Drawer exposes All, Unread, and Failed filters.
4. Bell shows unread badge count when non-zero.
5. Header includes “Mark all read”.
6. Bottom link goes to `/events/[eventId]/communications`.
7. Drawer refreshes on open via polling/fetch-on-open, not realtime sockets.

## Acceptance Checks

- Bell opens the correct drawer form factor by viewport.
- Rows show subject, recipient, channel icon, status, and relative timestamp.
- Unread badge count and mark-all-read behavior work against the chosen feed.
- Failed filter only shows failed items.

## Tracking

- Linear issue: to be created by `watch-packets.sh`
- Build commit prefix: `RPKT: PKT-C-005 - ...`
- QA commit prefix: `QPKT: PKT-C-005 - ...`
