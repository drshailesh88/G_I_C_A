# Sessionize Chrome UX Teardown
**Date:** 2026-04-06
**Researcher:** Claude Code (Chrome Automation)
**Account:** Free organizer (test mode), shailesh.greatest@gmail.com
**Test Event:** GEM India Test Conference 2026 (Demo event with 10 auto-generated sessions/speakers)
**Event URL:** https://sessionize.com/app/organizer/event/23805

---

## Table of Contents
1. [Event Dashboard](#1-event-dashboard)
2. [FLOW 1: Schedule Grid Builder](#2-flow-1-schedule-grid-builder)
3. [FLOW 2: Speaker/Faculty Management](#3-flow-2-speakerfaculty-management)
4. [FLOW 3: Session Status & Inform Flow](#4-flow-3-session-status--inform-flow)
5. [FLOW 4: Call for Speakers (Organizer View)](#5-flow-4-call-for-speakers-organizer-view)
6. [FLOW 5: Announce Schedule & Calendar](#6-flow-5-announce-schedule--calendar)
7. [Sidebar Navigation Map](#7-sidebar-navigation-map)
8. [Key UX Patterns for GEM](#8-key-ux-patterns-for-gem)

---

## 1. Event Dashboard

**URL:** `/app/organizer/event/{eventId}`

### Layout
- **Header:** Event name + badges ("in 6 months", "test")
- **Top-right:** "CfS page" button, "Duplicate event", "All events"
- **Left sidebar:** Full navigation (see Section 7)
- **Main content:** Two-column layout

### Left Column — Smart Task List
- Guided checklist that walks organizers through setup
- Each task shows: green checkmark (done) or grey circle (pending)
- Example tasks:
  - "Create an event" (auto-checked)
  - "Set additional event properties" (with "recommended" badge)
  - "Edit event" link inline
- This is an **onboarding wizard pattern** — progressive disclosure of next steps

### Right Column — Call for Speakers Stats
- **Badge:** "open, 30 days left" (green)
- **Stats grid:**
  - Sessions: 10 | Unique Speakers: 10 | Sessions per Speaker: 1.00
  - Accepted Sessions: 0 | Waitlist: 0 | In Process: 10 | Declined Sessions: 0
- **CfS Links:**
  - CfS Page: `/gem-india-test-conference-2026` (badge: "open, 30 days left")
  - CfS Secret Page: `/gem-india-test-conference-2026/?e=e078ee` (badge: "always open")
- **Speaker Support Email:** displayed
- **"Browse Speakers Directory"** button (links to Sessionize's global speaker directory)

### Event Status Banner
- Large red/coral banner when in TEST mode
- Shows flag icon + "event status: TEST"
- Warning text: "This event is in test mode and can be used just for testing. Number of submissions is limited."
- CTA: "Activate / Buy Now" button

---

## 2. FLOW 1: Schedule Grid Builder

**URL:** `/app/organizer/scheduleBuilder/{eventId}`
**This is the MOST CRITICAL flow — maps to our Module 5 (Scientific Program Schedule)**

### Prerequisite: Rooms Setup

**URL:** `/app/organizer/rooms/{eventId}`

**Rooms Page Layout:**
- Simple table with columns: **Room name** (text input), **Live stream link** (text input, placeholder "https://"), **Delete** (red trash button)
- **Drag handles:** Up/down arrow icon on left side of each room row for reordering
- **Auto-grow:** After saving, 3 new empty "(new room)" rows automatically appear
- **"Save changes"** button (green, top-right)
- **Important note at bottom:** "There is only one set of rooms, and they are available for all days. You cannot have different sets of rooms for different days. But, when building a schedule - if you don't use certain room during one day, that room will not be shown in the schedule for that day."
- **Toast notification:** "Changes successfully saved!" (green, top-right corner, auto-dismisses)

**Key UX Insight:** Rooms are global across all days. Column visibility is automatic based on usage.

### Schedule Builder — Full Layout

The Schedule Builder is a **dedicated full-screen-capable view** separate from the main nav.

**Top Bar:**
- Event name + timezone ("India Standard Time (UTC+05:30)")
- **Toolbar buttons:**
  - "(session coloring)" dropdown — color sessions by category
  - "Zoom in" / "Zoom out" — adjust time grid granularity
  - "Toggle list" — show/hide the left session panel
  - "Full screen" — expand to fill browser
- **"Schedule builder tips & tricks"** link (top-right, with video icon)
- **Action buttons:** "Save changes" (green), "Close" (dark grey) — changes to "Cancel" (red) when unsaved changes exist

**Left Panel (Session List Sidebar):**
- **Background:** Solid green/teal color
- **Filter field:** "filter by anything visible" with X clear button
- **"+ Add Service Session"** button (for breaks, lunch, etc.)
- **Session cards** for each ACCEPTED session (unscheduled only):
  - Title (bold)
  - Speaker name
  - Category tags as colored badge pills (e.g., "Lightning talk", "Technical", "Expert", "Portuguese")
- **CRITICAL:** Only sessions with **"Accepted" status** appear in the left panel. Nominated/other statuses are NOT shown.
- Panel can be hidden via "Toggle list" button

**Right Panel (Time Grid):**
- **Day tabs** at top: "Mon, 05 Oct" — one tab per event day
- **Column headers:** Room names (Hall A, Hall B, Hall C)
- **Time axis:** Vertical, left side, showing hours (8 am, 9 am, 10 am... etc.)
- **Grid lines:** Dashed horizontal lines at each hour mark
- **Column backgrounds:** Alternating white/light-grey for visual separation between rooms
- **Room header toolbar** (appears on hover/focus): 6 icons from left to right:
  1. Resize/collapse (diagonal arrows)
  2. **+** Add session directly to room
  3. **Pencil** Edit room name
  4. **Left arrow** Move room column left
  5. **Right arrow** Move room column right
  6. **Trash** Delete room (red)

### Drag-and-Drop Interactions

**Dragging a session from left panel to grid:**
- Grab a session card from the green left panel
- Drag onto the grid — session snaps to the nearest time position in the target room column
- Session renders as a **block/card on the grid** showing:
  - **Title** (bold, top-left)
  - **Time badge** (top-right): Clock icon + "8:35am | 60min" format
  - **Speaker name** (below title, dashed underline)
  - **Category tags** (bottom, colored badge pills)
  - **Two icons** (bottom-right of card):
    - External link / edit icon — opens session edit page
    - Horizontal double-arrow icon — for moving/resizing
- **Default duration:** 60 minutes (1 hour block height)
- **Left panel empties** as sessions are placed — only unscheduled sessions remain

**State change when unsaved:**
- "Close" button changes to red "Cancel" button
- Must click "Save changes" to persist

### Service Sessions (Breaks, Lunch, Keynotes)
- **"+ Add Service Session"** button in left panel
- Creates special sessions that span rooms or represent non-content blocks
- (Not fully explored in this teardown due to needing more accepted sessions)

### Color Coding
- "(session coloring)" dropdown in toolbar controls how sessions are colored on the grid
- Colors come from category/track assignments
- Tooltip on load: "Session coloring by category can help you build your schedule"

---

## 3. FLOW 2: Speaker/Faculty Management

**URL:** `/app/organizer/speakers/{eventId}`

### Speakers List Page Layout

**Top buttons:** Pending invites, Export, Speakers Directory

**Filters:**
- Search speakers... (text input)
- "All speakers that have submitted" (dropdown filter)
- "Missing data" (dropdown)
- Sort: "Name (A>Z)" (dropdown)
- Expandable: "Filter by Speaker Fields", "Filter by Session Fields (at least one session matches)"

**Table Layout:**
- **Columns:** Checkbox, Speaker, Sessions, [Configurable Column 1], [Configurable Column 2]
- **Speaker column:** Avatar (circular photo), Name (link), Tagline (grey subtitle text)
- **Sessions column:** Count badge (blue circle with number), Session name (link), Status badge ("Nominated", "Accepted", etc.)
- **Configurable columns:** Two dropdown-selectable columns. Defaults appear to be "Shirt size" and "Flight number". The dropdowns likely allow selecting from all custom speaker fields.
- **Row data example:**
  - Aiden Test | Professional public speaker | 1 | Aiden's Session Nominated | M
  - Ava Test | PR specialist | 1 | Ava's Session Nominated | XL

**Key UX Pattern:** The configurable table columns are a grid-editing pattern — organizers choose which two additional fields to display inline without opening each speaker profile. This is the "Grid View" referenced in Sessionize docs.

### Demo Speaker Data (10 speakers, auto-generated)
Each has: avatar photo, name ("X Test" format), tagline/title, 1 session each, shirt size

---

## 4. FLOW 3: Session Status & Inform Flow

### Sessions Page

**URL:** `/app/organizer/sessions/{eventId}`

**Top buttons:** + Add session, Delete demo sessions, Pending invites, All comments, Export, Speakers Directory

**Quick Stats Bar:**
Six status buckets with counts, color-coded:
| Status | Color | Count |
|--------|-------|-------|
| Accepted | Green | 0→1 |
| Waitlisted | Grey | 0 |
| Accept Queue | Teal | 0 |
| Nominated | White/neutral | 10→9 |
| Decline Queue | Salmon | 0 |
| Declined | Red | 0 |

**Tabs:**
1. **All sessions** (10) — default view
2. **Pending decision** (10) — sessions needing status decision
3. **Informed / Confirmed** (0/0) — format: informed count / confirmed count
4. **Scheduled** (0/0) — sessions placed on the grid

**Session List Table:**
- **Columns:** Checkbox, Title (link), Speaker(s) (avatar + name + tagline link), Session format (configurable dropdown column), Track (configurable dropdown column), Status (dropdown)
- **Configurable column headers:** The "Session format" and "Track" column headers are dropdowns that can be changed to: Session format, Track, Level, Language, Technical requirements, Date submitted, Live link, Recording link, Assigned evaluators, Team comments
- **Status dropdown** per row: Inline dropdown showing current status ("Nominated") with down arrow
- **Inline edit:** Clicking a session title reveals a small green "Edit" button; pencil icons appear on Session format and Track fields on hover

### Session Edit Page

**URL:** `/app/organizer/session/edit/{eventId}/{sessionId}`

**Breadcrumb:** Sessions / {Session Name} / Edit session

**Two-column layout:**

**Left Column — Session Details:**
- Session Title* (text input, required)
- Description (textarea)
- **Submission fields** (visible on CfS form):
  - Session format (dropdown: Lightning talk, Session, Workshop)
  - Track (dropdown: Technical, Scientific, Business)
  - Level (dropdown: Expert, Advanced, Intermediate, Introductory and overview)
  - Language (dropdown)
  - Technical requirements (likely below fold)

**Right Column — Metadata:**

**Session Status panel:**
- **Session status** (dropdown, color-coded): Nominated → click to change
- **Speaker sees status** (read-only, grey): Shows what the SPEAKER sees
- **Status mapping (CRITICAL UX INSIGHT):**
  | Organizer Status | Speaker Sees |
  |-----------------|-------------|
  | Nominated | In Evaluation |
  | Accepted | In Evaluation (until Informed) |
  | Waitlisted | (not confirmed) |
  | Declined | (not confirmed) |

**Full status dropdown options (6 values, color-coded):**
1. **Accepted** — green background
2. **Waitlisted** — white/grey background
3. **Accept Queue** — teal/blue-green background
4. **Nominated** — white background (default for new submissions)
5. **Decline Queue** — salmon/light-red background
6. **Declined** — dark red/salmon background

**Session Owner panel:**
- Session Owner* (dropdown): Select from speakers
- Note: "Session owner is responsible for all session-related communication. If owner is not on the list, you can send an invite."

**Session Speakers panel:**
- Speaker avatar + name
- "Remove from session" button (red) per speaker
- Drag handle (up/down arrows) for reordering speakers

**Action buttons (top-right):**
- "Save changes" (green)
- "Back" (grey outline)
- "Delete" (red)

**Unsaved changes protection:** Browser "Leave site?" dialog when navigating away with unsaved changes.

### Inform Speakers Page

**URL:** `/app/organizer/sessions/inform/{eventId}`

**Warning banner (yellow):** "Speakers cannot see the status of their sessions until you inform them!"

**Three tabs (one per decision type):**
1. **Accepted sessions** (count badge) — green
2. **Waitlist** (count badge)
3. **Declined sessions** (count badge)

**Left Column — Session Selection:**
- "Only sessions in" filter dropdown: "(all accepted sessions)" — allows filtering by specific category
- **select all / deselect all** checkboxes
- **Badge:** "1 session found" (count of matching sessions)
- **Table:** Send to (checkbox) | Title (link) | Speaker(s)
- Each row shows: Speaker name, email (e.g., test0@sessionize.com), session title, speaker name

**Right Column — Email Message Template:**
- **"Reset to default"** button + **"Edit message"** button
- **Template with merge variables:**
  ```
  Well done, {SPEAKER_FIRSTNAME}!

  Your session {SESSION_NAME} has been accepted for GEM India Test Conference 2026!

  Please click on the link below to acknowledge that you have received this message and you'll be joining us!

  {CONFIRM_BUTTON}

  If you cannot attend, or have any questions, please reply to this message.

  Thanks,
  GEM India Test Conference 2026
  ```
- **Available merge variables:** {SPEAKER_FIRSTNAME}, {SESSION_NAME}, {CONFIRM_BUTTON}
- Note: "Messages will be sent individually for every session."

**Bottom Action Buttons:**
- **"Send X email"** (large teal/green button) — X = count of selected sessions
- **"Save & Test"** (grey button) — preview email to yourself

**Key Workflow Insight:**
1. Accept sessions (change status on Sessions page)
2. Go to Inform Speakers
3. Select which accepted speakers to inform
4. Customize email template (or use default)
5. Click "Send X email" — speakers get acceptance email with confirmation button
6. Track confirmations on Sessions > Informed/Confirmed tab

**Link at bottom:** "The list of unconfirmed and confirmed sessions is located under the Informed & Confirmed tab on the Sessions page."

---

## 5. FLOW 4: Call for Speakers (Organizer View)

**URL:** `/app/organizer/event/cfs/{eventId}`

### Layout

**Left Column — Statistics:**
- **Submissions over time** line chart (X: Days, Y: Sessions count)
- Badge: "open, 30 days left"
- **Summary cards** at bottom (colored blocks):
  - 10 session submissions (icon: folder)
  - 10 speakers (icon: person)
  - 1.00 sessions / speaker (icon: network)

**Right Column — CfS Links:**

**Standard link:**
- Full URL with "Copy" button + "open" link (green badge)
- `https://sessionize.com/gem-india-test-conference-2026`
- Note: "Can be used during defined CfS period."

**Celebrity link (Secret link):**
- Full URL with secret token + "Copy" button + "open" link
- `https://sessionize.com/gem-india-test-conference-2026/?e=e078ee`
- Note: "For celebrity and last minute speakers. This submission link works all the time, regardless of official Call for Speakers period."
- **"Reset celebrity link"** action to regenerate the secret token

---

## 6. FLOW 5: Announce Schedule & Calendar

**URL:** `/app/organizer/schedule/{eventId}`
**Breadcrumb:** Schedule / Announce

### Announce Schedule Section
- **Toggle switch:** OFF/ON — "Schedule announced"
- When OFF: "Event schedule (rooms, dates and times of sessions) **is not visible** to speakers, on web pages with embedded code and via API."
- Quick links: "Schedule builder" and "Schedule individual sessions" buttons

### Calendar Appointments for Speakers
- **Toggle switch:** OFF/ON — "Send calendar appointments to accepted speakers"
- When OFF: "Calendar appointments **will not be automatically sent** to speakers of accepted, informed and scheduled sessions."
- Key behavior: "If something changes with a session (date, time, room...) an updated appointment will be sent."
- Timing: "Appointments and changes are not sent immediately, but during the following night (observing event's timezone)."
- **Buttons (greyed out when toggle OFF):**
  - "Send test to me" — preview calendar invite
  - "Send all appointments immediately" — override nightly batch

### Accepted Sessions Statistics (Right Panel)
Donut/pie charts for each category dimension:
- **Session format:** Lightning talk (red), Session (blue), Workshop (yellow)
- **Track:** Business (red), Technical (blue), Scientific (yellow)
- **Level:** Introductory and overview (red), Intermediate (blue), Advanced (yellow), Expert (green)
- **Language:** (partially visible, below fold)

---

## 7. Sidebar Navigation Map

Full left sidebar navigation for an event:

```
[Event Name]
  change event (dropdown)

Dashboard
Edit Event
Call for Speakers
Sessions
Speakers
Evaluation
Inform Speakers
Speaker Dashboard
Schedule (expandable)
  ├── Schedule Builder
  ├── Rooms
  └── Announce Schedule
Social Banners
Group Mailing
App
API / Embed
Feedback
```

**Top navigation bar:**
- Sessionize logo (home)
- Hamburger menu
- "Jump to..." search (combobox)
- Help & Support (dropdown)
- User name + email (dropdown)

**Role toggle:** "Organizer" / "Speaker" tabs (top-left, below logo)

---

## 8. Key UX Patterns for GEM

### Patterns to Adopt

1. **Status Pipeline with Speaker/Organizer Views:**
   - Organizer sees: Nominated → Accept Queue → Accepted → Waitlisted → Decline Queue → Declined
   - Speaker sees: "In Evaluation" until explicitly informed
   - The dual-view status system prevents premature disclosure

2. **Schedule Builder as Dedicated View:**
   - Full-screen capable, separate from regular navigation
   - Left panel = unscheduled sessions, Right panel = time grid
   - Save/Cancel paradigm (not auto-save)
   - Zoom controls for time granularity

3. **Drag-and-Drop with Rich Feedback:**
   - Session cards show title + speaker + tags in both list and grid views
   - Time badge appears on placed sessions (start time + duration)
   - Unsaved state clearly indicated by button color change

4. **Inform Flow Separation:**
   - Status change and notification are DECOUPLED — changing to "Accepted" does NOT notify the speaker
   - Explicit "Inform Speakers" step with email template customization
   - Merge variables for personalization
   - "Save & Test" for preview before sending

5. **Configurable Table Columns:**
   - Both Sessions and Speakers pages allow changing which fields display as columns
   - Avoids information overload while keeping data accessible

6. **Rooms as Global Resource:**
   - One set of rooms for all days
   - Unused rooms auto-hidden per day
   - Drag-handle reordering

7. **Smart Task List (Onboarding):**
   - Dashboard shows progressive checklist of setup tasks
   - Each task has contextual help and "recommended" badges

### Gaps / Limitations Observed

1. **No bulk status change from list view:** Must change session status one-by-one through edit page or individual dropdown (the list dropdown was difficult to interact with)
2. **Test mode limitations:** Demo/test events have limited submissions and some features may be restricted
3. **Single-day event in demo:** Could not test multi-day tab switching (event was set to one day)
4. **No inline session creation in schedule builder:** Must create sessions elsewhere, accept them, then drag onto grid
5. **Session coloring limited to categories:** No arbitrary color assignment; colors derive from track/category fields

### Status-to-Speaker-Label Mapping (Critical for GEM)

| Organizer Action | Internal Status | Speaker Sees | Speaker Notified? |
|-----------------|----------------|-------------|-------------------|
| New submission | Nominated | In Evaluation | No (auto) |
| Move to queue | Accept Queue | In Evaluation | No |
| Accept | Accepted | In Evaluation | No (until Inform) |
| Inform (Accept) | Accepted + Informed | Accepted | YES (email sent) |
| Speaker confirms | Accepted + Confirmed | Accepted | N/A (speaker action) |
| Decline | Declined | In Evaluation | No (until Inform) |
| Inform (Decline) | Declined + Informed | Declined | YES (email sent) |

---

## Event Creation Form Fields

**URL:** `/app/organizer/event/create`

**Fields (all required*):**
- Event Name* (text input, auto-suggested: "[name]'s Conference [year+1]")
- Event Dates* (date range picker)
- Event Time Zone* (dropdown, auto-detected: "Chennai, Kolkata, Mumbai, New Delhi")
- Call for Speakers Open* (datetime range)
- CfS Address* (text input, auto-slug from event name: "sessionize.com/" + slug)
  - Green checkmark when slug is available
- Speaker support email* (auto-filled from account email)

**Two submit options:**
1. **"Create Event"** (blue button) — creates empty event
2. **"Create Demo Event"** (teal button) — creates event with 10 randomly generated sessions, speakers, categories, etc.

**Right sidebar cards:**
- "Duplicate existing event" — clone from existing
- "Running user group / meetup?" — alternative event type
- "Quick Start with Demo Event" — instructions for demo creation

---

*End of Sessionize Chrome UX Teardown*
