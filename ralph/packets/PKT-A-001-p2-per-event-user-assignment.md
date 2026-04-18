# Packet PKT-A-001 — p2-per-event-user-assignment

| Field | Value |
|-------|-------|
| Packet ID | `PKT-A-001` |
| Story ID | `p2-per-event-user-assignment` |
| Bucket | `A` |
| Module | `events` |
| Status | `READY` |

## Goal

Build the Super Admin workflow to assign Event Coordinators and Ops staff to
specific events using the existing `event_user_assignments` model.

## Oracle Sources

- PRD: [`.planning/prd.md:37`](</Users/shaileshsingh/G_I_C_A/.planning/prd.md:37>)
- Access implementation already depends on assignments: [`src/lib/auth/event-access.ts:91`](</Users/shaileshsingh/G_I_C_A/src/lib/auth/event-access.ts:91>)
- Event listing already joins `event_user_assignments`: [`src/lib/actions/event.ts:168`](</Users/shaileshsingh/G_I_C_A/src/lib/actions/event.ts:168>)
- Existing team management area: [`src/app/(app)/settings/team/page.tsx`](</Users/shaileshsingh/G_I_C_A/src/app/(app)/settings/team/page.tsx)

## Problem Statement

The access-control layer already relies on `event_user_assignments`, but there
is no admin workflow to create, update, or deactivate assignments. That means
the RBAC model exists in data and code, but cannot be managed from the app.

## Allowed Write Scope

- `src/app/(app)/settings/team/**`
- `src/app/(app)/events/**` if needed only for event-assignment entrypoints
- `src/lib/actions/team*.ts` or a new event-assignment action file under `src/lib/actions/`
- `src/lib/validations/**` only if needed for new assignment input schemas
- tests directly covering the touched module(s)

## Forbidden Write Scope

- `src/lib/auth/**` behavior changes unless strictly required to consume the new UI
- database schema / migrations
- shared infra under `qa/`, `.quality/`, `ralph/`
- unrelated module UI

## Non-Goals

- ownership transfer
- event settings editing
- team invitation redesign
- Clerk org role redesign
- cross-event global dashboard changes

## Frozen Build Requirements

1. Super Admin can view current assignments for a specific event.
2. Super Admin can assign at least coordinator and ops staff to a specific event.
3. Super Admin can remove or deactivate an assignment.
4. Assignment mutations are validated before write.
5. Resulting records are compatible with `checkEventAccess()` and event list filtering.
6. Read-only and non-super-admin users cannot manage assignments.

## Acceptance Checks

- A Super Admin can create an assignment for an event and the assigned user then appears in the event-scoped access path.
- Removing or deactivating an assignment prevents further event access for that user.
- No assignment operation leaks across events.
- No schema change is introduced.
- All relevant tests and typecheck pass.

## Suggested Verification

- UI path from team/settings or event admin surface
- server action coverage for create/update/deactivate
- event access regression proving assignments actually govern visibility

## Tracking

- Linear issue: to be created by `watch-packets.sh`
- Build commit prefix: `RPKT: PKT-A-001 - ...`
- QA commit prefix: `QPKT: PKT-A-001 - ...`
