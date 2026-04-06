# G_I_C_A Research Hub — Master Status

> All workers update this file. Master reads it to coordinate.

## Workers

| Worker | Target | Status | Last Updated |
|--------|--------|--------|--------------|
| worker-1-indico | Indico | **DONE** | 2026-04-05 |
| worker-2-pretalx | Pretalx | **DONE** | 2026-04-05 |
| worker-3-hievents | Hi!Events | pending | — |
| worker-4-frab | Frab | **DONE** | 2026-04-05 |
| worker-5-commercial | Commercial platforms | pending | — |

## UX Teardown Agents (14 Sessions) — All Complete

| # | Agent | Platform(s) | Status |
|---|-------|------------|--------|
| 1 | ux-whova | Whova | **done** |
| 2 | ux-sessionize | Sessionize | **done** (chrome-teardown.md written 2026-04-06) |
| 3 | ux-luma | Lu.ma | **done** (chrome-teardown.md written 2026-04-05) |
| 4 | ux-hubspot | HubSpot CRM | **done** |
| 5 | ux-certifier | Certifier.io | **done** (chrome-teardown.md written 2026-04-05) |
| 6 | ux-wati | WATI.io | **done** |
| 7 | ux-travel-accom | TravelPerk + AppCraft | **done** |
| 8 | ux-airtable | Airtable | **done** |
| 9 | ux-email-templates | Stripo + React Email | **done** |
| 10 | ux-rbac | Clerk + Retool | **done** |
| 11 | ux-cvent | Cvent | **done** |

## Synthesis

**FINAL_SYNTHESIS.md** — Complete. 14 modules + cross-module architecture + India adaptations + universal UX patterns.

## Notes

---

## Worker N — Frab Person Reuse Across Conferences (Deep Dive)
**Status:** Done
**Completed:**
- Full analysis of frab's Person data model and cross-conference reuse pattern
- Documented complete database schema (people, event_people, conference_users, availabilities, expenses, transport_needs, + all related tables)
- Analyzed Person model (global master record), EventPerson junction (roles + states), ConferenceUser (crew roles)
- Documented MergePersons service class — full deduplication/merge algorithm
- Analyzed search/autocomplete (Ransack multi-field search, dropdown lookup)
- Documented all 5 event roles and 7 role states
- Provided Drizzle ORM skeleton schema for GEM India replication
- Mapped frab concepts → GEM India equivalents

**Key Findings:**
- Person is GLOBAL — never scoped to a conference. One record per human.
- User (auth) ≠ Person (profile) — separate entities, 1:1 link. Person can exist without login.
- Roles live on junction table (event_people.event_role), not on person. Same person = speaker at one event, moderator at another.
- Role states track confirmation lifecycle per assignment (idea → offer → confirmed/declined/canceled).
- Merge-after-creation strategy (MergePersons service) rather than strict dedup at creation.
- Conference-scoped data (availability, expenses, transport) in separate junction tables with person_id + conference_id.

**Files Created:**
- `research-hub/worker-N-frab-person-reuse/frab-person-reuse-analysis.md` — Complete 400+ line analysis

**Timestamp:** 2026-04-05

---

