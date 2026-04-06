# CERN Indico UI Research: Real Conference Pages

**Date:** 2026-04-05
**Source:** https://indico.cern.ch (Indico v3.3.13-pre)
**Conferences Examined:**
1. **ICHEP 2024** (42nd International Conference on High Energy Physics) - `/event/1291157/`
2. **LHCP 2024** (12th Large Hadron Collider Physics Conference) - `/event/1253590/`
3. **SM@LHC 2026** (Standard Model at the LHC 2026) - `/event/1640751/`

---

## 1. URL / ROUTE PATTERNS

| Page | URL Pattern | Example |
|------|------------|---------|
| Event Overview | `/event/{eventId}/` | `/event/1291157/` |
| Timetable | `/event/{eventId}/timetable/` | `/event/1291157/timetable/#20240718` |
| Timetable (day hash) | `#YYYYMMDD` | `#20240718` |
| Timetable (detailed) | `#YYYYMMDD.detailed` | `#20240718.detailed` |
| Contribution List | `/event/{eventId}/contributions/` | `/event/1291157/contributions/` |
| Registration List | `/event/{eventId}/registrations/` | `/event/1640751/registrations/` |
| Registration Form | `/event/{eventId}/registrations/{formId}/` | `/event/1253590/registrations/100405/` |
| Search | `/search/?q={query}` | `/search/?q=ICHEP+2024` |
| Category Page | `/category/{categoryId}/` | (main categories page) |
| Home | `/` | Indico homepage |

**Key observations:**
- Event IDs are simple integers (e.g., 1291157)
- Registration form IDs are also integers (e.g., 100405)
- Timetable day switching uses URL hash fragments (`#YYYYMMDD`)
- Detailed view appends `.detailed` to the hash
- No nested paths for sub-pages within events - all are flat under `/event/{id}/`

---

## 2. PUBLIC EVENT PAGE (Overview)

### Layout Structure
- **Header**: Full-width banner with event logo/image, custom background color/image
- **Sub-header**: Date range, location, timezone info, search bar
- **Top toolbar**: Navigation arrows (first, prev, up, next, last), timetable dropdown, layout dropdown, link/edit icons
- **Two-column layout**: Left sidebar (navigation menu) + Right content area

### Header Details (ICHEP 2024 example)
- Custom conference banner image (full width, ~150px height)
- Below banner: "17-24 Jul 2024 / Prague / Europe/Prague timezone"
- Search bar on the right side of sub-header

### Sidebar Navigation (Left, ~250px width)
The sidebar is a **vertical menu** with customizable items. Observed structure from ICHEP 2024:

```
MAIN ICHEP 2024 PAGE          (external link)
PROCEEDINGS                    (custom page)
TIMETABLE                     (built-in, highlighted when active)
NEWSLETTERS                   (custom section)
  |-- Newsletter - July 24    (sub-items)
  |-- Newsletter - July 23
  |-- ...
OVERVIEW                      (built-in page, highlighted when active)
FLOORPLAN AND TIMETABLE MOBILE APPS  (custom page)
PLENARY SESSION STREAM         (custom page)
EARLY CAREER SCIENTIST AWARDS  (custom page)
SPECIAL EVENTS OVERVIEW        (custom section)
  |-- Panel discussion on Future Colliders
  |-- Discussion & Lunch - Education and Outreach
  |-- EDI and Sustainability Discussion
  |-- Lecture: Quantum sensing in particle physics
  |-- Future of Particle Physics with Czech perspective
  |-- ICHEP Party
PHOTOS                        (custom page)
SCIENTIFIC PROGRAMME           (custom page)
CONTRIBUTION LIST              (built-in page)
INSTRUCTIONS                   (custom section)
  |-- Code of Conduct
  |-- Instructions for speakers
  |-- Instructions for poster presenters
  |-- Poster board identifications
  |-- Instructions for conveners
ACCOMMODATION                  (custom section)
  |-- Dormitory "17. listopadu"
  |-- Dormitory "Masarykova kolej"
SUPPORTERS & SPONSORS          (custom page)
PARTNERS                       (custom page)
---- CONTACT (footer section, different styling) ----
  Email: sci@ichep2024.org
```

