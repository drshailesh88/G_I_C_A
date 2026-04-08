# pretalx User Guide -- Comprehensive Research Notes

Source: https://docs.pretalx.org/user/ (pretalx v2026.1.0.dev0 documentation)
Researched: 2026-04-05

---

## 1. Organisers, Teams, and Event Setup

### Organiser Hierarchy

pretalx uses a three-level hierarchy: **Organisers > Teams > Events**.

- An **Organiser** represents the entity running events (company, community, institution).
- Every event belongs to exactly one organiser.
- Grouping events under an organiser allows managing team access across multiple events and copying settings from prior events (tracks, review settings, email templates, venue setup) when creating new ones.
- On pretalx.com, an organiser account is auto-created on sign-up. On self-hosted instances, an admin must create it.

### Teams

Teams grant access to events and define what members can do. Key characteristics:

- Each team belongs to one organiser and provides access to some or all of that organiser's events.
- A user can be in multiple teams; effective permissions are the **union** of all team permissions.
- Review restrictions (track limits, hidden speaker names) only apply if no other team grants broader access.

**Event Scope Options:**
- **All events** -- includes future events automatically
- **Specific events** -- must be explicitly added

**Permission Flags:**
| Permission | Description |
|---|---|
| Can create events | Create new events under the organiser |
| Can change teams and permissions | Manage teams, invite members, modify permissions |
| Can change organiser settings | Modify organiser-level settings (e.g., name) |
| Can change event settings | Modify event config (dates, CfP settings, etc.) |
| Can work with and change proposals | View/edit/manage proposals, handle scheduling, modify email templates, send emails |
| Is a reviewer | Participate in review process (scoring, commenting) |
| Always hide speaker names | Override event anonymisation settings for this team |
| Track restrictions | Limit review access to specific tracks (review-only, does not limit other permissions) |

**Recommended Team Structures:**
1. **Administrator team** -- small, full permissions, all events
2. **Organiser team** -- day-to-day event management (change event settings + work with proposals)
3. **Reviewer team** -- per-event, reviewer-only permission
4. **Track-specific reviewer teams** -- one per track for domain experts

### Adding/Removing Members

- Invite by email address (single or bulk, one per line)
- Always sends invitation email; recipient must click link to join
- Pending invitations can be resent or retracted
- Removing a member is non-destructive: reviews, comments, log entries remain intact

---

## 2. Sessions and Proposals

### Session Lifecycle States

```
Submitted --> Accepted --> Confirmed --> (on public schedule)
    |              |
    v              v
 Withdrawn      Rejected
```

| State | Description |
|---|---|
| **Submitted** | Initial state. Speaker may edit while CfP is open (or per review phase settings). Organisers can globally disable speaker editing. |
| **Accepted** | Selected for schedule. Triggers notification email (placed in outbox for review). Session can be scheduled. Not publicly visible until confirmed. |
| **Confirmed** | Speaker confirmed attendance (via link in acceptance email). Visible on public schedule after next release. Organisers can skip accepted and go straight to confirmed. |
| **Rejected** | Not selected. Email generated from rejection template. Kept for records; no longer editable by speaker. |
| **Withdrawn** | Speaker withdrew. Only possible while in "submitted" state and still editable. |

**Pending States:** A proposal can have a pending state overlay (e.g., "pending accepted") that is invisible to speakers. Useful for making decisions incrementally, then applying all pending states in bulk. Dashboard shows notification when pending states exist.

### Organisation Features

**Tracks:**
- Thematic groupings (e.g., "Security", "Web Development")
- Colour-coded on public schedule
- Used for reviewer permission assignment
- Can require access codes for submission
- Optional -- can be turned off entirely

**Session Types:**
- Define format and default duration (e.g., Long talk 45min, Workshop 2hr, Lightning talk 5min)
- Make scheduling easier (drag blocks of correct duration)
- Can have their own deadlines (overriding global CfP deadline)
- Can require access codes
- If only one session type exists, the field is hidden from speakers

