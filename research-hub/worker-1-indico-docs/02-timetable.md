# Indico — Making a Timetable

**Source:** https://indico.docs.cern.ch/conferences/timetable/  
**Screenshots:** 40 production screenshots  
**Image base URL:** https://indico.docs.cern.ch/assets/

---

## Page Structure (Table of Contents)

1. Anatomy of a timetable
2. Creating a timetable
   - Contributions
   - Session blocks
   - Poster sessions
   - Breaks
   - Reschedule
   - Fit to content
3. Making the timetable public (conferences only)

---

## 1. Anatomy of a Timetable

### Four Basic Elements

| Element | Description |
|---------|-------------|
| **Sessions** | Group together related contributions (talks/presentations). Cannot be directly scheduled — only session blocks can. |
| **Session blocks** | An "instance" of a session with defined start and end. E.g., morning block and afternoon block of the same session. |
| **Contributions** | Individual talks/presentations. In conferences, also used for Call for Abstracts and Peer Reviewing modules. |
| **Breaks** | Pauses in the programme (lunch, coffee break). Can be scheduled at top level or inside session blocks. |

Additionally: **Subcontributions** exist inside contributions but cannot be individually scheduled.

### Meeting vs Conference Timetable Differences

| Aspect | Meeting | Conference |
|--------|---------|------------|
| Contributions | Entry in timetable only, no purpose outside it | Versatile — used in Call for Abstracts, Peer Reviewing, Editing |
| Removing from timetable | **Deletes** the contribution | **Unschedules** only (data preserved) |
| People field | Speakers only | Speakers, Authors, Co-authors |
| Draft mode | N/A | Contributions start in "Draft mode" — must be published |

### Visual Layout

**Meeting timetable** — Simple vertical list of contributions with time slots:
- Shows time range (e.g., 15:00 → 15:20), title, speaker, duration
- Registration banner with participant list at top
- Edit/settings icons on each contribution row

**Conference timetable** — Grid-based with time axis:
- **Day tabs** at top: Mon 19/09 | Tue 20/09 | Wed 21/09 | All days (with arrow navigation)
- **Toolbar**: Print | PDF | Full screen | Detailed view | Filter
- **Time grid**: Vertical time axis on left (09:00, 10:00, etc.)
- **Color-coded sessions**: Each session gets a distinct color (e.g., pink for Talks, green for Workshops)
- **Parallel sessions**: Side-by-side columns when sessions overlap
- **Breaks**: Yellow background (e.g., "Lunch break")
- **Session legend**: Toggled via "Detailed view" — shows color key for each session

### Detailed View Features
- Shows individual contributions INSIDE session blocks
- Each contribution shows: title, speaker(s), room, time range
- Session conveners displayed in top right corner of session blocks

---

## 2. Creating a Timetable

### Management Interface

Navigate to **Timetable** in event management area. For multi-day events, day tabs shown at top.

**Key controls:**
- **Add new** dropdown (top right) — 3 options:
  - Session block
  - Contribution
  - Break
- **Reschedule** button (top right)

### Contributions

#### Adding Existing Contributions
1. Click **Add new** → **Contribution**
2. Shows "Add Contribution" dialog with scrollable list of available contributions
3. Contributions highlighted in green when selected
4. Select multiple contributions (scheduled one after another)
5. Click **Add selected** / **Close**

**Important:** Only contributions with NO session assignment can be scheduled at top level. Check the Contributions page → Session column should say "No session."

#### Creating New Contributions Inline
1. Click **Add new** → **Contribution** → **Create a new one**
2. Dialog fields:
   - **Title** (required, marked with *)
   - **Description** (text area)
   - **Start time** (required, e.g., "15:20")
   - **Duration**
   - **People** — tabs: Add myself | Search | Enter manually
     - Add speakers, authors, co-authors (meetings: speakers only)
   - **Location** — Venue dropdown + Room dropdown + Address
   - **Use default** checkbox (for location)
   - **Keywords** — tag input
   - **Advanced** — expandable section
3. Click **Save** — auto-scheduled at selected time

#### Drag-and-Drop Scheduling
- **Change start time**: Drag contribution up or down in timetable
- **Change duration**: Click and drag bottom edge of contribution
- **Move to different day**: Click two-arrow "Move contribution" icon → select target day or session block
- **Move into session block**: Drag contribution over session block (auto-assigns to session)
- **Up/down buttons**: Visible on hover — small arrows at top-right of each timetable item