**Navigation styling:**
- Active item: Purple/blue background with white text, full-width highlight bar
- Normal items: ALL CAPS text, link colored (blue/teal)
- Sub-items: Indented with "L" tree connector character, smaller text, mixed case
- Section headers vs page links are distinguished by font weight/style
- Contact section at bottom has different background color (highlighted block)

### LHCP 2024 Sidebar (Different Conference, Different Structure)
```
Overview
Timetable (compact)
Conference program
  |-- Detailed agenda
  |-- Conference venue
  |-- Social program
  |-- Poster session
  |-- Future of HEP Discussion
  |-- Outreach Event: The Music of Physics
  |-- Public Lecture
  |-- Saturday Program
  |-- Early Career Researcher Grants
  |-- Fees and payments
Conference services
  |-- Closed Captioning
  |-- Instructions for presenters and session convenors
  |-- Childcare services
  |-- HEPCon app
  |-- Wireless connection
Registration
Registration and Check-in information and contacts
  |-- Parking Passes
  |-- Staying in the dorms
Call for poster abstracts
Organisation
  |-- International Advisory Committee
  |-- Program Committee
  |-- Local Organising Committee
  |-- Parallel session conveners
  |-- Partners and sponsors
Practical information
  |-- Visa Information
```

### Overview Content Area
- Conference title (large, styled heading)
- Description text (rich text, can include bold, links, etc.)
- Date/Time block: Clock icon + "Starts: {date}, {time}" / "Ends: {date}, {time}" / timezone
- Location block: Pin icon + City, Building, Address
- Organizers/Chairs: Person icon + linked names
- Registration fee info (in info box with blue left border and info icon)
- Social media icons (YouTube, Instagram, X)
- Conference photo (large image)
- Organizing committee lists (bullet points)

---

## 3. TIMETABLE / PROGRAMME VIEW

### URL: `/event/{eventId}/timetable/#YYYYMMDD`

### Day Navigation
- **Tab bar** with one tab per day: "Wed 17/07", "Thu 18/07", etc.
- Left/right arrows (`<` `>`) to navigate beyond visible days
- **"All days"** tab available on some conferences (LHCP had it, ICHEP did not)
- Active day tab is **bold** with bottom border
- Day switching updates the URL hash fragment

### Action Buttons (Right-aligned, gray toolbar)
- **Print** - Print-friendly version
- **PDF** - Generate PDF export
- **Full screen** - Expand to full browser width
- **Detailed view** - Toggle to show individual contributions within sessions
- **Filter** - Toggle filter bar at bottom

### Compact View (Default)
- **Time axis**: Left column shows hours (08:00, 09:00, 10:00, etc.) vertically
- **Session blocks**: Colored rectangles spanning their time duration
- **Parallel sessions**: Displayed as side-by-side columns of equal width
- **Session block content** (compact):
  - Track/session name (bold, top of block)
  - Convener names (italic, within block)
  - Room name (bottom-left of block)
  - Time range (bottom-right of block)
- **Color coding**: Each session/track has a distinct color
  - Higgs: Dark navy blue
  - Neutrino: Medium blue
  - Beyond SM: Purple/plum
  - Quark: Dark purple
  - Astro-particle: Yellow/gold
  - Strong: Yellow-green
  - Operations: Light gray
  - Dark Matter: Olive/dark yellow
  - Top: Brown/tan
  - Detector: Gray
  - Heavy Ions: Light blue
  - Education: Light gray-blue
  - Accelerator: Light olive
- **Coffee breaks**: Full-width light green/mint row with label + room + time
- **Registration**: Full-width light blue row

### Detailed View (`#YYYYMMDD.detailed`)
- Same layout as compact but each session block expands to show individual **contribution tiles**
- Each tile shows: Abbreviated title, speaker initial, link icon
- Tiles are small colored squares arranged in a grid within the session block
- **Session legend** appears above the timetable showing color key for all tracks
- Legend has colored dots + track names, with "see more..." link and "X" close button

