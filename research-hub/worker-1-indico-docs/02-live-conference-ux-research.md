# Indico Live Conference UX Research — 3 Real CERN Conferences

**Researcher:** Worker 1 (Indico)  
**Date:** 2026-04-05  
**Source:** Live browsing of indico.cern.ch production instance (v3.3.13-pre)

---

## Conferences Studied

| # | Conference | URL | Dates | Location | Participants | Tracks |
|---|-----------|-----|-------|----------|-------------|--------|
| 1 | ICHEP 2024 | `/event/1291157/` | 17-24 Jul 2024 | Prague | ~1265 contributions | 13+ parallel |
| 2 | CHEP 2024 | `/event/1338689/` | 19-25 Oct 2024 | Krakow, Poland | 500 cap | 7 parallel |
| 3 | FCC Week 2023 | `/event/1202105/` | 5-9 Jun 2023 | London, UK | 466/500 | 5+ parallel |

---

## 1. ICHEP 2024 — International Conference on High Energy Physics

### 1.1 Event Page Layout

**URL:** `https://indico.cern.ch/event/1291157/`

**Header:**
- Full-width banner image ("ICHEP 2024 | PRAGUE") — custom conference banner
- Below banner: date range ("17-24 Jul 2024"), location ("Prague"), timezone ("Europe/Prague timezone")
- Top-right corner: timezone selector, language selector, Login button

**Top toolbar (above banner):**
- Grid/table view icon (timetable view switcher)
- Layout toggle dropdown
- Link icon (short URL)
- Edit icon (management area link — only for managers)
- Export button
- "Change theme" dropdown with options:
  - Compact style
  - Indico style
  - Indico style - inline minutes
  - Indico style - numbered
  - Indico style - numbered + minutes
  - Indico Weeks View

**Main content area:**
- Left sidebar navigation (see below)
- Right: conference description, date/time details, location, chairpersons
- Social media links embedded in description
- Contact section with email

**Conference info block:**
- "Date/Time" heading with Starts/Ends datetimes
- "Location" heading with venue name
- "Chairpersons" heading with list (login required to see emails)

### 1.2 Left Sidebar Menu (ICHEP 2024)

```
Main ICHEP 2024 page  → external link (https://ichep2024.org/)
Proceedings            → /event/1291157/page/29830-proceedings
Timetable              → /event/1291157/timetable/
Newsletters            → /event/1291157/page/34238-newsletters
  ├─ Newsletter - July 24  → /event/1291157/page/35172-newsletter-july-24
  ├─ Newsletter - July 23
  ├─ Newsletter - July 22
  ├─ Newsletter - July 20
  ├─ Newsletter - July 19
  ├─ Newsletter - July 18
  └─ Newsletter - May 27
Overview               → /event/1291157/overview
Floorplan and Timetable Mobile Apps
Plenary session stream
EARLY CAREER SCIENTIST AWARDS
Special events overview
  ├─ Panel discussion on Future Colliders
  ├─ Discussion & Lunch - Education and Outreach
  ├─ EDI and Sustainability Discussion
  ├─ Lecture: Quantum sensing in particle physics
  ├─ Future of Particle Physics with Czech perspective
  └─ ICHEP Party
Photos
Scientific Programme   → /event/1291157/program
Contribution List      → /event/1291157/contributions/
Instructions
  ├─ Code of Conduct
  ├─ Instructions for speakers
  ├─ Instructions for poster presenters
  ├─ Poster board identifications
  └─ Instructions for conveners
Accommodation
  ├─ Dormitory "17. listopadu"
  └─ Dormitory "Masarykova kolej"
Supporters & Sponsors
Partners
```

**Key pattern:** Menu items are a mix of:
- Built-in Indico pages (Timetable, Contribution List, Scientific Programme, Registration)
- Custom pages (`/event/{id}/page/{pageId}-{slug}`)
- External links

### 1.3 Timetable — Compact View (Default)

**URL pattern:** `/event/1291157/timetable/#YYYYMMDD`

**Day navigation:**
- Horizontal tab bar with day tabs: "Wed 17/07", "Thu 18/07", etc.
- Left/right arrow buttons (< >) for day navigation
- Active day tab is bold

**Action buttons (right-aligned row):**
- Print
- PDF
- Full screen
- Detailed view (toggles between compact/detailed)
- Filter

