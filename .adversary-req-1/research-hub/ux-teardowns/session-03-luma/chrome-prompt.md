# TERMINAL 4: Lu.ma — Chrome UX Teardown

You are Worker 4 doing a detailed UX teardown of Lu.ma for the GEM India Conference App project.

## Context
Web research (web-research.md) already documented the public event page layout, theme system, and feature set from docs. What we need from Chrome: the actual event CREATION flow, ORGANIZER dashboard (guest management, blasts), and REGISTRATION experience from both sides.

## Account Setup
Go to https://lu.ma (now luma.com) and create a free account. Create a real test event.

## FLOW 1: Event Creation (Single-Page Form — Our Design Inspiration)

This is the most important flow. Lu.ma is famous for condensing event creation into one elegant screen.

1. Click "Create Event". Document EVERYTHING on this page:
   - What is the FIRST thing you see? Layout?
   - List every field IN ORDER from top to bottom:
     - Title field: placeholder text? character limit?
     - Event type selector: In-Person / Online / Hybrid — what does each option change?
     - Date/time picker: how does it open? calendar popup? inline? timezone handling?
     - Location field: autocomplete behavior? map preview?
     - Cover image: curated gallery vs upload — how does the gallery look? categories? search?
     - Description: rich text editor — what toolbar options?
     - Theme selector: how does it present 40+ themes? grid? carousel? live preview?
   - Is this truly a SINGLE PAGE or does it have sections/steps?
2. What happens when you click "Create Event"? Where do you land? Is the event immediately live?
3. Can you edit everything after creation? What does the edit flow look like?

## FLOW 2: Organizer Dashboard — Guest Management

1. After creating an event, go to the Manage Event page. Document the TAB structure:
   - What tabs exist? (Registration, Guests, Blasts, More?) Exact names and order.
2. Go to the GUESTS tab. Document:
   - The 7 status filter tabs: exact labels and their visual treatment (counts? colors?)
   - How does the guest table look? What columns?
   - Search behavior: what can you search by?
   - Click on a guest row — what detail shows?
   - Bulk operations: select multiple → what actions appear?
3. Go to the REGISTRATION tab. Document:
   - Ticket type configuration
   - Custom question builder — how do you add questions? what types?
   - Approval toggle — where is it? what changes when turned on?
   - Capacity and waitlist settings

## FLOW 3: Registration Flow (Attendee Side)

1. Open your test event's public URL in an incognito window (or logged out). Document:
   - Full event page layout: what appears in what order?
   - Where is the Register/CTA button? Is it sticky?
   - Click Register. Document the registration form:
     - What fields? (Name, Email, custom questions?)
     - How many steps?
     - Payment step (if tickets are paid)?
   - After submitting: what confirmation screen appears?
   - What does the confirmation EMAIL contain?
   - Is there a QR code in the email? Calendar invite?

## FLOW 4: QR Check-in (If Possible)

1. Go to Manage Event > find the check-in/scanner section.
2. Open the scanner (phone or web). Document:
   - Standard mode vs Express mode: how do you switch?
   - What does the scan screen look like?
   - What information appears after scanning?
   - Where is the manual check-in option?

## FLOW 5: Blasts (Email Communications)

1. Go to the Blasts tab. Document:
   - How do you create a new blast/announcement?
   - What editor is used for the email body?
   - Can you filter recipients?
   - What does the send confirmation look like?

## Output Format

Write ALL findings to: `/research-hub/ux-teardowns/session-03-luma/chrome-teardown.md`

For each flow: screen name, layout, every clickable element, form fields, transitions, empty/error states.

After completing, update `/research-hub/_MASTER_STATUS.md` with your progress.