### Session Click Popup
Clicking a session block opens an **inline popup/tooltip** with:
- **Session name** (colored text matching session color)
- **Block** label + time range (with clock icon)
- **Session** label + session name (with link icon to go to session detail page)
- **Contributions** count (with numbered badge, e.g., "5")

### Filter Bar (Bottom of page)
When Filter is active, a bottom toolbar appears with:
- **Filter options** label
- **Sessions** dropdown (filter by session/track)
- **Rooms** dropdown (filter by room)
- **Reset filter** button
- Close (X) button

### Parallel Session Display
- ICHEP: Up to **14 parallel tracks** shown side-by-side
- LHCP: Up to **5-6 parallel tracks**
- Each column has equal width, automatically sized to fit available space
- When many parallel sessions exist, column labels get truncated with "..."

---

## 4. CONTRIBUTION LIST

### URL: `/event/{eventId}/contributions/`

### Header Controls
- **Count display**: "1265 / 1265" (showing/total)
- **Search bar**: "Enter #id or search string" with magnifying glass icon
- **Filter button** (funnel icon)
- **PDF export** button (document icon)
- **Link/share** button (chain icon)

### Contribution Card Layout
Each contribution is a card/row with:
- **ID number**: e.g., "455." (left-aligned, before title)
- **Title**: Clickable link (teal/blue colored)
- **Speaker**: Person icon + "Name" with affiliation in parentheses, e.g., "Mustafa Andre Schmidt (Bergische Universitaet Wuppertal (DE))"
- **Date/Time**: Clock icon + "18/07/2024, 08:30"
- **Tags row** (colored pill badges):
  - Track tag (dark teal, e.g., "06. Strong Interactions a...")
  - Session type tag (magenta/pink, e.g., "Parallel session talk")
  - Session name tag (dark gray, e.g., "Strong interactions and ...")
- **Abstract preview**: 2-3 lines of description text, truncated

### Tag Color Coding
- Track tags: Dark teal/green background, white text
- Session type tags: Magenta/pink background, white text
- Session/topic tags: Dark gray background, white text

---

## 5. REGISTRATION PAGE

### URL: `/event/{eventId}/registrations/{formId}/`

### Registration Listing Page (`/event/{eventId}/registrations/`)
- Title: "Registration"
- Subtitle: "Available forms"
- Table with columns: Form name, **Opens**, **Closes**
- If no forms: "No registration forms available for this event"

### Registration Form Page
- **Title**: "Application" (or custom title)
- **Subtitle**: Registration form name (e.g., "LHCP 2024 Registration")
- **Contact info**: Icon + email address
- **Info box**: Blue border, information icon, multi-line instructions
- **Login requirement**: Blue highlighted box with "Account required to apply" warning + "Log in to proceed" button

### Registration Form Fields (from Indico Documentation)
The Indico registration form builder supports these field types:
- **Personal Data Section** (built-in default):
  - First Name, Last Name, Email (pre-filled from account)
  - Affiliation / Institution
  - Position / Title
  - Address, City, Country
  - Phone number
- **Custom Sections** can be added with:
  - Section title, description
  - Manager-only visibility option
- **Available Field Types**:
  - Text input (single line)
  - Text area (multi-line)
  - Number
  - Dropdown / Select
  - Radio buttons
  - Checkboxes
  - Yes/No (boolean)
  - Date
  - File upload
  - Phone
  - Country
  - **Accommodation** (special field with arrival/departure dates, accommodation choices with pricing, room limits)
  - Email
- **Accommodation Field** (special):
  - Arrival date picker
  - Departure date picker
  - Accommodation choices (radio list with names, prices, availability counts)
  - "No accommodation" default option
- **Payment Integration**: Currency selection, fee display, PayPal/bank transfer support
- **Moderation**: Optional moderated workflow (manager must approve registrations)
- **Invitations**: Can send email invitations with link to registration form, with skip-moderation option