**Compact view layout (Thu 18/07 — busiest day):**
- Time column on far left (08:00, 09:00, 10:00, etc.)
- Full-width blocks for:
  - Registration (light blue, spans full width)
  - Coffee break (gray, spans full width)
  - Lunch break (gray, spans full width)
- Parallel session grid: **13 color-coded columns** side by side

**13 parallel tracks observed:**
| Track | Color | Room |
|-------|-------|------|
| Higgs Physics | Dark navy blue | South Hall 2A |
| Neutrino Physics | Purple/mauve | Panorama |
| Beyond the Standard Model | Brown/olive | Block 1 |
| Quark... | Yellow | South... |
| Astro-particle... | Gray/purple | South... |
| Strong Interactions | Yellow (with icon) | North... |
| Operation, Performance... | Light blue | Terrace... |
| Dark Matter | Dark olive/brown | Club A |
| Top Quark... | Pink | Club E |
| Detector... | Light gray | Club H |
| Heavy Ions | Tan/beige | Club B |
| Education and Outreach | Tan/light | (varies) |
| Accelerator... | Olive | Club D |

**Each session block shows:**
- Track name (abbreviated to fit column)
- Convener name(s) (abbreviated)
- Room name
- Time range (e.g., "08:30 - 10:15")

**Click behavior (compact view):**
Clicking a session block opens a **popup tooltip** with:
- Session title (full, in track color, linked)
- "Block" label with block name
- Clock icon + time range
- "Session" label with session name + list icon
- "Contributions" label with count in green badge (e.g., "5")

### 1.4 Timetable — Detailed View

**URL pattern:** `/event/1291157/timetable/#YYYYMMDD.detailed`

**Session legend bar** appears at top showing:
- Color-coded circles + full session names
- E.g., "Accelerators: Physics, Performance, and R&D for future facilities" (gray)
- "Astro-particle Physics and Cosmology" (yellow)
- "Beyond the Standard Model" (gray)
- "Coffee break" (light blue)
- "see more..." link to expand legend
- X button to dismiss

**Layout:** Same grid but individual contribution cards replace session blocks
- Each contribution is a small colored card
- Shows abbreviated title and speaker initials
- Small link/attachment icon on each card
- Much denser — shows all individual talks

**Click behavior (detailed view):**
Clicking a contribution card opens a popup with:
- Full contribution title (linked, in session color)
- Abstract text (truncated, italic)
- Clock icon + time range (e.g., "08:30 - 08:45")
- "Presenter" label with full name
- Link/list icon to navigate to full contribution page

### 1.5 Contribution List Page

**URL:** `/event/1291157/contributions/`

**Header:** "Contribution List" with count "1265 / 1265"

**Controls:**
- Search bar: "Enter #id or search string"
- Filter button (funnel icon)
- Export to PDF button
- Share/link button

**Each contribution card shows:**
- ID number (e.g., "455.")
- Title (linked, in red/magenta)
- Presenter icon + Name + red dot + Affiliation in parentheses
- Clock icon + date and time
- Track tags as colored badges:
  - Track name (green/teal badge)
  - "Parallel session talk" (magenta badge)
  - Session name (gray badge)
- Abstract text (truncated, 2-3 lines)

### 1.6 Scientific Programme Page

**URL:** `/event/1291157/program`

**Layout:** Numbered tracks with descriptions and conveners

**Each track section:**
```
01. Higgs Physics
─────────────────
[Description paragraph]

Conveners:
Daniel de Florian (UNSAM)
Linda Finco (Nebraska Uni.)
Katharine Leney (Southern Methodist Uni.)
...

Contact: ichep2024-pgm-01-higgs@cern.ch
```

PDF export button in top-right corner.

### 1.7 Registration Page

**URL:** `/event/1291157/registrations/`

**Layout:** "Registration" heading → "Available forms" subheading
- Table with columns: (form name), Opens, Closes, (action button)
- When closed: "No registration forms available for this event"
- When open: "Register" or "Apply" buttons

---

## 2. CHEP 2024 — Conference on Computing in HEP and Nuclear Physics

### 2.1 Event Page Layout

**URL:** `https://indico.cern.ch/event/1338689/`