**Tags:**
- Internal labels visible only to organisers/reviewers (never public)
- Flexible use: "needs work", "requires mentor", "beginner-friendly"

**Featured Sessions:**
- Highlighted on a dedicated page at `/{event}/featured/`
- Can be made public before full schedule release
- Visibility options: Never / Before schedule release / Always
- Useful for promoting keynotes early

### Speakers

- Sessions can have any number of speakers (including zero)
- Organisers can add/remove speakers at any time from the "Speakers" tab
- Adding a speaker triggers notification email (different templates for new vs. existing accounts)
- New speakers get a link to set their account password

### Comments vs. Reviews

| Feature | Comments | Reviews |
|---|---|---|
| Who can post | Anyone with session access | Users with review permission only |
| Visibility | Anyone with session access | **Never visible to speakers** |
| Format | Free-form, timestamped, multiple per person | Structured (scores + feedback), one per reviewer |
| Purpose | Discussion, clarification | Formal evaluation for acceptance decisions |

---

## 3. Call for Proposals (CfP) Configuration

### Deadlines

- **Opening date** -- when proposals start being accepted (leave empty for immediate)
- **Deadline** -- last date for new submissions. Existing drafts become read-only after close.
- Session types can override the global deadline with their own deadlines (e.g., keep lightning talks open longer)
- Access codes can extend deadlines for specific speakers

### The CfP Editor

Interactive editor under **Event > CfP** with live preview. Capabilities:
- Set headline and text for each CfP page
- Add/remove fields from submission form
- Reorder fields via drag-and-drop
- Configure each field: label, help text, required/optional, min/max length
- Length counted in characters or words (configurable in CfP Settings)

Auto-managed fields: session type hidden when only one exists, track hidden when disabled, content locale hidden when only one language.

### Built-in Fields

**Submission fields:**

| Field | Notes |
|---|---|
| **Title** | Only truly mandatory field; cannot be removed |
| **Session type** | Format + default duration. Auto-hidden when only one type. |
| **Abstract** | Short summary, shown in bold on public pages |
| **Description** | Longer text, shown below abstract |
| **Track** | Only when tracks are enabled |
| **Duration** | Override default session type duration. If required, hides default duration in dropdown. |
| **Content locale** | Session language. Hidden when event has only one language. |
| **Additional speakers** | Invite co-speakers by email. Can limit max number of co-speakers. |

**Speaker profile fields:**

| Field | Notes |
|---|---|
| **Name** | Only truly mandatory speaker field |
| **Biography** | Shown on public profile |
| **Profile picture** | Upload + crop to square (circle highlight for guidance) |
| **Availability** | Visual calendar widget. Used for scheduling conflict warnings. |

### Custom Fields

Created under **CfP > Localisation**. Three targets:

1. **Per-session** -- asked once per submission (e.g., "experience level", "special equipment needed")
2. **Per-speaker** -- asked once per speaker at event (e.g., "dietary requirements", "T-shirt size")
3. **Reviewer** -- answered by reviewers as part of review process

**Field Types:**

| Type | Notes |
|---|---|
| Text (one-line) | Min/max length |
| Multi-line text | Min/max length |
| Number | Min/max value |
| URL | Special icon support for social media |
| Date | Min/max date |
| Date and time | Min/max date+time |
| Yes/No | Shows as mandatory checkbox when required (e.g., CoC agreement) |
| File upload | For slide decks, signed agreements, etc. |
| Choose one from a list | Radio selection |
| Choose multiple from a list | Multi-choice selection |

**Advanced field options:**
- **Scoping to tracks/session types** -- per-session fields can appear only for matching submissions (e.g., ask about prerequisites only for workshops). Per-speaker fields always apply.
- **Required modes:** Always optional / Always required / Required after a deadline (field starts optional, becomes required after specified date)
- **Freeze after** -- field becomes read-only after a given date
- **Visibility:**
  - "Publish answers" -- shown publicly on session/speaker pages
  - "Show answers to reviewers" -- enabled by default; disable to hide from reviewers (important for anonymous reviews)