## Worker N — CERN Indico UI Research (Live Site Browsing)
**Status:** Done
**Completed:**
- Browsed indico.cern.ch and explored 3 real conferences (ICHEP 2024, LHCP 2024, SM@LHC 2026)
- Documented full overview/event page structure with sidebar navigation (2 different conferences compared)
- Documented timetable views (compact + detailed) with parallel sessions, day tabs, filter bar, session popups
- Documented contribution list page with search, tags, card layout
- Documented registration page structure and form field types (from live site + Indico docs)
- Documented all URL/route patterns for every page type
- Created Next.js App Router route mapping and component hierarchy for replication
**Key Findings:**
- Indico uses flat routes under `/event/{id}/` — no deep nesting
- Timetable day switching uses URL hash fragments (#YYYYMMDD), detailed view appends .detailed
- Up to 14 parallel session tracks shown as side-by-side colored columns in a time-grid layout
- Session blocks show: track name, convener, room, time; clicking shows popup with contribution count
- Registration forms are behind login; form builder supports accommodation, payments, custom sections
- Participant lists are controlled by event managers — most large conferences don't expose them publicly
- Sidebar navigation is fully customizable per event (sections, sub-items, external links, tree connectors)
- Color coding is per session/track, assigned by event managers (14+ distinct colors observed)
- Timetable has toolbar: Print, PDF, Full screen, Detailed view, Filter
- Filter bar at bottom has Sessions dropdown, Rooms dropdown, Reset filter
- Contribution list shows 1265+ items with ID, title, speaker+affiliation, date, track/session tags, abstract preview
**Files Created:**
- `research-hub/worker-N-indico-research/indico-cern-ui-research.md` — Full 300+ line UI research document
**Timestamp:** 2026-04-05

---

## Worker 1 — Indico Documentation Deep Dive (indico.docs.cern.ch)
**Status:** Done
**Completed:**
- Systematically walked through every page of the Indico conference documentation at indico.docs.cern.ch
- Captured and documented 123+ production screenshots across all conference management pages
- Extracted complete text content from 8 major documentation pages
- Documented full navigation map of the site (14 conference sub-pages + Document Generation + other sections)
- Created detailed documentation for Registration Config (form builder, 16 field types, accommodation field, payments, invitations)
- Created detailed documentation for Timetable (40 screenshots, sessions/blocks/contributions/breaks, drag-and-drop, reschedule, poster sessions)
- Created detailed documentation for Session Management (types, coordinator vs convener roles, permissions)
- Created detailed documentation for Paper Peer Reviewing (44 screenshots, dual review process, teams, competences, deadlines)
- Created detailed documentation for Document Generation/Badges (HTML/Jinja2 template system, badge/certificate/receipt generation)
- Created detailed documentation for Programme/Tracks (track-based abstract classification)
- Created detailed documentation for Call for Abstracts (submission config, review questions, book of abstracts)
- Created comprehensive feature inventory and UI pattern analysis

**Key Findings:**
- Indico has 16 registration field types including special Accommodation (arrival/departure dates, hotel choices, room pricing, capacity) and Accompanying Persons
- Registration supports moderated, automatic, or invitation-only workflows with payment integration (Manual, PostFinance, PayPal, Bank Transfer)
- Timetable uses 4-level hierarchy: Sessions → Session Blocks → Contributions → Subcontributions
- Session blocks cannot span multiple days; parallel sessions shown as side-by-side columns
- Drag-and-drop for reordering + edge-drag for duration changes in timetable
- Paper reviewing has separate Content and Layout review tracks with custom rating questions
- Old Badges & Posters page replaced by Document Generation (HTML/Jinja2 templates, admin-only creation)
- Some documented URLs have changed: /conferences/registration/ redirects to /conferences/registration_config/, /conferences/papers/ is now /conferences/papers/peer_reviewing/

**Files Created:**
- `research-hub/worker-1-indico-docs/00-navigation-map.md` — Full site navigation structure
- `research-hub/worker-1-indico-docs/01-registration-config.md` — Registration form builder details
- `research-hub/worker-1-indico-docs/02-timetable.md` — Timetable creation and management
- `research-hub/worker-1-indico-docs/03-session-management.md` — Session types, roles, permissions
- `research-hub/worker-1-indico-docs/04-paper-peer-reviewing.md` — Paper submission and review workflow
- `research-hub/worker-1-indico-docs/05-document-generation-badges.md` — Template system for badges/certificates
- `research-hub/worker-1-indico-docs/06-programme-tracks.md` — Track definition for abstracts
- `research-hub/worker-1-indico-docs/07-call-for-abstracts.md` — Abstract submission and review
- `research-hub/worker-1-indico-docs/08-indico-comprehensive-summary.md` — Complete feature inventory and UI patterns

**Timestamp:** 2026-04-05

---

## Worker 2 — Pretalx Deep Research
**Status:** Done
**Completed:**
- Explored pretalx.com website: homepage, features page, pricing page, registration flow
- Explored DemoCon demo event: public schedule grid, sessions list, speakers page, session detail, CfP page, home page
- Extracted and analyzed full schedule JSON (Frab c3voc schema) with 35 talks, 2 rooms, 2 tracks
- Documented all talk object fields, room objects, track objects, day structure
- Analyzed GitHub repo: tech stack (Python/Django/Vue), 891 stars, 7670 commits, 159 contributors, v2025.2.2
- Research agents systematically documented all user guide sections (30KB) and API documentation (35KB)
- Downloaded full OpenAPI 3.0 schema (230KB)
- Created comprehensive platform overview (sections A-E), feature matrix, API notes, and verdict

**Key Findings:**
- pretalx is the gold standard for CfP-to-schedule pipeline (submission, review, scheduling, publishing)
- Schedule editor is the crown jewel: drag-and-drop grid, real-time conflict detection (speaker double-booking, room overlap, availability), version control with named releases
- Outbox-first email system prevents accidental mass-emails — all emails queued for review before sending
- Review system is highly flexible: weighted multi-category scoring, anonymisation, pending states for bulk accept/reject, phase-based workflow
- Schedule JSON uses Frab c3voc standard format — well-established, compatible with many conference tools
- NO registration, ticketing, or attendee features — deliberately out of scope (delegates to pretix)
- NO native mobile app, PWA, or offline capability
- NO push notifications, SMS, or WhatsApp — email only
- Pricing: EUR 199 for small events, free for testing, self-host for free (Apache 2.0)
- **Recommendation: Build custom (Option C), but heavily copy pretalx's design patterns for schedule editor, review workflow, email outbox, and JSON schema**

**Files Created:**
- `research-hub/worker-2-pretalx/platform-overview.md` — Sections A-E: overview, features, India fit, extensibility, gaps (11KB)
- `research-hub/worker-2-pretalx/feature-matrix.md` — Structured feature checklist with 100+ features (8KB)
- `research-hub/worker-2-pretalx/user-guide-notes.md` — Comprehensive notes from pretalx documentation (30KB)
- `research-hub/worker-2-pretalx/api-notes.md` — Full API documentation with JSON schemas (35KB)
- `research-hub/worker-2-pretalx/pretalx-schema.yml` — Complete OpenAPI 3.0 schema (230KB)
- `research-hub/worker-2-pretalx/verdict.md` — Recommendation summary with what to copy vs improve (7KB)

**Timestamp:** 2026-04-05

---

## Worker N — Fourwaves Platform Research (Live Browser Exploration)
**Status:** Done
**Completed:**
- Explored fourwaves.com marketing site: homepage, all 5 feature pages (Event Website, Registration & Payments, Abstract Management, Conference Program, Virtual Poster Sessions), pricing page
- Documented complete signup/event creation flow (wizard stepper: 6 fields → event name + date → Event Dashboard)
- Explored help.fourwaves.com: full Organizers section (75 articles), documented all article categories and key articles
- Read detailed help articles: Create your event, Add Sessions, Create rooms, Schedule overview
- Browsed live public event: 2026 CSA-SCS Annual Conference (event.fourwaves.com)
- Captured and documented both Grid and List schedule views with filters (Tracks, Tags, Rooms)
- Documented session detail page with nested presentations, session organizers/chair, personal agenda
- Documented complete pricing structure (4 tiers: Free/$0, Essential/$899, Advanced/$1,799, Pro/$4,799 + add-ons)
- Created comprehensive 500+ line research document covering all platform aspects
- Mapped complete data model, URL patterns, and help center structure

**Key Findings:**
- Fourwaves is an ALL-IN-ONE platform: website builder + registration + submissions + peer review + schedule + virtual platform — unlike pretalx (CfP only) or Indico (CERN-specific)
- Schedule uses 2-level hierarchy only: Session → Presentation (vs Indico's 4 levels)
- NO dedicated Speaker entity — speakers are submission authors; no invite/RSVP/confirmation workflow
- Schedule has DUAL views: Grid (room columns × time rows, color-coded by track) + List (chronological cards grouped by time)
- Personal agenda feature: attendees can bookmark sessions ("My agenda" tab)
- Tracks Management is PRO PLAN ONLY ($4,799/yr) — basic plans don't get color-coded tracks
- Rooms are created from within session edit form, not a dedicated room management page
- Conflict checker auto-detects double-booked speakers
- Drag-and-drop: accepted submissions dragged directly into schedule sessions
- Real-time sync — changes publish instantly (no draft/publish workflow for schedule)
- No schedule versioning (unlike pretalx's named releases)
- No WhatsApp/SMS/push — email only
- No native mobile app — responsive web only
- Payment processing: organizer connects their own Stripe/PayPal (Fourwaves doesn't hold funds)
- Bilingual support limited to English + French only

**Additional (Round 2 — Registration & Attendee Experience):**
- Explored 6 live public event registration forms (Photonics North, CSME, MSC-SMC, ISME, ASIC, CSA-SCS)
- Documented registration page layout: progress stepper (Form → Confirmation), sticky sidebar, deadline display
- Documented field variations across events: from minimal (4 fields) to complex (10+ fields with Title dropdown, address, country)
- Captured "My agenda" empty state for non-logged-in users (lock icon, login prompt)
- Confirmed personal agenda requires authentication; "All" schedule view is public
- Documented event-ended state, date-gated registration rates, payment badges (PayPal)

**Additional (Round 3 — Exports, Email, Certificates, Dashboard, Post-Event):**
- Schedule export: Word (list) + PDF (grid), simplified or detailed format; tracks NOT included in exports
- Submission file export: email with download link (7-day expiry), folder-per-submission or group-by-session
- Invoice export: individual PDF or bulk ZIP (2-5 direct, 6+ via email)
- Mass email: 3-step flow (select → compose with variables → confirm), 6 personalization variables, 3 recipient types (submitters/presenters/non-presenting authors)
- Email tracking: 6 statuses (Delivered/Deferred/Bounce/Dropped/Processed/Unprocessed) via Event Data → Communications
- Certificate generation: inline editor (landscape/portrait, logos, signatures, form variables), email or PDF download, error detection (empty values, overflow)
- Dashboard: 4 sections (Overview/Configuration/Website Pages/Data), 3 role views (Organizer/Participant/Reviewer)
- Post-event: websites stay online permanently, data accessible on free plan, premium features disabled when plan expires
- Event cloning: copies website/forms/settings/branding but NOT data/emails/schedule/payments

**Files Created:**
- `research-hub/worker-N-fourwaves/fourwaves-platform-research.md` — Complete 1000+ line UX teardown (3 rounds of research)

**Timestamp:** 2026-04-06 (round 3 complete)

---

## Worker 1 — Live Conference UX Research (indico.cern.ch browsing)
**Status:** Done
**Completed:**
- Browsed 3 real production conferences on indico.cern.ch via Chrome browser automation
- ICHEP 2024 (event/1291157): 8-day, 13+ parallel tracks, 1265 contributions — largest physics conference
- CHEP 2024 (event/1338689): 7-day computing conference, 7 parallel tracks, multiple registration forms, poster sessions
- FCC Week 2023 (event/1202105): 5-day meeting, 466/500 participants, inline registration, public participant list
- Documented two distinct timetable paradigms: conference grid (day tabs + parallel columns) vs meeting list (vertical scrollable)
- Captured detailed view with individual contribution cards, session legend, filter system
- Documented contribution list (1265 items), scientific programme (numbered tracks), participant list (sortable table)
- Mapped all URL routing patterns for Next.js replication
- Documented registration page patterns: multiple forms, Register vs Apply modes, capacity counters
- Captured authentication patterns (CERN SSO with social login, eduGAIN, guest access)
- Documented search page with category facets and result tabs

**Key Findings:**
- Two timetable paradigms: conference grid (ICHEP/CHEP) for 13+ parallel tracks vs meeting list (FCC Week) for sequential display
- Timetable day switching uses hash fragments (#YYYYMMDD), detailed view uses #YYYYMMDD.detailed
- CHEP uniquely has "All days" tab alongside individual day tabs
- Session popups show: title, block name, time, session label, contribution count (green badge)
- Detailed view replaces session blocks with individual color-coded contribution cards + session legend
- Multiple registration forms per event supported (CHEP: "Registration" + "Proceedings Review")
- Two registration modes: "Register" (direct) vs "Apply" (moderated)
- Capacity counters shown inline in meeting-style (466/500 format)
- Participant list: sortable table with Last Name, First Name, Home Institute, Home Institute (2)
- Custom pages use /event/{id}/page/{pageId}-{slug} URL pattern
- Sidebar menu is fully customizable: mix of built-in pages, custom pages, external links, nested sub-items
- Conference themes selectable: Compact, Indico standard, numbered, inline minutes, weeks view

**Files Created:**
- `research-hub/worker-1-indico-docs/02-live-conference-ux-research.md` — Comprehensive 500+ line UX analysis of 3 live conferences

**Timestamp:** 2026-04-05
