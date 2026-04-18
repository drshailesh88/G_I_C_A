# Packet PKT-A-003 — p2-registration-settings-ui

| Field | Value |
|-------|-------|
| Packet ID | `PKT-A-003` |
| Story ID | `p2-registration-settings-ui` |
| Bucket | `A` |
| Module | `registration` |
| Status | `READY` |

## Goal

Implement the per-event registration settings configuration UI for
`registrationSettings`, including approval requirement, capacity, waitlist,
cutoff date, and configurable preference fields.

## Oracle Sources

- PRD: [`.planning/prd.md:63`](</Users/shaileshsingh/G_I_C_A/.planning/prd.md:63>)
- Public site reads `registrationSettings`: [`src/app/(public)/e/[eventSlug]/event-landing-client.tsx:42`](</Users/shaileshsingh/G_I_C_A/src/app/(public)/e/[eventSlug]/event-landing-client.tsx:42>)
- Event queries already select `registrationSettings`: [`src/lib/actions/event.ts:197`](</Users/shaileshsingh/G_I_C_A/src/lib/actions/event.ts:197>)

## Problem Statement

The event model already contains `registrationSettings`, but there is no admin
UI or server action for editing them.

## Allowed Write Scope

- `src/app/(app)/events/[eventId]/**` for a registration settings screen
- `src/lib/actions/event.ts` or a new event/registration settings action
- `src/lib/validations/**` for settings payload validation
- tests covering settings persistence and effect on public registration behavior

## Forbidden Write Scope

- public registration redesign beyond consuming stored settings
- schema changes
- travel/accommodation/transport modules

## Non-Goals

- approval workflow UI for processing registrations
- custom field builder beyond configuring preference fields already supported by the current shape
- analytics

## Frozen Build Requirements

1. Event admin can edit `registrationSettings` from an event-scoped admin UI.
2. Supported controls include approval required, max capacity, waitlist enabled, cutoff date, and preference field visibility/config.
3. Input is validated before write.
4. Saved settings are read back by the public registration surfaces.

## Acceptance Checks

- Saving settings persists to the event and survives reload.
- Public registration flow respects changed settings where already implemented in existing logic.
- Unauthorized users cannot edit settings.

## Tracking

- Linear issue: to be created by `watch-packets.sh`
- Build commit prefix: `RPKT: PKT-A-003 - ...`
- QA commit prefix: `QPKT: PKT-A-003 - ...`