- **Social media links** -- URL fields with icons (Bluesky, Discord, GitHub, Instagram, LinkedIn, Mastodon, Twitter, Website, YouTube). Displayed as icon links on public speaker profile.

### Access Codes

Two main scenarios:
1. **Opening CfP after deadline** -- speakers with code can still submit
2. **Granting access to restricted tracks/session types** -- only visible with matching code

**Access Code Settings:**
- Code (alphanumeric, auto-generated but customisable)
- Valid until (optional expiry date)
- Maximum uses (default 1; leave empty for unlimited)
- Track restrictions (optional)
- Session type restrictions (optional)
- Internal notes (organiser-only)

**Interaction with restricted tracks/types:**
- Code with specific tracks/types: speaker sees *only* those
- Code with no tracks/types: speaker sees non-restricted items only (code just extends deadline)
- No code: speaker sees non-restricted items only, subject to deadline

**Distribution:** Copy link or send email directly from pretalx.

---

## 4. Review Workflow

### Review Phases

Configured under **Settings > Review > Phases**. Exactly one phase is active at any time. Default two phases:
1. **Review phase** -- reviewers can submit reviews, cannot change proposal states
2. **Selection phase** -- reviewing closed, organisers (optionally reviewers) accept/reject

**Phase Settings:**

| Setting | Description |
|---|---|
| Start/end dates | Optional time boundaries. Auto-activation between phases. Manual activation possible. |
| Can review | Whether reviewers can write/edit reviews |
| Speakers can change submissions | Whether speakers can edit proposals (when CfP is closed) |
| Can change proposal state | Whether reviewers (not just organisers) can accept/reject |
| Can tag proposals | Never / Use existing tags / Create tags |

Each phase also carries visibility/anonymisation settings (see below).

### Score Categories

Configured under **Settings > Review > Scores**.

Each category has:
- **Name** (e.g., "Content quality", "Relevance")
- **Score values** with optional labels (e.g., 0="Poor", 1="Below average", 2="Average", 3="Good", 4="Excellent")
- Can be **required** or **optional**
- Can be **deactivated** (hidden without deleting existing scores)

**Weighting and Aggregation:**
- Each category has a **weight** (default 1) that acts as multiplier
- Total score per review = weighted sum of category scores
- Dashboard aggregates total scores across reviewers using **median** or **mean** (configurable)
- Median is less sensitive to outliers; mean gives more granular ranking

**Independent Categories:**
- Shown as separate columns on dashboard but excluded from total score (weight auto-set to 0)
- Useful for informational flags (e.g., "Speaker is a first-timer")
- Must always have at least one non-independent category

**Track-specific Categories:**
- Only appear in review form for proposals in specified tracks
- Recommended to mark as independent to avoid skewing cross-track comparisons

**Reviewer Custom Fields:**
- Custom fields with "Reviewer" target
- For structured data that doesn't fit scores (e.g., "Would you mentor this speaker?")

### Review Settings (General Tab)

- **Require a review score** and/or **Require a review text** -- when neither required, "Abstain" button appears
- **Score display** -- text labels with numbers, numbers with labels, or either alone
- **Help text for reviewers** -- displayed at top of every review form
- **Score aggregation** -- median vs. mean

### Reviewers, Teams, and Tracks

- Reviewer access managed through teams with "Is a reviewer" permission
- **Track-based assignment** -- restrict reviewer teams to specific tracks
- **Individual reviewer assignment** -- assign specific reviewers to proposals via **Review > Assign reviewers** (one-at-a-time or CSV import)
- When proposal visibility = "Assigned only", reviewers only see assigned proposals
- When = "All proposals", assigned proposals are highlighted/shown first
- Reviewers are NOT auto-notified of assignments; use email composer

