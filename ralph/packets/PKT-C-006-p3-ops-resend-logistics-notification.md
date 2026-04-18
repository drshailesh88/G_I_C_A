# Packet PKT-C-006 — p3-ops-resend-logistics-notification

| Field | Value |
|-------|-------|
| Packet ID | `PKT-C-006` |
| Story ID | `p3-ops-resend-logistics-notification` |
| Bucket | `C -> buildable` |
| Module | `logistics` |
| Status | `READY` |

## Goal

Build the Ops resend-logistics-notification row action UX for travel and
accommodation records using the frozen wireframes and decisions.

## Oracle Sources

- Design decisions: [`.planning/wireframes/bucket-c-design-decisions.md:45`](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/bucket-c-design-decisions.md:45>)
- Mobile export: [PKT-C-006-resend-notification-mobile.png](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/exports/PKT-C-006-resend-notification-mobile.png>)
- Desktop export: [PKT-C-006-resend-notification-desktop.png](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/exports/PKT-C-006-resend-notification-desktop.png>)
- Existing resend infrastructure reference is documented in the decisions file

## Allowed Write Scope

- `src/app/(app)/events/[eventId]/travel/**`
- `src/app/(app)/events/[eventId]/accommodation/**`
- `src/lib/actions/notifications.ts` only if directly required
- logistics notification tests

## Forbidden Write Scope

- transport resend UI in this packet
- schema changes
- preview-builder UX

## Non-Goals

- resend preview
- batch resend
- transport resend support

## Frozen Build Requirements

1. Travel and accommodation rows expose a `···` action menu.
2. Resend action opens bottom sheet on mobile and modal on desktop.
3. User selects exactly one channel: Email or WhatsApp.
4. UI shows last-sent cooldown warning if applicable.
5. Confirmation dialog shows recipient and chosen channel.
6. Reuse existing resend infrastructure where available.

## Acceptance Checks

- Ops can resend from travel and accommodation contexts only.
- Channel choice is enforced as single-select.
- Existing notification log correctly reflects resend semantics.
- No transport resend UI is introduced in this packet.

## Tracking

- Linear issue: to be created by `watch-packets.sh`
- Build commit prefix: `RPKT: PKT-C-006 - ...`
- QA commit prefix: `QPKT: PKT-C-006 - ...`