### Registration Workflow
1. User sees registration form listing
2. Must log in (Indico account required)
3. Fills in form sections
4. Optionally pays (if payment enabled)
5. Manager may need to approve (if moderated)

---

## 6. PARTICIPANT LIST

Participant lists in Indico are tied to registration forms. When enabled by the event manager, they display registered participants publicly.

**Observed behavior**: Most large conferences (ICHEP, LHCP) do NOT show public participant lists — registration requires login. The participant list feature exists but is controlled by event managers.

**When visible, participant lists show**:
- Name (First Last)
- Affiliation / Institution
- Country
- Registration date
- Can be sorted/filtered

**URL pattern**: Linked from the registration section, typically accessible within the registration area.

---

## 7. GLOBAL UI ELEMENTS

### Top Navigation Bar (Global Header)
- **Indico logo** (left, links to home)
- **Home** link
- **Create event** dropdown (Lecture, Meeting, Conference)
- **Room booking** link
- **Right side**: Timezone selector, Language selector, **Login** button

### Event-Level Top Toolbar (Below banner, when inside an event)
- Navigation arrows: |< < ^ > >| (first, prev, parent, next, last event)
- Timetable view dropdown (grid icon)
- Layout dropdown (columns icon)
- Copy link icon
- Edit icon (pencil)

### Footer
- CERN logo
- "Powered by Indico v3.3.13-pre"
- Links: Help | Contact | Terms and conditions | URL Shortener | Privacy

### Search Page (`/search/?q={query}`)
- Left sidebar: Category facets with counts (Home, Conferences, Projects, Experiments, etc.)
- Tab bar: Events, Contributions, Materials, Notes, Categories (with counts)
- Sort dropdown: "Most relevant"
- Result cards showing: Title, description snippet (with highlighted matches), date, location, breadcrumb path

---

## 8. KEY DESIGN PATTERNS FOR NEXT.JS REPLICATION

### Route Structure (Next.js App Router)
```
/                                    -> Homepage with categories
/search                              -> Search results
/event/[eventId]                     -> Event overview (default page)
/event/[eventId]/timetable           -> Timetable (client-side day switching via hash)
/event/[eventId]/contributions       -> Contribution list
/event/[eventId]/registrations       -> Registration forms list
/event/[eventId]/registrations/[formId] -> Specific registration form
```

### State Management Needs
- Timetable day selection (URL hash or query param)
- Timetable view mode (compact vs detailed)
- Filter state (sessions, rooms)
- Contribution list search/filter state
- Registration form data

### Component Hierarchy
```
EventLayout
  |-- EventHeader (banner, dates, location)
  |-- EventToolbar (nav arrows, view toggles)
  |-- EventSidebar (customizable menu items)
  |-- EventContent (dynamic based on route)
       |-- OverviewPage
       |-- TimetablePage
       |    |-- DayTabs
       |    |-- ActionButtons (Print, PDF, Filter, etc.)
       |    |-- TimeGrid
       |    |    |-- TimeAxis
       |    |    |-- SessionBlock (colored, positioned)
       |    |    |    |-- ContributionTile (in detailed view)
       |    |    |-- BreakRow
       |    |-- FilterBar
       |    |-- SessionLegend
       |    |-- SessionPopup (on click)
       |-- ContributionListPage
       |    |-- SearchBar
       |    |-- ContributionCard
       |    |    |-- TrackTag
       |    |    |-- SessionTypeTag
       |-- RegistrationPage
            |-- RegistrationFormList
            |-- RegistrationForm
                 |-- FormSection
                 |-- FormField
                 |-- AccommodationField
                 |-- PaymentSection
```

### Color System
Events use customizable color themes. The timetable has distinct colors per session/track that are assigned at the session level by event managers. Key default palette observed:
- Dark navy, medium blue, purple, gold/yellow, olive, gray, brown/tan, light blue, mint/green

### Responsive Considerations
- Timetable with 14 parallel columns needs horizontal scroll on mobile
- Sidebar collapses on mobile (hamburger menu pattern)
- Session blocks need minimum readable width