### Visibility and Anonymisation

Per-phase settings:

**Speaker Anonymisation:**
- **Can see speaker names** -- when disabled, hides names, biographies, identifying info (blind review)
- Custom fields have separate "Show answers to reviewers" toggle
- Teams can have "Always hide speaker names" override

**Anonymising Proposal Content:**
- Speaker names hidden may not be enough (title/abstract may contain identifying info)
- Organisers can create **anonymised/redacted versions** of proposal text fields per proposal
- "Save and next" for efficient batch anonymisation
- Anonymised proposals marked with icon in session list

**Proposal Visibility:**
- **All proposals** -- reviewers see everything their permissions allow (assigned highlighted first)
- **Assigned only** -- strict control, reviewers see only assigned proposals

**Seeing Other Reviews:**
- **Always** / **After submitting own review** / **Never**
- Recommended: "After submitting own review" in first phase to avoid anchoring bias
- **Can see reviewer names** -- hides/shows reviewer identities from other reviewers (organisers always see)

### Review Dashboard

Located at **Review > Review**. Sortable, filterable table showing:
- Proposal title, track, state, own score
- Users with full review access see: total reviews, median/mean score, independent category columns
- Users who can change state see: accept/reject action buttons

Default sort: submitted first, then by aggregate score descending.

**Accepting/Rejecting:**
- Direct from dashboard via action buttons or bulk checkboxes
- Two modes: **Immediate** (state changes + email to outbox) or **Pending** (invisible to speakers, apply all at once later)
- Pending states recommended workflow
- `{all_reviews}` placeholder can include reviewer feedback in acceptance/rejection emails

### Writing Reviews

**Detail View:**
- Full proposal content (title, type, track, abstract, description, notes, custom fields)
- Speaker info visible if phase allows
- Review form: radio buttons per score category + text field + reviewer custom fields
- Progress bar (e.g., "12 / 45")
- **Save and next** -- saves and advances to next unreviewed proposal (fewest reviews prioritised for balanced coverage)
- **Skip for now** -- skip without saving, returns later
- **Abstain** -- record looked-at without scoring
- **Save** -- save and stay on page
- Keyboard shortcut: Ctrl+Enter / Cmd+Enter

**Bulk View:**
- All proposals in single table, one row per proposal
- Score columns + comment field per row
- Best for lightweight review processes

### Example Configurations

**Small event (30 proposals, 5 organisers):** 1 score category (0-3), 1 phase, no track restrictions, median aggregation, scores/text optional.

**Medium conference (200 proposals, 3 tracks, 15 reviewers):** 2 weighted categories, 2 phases (review + selection), track-restricted teams, speaker names hidden in review phase, other reviews visible after own submission.

**Large conference (800 proposals, 50 reviewers):** 3 categories (2 weighted + 1 independent), 3 phases (initial review/calibration/final selection), assigned-only visibility, scores+text required, reviewer custom fields.

---

## 5. Speaker Management

### Speaker Profiles

- Name (required) and Biography on public profile
- Profile picture with crop-to-square (circle highlighted for round display)
- Availability via visual calendar widget (when enabled in CfP)
- Custom per-speaker fields (dietary needs, T-shirt size, social media, etc.)
- Social media URL fields with platform icons displayed on public profile

### Speaker Communication

- **Adding speakers to sessions** triggers automatic notification emails (different templates for new/existing accounts)
- New speakers get account setup link
- **Acceptance/rejection emails** generated from templates, placed in outbox for review
- **Confirmation link** in acceptance email for speakers to confirm attendance
- **Schedule notifications** with iCal attachment when schedule is released
- **Custom field reminders** for unanswered fields
- **Draft proposal reminders** for unfinished submissions
- **Composed emails** to filtered groups of speakers

### Speaker Availability

- Collected via visual calendar widget during submission
- Speakers can update availability from their profile later
- When session has multiple speakers, pretalx uses **intersection** of availabilities
- Room availabilities constrain speaker availability options
- Schedule editor visualises available/unavailable times on grid
- Warning icons shown when scheduling conflicts with availability