**Header:**
- Full-width dark banner with custom design ("CHEP 2024" large text + building illustration)
- Dates in banner: "October 19 - 25, 2024"
- Below banner: full title, date range, timezone

**Key difference from ICHEP:** Different banner design approach, but same Indico template structure.

### 2.2 Left Sidebar Menu (CHEP 2024)

```
General                → /event/1338689/ (overview/home)
The HSF Training Pre-CHEP Workshop, 19-20 Oct 2024
Announcements
Important Dates
Registration           → /event/1338689/registrations/
Payment portal
Scientific Programme   → /event/1338689/program
Timetable              → /event/1338689/timetable/
Book of Abstracts
Contribution List      → /event/1338689/contributions/
Paper Submission
Surveys
Social Program / Kraków Tours
Organization, Program Committee and Conveners
The conference format
  └─ Call for Abstracts
Code of Conduct
The Venue & Travel directions
  ├─ The Venue Plan
  ├─ About Kraków
  ├─ Hotel suggestions
  └─ Visa Information
Exhibit & Sponsorship Prospectus
LOT - Polish Airlines - Official Event Carrier

Contact Program Chairs
  └─ chep2024-pc@cern.ch
```

**Key differences from ICHEP:**
- Has "Payment portal" as separate menu item
- "Book of Abstracts" built-in
- "Paper Submission" section
- "Surveys" section
- Travel/visa info as sub-menu
- Sponsorship prospectus page
- Contact section embedded in sidebar

### 2.3 Registration Page (CHEP 2024)

**URL:** `/event/1338689/registrations/`

**Multiple registration forms** displayed:

| Form Name | Opens | Closes | Action |
|-----------|-------|--------|--------|
| Proceedings Review | 19 Feb 2025, 11:27 | No deadline | **Register** (blue button, active) |
| Registration | 4 Apr 2024, 00:00 | 23 Sept 2024, 23:59 | **Apply** (gray, disabled/closed) |

**Key patterns:**
- **Multiple forms per event** — different purposes (main registration vs proceedings)
- **Two modes:** "Register" (direct) vs "Apply" (moderated)
- Open/close dates with precise timestamps
- Grayed-out button when form is past deadline

### 2.4 Timetable (CHEP 2024)

**URL:** `/event/1338689/timetable/#20241021`

**Day tabs:** Sun 20/10, Mon 21/10, Tue 22/10, Wed 23/10, Thu 24/10, Fri 25/10, **All days**

**"All days" tab** — unique to CHEP (not seen in ICHEP). Shows all days stacked.

**Action buttons:** Same as ICHEP — Print, PDF, Full screen, Detailed view, Filter

**Monday schedule structure (typical day):**
```
09:00-10:30  Plenary session: Mon plenary 1 (full width, dark blue)
             Convener: Katy Ellis
10:30-11:00  Coffee break (full width, gray)
11:00-12:30  Plenary session: Mon plenary 2 (full width, dark blue)
12:30-13:30  Lunch break (full width, gray)
13:30-15:18  7 PARALLEL TRACKS (color-coded columns):
             ├─ Track 3: Offline Computing (Room 1.A, Medium Hall A) — dark teal
             ├─ Track 5: Full Simulation (Large Hall A) — olive
             ├─ Track 3: Offline Computing [2nd] (Room 1.B, Medium Hall B) — dark teal
             ├─ Track 2: Online and real-time computing (Room 1.C, Small Hall) — tan
             ├─ Track 5: Analysis Tools (Large Hall B) — olive
             ├─ Track 6: Collaborative software (Room 2.A, Seminar Room) — gray
             └─ Track 8: Collaboration, Outreach, Education — dark blue
15:18-16:15  Poster session: Presentation with coffee (Exhibition Hall, green)
16:15-18:00  7 PARALLEL TRACKS (second round)
```

**Each parallel track column shows:**
- "Parallel (Track N): Topic Name"
- Convener name(s)
- Room name with building context (e.g., "Room 1.A (Medium Hall A)")
- Time range

**Key observation:** Same track can appear in **multiple columns** simultaneously (Track 3: Offline Computing had 2 parallel sessions).

---

## 3. FCC Week 2023 — Future Circular Collider Conference

### 3.1 Event Page Layout — DIFFERENT THEME

**URL:** `https://indico.cern.ch/event/1202105/`