#### Contribution Popup (Click on contribution)
Shows:
- Basic info
- Time display (clickable to edit start time and duration)
- Quick edit button (pencil icon)
- Protection settings
- Move icon (two arrows)
- Unschedule/Delete icon (bin)

### Session Blocks

#### Creating a Session Block
1. Click **Add new** → **Session block**
2. Under "Add another block to" — select parent session OR click **Create new session**
3. Session block dialog fields:
   - **Title** (optional — defaults to session title if empty)
   - **Start time**
   - **Duration**
   - **Location** — links to Room booking module
   - **Conveners** — distinct from session coordinators (display-only, no extra rights)
4. Click **Save**

#### Session Block Management
- Conveners shown in top-right corner of session block
- Click to edit (pencil icon in session block section)
- Drag up/down to change start time
- Drag bottom edge to adjust duration
- Click for session settings and protection

**Key constraint:** A session block **cannot span multiple days**. Create one block per day.

#### Session Block Timetable
- Click session block → **Go to session block timetable**
- Opens dedicated sub-timetable for that block
- "Up to timetable" link to return to main timetable
- Block name shown in top right
- Can add contributions and breaks WITHIN the block
- Only contributions assigned to the SAME session can be scheduled in the block

#### Deleting Session Blocks
- Click bin icon on session block
- **Warning**: Deleting a session block will:
  - **Conferences**: Unschedule all contributions inside (data preserved)
  - **Meetings**: DELETE all contributions inside
  - DELETE all breaks inside

### Poster Sessions
- Session blocks belonging to poster sessions work differently
- Contributions treated as posters — **automatically scheduled in parallel**
- Start/end time = parent session block's times
- No breaks allowed inside poster sessions
- Click **Add poster** instead of Add new
- Timetable shows simple list (no individual time ranges)

### Breaks

#### Adding Breaks
1. Click **Add new** → **Break**
2. Fields: Title, Start time, End time, Description, Location, **Colour**
3. Click **Save**

- Can be at top level or inside session blocks
- Drag up/down to change time
- Drag bottom edge for duration
- Can be moved to different days or into session blocks

### Reschedule (Batch Operations)

Click **Reschedule** in top right. Two modes:

#### Mode 1: Adjust Starting Time
- Moves first entry to event/block start time
- Stacks all entries sequentially, removing gaps
- Duration unchanged

#### Mode 2: Adjust Duration
- Keeps start times unchanged
- Extends each entry's duration to fill gap before next entry
- Last entry unchanged (no gap to fill)

#### Time Gap Option
- Optional gap (e.g., 10 minutes) between entries
- Applied with either mode

### Fit to Content
- Shrinks session block to exactly cover its entries
- Sets block start = first entry start, block end = last entry end
- Click **Fit to content** in session block timetable
- Can also fit ALL blocks in a day: Reschedule → tick "Fit all the sessions to their content"

**Note:** Session blocks always **grow automatically** to accommodate contents. Fit to content only needed to **shrink**.

---

## 3. Making the Timetable Public (Conferences Only)

- Contributions start in **Draft mode** — participants cannot see:
  - List of contributions
  - Timetable
  - Book of abstracts
  - Author and speaker list
- To publish: Navigate to **Contributions** page → toggle **Draft** in top right
- Can also toggle from **Settings** or **Timetable** page via "Publish contributions" warning link

---

## Key UI Patterns for G.I.C.A. Reference

### Timetable Visual Design
- **Color-coded sessions** with distinct colors per session
- **Grid layout** with vertical time axis
- **Day tabs** for multi-day events with "All days" option
- **Parallel columns** for concurrent sessions
- **Toolbar** with Print, PDF, Full screen, Detailed view, Filter

### Interaction Patterns
- **Drag-and-drop** for repositioning (vertical only, within day)
- **Edge-drag** for duration adjustment
- **Click-to-edit** popups with quick actions
- **Hover reveals** up/down arrows
- **Nested timetables** — session block has its own sub-timetable

### Key Image Files (40 total)
| Image | Description |
|-------|-------------|
| finished_timetable.png | Meeting timetable example |
| finished_timetable_detailed.png | Conference timetable detailed view |
| timetable_days.png | Management view with day tabs |
| add_contrib.png | "Add new" dropdown menu |
| add_contrib_select.png | Contribution selection dialog |
| create_contrib_dialog.png | New contribution form |
| move_up_down.png | Drag/reorder controls |
| block_dialog.png | Session block creation dialog |
| session_block.png | "Add new → Session block" dropdown |
| reschedule_*.png | Reschedule before/after examples |
| poster_*.png | Poster session views |
| draft_mode.png | Draft mode toggle |