---

## 6. Schedule Editor

### Core Concepts

**Rooms:**
- Physical or virtual spaces where sessions happen
- Each has: name, optional description (shown to attendees), optional speaker info (technical details, shown only to scheduled speakers)
- Managed under **Event > Schedule > Rooms**
- Reorder by drag-and-drop (order determines column order in editor and public schedule)
- At least one room required before scheduling

**Availabilities:**
- Both rooms and speakers can have time-window availabilities
- Room availabilities: set by organisers; if none set, room is available entire event
- Speaker availabilities: collected during submission via calendar widget
- Schedule editor shows available times clearly, unavailable times greyed out
- Warning icons on sessions with availability conflicts

**Schedule Versions:**
- Always exactly one **work-in-progress (WIP)** schedule (organiser-only)
- **Release** creates a named version (snapshot) that becomes public
- New WIP automatically created after release
- Unlimited releases; each recorded with timestamp
- Attendees see changelog between versions + RSS feed
- Releasing is separate from making schedule visible (toggle: **Actions > Make schedule public / Hide schedule**)

### The Schedule Editor Interface

Located at **Event > Schedule**. Two main areas:
- **Sidebar** (left) -- unscheduled sessions
- **Grid** (central) -- time grid with rooms as columns, time slots as rows

**Modes:**
- **Expanded mode** -- full-width sidebar, schedule looks like public view
- **Condensed mode** -- grid compressed, sidebar collapses to small floating panel in bottom-right corner

### Scheduling Sessions

- **Drag from sidebar to grid** to schedule
- Snaps to grid time intervals
- **Grid intervals:** 5, 15, 30, or 60 minutes (remembered between visits)
- Click a timeline interval to expand only that interval to 5-minute resolution
- **Move:** drag to new position
- **Unschedule:** drag back to sidebar, or use "Unschedule" button in session editor

### Session Editor (Click on Grid Item)

- For sessions: shows speakers, availabilities, track, room, duration, link to full session page
- For breaks/blockers: edit title and duration
- Shows any warnings (conflicts)

### Schedule-Only Items

**Breaks:**
- Publicly visible items (lunch, coffee, social events)
- No speakers or session detail pages
- Created by dragging from sidebar
- "Copy to other rooms" for spanning all rooms (e.g., lunch)
- Mobile/single-column: only one break shown when duplicated across rooms

**Blockers:**
- Internal planning items, **never shown publicly**
- Reserve time slots (room setup, uncommitted sessions, unavailable times)
- Created by dragging from sidebar
- Also support "Copy to other rooms"

### Warnings / Conflict Detection

The editor checks for and warns about:
1. Session scheduled outside **room's availability** windows
2. Session scheduled when a **speaker is unavailable**
3. Two sessions in the **same room overlap** in time
4. **Speaker double-booked** (two sessions at same time)

Warnings appear as visual indicators on grid and in session editor.

### Releasing a Schedule

Click **New release** button. Release page allows:
- **Version name** (must be unique within event, e.g., "v1", "Final", "Day 1 update")
- **Review warnings** (unconfirmed sessions, unscheduled sessions, conflicts)
- **Public changelog comment** (appears in version history + RSS feed)
- **Notify speakers** option (emails generated to outbox for review, with iCal attachment)

**What Becomes Public:**
- Confirmed sessions with scheduled time+room
- Breaks with scheduled time+room

**What Stays Hidden:**
- Sessions not in "confirmed" state (including accepted-but-unconfirmed)
- Blockers
- Sessions without scheduled time/room

Visual indicators in editor: accepted sessions slightly greyed-out, pending-accepted sessions striped.

### Embedding the Schedule

JavaScript widget available at **Schedule > Widget**. Configurable: language, layout, style.

Two code snippets:
1. Script tag for `<head>` (loads widget JS)
2. `<pretalx-schedule>` custom element where schedule should appear

