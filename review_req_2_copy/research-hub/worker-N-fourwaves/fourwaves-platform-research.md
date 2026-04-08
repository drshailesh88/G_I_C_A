# Fourwaves Platform Research — Complete UX Teardown

> **Worker N — Fourwaves Deep Research**
> Date: 2026-04-05
> Method: Live browser exploration of fourwaves.com, help.fourwaves.com, and public event sites (event.fourwaves.com)

---

## A. Platform Overview

**What is Fourwaves?**
- Commercial SaaS conference management platform specifically for academic/scientific events
- Tagline: "The Conference Software for Research Organizations"
- Montreal-based company (French + English bilingual support)
- URL structure: `fourwaves.com` (marketing), `dashboard.fourwaves.com` (admin), `event.fourwaves.com/{acronym}` (public event sites)

**Target Market:** Academic conferences, scientific symposiums, research events
- Trusted by: Stanford, MIT, NASA, NIH, AAAS, BASF, Columbia University Medical Center, University of Florida, Harvard Medical School, McGill, Uppsala Universitet, etc.

**Core Feature Modules (from Features dropdown):**
1. Event Website — drag-and-drop website builder
2. Registration & Payments — forms, pricing tiers, payment gateways
3. Abstract Management — submission forms, decisions, booklets
4. Peer Reviews — reviewer portal, scoring, assignments
5. Conference Program — schedule builder, sessions, rooms, tracks
6. Virtual Poster Sessions — virtual event platform

---

## B. Pricing

| Plan | Price/yr (USD) | Key Inclusions |
|------|---------------|----------------|
| **Free** | $0 | Unlimited events, unlimited registrations, 25 abstract submissions, ready-to-publish website, 3% service fee |
| **Essential** | $899 | 1 active event, 100 submissions, email communication, rich website content, name tags generator, 3% fee |
| **Advanced** | $1,799 | 1 active event, 200 submissions, unlimited website pages, premium headers, certificates, launch support, 3% fee |
| **Pro** | $4,799 | 1 active event, unlimited submissions, tracks management, VIP support, white-labeled website, peer-review module, video recordings, 2.5% fee |

**Add-ons (per active event):**
- Peer-Review Module: $899
- Virtual Platform: $1,099
- Unlimited Submissions: $599
- Video Recordings: $599

**Notes:**
- 3-year term saves 10% and locks price
- Currency options: USD, CAD, EUR
- "Active event" = published and end date not yet passed; can hold 12 events/year (one at a time)
- Service fees apply on top of subscription
- Payment methods: credit card or bank transfer/invoice
- Custom plans available for multiple events, PCOs, university departments

---

## C. Event Creation Flow

### C1. Signup (New User)
**URL:** `dashboard.fourwaves.com/get-started`
**Title:** "Let's unlock your Fourwaves experience"
**Subtitle:** "Just a few details so we can tailor your workspace"

**Form Fields (Step 1 — wizard/stepper format):**
| Field | Type | Required |
|-------|------|----------|
| First name | text input | Yes (*) |
| Last name | text input | Yes (*) |
| Email (Work or Academic) | text input | Yes (*) |
| Phone number | text input | No |
| Which best describes your role? | dropdown ("Select an option") | Yes (*) |
| Organization name | text input (placeholder: "Department of Biology, McGill University") | Yes (*) |

**Buttons:** "< Back" (left), "Next" (right, purple filled)
**Navigation:** Multi-step wizard (stepper), not one big form
**Footer:** "Terms of service · Privacy policy"

