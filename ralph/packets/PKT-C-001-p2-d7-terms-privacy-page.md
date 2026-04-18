# Packet PKT-C-001 — p2-d7-terms-privacy-page

| Field | Value |
|-------|-------|
| Packet ID | `PKT-C-001` |
| Story ID | `p2-d7-terms-privacy-page` |
| Bucket | `C -> buildable` |
| Module | `public` |
| Status | `READY` |

## Goal

Build the public legal page as a single `/terms` route with Terms and Privacy
tab toggle, using the frozen wireframes and design decisions.

## Oracle Sources

- Design decisions: [`.planning/wireframes/bucket-c-design-decisions.md:9`](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/bucket-c-design-decisions.md:9>)
- Mobile export: [PKT-C-001-terms-privacy-mobile.png](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/exports/PKT-C-001-terms-privacy-mobile.png>)
- Desktop export: [PKT-C-001-terms-privacy-desktop.png](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/exports/PKT-C-001-terms-privacy-desktop.png>)
- Original deferred note: [`research-hub/DEFERRED_TICKETS.md:15`](</Users/shaileshsingh/G_I_C_A/research-hub/DEFERRED_TICKETS.md:15>)

## Allowed Write Scope

- `src/app/(public)/terms/**`
- `src/app/(public)/register/**` or registration footer link only as needed
- public-only tests for the new route and link behavior

## Forbidden Write Scope

- event-specific branding logic
- CMS/editor systems
- schema changes
- unrelated public pages

## Non-Goals

- legal CMS
- separate `/privacy` route for v1
- event-specific legal variants

## Frozen Build Requirements

1. Public route is `/terms` under the `(public)` layout.
2. Page presents two tabs: Terms of Service and Privacy Policy.
3. Mobile uses accordion sections in a scrollable layout.
4. Desktop uses a centered prose column with the same accordion pattern.
5. Page includes a “Back to Registration” ghost button.
6. Registration footer link points to `/terms`.
7. v1 content is static.

## Acceptance Checks

- `/terms` renders in public layout on mobile and desktop.
- Tab toggle switches between Terms and Privacy sections without navigation drift.
- Registration flow links to the page.
- No event-specific data is required.

## Tracking

- Linear issue: to be created by `watch-packets.sh`
- Build commit prefix: `RPKT: PKT-C-001 - ...`
- QA commit prefix: `QPKT: PKT-C-001 - ...`
