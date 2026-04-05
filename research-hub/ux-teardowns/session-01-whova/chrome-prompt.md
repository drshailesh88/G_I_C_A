# TERMINAL 5: Whova — Chrome UX Teardown

You are Worker 5 doing a detailed UX teardown of Whova for the GEM India Conference App project.

## Context
Web research (web-research.md) documented features from blog posts and marketing pages. What we need: the actual organizer dashboard, event creation wizard, agenda builder, badge editor, and check-in interfaces.

## Account Setup
Go to https://whova.com and request demo access or create an organizer account. If full dashboard isn't available, explore every public event page and documented walkthrough you can access.

**Important:** Whova's organizer dashboard may require demo approval. If you cannot get dashboard access, focus on:
- Public event pages in the Whova app/web
- Any available demo videos or walkthrough pages
- The Whova Event app (download on phone if possible)

## FLOW 1: Event Creation Wizard

1. If you have dashboard access: Click to create a new event. Document the linear wizard:
   - Step 1: Registration source selection — what import options? Visual layout?
   - Step 2: Basic Information — every field, every type
   - Step 3: Logistics section — what customizable items?
   - Step 4: Permissions — what access levels?
   - Step 5: Submit — what happens? Immediate publish?
2. What does the event list/dashboard look like? How are events organized? Status indicators?

## FLOW 2: Agenda / Session Manager

1. Navigate to the Agenda/Session Manager. Document:
   - How do you add a session? What form appears?
   - Every session field: title, date, time, duration, room, track, tags, speaker, description
   - How does multi-track support work visually? Track manager?
   - Track colors: how are they assigned? What palette?
2. Bulk Edit button: what opens? How do you select sessions? What can you bulk-change?
3. Batch scheduling: document the 3-step process (select sessions → configure → review & order)
4. Non-session items (breaks, meals): where is the button? What fields?
5. What does the organizer's agenda view look like vs what attendees see?

## FLOW 3: Badge Editor

1. Navigate to Badge/Name Badge section. Document:
   - How do you create a new badge design?
   - The drag-and-drop editor: what tools? What fields can you add?
   - The 17 templates: how are they presented? Grid? List?
   - How do you add a QR code to the badge?
   - Print setup: paper sizes, printer selection
   - On-demand printing triggered by check-in: how is this configured?

## FLOW 4: Check-In System

1. Navigate to the Check-In section. Document:
   - Kiosk setup: how do you configure a self-service kiosk?
   - QR scanning interface: what does the scanner screen look like?
   - What information displays when you scan an attendee?
   - Session-level check-in: how do you configure per-session tracking?
   - Check-in dashboard: what metrics are shown in real-time?

## FLOW 5: Registration Setup

1. Navigate to Registration/Ticketing. Document:
   - How do you create ticket types? (paid, free, early bird)
   - Registration form builder: what custom fields can you add? What types?
   - Discount code management: how do you create/upload codes?
   - What does the public registration page look like?

## FLOW 6: Reports Dashboard

1. Navigate to Reports. Document:
   - What does the main dashboard show? Layout?
   - What report categories exist? (Document all 9 if visible)
   - How do you export? What formats?
   - What real-time metrics are displayed?

## Output Format

Write ALL findings to: `/research-hub/ux-teardowns/session-01-whova/chrome-teardown.md`

For each flow: screen name, layout, every clickable element, form fields, transitions, empty/error states.

**Note:** If dashboard access is limited, document what you CAN see and clearly mark what was inaccessible. Focus depth on whatever flows you can access fully.

After completing, update `/research-hub/_MASTER_STATUS.md` with your progress.