**This conference uses the "meeting" display style**, which is fundamentally different from ICHEP/CHEP.

**Header:**
- Logo image + Title ("FCC Week 2023") side by side
- Date range, Venue, Timezone below
- Search box in top-right

**Top toolbar (meeting-style):**
- Navigation arrows: |< < ^ v > >| (first, prev, up, down, next, last)
- Layout/display toggle icons (grid, table, filter)
- "Back to Conference View" link
- Link/edit icons

**No custom banner image** — uses clean logo-based header.

### 3.2 Left Sidebar Menu (FCC Week 2023)

```
Overview               → /event/1202105/ (conference display)
Programme at a glance
Timetable              → /event/1202105/timetable/
Public event: Giant Experiments, Cosmic Questions
Early Career Researchers meeting
Industry Meeting
Call for Abstracts
Contribution List
Data privacy
Scientific Programme Committee
Organizing Committee

[Contact section]
fccw2023.secretariat@cern.ch
```

### 3.3 Registration & Participants (INLINE — Key Difference!)

In the meeting-style timetable view, registration and participants are shown **inline** at the top of the page (not on a separate page):

**Registration row:**
```
Registration    FCCW2023 Registration    👤 466 / 500    [Apply for participation]
```
- Registration form name shown inline
- **Capacity counter: 466 / 500** (current/max)
- "Apply for participation" button (green, moderated)

**Participants row:**
```
Participants    466    View full list
```
- Count shown inline
- "View full list" link → opens participant list page

### 3.4 Participant List Page

**URL:** `/event/1202105/registrations/participants`

**Layout:**
- "Participant List" heading
- "466 participants" count
- Registration form name: "FCCW2023 Registration" with person count icon
- **Sortable table** with columns:
  - Last Name (sortable ↕)
  - First Name (sortable ↕)
  - Home Institute (sortable ↕)
  - Home Institute (2) (sortable ↕)

**Key patterns:**
- Sorted alphabetically by first name by default
- Institutional affiliations include country codes (e.g., "FR-Paris, CNRS/IN2P3")
- "Aa - Not in the list" shown when institution not found in Indico database
- Multiple institute fields supported (primary + secondary affiliation)

### 3.5 Timetable — Meeting Style (Vertical List)

**URL:** `/event/1202105/timetable/`

This is a **completely different timetable layout** from the conference grid:

**Day headings:** Large uppercase centered text: "MONDAY 5 JUNE"
- Calendar icon with dropdown on the right

**Session blocks (vertical list):**
```
[08:30] → 10:25  Monday plenaries: Opening          📍 Orchard Suite
                  Convener: Ian Shipsey (University of Oxford (GB))

    [08:30]  Welcome address STFC                    ⏱ 15m
             Speaker: Mark Andrew Thomson
             🔗 Recording

    [08:45]  Introductory remarks                    ⏱ 20m
             Speaker: Fabiola Gianotti (CERN)
             📄 FCCweek-2023-L...  🔗 Recording
```

**Visual elements:**
- **Green time badge** for session start time
- **Gray time badge** for individual contribution start times
- Arrow (→) connecting start to end time
- Pin icon (📍) + room name right-aligned
- Clock icon (⏱) + duration right-aligned for talks
- Material attachments inline: PDF icons, presentation icons, "Recording" links

**Breaks:**
```
[10:25] → 10:55    Coffee break                     ⏱ 30m  📍 Sentosa suite
```
- Centered text in teal/green color
- Duration and room shown

**Key meeting-style features:**
- All days on single scrollable page (no day tabs)
- Calendar dropdown per day heading for navigation
- Individual talks shown with full detail inline
- Materials (PDFs, recordings) visible directly — no need to click through
- Speaker affiliations shown inline

---

## URL Routing Patterns (Critical for Next.js Implementation)

### Event-Level Routes
```
/event/{eventId}/                    → Event overview/home
/event/{eventId}/overview            → Overview page
/event/{eventId}/timetable/          → Timetable (default day)
/event/{eventId}/timetable/#YYYYMMDD → Timetable (specific day)
/event/{eventId}/timetable/#YYYYMMDD.detailed → Detailed view
/event/{eventId}/timetable/?view=nicecompact  → Compact theme
/event/{eventId}/timetable/?view=standard     → Standard theme
/event/{eventId}/timetable/?view=standard_inline_minutes
/event/{eventId}/timetable/?view=standard_numbered
/event/{eventId}/timetable/?view=indico_weeks_view
/event/{eventId}/contributions/      → Contribution list
/event/{eventId}/program             → Scientific programme
/event/{eventId}/registrations/      → Registration forms list
/event/{eventId}/registrations/participants → Public participant list
/event/{eventId}/manage/             → Management area
/event/{eventId}/page/{pageId}-{slug} → Custom page
/event/{eventId}/event.ics           → iCal export
```

