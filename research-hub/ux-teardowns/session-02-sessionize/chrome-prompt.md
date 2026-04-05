# TERMINAL 2: Sessionize — Chrome UX Teardown

You are Worker 2 doing a detailed UX teardown of Sessionize for the GEM India Conference App project.

## Context
We already have web research in this folder (web-research.md). We know the features, field types, session statuses, and notification logic. What we DON'T have is the actual visual UX — the schedule grid builder's drag-and-drop, the speaker assignment interface, the inform flow, and the notification email templates.

## Your Job
Log into Sessionize (free organizer account) and document every screen, every click, every transition. Do NOT guess.

## Account Setup
Go to https://sessionize.com and create a free organizer account. Create a test event. Add at least:
- 3 rooms/halls
- 2 days
- 8-10 test sessions (use fake data)
- 4-5 test speakers (can be accountless)
- 2 tracks with different colors

## FLOW 1: Schedule Grid Builder (MOST CRITICAL — This Is Our Module 5)

1. Navigate to the Schedule Builder page. Screenshot the FULL layout:
   - LEFT PANEL: How is the session list displayed? What information per session? Is there search/filter?
   - RIGHT PANEL: How is the grid structured? Columns = rooms? Rows = time slots?
   - What's the default time range? Where is the "Add an hour" button?
   - How are room names displayed? Can you rename inline?
2. DRAG AND DROP — document each interaction:
   - Drag a session from the left panel to a grid cell. What visual feedback? Ghost element? Snap behavior?
   - Drag the BOTTOM EDGE of a placed session to resize duration. What cursor? What visual indicator?
   - Drag a session from one room column to another. Does it snap? Does duration adjust?
   - Drag a session BACK to the left panel to unschedule it. What happens?
   - Drag one session ON TOP of another. Does it swap? What visual feedback?
3. MULTI-DAY: How do day tabs work? What do they look like? Can you drag across days?
4. COLOR CODING: How are sessions colored by category? Where is the color legend? Is it automatic from custom fields?
5. SPECIAL SESSIONS:
   - Add a plenum/keynote session that spans all rooms. How?
   - Add a service session (break, lunch). Where is the button? What fields?
6. CONFLICT DETECTION: Schedule the same speaker in two rooms at the same time. What warning appears? Where? What color/icon?
7. Collapse/expand a room column. Where is the control?
8. Hide the left sidebar. Where is the toggle?

## FLOW 2: Speaker/Faculty Management

1. Go to the Speakers page. Document the list view:
   - What columns/cards? How is each speaker displayed?
   - Search and filter controls?
2. Add a speaker manually (not via CFP). Document every field in the form.
3. Add an ACCOUNTLESS speaker (placeholder). Where is the "Do not send invite" checkbox?
4. Go to the Grid View for editing. Document:
   - How does the two-column inline editing work?
   - Click a cell to edit — what happens? Dropdown? Text input?
   - How do you switch which two fields are displayed?

## FLOW 3: Session Status & Inform Flow

1. Go to the Sessions page. Change a session's status from Nominated to Accepted. How? Dropdown? Button?
2. Now go to the Inform page. Document the FULL inform interface:
   - How do you select which speakers to inform?
   - Where are the three email template editors (Accept/Decline/Waitlist)?
   - What variables can you insert? Where is the variable picker?
   - Where is "Save & Test" to preview?
3. Click Inform. What confirmation appears? What does the speaker see on their end?

## FLOW 4: Speaker Confirmation Pipeline

1. After informing, go to the "Informed & Confirmed" tracking view. Document:
   - What columns? (Speaker, Status, Date Informed, Date Confirmed?)
   - What does "unconfirmed" look like vs "confirmed"?
   - Where is the "Resend" button?
2. Calendar appointments: Where is the toggle? What does "Send test to me" show?

## FLOW 5: Public Schedule View

1. Go to the Announce Schedule page. Toggle it ON.
2. Open the public schedule embed. Document:
   - Schedule grid layout (attendee-facing, not organizer)
   - How does day switching work?
   - What does clicking a session show? (popup? new page?)
   - Where are filters? (track, speaker, topic)
3. Open the Speaker Wall embed. Document the layout.

## FLOW 6: CFP (Call for Papers) Page

1. Open the public CFP page for your test event. Document:
   - What does a speaker see?
   - What fields are in the submission form?
   - How does file upload work?
   - What confirmation does the speaker get after submitting?

## Output Format

Write ALL findings to: `/research-hub/ux-teardowns/session-02-sessionize/chrome-teardown.md`

For each flow, document:
- **Screen name** and URL pattern
- **Layout** (what's where)
- **Every clickable element** with its exact label text
- **Drag-and-drop interactions** (cursor changes, ghost elements, snap points, visual feedback)
- **Form fields** (name, type, required/optional)
- **Transitions** (modal? page? slide-over? toast?)
- **Empty states** and **error states**

After completing all flows, update `/research-hub/_MASTER_STATUS.md` with your progress.
