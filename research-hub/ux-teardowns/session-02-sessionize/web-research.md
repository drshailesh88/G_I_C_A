# Sessionize UX Teardown -- Web Research
**Date:** 2026-04-05
**Researcher:** UX Research Agent
**Purpose:** Document Sessionize's speaker management, schedule building, and attendee-facing features to inform the GEM India Conference App's Scientific Program module.

---

## Table of Contents
1. [Platform Overview](#1-platform-overview)
2. [Speaker/Faculty Management](#2-speakerfaculty-management)
3. [Session Assignment & Creation](#3-session-assignment--creation)
4. [Schedule Grid Builder](#4-schedule-grid-builder)
5. [Speaker Notifications & Communication](#5-speaker-notifications--communication)
6. [Public Schedule & Attendee Experience](#6-public-schedule--attendee-experience)
7. [API & Developer Features](#7-api--developer-features)
8. [Data Management & Exports](#8-data-management--exports)
9. [Key UX Patterns to Adopt](#9-key-ux-patterns-to-adopt)
10. [Gaps & Limitations](#10-gaps--limitations)
11. [Mapping to GEM Scientific Program Module](#11-mapping-to-gem-scientific-program-module)

---

## 1. Platform Overview

**Source:** [sessionize.com](https://sessionize.com), [Features](https://sessionize.com/features), [Platform Overview](https://sessionize.com/playbook/platform-overview)

Sessionize is a cloud-based event content management platform focused on the Call for Papers (CFP) through schedule publication lifecycle. It is used by 11,000+ events with 276,000+ speakers and over 1 million cumulative session submissions.

### Core Scope
- Call for Papers / Call for Speakers management
- Session submission evaluation (stars, yes/no, comparison modes)
- Speaker and session content management
- Drag-and-drop schedule building
- Schedule publication (embed, API, mobile/web app)
- Speaker communication (email, calendar appointments)

### Explicit Non-Scope (What Sessionize Does NOT Do)
- Attendee management or ticketing
- Live streaming (provides links only)
- Video hosting
- Event webpage/website building
- Registration management

### Pricing
| Tier | Cost | Notes |
|------|------|-------|
| Community | Free | Qualifying community events only |
| Professional | $499/event | Full feature set |
| Bulk | Custom | 5+ annual events |

---

## 2. Speaker/Faculty Management

### 2.1 Speaker Acquisition Methods

**Source:** [Adding Sessions and Speakers](https://sessionize.com/playbook/adding-sessions-and-speakers)

There are three pathways for speakers to enter the system:

#### A. Call for Speakers (Recommended)
- Speaker submits through the public CFP page
- Automatically creates ownership link between speaker and session
- Speaker creates/uses Sessionize account during submission
- Full communication and editing capabilities enabled

#### B. Organizer Invitation
- Organizer adds a session manually, then invites a speaker via email
- Speaker receives an invitation email with an **"Open Invitation"** button
- Speaker creates account (OAuth or email/password) and completes profile
- Speaker checks consent box ("I agree that personal data show on this page...") and clicks **"Accept invitation"**
- Invitation email address does NOT need to match the account email

#### C. Accountless Speaker (Manual Entry)
- Organizer checks **"Do not send an invite, just enter speaker details"**
- Creates a placeholder profile with no Sessionize access
- Speaker receives NO communication, cannot edit sessions, cannot view schedule
- Can later be converted: organizer enters email -> invitation sent -> upon acceptance, accountless profile is automatically swapped with real account

**Source:** [Replacing Accountless Speakers](https://sessionize.com/playbook/replacing-accountless-speakers), [Accepting Invitation](https://sessionize.com/playbook/accepting-invitation-to-join-session)

### 2.2 Speaker Profile Fields

**Source:** [Custom Fields Explained](https://sessionize.com/playbook/fields-explained)

Sessionize uses three categories of custom fields:

#### Submission Fields
- Visible on the Call for Speakers page during submission
- Includes mandatory predefined fields: **session title, speaker name, email**
- Organizers add unlimited custom fields

#### Additional Fields
- NOT visible during submission
- Visible to speakers in their speaker dashboard after submission
- Used for post-acceptance data: flight numbers, technical requirements, dietary needs, shirt size

#### Internal Fields
- Visible ONLY to organizers and content team
- Used for sensitive organizer-only notes, internal scoring, logistics tracking

#### Available Field Types
| Type | Description |
|------|-------------|
| Single choice | Dropdown/radio (used for filtering and grouping throughout the platform) |
| Multiple choice | Multi-select (also used for filtering and grouping) |
| Short text | Free-form text input |
| Checkbox | Boolean consent/agreement fields |
| File upload | Document/presentation upload |
| Text separator | Informational blocks with clickable links (not a data field) |

**Critical constraint:** Only single-choice and multiple-choice fields can be used for filtering and grouping in browsing, evaluations, embedding, and API.

#### Field Management UX
- Drag-and-drop reordering of field headers
- Move fields between groups (Submission/Additional/Internal) via cog icon without losing data
- Lock answers: "Do not allow speaker to edit the answer" toggle
- **Conditional logic:** Show/hide fields based on previous answers (dependent fields must be positioned below trigger fields)
- Bulk entry for choice options: paste semicolon-separated values (e.g., "Lightning talk;Session;Workshop;Masterclass")
- Multi-speaker sessions: session fields filled once, but speaker fields filled individually per speaker

#### Standard Speaker Profile Data
- Full name
- Email
- Tagline / short bio
- Biography (rich text)
- Photo/headshot
- Social network links (Twitter, LinkedIn, blog, company URL)
- Areas of expertise / topics covered
- Speaking history
- Awards

### 2.3 Session Owner vs. Session Speaker Roles

**Source:** [Session Owner and Session Speaker](https://sessionize.com/playbook/session-owner-and-session-speaker)

Sessionize distinguishes two roles per session:

| Capability | Session Owner | Session Speaker |
|-----------|--------------|----------------|
| Edit session details (title, description, format) | Yes (if organizer permits) | No |
| Add additional speakers | Yes | No |
| Withdraw submission | Yes | No |
| Receive acceptance/rejection notifications | Yes | No (unless also owner) |
| Edit own speaker profile | Yes | Yes |
| Communicate with organizers | Yes | Limited |

**Ownership patterns:**
- Self-submission: submitter is both owner and speaker
- Third-party submission (assistant/manager): submitter becomes owner, actual presenter is speaker
- Manual organizer entry: organizer designates owner

Organizers can reassign ownership by editing the session and selecting any participant or inviting a new owner via email.

### 2.4 Multi-Role Support

Sessionize supports:
- **Multi-speaker sessions** (panels, co-presentations): one owner + multiple speakers
- **Top speaker** designation: checkbox in grid view or bulk action; top speakers get priority placement in speaker lists, walls, and event pages
- **Team member roles for organizers:** full access, partial access, read-only access, evaluator-only

**Notable gap for GEM:** Sessionize does NOT have built-in roles like "chairperson," "moderator," or "panelist" as distinct from "speaker." These would need to be modeled using custom fields (e.g., a single-choice field "Role" with options: Speaker, Chairperson, Moderator, Panelist, Discussant).

---

## 3. Session Assignment & Creation

### 3.1 Session Creation

Sessions can be created via:
1. **CFP submissions** -- speaker submits, session auto-created
2. **Manual addition** -- organizer clicks "Add session" on Sessions page
   - Required fields: session title, session owner
   - Can invite speakers or create accountless entries
   - Described as "very time-consuming for larger events"

### 3.2 Session Statuses

**Source:** [Session Statuses](https://sessionize.com/playbook/session-statuses)

Six manually-assignable statuses:

| Status | Meaning | Speaker Sees |
|--------|---------|-------------|
| Nominated | Under evaluation | "In Evaluation" |
| Accept Queue | Pending additional checks | "In Evaluation" |
| Decline Queue | Potential backup/decline | "In Evaluation" |
| Accepted | Will be part of event | "In Evaluation" (until informed) |
| Waitlisted | Awaiting slot availability | "In Evaluation" (until informed) |
| Declined | Will not be part of event | "In Evaluation" (until informed) |

**Key design principle:** Speakers ALWAYS see "In Evaluation" until the organizer explicitly triggers the inform action. This allows organizers to change their minds freely without speakers knowing.

Three additional auto-generated statuses after notification:
- Accepted + Informed
- Waitlisted + Informed
- Declined + Informed

**Workflow constraints:**
- Sessions with informed statuses cannot be bulk-changed (only individually)
- Reverting a decision after informing requires a deliberate reset step
- Bulk status changes available for non-informed sessions

### 3.3 Session Editing

**Source:** [Editing Sessions and Speakers](https://sessionize.com/playbook/ways-of-editing-sessions-speakers)

Three editing methods:

#### Grid View (Fastest for bulk operations)
- Two-column dropdown layout
- Click existing data to modify inline
- Pencil icon to add new data
- Ideal for mass updates (e.g., adding recording links post-event)

#### Bulk Editing
- Checkbox selection at list top, "Expand the selection" for all filtered items
- "Change field values" dialog: choose field, set new value across all selected
- Efficient for status changes, category assignments

#### Individual Editing
- Click session/speaker name for detail view
- "Edit session" button or hover pencil icon
- Full field access

**Organizer editing permissions:**
- Can change: title, description, owner, status, speakers, all custom fields
- Cannot change: speaker name and email (account-linked) -- exception: manually-added speaker names are editable

---

## 4. Schedule Grid Builder

**Source:** [Schedule Builder Tips and Tricks](https://sessionize.com/playbook/schedule-builder), [Features](https://sessionize.com/features)

### 4.1 Layout Architecture

The schedule builder uses a **two-panel layout:**

```
+---------------------+----------------------------------------+
|                     |   Room A    |   Room B    |   Room C   |
|   SESSION LIST      |-------------|-------------|------------|
|   (Left Sidebar)    |  8:00 AM    |             |            |
|                     |-------------|-------------|------------|
|   - Session 1       |  9:00 AM    |  Session X  |            |
|   - Session 2       |-------------|-------------|------------|
|   - Session 3       | 10:00 AM    |             |  Session Y |
|   - ...             |-------------|-------------|------------|
|                     | 11:00 AM    |             |            |
+---------------------+----------------------------------------+
```

- **Left panel:** List of accepted sessions (only accepted sessions appear; rejected/pending are hidden)
- **Right panel:** The schedule grid
- **Columns = Rooms/tracks** (configurable quantity, default 3)
- **Rows = Time slots** (starting from 8:00 AM, expandable via "Add an hour" button)
- **Cells = Intersection** of room and time slot where sessions are placed

### 4.2 Drag-and-Drop Mechanics

| Action | Interaction |
|--------|------------|
| Place session | Drag from left panel into grid cell |
| Adjust duration | Grab bottom edge of tile and pull to desired length |
| Move between rooms | Drag from one column to another (auto-adjusts duration to match same-slot sessions unless Ctrl/Cmd held) |
| Remove from schedule | Drag session back to the left panel |
| Swap two sessions | Drag one precisely on top of the other |
| Move across days | Drag to left panel, switch to target date tab, reposition |

**Duration memory:** The builder remembers the last-adjusted duration and applies it automatically to subsequently placed sessions.

### 4.3 Room Management

- Add or remove rooms beyond the default three (unlimited rooms supported)
- Rename room labels inline
- Reorder rooms via "Move left/Move right" buttons (appear on hover over room names)
- Collapse/expand individual rooms for focused scheduling
- Green hamburger menu hides the session list sidebar to maximize schedule grid visibility

### 4.4 Multi-Day Support

- Schedule builder automatically splits dates into **separate tabs** (one tab per day)
- Rooms persist across all dates
- Rooms only display in embedded schedule where they contain scheduled sessions (empty rooms hidden publicly)

### 4.5 Visual Organization / Color Coding

- Sessions can be **color-coded by category** derived from single-choice or multi-choice submission fields
- Color coding is a **scheduling aid only** -- does NOT appear in public embeds
- Categories available for coloring come directly from the fields defined in the Submission Fields tab

### 4.6 Special Session Types

#### Plenum Sessions
- Visually extend across all room columns simultaneously
- Must be placed in their actual host room
- Useful for keynotes or general sessions

#### Service Sessions
- Non-speaker entries: registration, breaks, coffee, lunch, networking
- Added via **"Add Service Session"** button
- Separate from speaker-submitted sessions

### 4.7 Conflict/Collision Detection

**Source:** [Features](https://sessionize.com/features)

- **Built-in schedule collision detection and preview**
- Designed to flag when speakers are double-booked or sessions overlap
- Provides "ease of mind" during scheduling
- Details of the collision UI are not fully documented publicly, but the feature is confirmed as built-in

### 4.8 Time Management

- Default start time: 8:00 AM
- Hourly extensions available (add hours upward or downward)
- **Zoom feature** for handling shorter session durations (15-minute, 30-minute granularity)
- Session tiles display: start time and duration

### 4.9 Practical Constraints

- Only accepted sessions appear in the builder
- Works best on larger screens (no explicit mobile schedule-builder support)
- Unlimited rooms supported but performance scales with screen real estate

---

## 5. Speaker Notifications & Communication

### 5.1 Session Status Notification (Inform Flow)

**Source:** [Informing and Confirming](https://sessionize.com/playbook/informing-and-confirming)

Sessionize uses a **deliberate two-step notification system** -- organizers must manually trigger notifications.

#### Notification Triggers
- Not automatic -- organizers press "Inform" when ready
- Three selection approaches: individual checkbox, bulk select/deselect, category filtering via custom fields

#### Email Logic
| Status | Emails Sent |
|--------|------------|
| Declined | ONE email listing ALL rejected sessions (avoids overwhelming) |
| Accepted | SEPARATE email per accepted session |
| Waitlisted | SEPARATE email per waitlisted session |

#### Email Customization
- Three separate message templates (accepted, declined, waitlisted)
- Customizable text per template
- Variable insertion system (speaker name, event details, session title)
- "Save & Test" feature to preview messages before sending
- Decline-specific: can add "Decline reason/feedback" that auto-includes in rejection email

#### Recipient Rules
- ONLY the session owner receives status notifications
- Additional speakers do NOT receive accept/decline emails (owner is the communication point)

### 5.2 Speaker Confirmation Workflow

After acceptance notification:
1. Speaker receives email with **"Confirm Participation"** button
2. Clicking opens Sessionize website
3. Speaker clicks **"Confirm participation"** button
4. If session is scheduled, speaker sees date/time/room details before confirming
5. Organizer sees confirmation status in tracking dashboard

**Organizer tracking features:**
- "Informed & Confirmed" tab with overview of all informed/unconfirmed speakers
- Sortable columns by confirmation status
- "Resend" option for non-responsive speakers
- Preview and resend functionality

### 5.3 Calendar Appointments

**Source:** [Calendar Appointments](https://sessionize.com/playbook/calendar-appointments)

- Enabled on the "Announce schedule" page via toggle: **"Send calendar appointments to accepted speakers"**
- Sent **automatically during the following night** (event timezone) after changes are finalized
- Batches changes over 24 hours before sending (prevents spam from frequent updates)
- Manual override: **"Send all appointments immediately"** button
- **"Send test to me"** feature for organizer preview

**Calendar appointment content:**
- Session details (title, description, date, time, room)
- Event details links
- Official website links

**Automatic updates:** When a session's date, time, or room changes, affected speakers receive an updated calendar appointment automatically (next batch cycle).

**Eligibility:** Only speakers whose sessions are accepted, scheduled, AND informed.

**Important:** Rejecting a calendar invitation does NOT withdraw a speaker -- they must contact organizers directly.

### 5.4 Group Mailing

**Source:** [Group Mailing](https://sessionize.com/playbook/group-mailing)

- Unlimited mailings, each with its own performance report
- **Targeting options:**
  - Filter by session status (acceptance stage)
  - Filter by category (custom field values)
  - Direct selection of specific speakers/sessions
  - Add speakers to previously created mailings
- **Variable insertion** for personalization (speaker name, session title, etc.)
- "Send test to me" preview
- Post-event restriction: only accepted sessions qualify for messaging

**Eligibility restrictions:** Cannot target speakers with declined sessions.

### 5.5 Individual Session Messaging

- One-off messaging about specific sessions from the Sessions page
- Full email history visible
- Reply tracking functionality

### 5.6 Speaker Dashboard

- Non-email option for posting guidelines and resources
- Visible to accepted speakers in their Sessionize account
- Used for rehearsal times, technical specs, presentation templates

---

## 6. Public Schedule & Attendee Experience

### 6.1 Schedule Announcement Workflow

**Source:** [Announcing the Schedule](https://sessionize.com/playbook/en_US/helpful-tips/announcing-the-schedule)

**Toggle-based activation:**
1. Navigate to "Announce schedule" page
2. Toggle **"Schedule announced"** from Off to On
3. Immediately visible to: speakers, API consumers, web embeds, mobile/web app users

**Before announcement:** Schedule details (room names, start/end times) visible ONLY to organizers and team members.

**Handling unscheduled sessions after announcement:**
- Toggle announcement off to hide everything
- Schedule remaining sessions individually
- Enable **"Include unscheduled sessions where possible (advanced)"** in API/Embed Advanced options

### 6.2 Embedded Schedule Views

**Source:** [Embedding](https://sessionize.com/playbook/embedding)

Four embed types available:

| Embed Type | Description |
|-----------|-------------|
| **Schedule Grid** | Calendar-style display: sessions across time slots (rows) and rooms (columns) |
| **Session List** | Individual session entries with details and filtering |
| **Speaker List** | Alphabetical/organized speaker directory with profiles |
| **Speaker Wall** | Visual gallery layout featuring speaker images |

**Implementation:** Single HTML script tag:
```html
<script type="text/javascript"
  src="https://sessionize.com/api/v2/[eventId]/view/[viewType]">
</script>
```

**Customization options:**
- Custom color schemes matching brand guidelines ("Set other colors manually (advanced)")
- Localized date/time formatting ("virtually all languages and date/time formats")
- CSS overrides for custom appearance
- JavaScript injection for dynamic modifications
- HTML-only embedding for complete design control
- Session filtering configuration per endpoint
- Speaker information display toggles

**Visibility rules:**
- Sessions display only when marked "Informed" (default) or "Accepted" (alternative mode)
- Room/time info requires "Schedule announced" status unless overridden per endpoint
- Empty rooms hidden in public view

**Caching:** 5-minute server-side cache; manual cache clearing available.

### 6.3 Mobile & Web App (Progressive Web App)

- Free with Sessionize -- no additional cost
- Built as PWA: installable on mobile, works on tablet/desktop
- Real-time schedule updates

**Attendee features:**
- View full schedule by day/track/time
- Browse speaker profiles and session details
- **Favorite/bookmark sessions** to build a personal agenda ("my schedule")
- Filter by track, speaker, topic
- Session detail views with speaker bios

### 6.4 Data Visibility Configuration

**API/Embed data display settings:**
- **"Accepted And Informed"** -- shows sessions where speakers have been notified (recommended)
- **"Accepted"** -- shows accepted sessions regardless of notification status (not recommended)
- Per-endpoint configuration

---

## 7. API & Developer Features

**Source:** [API Documentation](https://sessionize.com/playbook/api), [Developers](https://sessionize.com/developers)

### 7.1 API Architecture

- **Read-only** access (no write operations)
- **No authentication required** -- designed for public schedule data
- Endpoint URLs should be treated as semi-confidential (anyone with URL can access)
- Organizers create endpoints via the event's API/Embed page
- Each endpoint gets a **unique ID**

### 7.2 Available Formats

| Format | Scope |
|--------|-------|
| JSON | Full data (sessions, speakers, rooms, custom fields) |
| XML | Full data (sessions, speakers, rooms, custom fields) |
| iCalendar | Basic session info only |

### 7.3 API Endpoints (Views)

Base URL pattern: `https://sessionize.com/api/v2/[endpoint-id]/view/[ViewName]`

| View | Description |
|------|-------------|
| `/view/All` | Complete event data |
| `/view/GridSmart` | Schedule grid layout data |
| `/view/Sessions` | Session list data |
| `/view/Speakers` | Speaker list data |
| `/view/SpeakerWall` | Speaker wall/gallery data |

### 7.4 Data Available

**Sessions:** title, description, status, custom fields (categories, tags, questions, files), start/end times, room assignment
**Speakers:** name, bio, tagline, photo, custom fields, social links (Twitter, blog, company)
**Rooms:** room names, assignments
**Schedule:** complete timing and room data

**Custom fields:** Disabled by default -- must be explicitly enabled per endpoint.

### 7.5 Caching

- Server-side cache: up to 5 minutes
- Manual cache clearing available on the "Get Code" page
- Browser cache may need separate clearing

### 7.6 Unlimited Endpoints

- Create unlimited API/Embed endpoints per event
- Each with independent configuration settings (what data to expose, which custom fields to include)

---

## 8. Data Management & Exports

**Source:** [Using Data](https://sessionize.com/playbook/using-data)

### Export Options
- Spreadsheet exports: sessions, speakers, evaluation results, schedule details, team comments
- Bulk speaker photo downloads
- Uploaded files download (presentations, etc.) as ZIP
- Automatic email exports
- Change history tracking
- Email log records

### Data Consumption Summary

| Method | Updates | Use Case |
|--------|---------|----------|
| Embedding | Real-time (5-min cache) | Event website schedule display |
| API | Real-time (5-min cache) | Custom apps, integrations |
| Mobile/Web App | Real-time | Attendee schedule access |
| Export | Static snapshot | Offline use, printing, reporting |

---

## 9. Key UX Patterns to Adopt

### 9.1 Two-Panel Schedule Builder
The left sidebar (session list) + right grid (rooms x timeslots) pattern is the gold standard for visual schedule construction. This should be the primary layout for GEM's Scientific Program schedule builder.

### 9.2 Deliberate Notification Control
Sessionize's "speakers see nothing until you tell them" philosophy prevents premature exposure. The GEM app should similarly decouple internal status changes from external notifications.

### 9.3 Three-Tier Field Visibility
Submission / Additional / Internal field grouping elegantly handles the tension between what speakers submit, what organizers need speakers to provide later, and what is organizer-only. GEM should adopt this pattern for faculty data collection.

### 9.4 Session Owner vs. Speaker Role Separation
Separating "who manages the session" from "who presents" handles real-world scenarios (assistants submitting, panel chairs managing). GEM should model this for session chairs vs. presenters.

### 9.5 Accountless Speaker Conversion
The ability to create placeholder entries that convert to real accounts is essential for large conferences where not all faculty are on the platform initially.

### 9.6 Grid View Editing
The two-column grid edit view (pick any two fields, edit inline) is remarkably efficient for bulk data management. GEM should implement this for session/speaker bulk editing.

### 9.7 Service Sessions
Dedicated non-speaker session types (breaks, registration, lunch) are essential for a complete schedule view. GEM needs this for inaugural ceremonies, tea breaks, poster sessions, etc.

### 9.8 Color Coding by Category
Derived from custom field values (not manually assigned) -- reduces configuration burden. GEM should color-code by session type (Plenary, Symposium, Workshop, Free Paper, etc.).

### 9.9 Confirmation Pipeline
Inform -> Confirm -> Calendar appointment is a clean three-step engagement funnel. GEM should implement: Invite -> Accept -> Confirm -> Calendar.

### 9.10 Personal Schedule Bookmarking
Attendees favoriting sessions to build "my schedule" is a must-have for a multi-track conference like GEM.

---

## 10. Gaps & Limitations (Relative to GEM Needs)

### 10.1 No Built-In Role Taxonomy
Sessionize has only "owner" and "speaker." GEM needs: Chairperson, Co-chairperson, Moderator, Panelist, Invited Speaker, Free Paper Presenter, Poster Presenter, Discussant. Sessionize handles this via custom fields, but GEM should build role-awareness into the data model.

### 10.2 No Abstract/Paper Management
Sessionize handles session descriptions, not structured abstracts with authors, affiliations, keywords, and review workflows. GEM needs a full abstract submission and review pipeline.

### 10.3 No Hierarchical Session Structure
Sessionize sessions are flat (session -> speakers). GEM needs: Scientific Session -> Presentations -> Speakers, where a Symposium contains multiple talks with different speakers, each with its own abstract.

### 10.4 No Attendee Management
Sessionize explicitly excludes ticketing, registration, and attendee tracking. GEM needs delegate registration and attendance tracking.

### 10.5 No CME/Credit Tracking
No continuing education credit assignment or tracking. GEM needs CME point allocation per session.

### 10.6 Limited Conflict Detection Detail
Sessionize confirms collision detection exists but does not document the specific UI (warnings, visual indicators, resolution suggestions). GEM should design explicit conflict alerts for: speaker double-booking, room double-booking, and chair conflicts.

### 10.7 No Offline/Print Schedule
Sessionize focuses on digital delivery. GEM needs PDF generation for printed programme books.

### 10.8 Write API Absent
Read-only API only. GEM will need bidirectional sync if integrating with other systems.

---

## 11. Mapping to GEM Scientific Program Module

| Sessionize Feature | GEM Equivalent | Adaptation Needed |
|-------------------|---------------|-------------------|
| Call for Speakers | Abstract Submission Portal | Add structured abstract fields, author affiliations, keywords |
| Session statuses (6 levels) | Abstract review statuses | Add review scores, reviewer assignment, rebuttal workflow |
| Session owner/speaker | Session chair / presenter | Expand to full role taxonomy (chair, moderator, panelist, etc.) |
| Submission fields | Abstract form fields | Add structured fields: objectives, methods, results, conclusions |
| Additional fields | Post-acceptance data collection | Travel info, AV requirements, presentation upload |
| Internal fields | Organizer notes | Reviewer scores, committee notes, logistics flags |
| Schedule grid (rooms x time) | Hall x Time Slot grid | Same pattern; add session-type awareness and nesting |
| Drag-and-drop scheduling | Same | Same interaction model |
| Service sessions | Ceremonies, breaks, social events | Same concept, different labels |
| Color coding by category | Color by session type | Plenary=red, Symposium=blue, Workshop=green, etc. |
| Collision detection | Conflict detection | Add chair/moderator conflict checking, not just speaker |
| Inform -> Confirm pipeline | Invite -> Accept -> Confirm | Add role-specific notifications |
| Calendar appointments | Calendar invites | Same, with CME session flagging |
| Group mailing | Bulk faculty communication | Same, filtered by role/session type |
| Embedded schedule grid | Public conference schedule | Same embed pattern, add CME indicators |
| Mobile PWA with favorites | GEM Conference App | Add offline support, floor maps, CME tracker |
| API (JSON/XML) | Conference data API | Add write capability for registration system integration |
| Speaker wall | Faculty directory | Add institution/department, specialty, photo |
| Plenum sessions | Plenary/Keynote sessions | Same full-width display |
| Top speakers | Invited/Keynote speakers | Priority listing in programme |
| Conditional field logic | Dynamic form sections | Same pattern for role-dependent fields |
| Export to spreadsheet | Programme book data export | Add PDF generation for print programme |

---

## Sources

- [Sessionize Homepage](https://sessionize.com)
- [Sessionize Features](https://sessionize.com/features)
- [Platform Overview (Capabilities & Limitations)](https://sessionize.com/playbook/platform-overview)
- [Schedule Builder Tips and Tricks](https://sessionize.com/playbook/schedule-builder)
- [Adding Sessions and Speakers](https://sessionize.com/playbook/adding-sessions-and-speakers)
- [Custom Fields Explained](https://sessionize.com/playbook/fields-explained)
- [Informing and Confirming Logic](https://sessionize.com/playbook/informing-and-confirming)
- [Session Statuses Explained](https://sessionize.com/playbook/session-statuses)
- [Session Owner and Session Speaker](https://sessionize.com/playbook/session-owner-and-session-speaker)
- [Calendar Appointments](https://sessionize.com/playbook/calendar-appointments)
- [Group Mailing](https://sessionize.com/playbook/group-mailing)
- [Announcing the Schedule](https://sessionize.com/playbook/en_US/helpful-tips/announcing-the-schedule)
- [Editing Sessions and Speakers](https://sessionize.com/playbook/ways-of-editing-sessions-speakers)
- [Embedding Documentation](https://sessionize.com/playbook/embedding)
- [API Documentation](https://sessionize.com/playbook/api)
- [Using Your Data](https://sessionize.com/playbook/using-data)
- [Replacing Accountless Speakers](https://sessionize.com/playbook/replacing-accountless-speakers)
- [Accepting Invitation to Join Session](https://sessionize.com/playbook/accepting-invitation-to-join-session)
- [Lists (Speaker/Event Grouping)](https://sessionize.com/playbook/lists)
- [Developers Page](https://sessionize.com/developers)