### Category-Level Routes
```
/category/{categoryId}/              → Category listing
/category/{categoryId}/previous      → Previous event in category
/category/{categoryId}/upcoming      → Upcoming event in category
/category/{categoryId}/closest       → Closest event to today
/category/{categoryId}/overview?period=day  → Today's events
/category/{categoryId}/overview?period=week → Week's events
/category/{categoryId}/calendar      → Calendar view
/category/{categoryId}/statistics    → Category statistics
```

### Search Routes
```
/search/?q={query}&type=events       → Search events
/search/?q={query}&type=contributions → Search contributions
```

### Global Routes
```
/                                    → Home
/rooms/                              → Room booking
/login/                              → Login (redirects to CERN SSO)
/contact                             → Contact page
/tos                                 → Terms of service
```

---

## Key UX Patterns for G.I.C.A. Implementation

### 1. Two Timetable Display Paradigms

**Conference Grid (ICHEP/CHEP):**
- Horizontal day tabs + vertical time axis + parallel columns
- Color-coded session blocks
- Click-to-expand popups
- Best for: large conferences with many parallel tracks

**Meeting List (FCC Week):**
- Single scrollable page with all days
- Vertical session list with nested contributions
- Inline material attachments
- Best for: workshops/meetings with fewer tracks

### 2. Scalability Patterns (13+ Parallel Tracks)
- Columns abbreviate text when space is tight
- Color coding is essential for visual navigation
- Session legend/filter helps orient users
- Detailed view trades grid for individual talk cards
- Coffee breaks / lunch as full-width separators

### 3. Registration System Patterns
- Multiple registration forms per event (different purposes)
- "Register" (direct) vs "Apply" (moderated) modes
- Open/close dates with precise timestamps
- Capacity counters (466/500 format)
- Inline display in meeting-style view
- Separate page in conference-style view

### 4. Participant List Patterns
- Sortable table (Last Name, First Name, Institute)
- Multiple affiliation fields
- Total count prominently displayed
- Linked from registration section

### 5. Contribution Detail Patterns
- ID + Title + Presenter + Affiliation + Time + Track tags + Abstract
- Color-coded track badges
- Type badges (e.g., "Parallel session talk")
- Materials attached inline
- Searchable with filters

### 6. Custom Pages
- URL format: `/event/{id}/page/{pageId}-{slug}`
- Used for: accommodation, newsletters, instructions, sponsors, etc.
- Appear in sidebar navigation
- Support nested sub-pages
- Rich text content with images

### 7. Theme System
- Multiple display themes for timetable
- Conference vs Meeting display modes
- Customizable banner images
- Consistent sidebar across themes

---

## Authentication Patterns Observed

**CERN SSO Login Page:**
- Left panel: CERN account (username/password) + Kerberos
- Right panel: 
  - "Home Organisation - eduGAIN" (institutional login)
  - "Email - Guest Access" (email-based)
  - Social login: Google, GitHub, Facebook, LinkedIn
- URL: `auth.cern.ch/auth/realms/cern/protocol/openid-connect/auth`

**For G.I.C.A.:** Consider supporting multiple auth methods:
- Email/password (primary)
- Institutional SSO (SAML/eduGAIN equivalent)
- Social login (Google, GitHub)
- Guest access for viewing

---

## Search Page Patterns

**URL:** `/search/?q={query}&type=events`

**Layout:**
- Left sidebar: Category facets with counts (Home, Conferences, Workshops, etc.)
- Affiliation facets
- Main area: tabs for Events, Contributions, Materials, Notes, Categories
- Results with: title, description snippet (with keyword highlighting), date, location, category breadcrumb
- Sort: "Most relevant" dropdown

---

## Files Created
- `02-live-conference-ux-research.md` — This file (comprehensive UX analysis)
