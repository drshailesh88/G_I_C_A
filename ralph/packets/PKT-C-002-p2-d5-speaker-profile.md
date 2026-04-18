# Packet PKT-C-002 — p2-d5-speaker-profile

| Field | Value |
|-------|-------|
| Packet ID | `PKT-C-002` |
| Story ID | `p2-d5-speaker-profile` |
| Bucket | `C -> buildable` |
| Module | `public` |
| Status | `NEEDS_REVIEW` |

## Goal

Build the speaker-profile overlay on the public event landing page according to
the frozen wireframes and design decisions.

## Oracle Sources

- Design decisions: [`.planning/wireframes/bucket-c-design-decisions.md:25`](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/bucket-c-design-decisions.md:25>)
- Mobile export: [PKT-C-002-speaker-profile-mobile.png](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/exports/PKT-C-002-speaker-profile-mobile.png>)
- Desktop export: [PKT-C-002-speaker-profile-desktop.png](</Users/shaileshsingh/G_I_C_A/.planning/wireframes/exports/PKT-C-002-speaker-profile-desktop.png>)
- Original deferred note: [`research-hub/DEFERRED_TICKETS.md:13`](</Users/shaileshsingh/G_I_C_A/research-hub/DEFERRED_TICKETS.md:13>)
- Schema landed: [drizzle/migrations/0008_add_people_bio_and_photo.sql](</Users/shaileshsingh/G_I_C_A/drizzle/migrations/0008_add_people_bio_and_photo.sql>) and [src/lib/db/schema/people.ts](</Users/shaileshsingh/G_I_C_A/src/lib/db/schema/people.ts:33>)

## Status Note

The required nullable `bio` and `photoStorageKey` fields have already been
approved and landed in the repo. This packet is therefore eligible for QA and
verification against the implemented public speaker-profile behavior.

## Allowed Write Scope

- `src/app/(public)/e/[eventSlug]/**`
- `src/lib/actions/event.ts` or program/public query helpers as needed
- `src/lib/actions/speaker-profile.ts`
- public-flow tests for modal/sheet behavior

## Forbidden Write Scope

- adding a new dedicated route
- session link-through navigation
- unrelated public registration changes

## Non-Goals

- full speaker directory
- session deep links from profile cards
- CMS photo management workflow

## Frozen Build Requirements

1. No new route; interaction stays on `/e/[eventSlug]`.
2. Mobile opens a full-height bottom sheet from speaker cards.
3. Desktop opens a centered modal with two-column layout.
4. Fields shown: name, designation, organization, bio, photo placeholder, event-scoped sessions list.
5. Sessions listed are only for the current event.
6. Existing landed schema fields `people.bio` and `people.photoStorageKey` are the approved source for profile content.

## Acceptance Checks

- Speaker card opens the correct overlay mode on mobile and desktop.
- Session list is scoped to the current event.
- No route change is required.

## Tracking

- Linear issue: to be created by `watch-packets.sh`
- Build commit prefix: `RPKT: PKT-C-002 - ...`
- QA commit prefix: `QPKT: PKT-C-002 - ...`