### C2. Create New Event (Existing User)
1. Log in to `dashboard.fourwaves.com`
2. From user dropdown → click "Organizer"
3. In Organizer dashboard → click "+ New Event" button (purple)
4. Enter: **event name** + **start date** (that's it — minimal creation)
5. Redirected to Event Dashboard

### C3. Organizer Dashboard (Organization Level)
**Top bar:** Fourwaves logo | Organization name ("Department of Biology, Université de Sherbrooke") | "Switch Organization" | "Upgrade" | Language (English) | Profile avatar

**Left sidebar navigation:**
- Events (main section)
- Users
- Plan & Billing
- Finances (expandable)
- Settings

**Events list view:**
- **Filter tabs:** All · Drafts · Active · Past (with counts)
- **Search bar**
- **"+ New Event" button** (top right, purple)
- **Table columns:** Event name | Date ↑ | Registrations | Submissions | Status
- Status values: Draft, Active, Past

---

## D. Event Dashboard (Event Level)

Once inside an event, the admin dashboard has these sections accessible via **Website Pages > Schedule** path and other sidebar sections.

**Key Admin Sections (from help center article list):**

### Event Settings
- Define the event's reference timezone
- Manage a multilingual event (English/French)
- Define your event's acronym (creates short URL)
- Event Assistant (AI helper)

### Organizer Access
- Add an Organizer to Your Event (multi-user access)

### Setting Up Payments
- Link an event to a payment gateway (Stripe, PayPal — organizer's own account)
- Help Participants Enter the Correct Billing Information
- Activate payments by invoice (bank transfer option)
- Edit billing information and tax IDs
- Create, edit and delete coupon codes
- Pass Fourwaves service fees to participants

### Data Tables
- Mass Edit (bulk operations)
- Select Column Visibility

### Generate Certificates
- Custom certificates with event info, presenter name, presentation title, logos, signatures

### Decisions
- Create, edit and delete presentation types
- Change the decision of one or more submissions (accept/reject)

---

## E. Program/Schedule Builder (Admin Side)

### E1. Adding Sessions
**Path:** Event Dashboard → Website Pages → Schedule → "Add session"

**Session creation fields:**
- Name (text)
- Description (text/rich text)
- Date (date picker)
- Time range (start time – end time)
- Room (dropdown — select existing or "Create Room")
- Track (dropdown — if Tracks Management feature enabled, Pro plan)
- Video recording (drag-and-drop .mp4 upload, plan-dependent)

**Save button** → session appears in schedule grid

**Key behaviors:**
- Sessions can be edited or deleted at any time
- No wizard for sessions — simple form
- Sessions are the top-level container; presentations nest inside them

### E2. Creating Rooms
**Path:** Edit a session → scroll to "Room" section

**Room creation UI:**
- Room dropdown with existing rooms
- "Create Room" link below dropdown
- Pencil icon to edit existing room
- Delete option available

**Room fields:**
- Name (text)
- Livestream link (optional — can link to Zoom, etc.)
- Rooms are reusable across multiple sessions

**Key insight:** Rooms correspond to physical locations OR virtual rooms (linked to Zoom/livestream). They create the column headers in the grid view.

### E3. Adding Presentations to Sessions
**Path:** Event Dashboard → Website Pages → Schedule → click "Add presentation" on a session card

**Step-by-step flow:**
1. On the schedule page, click **"+ Add presentation"** on a session card
2. A submissions data table opens — select submissions to add (checkbox)
3. Toolbar shows: "2 selected", "Select all 15", Contact, Assign reviewers, **"+ Add to session"**
4. Click "+ Add to session" → session selection dialog appears (radio buttons listing all sessions with dates/times)
5. Select session → click Next → click "Add to session"
6. Redirected back to schedule page

**Session card UI shows:**
- Session time range (08:00 - 11:00)
- Room icon + room name
- Edit (pencil) and delete (trash) icons
- Track badge ("Assign track" button if none)
- Session title + description
- "Presentations (N)" count at bottom
- **"+ Add presentation"** button

**Removing presentations:**
- "Remove all" link on session card
- Individual trash icons per presentation
- Can also remove from a "quick view side panel" that shows all sessions a submission is in

**Key behaviors:**
- Presentations are nested INSIDE sessions (2-level hierarchy: Session → Presentation)
- Title, authors, abstract **auto-sync** from submission data — no re-entry needed
- Once placed in schedule + published, presenters can log in to see when they're presenting
- Conflict checker detects double-booked speakers
- Presentations inherit the session's room and date
- **Note:** If the Presentations page is not visible on the event website, presentations in schedule will also be hidden

### E4. Setting Presentation Times
**Path:** Edit session → side panel → "Presentation times" dropdown

**Two modes:**
1. **Equal length** — auto-splits session time across all presentations (e.g., 2hr session / 4 presentations = 30 min each)
2. **Unequal length** — set custom duration per presentation (clickable duration badges: "30 minutes", "40 minutes", etc.)

**Session edit side panel fields:**
- Presentation times: Equal length / Unequal length (dropdown)
- Room (dropdown with edit pencil + "Create Room" link)
- Track (dropdown)
- Video Recordings (drag-and-drop upload, max 1 GB)

**Reordering presentations:**
- Drag handles (6-dot grip icons) on each presentation for manual reorder
- Only available when presentation times are set (equal or unequal)
- Without presentation times, presentations ordered by submission ID
- Can manually change submission IDs via Data → Submissions

### E5. Schedule Tags
- Custom tags can be created and applied to sessions
- Tags appear as filterable labels
- Session types like "Research Cluster Meeting", "Panel", etc.

### E6. Tracks Management (Pro plan feature)
**Path:** Event Dashboard → Configuration → Tracks

**Creating tracks:**
1. Navigate to Configuration → Tracks
2. Click "Add Track"
3. Enter track **name** (e.g., "Coastal Ecosystems & Coral Reefs") and choose a **colour**
4. Colour identifies sessions of that track in schedule view

**Track detail view shows linked elements:**
- Track Chairs (count)
- Sessions (count)
- Reviewers (count)
- Submissions (count) — with "View the full list in Submissions" link

**Track Chair Role (delegation feature):**
Track Chairs have scoped permissions limited to their assigned tracks:
- **Submissions:** View only their track's submissions, send emails, edit, export
- **Peer Review:** Assign reviewers (only track-associated), make decisions, contact reviewers, edit/export reviews
- **Program:** View all sessions but edit only their track's sessions, edit session details, presentations, and times

**Submission form integration:**
- Add a "Tracks" field to submission form
- Submitters can select one or multiple tracks
- Deletion warning: removing Tracks field from form deletes all track data from existing submissions

**Assigning tracks to sessions:**
- Edit session → Track dropdown in side panel
- Sessions auto-display the track's colour
- Participants can filter sessions by track in public schedule

**Delete restriction:** Cannot delete a track if linked to track chairs, sessions, reviewers, or submissions

### E7. Schedule Views (Admin)
- Grid view with rooms as columns, time as rows
- Drag and drop to reorder presentations within sessions
- Conflict detection (double-booked speakers, overlapping sessions)
- Schedule mass export

### E8. Schedule Mass Export
- Export full schedule data
- Booklet generation (Word .docx or PDF format)
- Can export just abstracts, just program, or both

---

## F. Public Schedule Views (Attendee-Facing)

### F1. Schedule Page Layout
**URL pattern:** `event.fourwaves.com/{acronym}/schedule`

**Page header:**
- Title: "Schedule"
- Timezone note: "* All times are based on [timezone]"
- Tabs: "All" | "My agenda" (personal bookmarks)

**Controls bar:**
- Search: "Search by session title, topic, or other"
- View toggles: **Grid** | **List** (icon buttons)
- **Filters** button (orange, opens filter panel)

**Filter panel (3 dropdowns):**
- Tracks: "Any" (dropdown)
- Tags: "Any" (dropdown)
- Rooms: "Any" (dropdown)

**"Happening now" pill** — quick filter for current sessions

### F2. Day Navigation
- Day tabs: horizontal row of day cards showing day name + date
- Example: Monday June 1, Tuesday June 2, ..., Friday June 5
- Arrow button (→) for events with more than 5 days
- Selected day highlighted with orange border

### F3. Grid View
- **Room columns** as headers (e.g., "Virtual Zoom Room 1", "Room A", "Seminar Room 2118")
- **Time axis** on the left (12:00 PM, 1:00 PM, etc.)
- **Session cards** as colored blocks positioned in the grid
- **Card content:** Time range + session code + title
- **Color coding:** Per track — different background colors (light blue, dark blue, green, gray, pink, orange)
- **Left border accent:** Colored left border stripe on each card
- **Horizontal scroll** when many rooms exist (6+ rooms observed)
- Cards are proportional to time duration

### F4. List View
- Sessions grouped by time slot
- **Time group header:** "12:00 PM" with "6 parallel sessions" count badge
- **Session cards (vertical list):**
  - Time range (12:00 PM - 1:00 PM)
  - Room name (dot separator)
  - Track tag (colored pill, e.g., "(ANS) Animals in Society Research Cluster" in orange)
  - Session title (bold)
  - Description preview (truncated)
  - Session type tag (e.g., "Research Cluster Meeting")

### F5. Session Detail Page
**URL pattern:** `event.fourwaves.com/{acronym}/schedule/{session-uuid}`

**Session header:**
- Clock icon + Date, time range, timezone (e.g., "June 12th, 2026, 3:30 PM - 5:00 PM ADT")
- Pin icon + Room name (e.g., "Seminar Room 2118")
- Track tag (colored pill with track name)

**Session body:**
- Session title (large heading)
- Full description (multi-paragraph)
- **Session Organizers:** Name, University; Name, University (comma-separated list)
- **Session Chair:** Clickable name link, University

**Action buttons:**
- "Add to my agenda" (orange, with calendar icon)
- "Export to calendar" (gray outline)

**Presentations section:**
- "Presentations (N)" heading with count
- Each presentation card:
  - Submission ID badge (e.g., "SOM1-1")
  - Comment count icon + count
  - Bookmark icon
  - Presentation title (bold, clickable)
  - Abstract preview (truncated)
  - Author name (with avatar)

---

## G. Speaker/Presenter Management

### G1. How Speakers Work in Fourwaves
- Fourwaves does NOT have a separate "Speaker" entity/module
- Speakers are **submission authors** who have been accepted
- The flow: Author submits abstract → peer review → acceptance decision → presentation placed in schedule
- Speaker profile data comes from the **submission form fields** and **registration data**

### G2. Speaker Profile Fields (from submission form)
- Submission title
- Submission authors (name + role tag "Presenter" + institution)
- Abstract text
- Poster/slides/video uploads
- Custom fields via form builder

### G3. Adding Speaker Photos and Bios (IMPORTANT: Two Separate Systems!)
**Path:** Event Dashboard → Website Pages → [any page] → Add block → "Speakers" content block

**The "Speakers" content block is STATIC/MANUAL — NOT linked to schedule or submissions.**

**Adding a Speaker Content Block:**
1. Go to the page → click "Add block"
2. Select "Speakers" content block
3. Click text to update name/bio
4. Click pencil icon to upload headshot image
5. "Add Item" to add more speakers
6. "Move Up" / "Move Down" arrows to reorder
7. Crop button to adjust images

**Speaker block fields (per entry):**
- Name (text)
- Affiliation / Organization (text)
- Headshot (image upload with crop)
- Biography (text)

**Rendered layout:** Vertical stack of speaker entries, each with square photo on left + name, affiliation, bio on right

**CRITICAL INSIGHT:** This speaker content block has NO connection to the schedule or submission system. It is purely a visual/informational website element. There is NO unified "speaker profile" that connects a person's bio/photo to their scheduled presentation. These are completely independent features.

### G4. Linking Speakers to Sessions
- When a presentation (from accepted submission) is added to a session, the author is automatically linked
- Speaker appears on the session detail page
- Conflict checker detects if same speaker is in overlapping sessions

### G5. Speaker Roles
**Session-level roles observed in public events:**
- **Session Organizers** — listed with name + university
- **Session Chair** — single person, clickable profile link + university
- **Presenters** — within nested presentations, shown as authors

**Submission-level roles:**
- Author (with "Presenter" tag)
- Co-authors

### G6. Speaker Communication
- Mass email tool with recipient filtering
- Can email presenters of specific sessions
- Email communication status tracking (sent, delivered, etc.)
- Notification to presenters when session changes or conflicts

### G7. No Dedicated Speaker Invite Flow
- No speaker invitation/confirmation workflow like Indico's role states
- Speakers are created through the submission pipeline, not invited separately
- Session organizers/chairs appear to be manually assigned

---

## H. Event Website Builder

### H1. Website Structure
**Public event URL:** `event.fourwaves.com/{acronym}`

**Default navigation bar items (observed on CSA-SCS 2026):**
- Home
- Registration
- Program (dropdown): Preliminary Program, Schedule, Plenary, Publisher Engagement, Presentations, Participants, Virtual Sessions, Submission Review Results
- Participation (dropdown)
- Overview (dropdown)
- Plan Your Trip
- Awards
- Session Organizer Info
- EN (language switcher)
- Log in

**Key:** Navigation is fully customizable — organizers can add/remove/rename pages and create page groups (dropdowns)

### H2. Website Builder Features
- Drag-and-drop content editor
- Real-time updates (instant publish)
- Mobile-optimized (responsive)
- Multilingual support (English + French)
- Custom pages and page groups
- Rich content blocks: text, images, videos, sponsor logos, speaker bios
- Banner headers (customizable)
- Participant-only content (gated)
- White labeling (Pro plan)
- Event duplication (clone previous website)
- Archives (sites remain online permanently)
- Custom domain redirect (not native custom domain — but acronym-based short URLs)

### H3. Content Block Types
- Text blocks
- Image blocks with cropping
- Video embeds
- Sponsor logos
- Speaker photos and bios
- File downloads
- Banner headers (premium/custom)
- Registration/submission form embeds (integrated)

---

## I. Registration System

### I1. Registration Admin Setup
**Path:** Event Dashboard → Website Pages → Registration → Settings

**Registration period settings:**
- Set registration start and end dates
- Set maximum number of participants (toggle + number input, e.g., max 500)
- Participant profile visibility (per-registrant toggle via pen icon in Event Data → Registrations → Public Profile column)

### I1b. Form Builder
**Path:** Website Pages → Registration (form editor)

- Drag-and-drop field builder
- Field types: text, multiple choice (dropdowns, checkboxes), file uploads, custom fields
- Conditional logic (show/hide fields based on responses)
- Form sections (groupable, with custom section headers like "Contact Information", "Registration Rates")
- Capacity limits per item
- Availability dates (auto open/close, date-gated sections like "Opens in January 2026")
- Mandatory field enforcement (asterisk * indicator)
- Helper text per field (e.g., "(Please use the address you need on your invoice)")
- Custom field labels (organizer-defined)
- Built-in country dropdown (ISO 3166-1, 200+ countries)
- Title/salutation dropdown (optional: Mr/Ms/Dr/Prof)
- Rich text instruction blocks within the form

### I2. Pricing
- Early-bird / Regular / Late pricing tiers
- Automatic date-based price switching
- Per-item costs (registration types, gala dinners, workshops, etc.)
- Coupon/promo codes
- Member/non-member rates
- No limit on registration types or add-ons

### I3. Payments
- PCI-compliant processing
- Payment gateways: Organizer connects their own Stripe or PayPal account
- Funds go directly to organizer (Fourwaves doesn't hold funds)
- Invoice/bank transfer option
- Credit card option
- Detailed invoices with line items, tax breakdown
- Full/partial refund support
- Real-time revenue and tax reporting (CSV export)
- Compatible with university FOAPAL/cost-center workflows

### I4. Attendee Management
- Waitlist management
- Name badge generator (auto-generated from registration data)
- Certificate of attendance (auto-distributed)
- Registration data linked to presenter profiles
- Spot unregistered presenters and follow up
- On-site check-in lists
- Clone/tweak forms mid-cycle (existing registrants preserved)
- Participants can self-edit registrations

### I5. Live Registration Form Examples (from public events)

**Common page layout (all events observed):**
- **Page title:** "Registration" or "Registration Form"
- **Registration deadline** shown below title (e.g., "Registration deadline is May 27, 2026")
- **Progress stepper:** Form (active dot) → Confirmation (gray dot) — 2-step flow
- **Right sidebar (sticky):** "Register" button (event-themed color), contact email, "Already registered? Log in" section
- **"POWERED BY Fourwaves"** banner at bottom left (on free/lower plans)

**Observed registration form fields (across multiple live events):**

| Event | Fields Observed |
|-------|----------------|
| **Photonics North 2026** | Title (dropdown: Mr/Ms/Dr/Prof), First name*, Last name*, Address* (with helper text "for invoice"), Organization*, City*, Zip code*, Country* (dropdown with 200+ countries), Phone*, Email* |
| **CSME-CFDSC-CSR 2026** | First name*, Last name*, Email*, Confirm email*, Phone number |
| **MSC·SMC 2026** | First name*, Last name*, Email*, Confirm email*, University or Institution*, Country*, Province* + "Registration Rates" section with "Opens in January 2026" date-gated |
| **ISME 2026** | First name*, Last name*, Email*, Confirm email* (minimal) |
| **ASIC 2026** | Confirm email*, Company/Organization (for name badge)*, Country* (dropdown) + detailed registration info text block |
| **CSA-SCS 2026** | Behind login — instructions only visible without auth |

**Key observations:**
- Forms vary dramatically per event — organizers have full control over fields
- Some forms show pricing tiers behind date gates ("Opens in January 2026")
- Payment badges shown: "Payment secured by PayPal™" on some events
- Custom helper text per field (e.g., "(Please use the address you need on your invoice)")
- Custom field labels (e.g., "Company/ Organization (for name badge)")
- Country field uses ISO 2-letter codes dropdown with 200+ countries
- Title/salutation dropdown is optional (not all events use it)
- Registration instructions can include rich text with links (conference policies, funding programs)
- Some events gate registration behind login (CSA-SCS)
- "The event has ended" message shown for past events with "Login to access your registrations" link

### I6. Attendee Schedule Experience

**Schedule page features for attendees:**
- **"All" tab** — shows full schedule (grid or list view), accessible without login
- **"My agenda" tab** — personal bookmarked sessions
  - **Not logged in:** Shows empty state with lock icon, "Log in to view your agenda", "Access your personalized schedule and keep track of sessions and presentations you've added", "Log in" button
  - **Logged in:** Shows only sessions the attendee has bookmarked via "Add to my agenda" button
  - URL pattern: `/schedule/agenda`
- **Session detail page** has "Add to my agenda" + "Export to calendar" buttons
- **Presentation cards** on session detail page have bookmark icons
- **Search** works on session titles, topics, and other text
- **Filters** (Tracks, Tags, Rooms) work in both Grid and List views

---

## J. Abstract Submission & Review

### J1. Submission Form
- Highly flexible form builder (same drag-and-drop as registration)
- Fields: title, authors, abstract text, topic/track selection, file uploads (Word, PPT, PDF, images, videos)
- Conditional logic for different submission types
- Separate deadlines per submission type
- Authors can edit submissions after initial submission
- Multi-format file uploads

### J2. Peer Review
- Custom review form creation
- Reviewer portal (dedicated interface)
- Review criteria: Custom scoring questions (observed: "Relevance for the conference" 4/5, "Quality of information presented" 3/5, "Quality of the results" 9/10)
- Reviewer assignment engine
- Progress tracking
- Share review results to authors

### J3. Decisions
- Presentation types: Create custom types (oral, poster, etc.)
- Bulk accept/reject
- Acceptance notifications via email
- "Withdrawn" status for last-minute cancellations

### J4. Abstract Booklet
- Auto-generated .docx booklet
- Customizable formatting
- Author index
- Images included
- Export in Word or PDF
- Can export abstracts only, program only, or both

---

## K0. Exports & Data Management

### K0.1 Schedule Export
**Path:** Website Pages → Schedule → Export button (top right)

**Two file formats:**
| Format | Layout | Content |
|--------|--------|---------|
| **Word (.docx)** | List view — sessions and presentations listed sequentially | Text-based, printable |
| **PDF** | Grid format — parallel sessions displayed side-by-side | Visual grid, printable |

**Two detail levels:**
- **Simplified:** Sessions only, no additional details
- **Detailed:** Sessions + presentations with presenter name and affiliation

**Limitation:** Tracks are NOT displayed in any export format

### K0.2 Submission Files Export
**Path:** Event Data → Submissions → Actions → Export Submission Files

- Exports all submission files (posters, slides, etc.)
- Delivered via email with download link (expires after 7 days)
- Default: one folder per submission with all associated files
- Option: "Group Submissions by Session" to organize by session folders
- Size limit: if export > 500 MB, must wait 1 hour before next export

### K0.3 Data Table Exports
- Registration data exportable from Event Data → Registrations
- Submission data exportable from Event Data → Submissions
- Column visibility customizable (show/hide columns)
- Export to Excel/CSV (standard data table export)
- Filtered subsets: yes — use filters/search before exporting

### K0.4 Invoice Exports
**Path:** Event Data → Transactions

**Two access methods:**
1. By Transaction: Click Transaction ID → View invoice
2. By Registration: Click registrant name → View Invoice in Transactions section (only visible if payment was made)

**Bulk download behavior:**
- 1 invoice: downloads immediately as PDF
- 2-5 invoices: auto-packaged as ZIP file
- 6+ invoices: sent via email as ZIP file
- PDF naming follows Transaction ID convention
- Export temporarily blocked while processing

---

## K0b. Email & Communications

### K0b.1 Sending Mass Emails
**Path:** Event Data → [Submissions/Registrations/Reviews] → Select entries → Contact

**Step-by-step flow:**
1. Filter/search to find recipients
2. Select individuals or "Select all X" (across all pages)
3. Click "Contact"
4. Compose subject line + message body
5. Insert personalization variables (click "Variables" button)
6. Add attachments
7. Click "Next" → confirm → send

### K0b.2 Email Variables (Personalization)

**Common to all tables:**
- Event Name, Event Start Date, Event End Date
- User Profile Link
- First Name, Last Name

**Submission-specific:**
- Event Website Link, Submission Number
- Submission Form Link, Submission Title
- Presentation Time and Room

**Registration-specific:**
- Event Website Link, Registration Form Link

**Review-specific:**
- Reviewer First Name, Reviewer Last Name
- Reviewer Dashboard Link

**Note:** All links redirect through account activation page if never activated; otherwise require login.

### K0b.3 Email Recipient Targeting (Submissions)
Three recipient types for submission emails:
1. **Submitters** — the person who submitted the form
2. **Presenters** — those designated as presenters in the authors field
3. **Non-presenting authors** — any authors not presenting

No default selected — organizer must explicitly choose.

### K0b.4 Email Status Tracking
**Path:** Event Data → Communications

**Six statuses:**
| Status | Meaning |
|--------|---------|
| **Delivered** | Receiving server accepted (but may go to spam) |
| **Deferred** | Receiving server delayed acceptance temporarily |
| **Bounce** | Receiving server denied (e.g., email doesn't exist) |
| **Dropped** | Never reached receiving server (spam filter or unsubscribed) |
| **Processed** | Sending triggered, awaiting final confirmation |
| **Unprocessed** | Pre-Dec 2021 emails OR pending delivery |

Click email subject for detailed failure explanations.

### K0b.5 Automated Emails
- Registration confirmation emails (customizable)
- Submission confirmation emails
- Decision notification emails (accept/reject)
- Session change alerts to presenters
- Certificate distribution emails (see below)

---

## K0c. Certificates

### K0c.1 Certificate Generation
**Path:** Event Data → [Registrations or Submissions] → Select entries → Actions → Generate Certificates

**Scope:**
- For registrations: one certificate per registrant
- For submissions: one certificate per presenter

### K0c.2 Certificate Editor

**Page & Layout:**
- Format: US Letter
- Orientation: Landscape or Portrait
- Alignment: Left/Center (horizontal), Top/Middle (vertical)

**Branding:**
- Logos: 0, 1, or 2 logos; each in standard or compact size
- Signatures: up to 2 signature blocks with text fields for name/title

**Content:**
- Inline text editor with 6 font sizes (3 title + 3 text sizes)
- Bold, italic, underline formatting
- **Form variables** that auto-replace with each recipient's data (e.g., name, presentation title, event name)

### K0c.3 Templates
- Each event saves 2 templates: one for registrations, one for submissions
- Email subject and message from Distribution step also saved

### K0c.4 Preview & Error Detection
- Browse certificates by scrolling or searching by name
- Filter to show only certificates with issues
- Two issue types detected:
  - **Empty Variable Values** — missing form data
  - **Content Overflow** — text exceeding boundaries

### K0c.5 Distribution

**Two methods:**
1. **Send by Email** — define subject + message; certificate attached individually to each recipient
2. **Download as PDF** — generates one PDF per certificate, delivered as .zip via email

### K0c.6 Confirmation
Final step shows certificate count + unique recipient count before execution.

---

## K0d. Dashboard & Analytics

### K0d.1 Event Dashboard Structure
**Path:** dashboard.fourwaves.com → click event name

**Four main sections:**
1. **Dashboard Overview** — general event statistics and performance metrics at a glance
2. **Configuration** — event title, location, dates, team access, banner/colors, bank accounts, partner logos
3. **Website Pages** — edit all event website pages and content
4. **Data** — access comprehensive event information and attendee data

### K0d.2 User Dashboard Roles

**Three role views (accessible via profile picture → Dashboard roles):**

**1. Organizer Dashboard:**
- Events categorized: Drafts | Active | Past
- Click event → detailed event dashboard

**2. Participant Dashboard:**
- Events: events participated in as registrant or submitter
- Submissions: all submissions
- Registrations: all registered events
- Transactions: all payment transactions

**3. Reviewer Dashboard:**
- Events assigned as reviewer (regardless of active reviews)

### K0d.3 Event Statistics
- Registration counts (visible on organizer event list)
- Submission counts (visible on organizer event list)
- Downloads statistics available (dedicated feature)
- No real-time charts/graphs documented — appears to be primarily numerical counters
- Revenue/tax breakdowns available in Transactions section (CSV exportable)

---

## K0e. Post-Event & Archiving

### K0e.1 Event States
| State | Description |
|-------|-------------|
| **Unpublished (Draft)** | Visible only to organizers; ideal for editing before going live |
| **Published (Active)** | Publicly accessible; participants can view and interact |
| **Past** | End date has passed; event moves to "Past" filter in organizer dashboard |

**Key behaviors:**
- Events can be edited even after publishing
- Only organization administrators can publish events
- Publishing makes the URL fully functional

### K0e.2 Post-Event Data Access
- Event websites remain accessible online permanently (plan-independent)
- All data (registrations, submissions, reviews, transactions) remains accessible
- Past events accessible via Organizer Dashboard → "Past" tab
- Premium features disabled when plan expires: sending emails, editing content, receiving new submissions
- Event data and website stay accessible on the free plan after expiry

### K0e.3 Event Cloning (for recurring events)
**Path:** Event Dashboard → Overview → Actions → Clone Event

**What gets cloned:**
- Event website pages
- Form structure (Registration, Submission, Review)
- Settings and configurations
- Design and branding elements

**What does NOT get cloned:**
- Collected data (registrations, submissions, reviews, transactions)
- History of sent emails
- The event schedule
- Payment gateway connection

**After cloning:** Update dates, adjust forms, recreate schedule, reconnect payments.

### K0e.4 Mass Edit (Bulk Operations)
**Path:** Event Data → [Submissions/Registrations] → Select entries → Edit

**Editable fields:**
- All custom registration/submission form fields
- Presentation visibility (Public column)
- Participant visibility (Public Profile column)
- Submission decisions (via separate action)

**NOT editable in bulk:**
- First/last names and email addresses
- File uploads (posters, slides, videos, figures)
- Submission titles, authors, and abstracts

**Multi-select field options:**
- Append: keep existing + add new selections
- Replace: overwrite all selections
- Remove: uncheck specific options only

**Error conditions (edit blocked):**
- Removing paid choices with issued invoices
- Adding items when quota is full

### K0e.5 Fourwaves Assistant (AI Helper)
- Scans event website and provides detailed report
- Identifies potential issues and improvements
- Categorized by severity
- Helps polish website before participants see it

---

## K. Data Model Summary (Inferred)

```
Organization (top-level account)
  └── Event (one active at a time on most plans)
       ├── Website Pages
       │    ├── Home, Registration, Schedule, Presentations, Participants, etc.
       │    └── Custom pages and page groups
       ├── Registration Form
       │    ├── Fields (drag-and-drop)
       │    ├── Pricing tiers
       │    └── Registrations (attendee records)
       ├── Submission Form
       │    ├── Fields (drag-and-drop)
       │    └── Submissions (abstracts)
       │         ├── Authors (presenter + co-authors)
       │         ├── Files (posters, slides, videos)
       │         └── Reviews (scores, comments)
       ├── Schedule
       │    ├── Rooms (reusable across sessions)
       │    ├── Tracks (color-coded, filterable)
       │    ├── Tags (custom labels)
       │    └── Sessions
       │         ├── Name, description, date, time range
       │         ├── Room assignment
       │         ├── Track assignment
       │         ├── Session Organizers
       │         ├── Session Chair
       │         ├── Livestream link
       │         ├── Video recording
       │         └── Presentations (nested)
       │              ├── From accepted submissions (drag-drop)
       │              ├── Individual times
       │              └── Author/speaker data
       ├── Peer Review
       │    ├── Review form (custom criteria)
       │    ├── Reviewers (imported list)
       │    └── Assignments
       ├── Email Communication
       │    ├── Mass emails
       │    ├── Recipient filtering
       │    └── Status tracking
       └── Transactions/Finances
            ├── Revenue reports
            ├── Invoice management
            └── Refund processing
```

---

## L. Key Differences vs Other Platforms

### Fourwaves vs Indico
| Aspect | Fourwaves | Indico |
|--------|-----------|--------|
| Hosting | SaaS only | Self-hosted (free) |
| Pricing | $0-$4,799/yr + fees | Free (open source) |
| Schedule hierarchy | Session → Presentation (2 levels) | Session → Block → Contribution → Subcontribution (4 levels) |
| Room creation | From session edit form | Dedicated room management |
| Track management | Pro plan only ($4,799/yr) | Free, built-in |
| Speaker entity | No dedicated model — derived from submissions | No dedicated model — person + role junction |
| Drag-and-drop | Submissions into sessions | Timetable reordering |
| Website builder | Built-in WYSIWYG | Basic customizable pages |
| CfP/Abstracts | Excellent, with peer review | Excellent, with dual-track review |
| Booklet export | Word/PDF auto-generated | PDF export |
| Multi-language | English + French | Full i18n |

### Fourwaves vs Pretalx
| Aspect | Fourwaves | Pretalx |
|--------|-----------|---------|
| Hosting | SaaS only | Self-hosted or SaaS |
| Registration | Built-in | None (delegates to pretix) |
| Website | Full builder | Basic event page |
| Schedule JSON | Not documented (proprietary) | Frab c3voc standard |
| Conflict detection | Yes | Yes (real-time) |
| Speaker management | Via submission authors | Dedicated speaker profiles |
| Email system | Mass emails + status tracking | Outbox-first (review before send) |
| Schedule versioning | Real-time sync | Named releases |

---

## M. Platform Strengths (for GEM India Reference)

1. **All-in-one approach** — website + registration + submissions + reviews + schedule in one platform
2. **Schedule grid view** — clean room-column × time-row grid with color-coded tracks
3. **Dual view modes** — Grid and List views for attendees, with search + filters
4. **Personal agenda** — "My agenda" tab for attendees to bookmark sessions
5. **Submission-to-schedule pipeline** — drag accepted abstracts directly into sessions
6. **Conflict checker** — auto-detect double-booked speakers
7. **Session detail page** — rich detail with organizers, chair, nested presentations, export-to-calendar
8. **Real-time sync** — changes publish instantly to website + app
9. **Flexible pricing tiers** — early-bird auto-switching
10. **Certificate generation** — automated presenter certificates

## N. Platform Weaknesses / Gaps (for GEM India)

1. **No dedicated Speaker entity** — speakers are just submission authors, no separate invite/manage flow
2. **2-level schedule hierarchy only** — Session → Presentation (no blocks, no sub-sessions)
3. **Tracks are Pro-only** ($4,799/yr) — basic plans don't get color-coded tracks
4. **No schedule versioning** — no named releases or draft/publish workflow for schedule
5. **No WhatsApp/SMS/push** — email only
6. **No native mobile app** — responsive web only
7. **No offline capability** — downloadable schedule is static PDF/booklet
8. **French+English only** for bilingual — no Hindi or other languages
9. **No RSVP/confirmation workflow for speakers** — no invitation states (offered → confirmed → declined)
10. **Single active event per plan** (except custom plans)
11. **No public API documented** on marketing site (help center mentions "Creating and managing API keys" — may exist)
12. **Session organizer/chair appear manually assigned** — no automated role assignment from reviews

---

## O. URL Patterns

| Page | URL Pattern |
|------|-------------|
| Marketing site | `fourwaves.com` |
| Features - Event Website | `fourwaves.com/event-website/` |
| Features - Registration | `fourwaves.com/event-registration/` |
| Features - Abstract Mgmt | `fourwaves.com/abstract-management-software/` |
| Features - Conference Program | `fourwaves.com/conference-program/` |
| Pricing | `fourwaves.com/pricing/` |
| Help Center | `help.fourwaves.com/en/` |
| Help - Organizers | `help.fourwaves.com/en/collections/6038579-organizers` |
| Admin Dashboard | `dashboard.fourwaves.com` |
| Signup / Get Started | `dashboard.fourwaves.com/get-started` |
| Public Event Home | `event.fourwaves.com/{acronym}` |
| Public Schedule | `event.fourwaves.com/{acronym}/schedule` |
| Session Detail | `event.fourwaves.com/{acronym}/schedule/{uuid}` |
| Presentations List | `event.fourwaves.com/{acronym}/presentations` |
| Participants List | `event.fourwaves.com/{acronym}/participants` |
| Registration | `event.fourwaves.com/{acronym}/registration` |

---

## P. Help Center Structure

**Categories:**
- General (6 articles)
- **Organizers (75 articles)** — main admin documentation
  - Basics (5): Create event, dashboard, publish, clone, statistics
  - Event Settings (4): timezone, multilingual, acronym, assistant
  - Organizer Access (1)
  - Setting Up Payments (6)
  - Peer-review (4)
  - Data Tables (2)
  - Generate Certificates (1)
  - Decisions (2)
  - Event Website (10)
  - Form Management (6)
  - Registrations (4+)
  - Submissions (2+)
  - **Schedule (7):** Add sessions, Create rooms, Add presentations, Set times, Mass export, Tags, Livestream
  - Virtual Platform (2)
  - Email Communication (3)
  - Transactions (2)
  - Tracks (1)
- Participants (14 articles)
- Reviewers (1 article)
- Administrator
- Troubleshooting
