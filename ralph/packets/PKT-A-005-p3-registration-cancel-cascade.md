# Packet PKT-A-005 — p3-registration-cancel-cascade

| Field | Value |
|-------|-------|
| Packet ID | `PKT-A-005` |
| Story ID | `p3-registration-cancel-cascade` |
| Bucket | `A` |
| Module | `registration` |
| Status | `READY` |

## Goal

When a registration is cancelled, create linked red flags on affected
travel/accommodation/transport records. Do not auto-delete downstream data.

## Oracle Sources

- Audit finding and required behavior from the bucket review
- Existing registration status mutation: [`src/lib/actions/registration.ts:243`](</Users/shaileshsingh/G_I_C_A/src/lib/actions/registration.ts:243>)
- Existing red-flag types include `registration_cancelled`: [`src/lib/cascade/red-flags.ts:45`](</Users/shaileshsingh/G_I_C_A/src/lib/cascade/red-flags.ts:45>)
- Cascade event catalog already knows registration-created paths: [`src/lib/cascade/events.ts:115`](</Users/shaileshsingh/G_I_C_A/src/lib/cascade/events.ts:115>)

## Problem Statement

Registration cancellation currently only updates registration status. It does
not emit a cascade or mark dependent logistics records for human review.

## Allowed Write Scope

- `src/lib/actions/registration.ts`
- `src/lib/cascade/events.ts`
- `src/lib/cascade/handlers/**` if needed for registration cancellation
- tests covering cancellation cascade and red-flag creation

## Forbidden Write Scope

- deleting or auto-cancelling downstream records
- schema changes
- unrelated travel/accommodation/transport UI

## Non-Goals

- resend notifications
- waitlist/approval redesign
- travel import

## Frozen Build Requirements

1. Cancelling a registration emits the appropriate domain event or equivalent internal cascade trigger.
2. Linked logistics records receive red flags for human review.
3. Existing logistics records are preserved; nothing is auto-deleted.
4. Event scoping is preserved throughout.

## Acceptance Checks

- Cancelling a registration with linked travel/accommodation/transport creates red flags.
- Cancelling a registration without linked logistics does not error.
- No unrelated records across events are flagged.
- Existing created-registration cascade behavior remains intact.

## Tracking

- Linear issue: to be created by `watch-packets.sh`
- Build commit prefix: `RPKT: PKT-A-005 - ...`
- QA commit prefix: `QPKT: PKT-A-005 - ...`