Supports multiple widgets for different events on same page. Opens session detail and speaker profiles as overlays.

---

## 7. Email System

### The Outbox

Central concept: almost every email lands in the outbox as a draft before sending.

**Exceptions (sent immediately):**
- Submission confirmations (speaker expects instant feedback)
- Team/reviewer emails (internal communication)

**Benefits:**
- Review before sending (fix typos, adjust wording, add personal notes)
- Batch control (e.g., 50 acceptance emails held until ready)
- Safe corrections (delete from outbox = speaker never knows)

**Working with the Outbox:**
- View/edit all fields: subject, body, Reply-To, CC, BCC
- Filter by track or search recipients/addresses/subjects
- Send all (or filtered subset) at once
- Discard all or filtered subset
- Send/discard individual emails

### Email Templates

Managed under **Event > Mails > Templates**.

**Built-in Templates:**

| Template | Trigger | Notes |
|---|---|---|
| Acknowledge proposal submission | Speaker submits | Sent immediately |
| Proposal accepted | Accept a proposal | To outbox; contains confirmation link |
| Proposal rejected | Reject a proposal | To outbox |
| Add speaker (new account) | Add unknown speaker | Contains account setup link |
| Add speaker (existing account) | Add known speaker | Links to proposal page |
| Custom fields reminder | Manual trigger | For unanswered custom fields |
| Draft proposal reminder | Manual trigger | For unfinished submissions |
| New schedule published | Schedule release | iCal attachment included |

**Custom Templates:**
- Create additional templates for recurring emails (e.g., "Please upload slides", "Speaker dinner invitation")
- Appear alongside built-in templates
- Use as starting point in composer via "Compose" button
- Changing a template does NOT affect emails already in outbox

### Placeholders

Dynamic values in curly braces, replaced when email is generated. Available in both subject and body.

**Key Placeholders:**

| Placeholder | Description |
|---|---|
| `{event_name}` | Event name |
| `{proposal_title}` | Proposal/session title |
| `{confirmation_link}` | URL for speaker to confirm attendance |
| `{all_reviews}` | All review texts for a proposal (separated by dividers) |
| `{speaker_schedule_full}` | Formatted list of all speaker's scheduled sessions with times and rooms |
| `{session_title}` | Session title |
| `{speaker_schedule_new}` | New/changed schedule items for speaker |

- Template editor shows available placeholders grouped by category
- Click question mark next to placeholder for explanation + preview
- Some templates have role-specific placeholders
- Using a placeholder not available for a template causes error
- Use `{event_name}` so templates work when copied to next year's event

### Composing Emails

Located at **Event > Mails > Compose emails**. Two modes:

**1. Sessions/proposals/speakers mode:**
- Filter by: proposal state, session type, track, content locale, tags
- Select specific proposals/speakers to include
- Filter by custom field responses (from submission list)
- Supports all placeholders (personalised per speaker)
- Default: placed in outbox. Option: "Send immediately" (no confirmation)

**2. Reviewers and team members mode:**
- Select teams as recipients
- Always sent directly (no outbox)

**Preview and Deduplication:**
- Click "Preview email" for rendered preview with sample values
- Shows approximate recipient count
- Auto-deduplicates: if speaker has multiple matching proposals but rendered email is identical, they receive only one copy (linked to all matching proposals)

### Sent Emails

- Recorded under **Event > Mails > Sent emails**
- Searchable and filterable
- "Copy to draft" creates new draft from original template (with placeholders intact, not rendered text)

### Email Settings

Under **Event > Settings > Mail**:
- **Reply-To address** -- recipients see this; From header always set to pretalx server address
- **Subject prefix** -- prepended in `[brackets]` to all subjects (default: event name). Auto-skips if template already has bracketed prefix.
- **Signature** -- appended to all emails with standard separator. Supports Markdown.

