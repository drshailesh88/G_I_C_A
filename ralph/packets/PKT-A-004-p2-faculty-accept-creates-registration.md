# Packet PKT-A-004 — p2-faculty-accept-creates-registration

| Field | Value |
|-------|-------|
| Packet ID | `PKT-A-004` |
| Story ID | `p2-faculty-accept-creates-registration` |
| Bucket | `A` |
| Module | `program` |
| Status | `READY` |

## Goal

When a faculty member accepts an invite from the public confirmation flow,
create or confirm their event registration and ensure the event-person link is
present.

## Oracle Sources

- PRD faculty acceptance story: [`.planning/prd.md:99`](</Users/shaileshsingh/G_I_C_A/.planning/prd.md:99>)
- Public confirm flow: [`src/app/(public)/e/[eventSlug]/confirm/[token]/faculty-confirm-client.tsx:44`](</Users/shaileshsingh/G_I_C_A/src/app/(public)/e/[eventSlug]/confirm/[token]/faculty-confirm-client.tsx:44>)
- Current action only updates invite status: [`src/lib/actions/program.ts:907`](</Users/shaileshsingh/G_I_C_A/src/lib/actions/program.ts:907>)
- Invite creation already upserts `event_people`: [`src/lib/actions/program.ts:897`](</Users/shaileshsingh/G_I_C_A/src/lib/actions/program.ts:897>)

## Problem Statement

Acceptance currently changes invite status only. It does not create or confirm
registration for the faculty member.

## Allowed Write Scope

- `src/lib/actions/program.ts`
- public confirm flow files under `src/app/(public)/e/[eventSlug]/confirm/**`
- registration actions only if directly needed for the accept flow
- tests for invite acceptance and resulting registration state

## Forbidden Write Scope

- program versioning
- template/notification UX
- schema changes
- unrelated public registration flow redesign

## Non-Goals

- revised responsibility notifications
- aggregated faculty email
- faculty profile pages

## Frozen Build Requirements

1. Accepting a valid invite moves invite status to accepted.
2. Acceptance creates a registration if none exists for that person and event.
3. If a registration already exists, acceptance confirms or preserves it in a valid state.
4. `event_people` relationship remains present.
5. Invalid/expired tokens remain blocked.

## Acceptance Checks

- First-time acceptance creates a registration row for the event.
- Re-accept or already-linked scenarios do not create duplicates.
- Cross-event leakage is impossible.
- Public success path still works.

## Tracking

- Linear issue: to be created by `watch-packets.sh`
- Build commit prefix: `RPKT: PKT-A-004 - ...`
- QA commit prefix: `QPKT: PKT-A-004 - ...`
