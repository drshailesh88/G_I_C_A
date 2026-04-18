# Packet PKT-C-003 — p2-d1-preview-revised-emails

| Field | Value |
|-------|-------|
| Packet ID | `PKT-C-003` |
| Story ID | `p2-d1-preview-revised-emails` |
| Bucket | `C` |
| Module | `program` |
| Status | `READY` |

## Goal

Build the “Preview Revised Emails” experience for M52 using the frozen modal
wireframes and faculty-diff rendering decisions.

## Oracle Sources

- Design decisions: [`.planning/wireframes/bucket-c-design-decisions.md:90`](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/bucket-c-design-decisions.md:90>)
- Mobile export: [PKT-C-003-preview-emails-mobile.png](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/exports/PKT-C-003-preview-emails-mobile.png>)
- Desktop export: [PKT-C-003-preview-emails-desktop.png](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/exports/PKT-C-003-preview-emails-desktop.png>)
- Deferred note: [`research-hub/DEFERRED_TICKETS.md:9`](</Users/shaileshsingh/G_I_C_A/research-hub/DEFERRED_TICKETS.md:9>)

## Dependency Status

`PKT-A-010` / `p2-m52-version-history` is now verified, so this packet is
unblocked and ready to build on top of the shipped M52 page.

## Allowed Write Scope

- `src/app/(app)/events/[eventId]/changes/**`
- `src/lib/actions/program.ts`
- template rendering helpers already used for program updates
- tests for preview rendering and send-all workflow

## Forbidden Write Scope

- building M52 itself inside this packet
- unrelated notification template editor work
- schema changes

## Non-Goals

- full email campaign console
- React Email migration
- per-item drill-through from preview

## Frozen Build Requirements

1. Mobile uses a full-screen sheet; desktop uses a centered 560px modal.
2. User can preview as a selected faculty member from a dropdown.
3. UI shows affected count and send-all footer information.
4. Preview uses real template rendering and diff blocks with green/orange/red coding.
5. “Send All” publishes and sends all revised emails in one action.

## Acceptance Checks

- Preview renders real variables for selected faculty.
- Diff blocks match the structured categories from the decisions doc.
- Send-all action is available from the M52-based flow now that `PKT-A-010`
  exists.

## Tracking

- Linear issue: to be created by `watch-packets.sh`
- Build commit prefix: `RPKT: PKT-C-003 - ...`
- QA commit prefix: `QPKT: PKT-C-003 - ...`