**Custom Email Server:**
- Configure custom SMTP under mail settings
- All event emails routed through it (except password reset/recovery which use system server)
- Test button to verify settings
- Warning: misconfigured servers can cause silent delivery failures

### Email Deliverability

- Sending hundreds of emails in short window damages sending domain reputation
- Recommendations: spread sends (use outbox filters by track/type), check DNS records (SPF/DKIM/DMARC), monitor bounces
- pretalx.com handles deliverability automatically (infrastructure, reputation, DNS, bounces, specialised routing per recipient)

### Email Language Selection (Multilingual Events)

For emails about **one specific proposal:**
1. Proposal's content locale (if it's an event language)
2. Speaker's UI language (if it's an event language)
3. Fallback: main event language

For emails **not tied to one proposal:** speaker's UI language (if event language), else main event language.

---

## 8. Export Options

### Available Export Formats

pretalx provides several export mechanisms (documented across user guide, FAQ, and API):

**Schedule Exports:**
- **Embeddable JavaScript widget** -- configurable language, layout, and colours; embed on external websites
- **RSS feed** -- changelog of schedule version updates
- **iCal attachments** -- included in speaker notification emails with session details
- **Print/PDF** -- no native PDF export, but schedule editor page has print CSS support. Navigate to schedule editor, use browser print dialog > "Print to PDF". Supports hiding rooms.
- **Static HTML export** -- download static export of all schedule pages for hosting elsewhere (mentioned on features page)
- **Schedule API** -- full schedule data available via REST API

**Data Exports:**
- **CSV export** -- speaker data (name, email) for integration with other tools (e.g., pretix vouchers). Select accepted/confirmed speakers and export fields.
- **REST API** -- full programmatic access to all data (submissions, speakers, reviews, schedule). Documented at https://docs.pretalx.org/api/
- **Frab-compatible XML** -- pretalx supports the frab schedule XML format (standard in the conference community), available via API endpoints

**Per-Session Exports:**
- Session detail pages publicly accessible with metadata
- Speaker profile pages publicly accessible

### API-Based Export

The REST API (documented separately at https://docs.pretalx.org/api/) provides:
- Authentication via token
- Endpoints for: events, submissions/sessions, speakers, reviews, schedule, rooms, tracks, tags, questions/answers
- Supports pagination and filtering
- Can expand linked resources
- OpenAPI schema available at `/schema.yml`

---

## 9. Key Workflow Summary

### Typical Event Lifecycle in pretalx

```
1. Create Organiser + Event
      |
2. Configure CfP (fields, deadlines, tracks, session types)
      |
3. Open CfP --> Speakers submit proposals
      |
4. Close CfP --> Review phase begins
      |  - Reviewers score proposals
      |  - Optionally: multiple review phases
      |  - Anonymisation options available
      |
5. Selection phase
      |  - Accept/reject (pending states recommended)
      |  - Apply pending states in bulk
      |  - Review emails in outbox before sending
      |
6. Scheduling
      |  - Create rooms
      |  - Drag sessions onto grid
      |  - Check warnings (availability, overlaps, double-booking)
      |  - Release schedule version
      |  - Optionally notify speakers (emails to outbox)
      |
7. Public schedule
      |  - Make schedule public
      |  - Embed widget on event website
      |  - Iterate with new releases as needed
      |
8. Ongoing communication
      - Compose emails to speaker groups
      - Send reminders (custom fields, draft proposals)
      - Share schedule updates
```

### Key Design Principles

1. **Outbox-first email system** -- almost all emails queued for review before sending
2. **Version-controlled schedule** -- WIP schedule invisible to public; explicit releases
3. **Flexible review system** -- phases, weighted scores, anonymisation, track-based assignment
4. **Pending states** -- make accept/reject decisions incrementally, apply in bulk
5. **Copy settings between events** -- templates, tracks, review config carry forward
6. **Permission unions** -- multiple team memberships combine additively
7. **Non-destructive operations** -- removing team members preserves their contributions
