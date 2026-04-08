# Lu.ma (Luma) — Chrome UX Teardown

> **Teardown Date:** 2026-04-05
> **Researcher:** Worker 4 (Chrome UX Agent)
> **Platform URL:** https://luma.com (rebranded from lu.ma)
> **Purpose:** Design inspiration for GEM India Conference App — Registration, Public Pages, Event Creation
> **Auth Status:** Unauthenticated (sign-in required for organizer dashboard; public pages and create form accessible without login)

---

## Table of Contents

1. [Homepage & Navigation](#1-homepage--navigation)
2. [Flow 1: Event Creation (Single-Page Form)](#2-flow-1-event-creation-single-page-form)
3. [Flow 2: Organizer Dashboard — Guest Management](#3-flow-2-organizer-dashboard--guest-management)
4. [Flow 3: Registration Flow (Attendee Side)](#4-flow-3-registration-flow-attendee-side)
5. [Flow 4: QR Check-in](#5-flow-4-qr-check-in)
6. [Flow 5: Blasts (Email Communications)](#6-flow-5-blasts-email-communications)
7. [Discover Events Page](#7-discover-events-page)
8. [Sign-In Flow](#8-sign-in-flow)
9. [Key Design Patterns for GEM App](#9-key-design-patterns-for-gem-app)

---

## 1. Homepage & Navigation

### 1.1 Homepage Layout (luma.com)

- **Background:** Full-viewport dark gradient (near-black with subtle warm tones)
- **Logo:** "luma" wordmark (lowercase) top-left with sparkle/star icon, light gray
- **Top-right nav bar:** Local time display ("9:31 pm IST"), "Explore Events" link with external arrow icon, "Sign In" button (bordered pill)
- **Hero section:**
  - "luma" logo repeated larger
  - Headline: "Delightful events" (white, very large serif text)
  - "start here." in gradient text (pink → orange → warm), italic style
  - Subtitle: "Set up an event page, invite friends and sell tickets. Host a memorable event today."
  - CTA: "Create Your First Event" — white pill button, black text, prominent
- **No footer visible** on initial viewport — page is single-screen hero

### 1.2 Global Navigation (across all pages)

| Element | Position | Details |
|---------|----------|---------|
| Logo | Top-left | "luma" + sparkle, links to homepage |
| Local time | Top-right | e.g. "9:31 pm IST" — auto-detected timezone |
| Explore Events | Top-right | External link to /discover |
| Sign In | Top-right | Bordered pill button → /signin |

---

## 2. Flow 1: Event Creation (Single-Page Form)

**URL:** `luma.com/create`
**Access:** Accessible without login — the form renders fully, but any interaction triggers a sign-in modal overlay.

### 2.1 Page Layout — True Single Page

The creation form uses the **same two-column layout as the public event page**, making it a WYSIWYG editor that mirrors exactly what attendees will see.

**LEFT COLUMN (sticky sidebar):**

| Element | Details |
|---------|---------|
| **Cover Image** | Pre-populated with random curated gallery image (square 1:1, rounded corners). Small camera/gallery icon at bottom-right corner for changing. |
| **Theme Selector** | Below image: thumbnail preview swatch + "Theme: Minimal" dropdown with chevron. Shuffle/randomize button (crossed arrows ⟳ icon) next to dropdown. |

**RIGHT COLUMN (main form, top to bottom):**

| # | Field | Type | Default | Details |
|---|-------|------|---------|---------|
| 1 | **Calendar** | Dropdown | "Personal Calendar" (green dot) | Top-left. Assigns event to personal or team calendar. |
| 2 | **Visibility** | Dropdown | "Public" (globe icon) | Top-right. Options: Public / Private / Member-Only |
| 3 | **Event Name** | Text input | Placeholder: "Event Name" | Large, prominent — the first thing organizers type. No visible character limit. Gray placeholder text. |
| 4 | **Start Date** | Text input | Current date (e.g. "Sun, 5 Apr") | Calendar icon with date field |
| 5 | **Start Time** | Time input | "10:00 PM" (auto-filled) | Time picker format: "HH:MM AM/PM" |
| 6 | **End Date** | Text input | Same as start date | Below start, connected by dotted vertical line |
| 7 | **End Time** | Time input | "11:00 PM" (1 hour after start) | Auto-calculated 1-hour duration |
| 8 | **Timezone** | Display | "GMT+05:30 Calcutta" | Auto-detected from browser. Globe icon. Shown to right of time fields. |
| 9 | **Add Event Location** | Clickable row | "Offline location or virtual link" | Pin icon. Opens location input (address autocomplete + map preview) or virtual link field. |
| 10 | **Add Description** | Clickable row | "Add Description" | Document icon. Expands to rich text editor. |

**Event Options section (below main form):**

| Option | Default | Control |
|--------|---------|---------|
| **Ticket Price** | "Free" | Edit icon (pencil) → opens pricing modal |
| **Require Approval** | Off | Toggle switch (gray when off) |
| **Capacity** | "Unlimited" | Edit icon (pencil) → opens capacity input |

**Submit Button:**
- "Create Event" — full-width, prominent white button at bottom
- Clicking triggers sign-in modal if not authenticated

### 2.2 Key Design Observations

1. **WYSIWYG**: The create form IS the event page in edit mode — same two-column layout
2. **Smart defaults**: Auto-fills today's date, reasonable evening times (10-11 PM), local timezone
3. **Progressive disclosure**: Location and Description are collapsed by default — only "Add" prompts shown
4. **Minimal required fields**: Only Event Name is truly required to create — everything else has sensible defaults
5. **Gallery-first image**: Random curated cover shown immediately — no blank state
6. **Theme preview**: Entire page background changes to match selected theme in real-time
7. **Start/End visual link**: Dotted vertical line connecting Start and End creates visual continuity
8. **Event Options are secondary**: Ticket price, approval, capacity tucked into a separate section below the main form — good hierarchy

### 2.3 Theme System (Observed)

- Default theme: "Minimal" — dark background, clean typography
- Theme selector shows: small color swatch thumbnail + theme name
- Dropdown chevron suggests a list/grid picker opens on click
- Shuffle button for random theme discovery
- Live preview: the entire page background and accent colors change immediately
- Themes observed on public event pages:
  - **Dark/minimal**: Near-black background, white text (most common)
  - **Olive/warm**: Warm brown/olive tones (GitHub Copilot event)
  - **Purple/gradient**: Purple hues with gradient backgrounds
  - **Fiber optic**: Decorative light burst patterns behind content
- Per help docs: 40+ themes across categories:
  - **Emoji Light/Dark** — 15+ emoji shapes (hearts, party, sunglasses, pumpkins, etc.)
  - **Pattern** — Geometric/artistic (Cross, Hypnotic, Plus, Polkadot, Wave, Zigzag)
  - **Holiday Collection** — Seasonal themes (Diwali, Thanksgiving, Christmas, Hanukkah); some rotate seasonally
  - **Minimal** — Clean, dark background
- Some themes support custom base color picker; Luma auto-adjusts for contrast and accessibility
- Derived colors generated from base color (may not match exact hex picked)
- Themes update/rotate over time; some are seasonal only

### 2.4 Cover Image Gallery

- Pre-populated gallery images are themed (e.g., "PARTY LIKE IT'S THE LAST ONE" — event poster style)
- Camera icon overlay at bottom-right of image for upload/gallery access
- File upload button exists in DOM (type="file") for custom images
- Square 1:1 aspect ratio with rounded corners

---

## 3. Flow 2: Organizer Dashboard — Guest Management

> **Note:** Dashboard requires authentication. Details below are from web research + help documentation, supplemented by Chrome observations of the sign-in flow.

### 3.1 Dashboard Tab Structure

After creating an event, the Manage Event page has these tabs:

| Tab | Contents |
|-----|----------|
| **Overview / Insights** | Page views (past month/week/day), live traffic, top referrers, top cities, top sources (UTM parameter support), guest referrals tracking. Google Analytics Measurement ID integration (Luma Plus). |
| **Registration** | Ticket types, pricing, capacity limits, custom registration questions, approval toggle, waitlist toggle |
| **Guests** | Guest list view with 7 status filter tabs, search, bulk operations, check-in status |
| **Blasts** | Email/SMS/push communications — reminders, announcements, post-event feedback. Scheduling support. |
| **More** | Custom URLs/links, integrations, advanced settings |

### 3.2 Guest Status Filter Tabs (7 categories)

| Tab | Description |
|-----|-------------|
| **Going** | Approved guests attending |
| **Pending** | Awaiting organizer approval |
| **Waitlist** | On the waitlist (capacity reached) |
| **Invited** | Invited but not yet registered |
| **Not Going** | Declined attendees |
| **Checked In** | Arrived and scanned |
| **Not Checked In** | Approved but no check-in record |

### 3.3 Guest Table & Search

- **Search by:** first name, last name, full name, email, partial email, email domain (e.g., "acme.com")
- **Columns:** Name, email, status, ticket type, registration date, check-in status, custom question responses (each as separate column in expanded view)
- **Full-screen mode:** Expand icon (top-right) → full-screen table with more columns and bulk management tools
- **Bulk operations (via Actions menu in expanded table):**
  - Approve All (all pending/waitlisted; appears only when 2+ pending)
  - Decline All (all pending/waitlisted)
  - Update Guests (change status via CSV upload or manual email entry)
- **Export:** CSV includes all registration details, ticket info, custom question responses (each as separate column), and `qr_code_url` column. Respects current sort order.
- **Per-guest detail:** Clicking a guest row shows activity timeline, registration answers, all messages sent, delivery status, and email open status

### 3.4 Registration Configuration

**Custom question types available:**
- Short text (single line)
- Long text / textarea
- Dropdown (single select)
- Multi-select dropdown ("Select one or more")
- Phone number (with country code)
- URL/link field (e.g., LinkedIn)

**Ticket configuration:**
- Free tickets (default)
- Paid tickets (fixed price) via Stripe integration
- Sliding scale pricing (set minimum and suggested prices)
- Multiple ticket types per event, each with description and per-ticket capacity ("Total Tickets" field)
- Sales start/end date controls (for early bird / pre-sale)
- Each ticket type can independently have "Require Approval" enabled
- Coupon/discount codes (via API)

**Terms & conditions:**
- Terms/Checkbox question type — Content options: Text (paste rich text) or Link (URL to external terms)
- Optional digital signature field for extra confirmation

**Approval workflow:**
- Toggle on/off from Event Options
- When on: Registration CTA changes from "Register" → "Request to Join"
- Pending guests appear in "Pending" tab
- Organizer reviews responses and approves/declines individually
- Separate approval/rejection emails sent automatically

**Capacity & Waitlist:**
- Set maximum capacity via "Total Tickets" field per ticket type (default: Unlimited)
- Automatic waitlist when capacity reached
- **Waitlisted guests do NOT count toward capacity**
- No automatic promotion — hosts must manually approve waitlisted guests when spots open
- Bulk "Approve All" includes waitlisted guests

---

## 4. Flow 3: Registration Flow (Attendee Side)

### 4.1 Public Event Page Layout (Full Desktop View)

**Two-column layout confirmed via Chrome:**

**LEFT COLUMN (sidebar, ~35% width):**

| Section | Details |
|---------|---------|
| **Cover Image** | Square (1:1), rounded corners, full-bleed within column |
| **Presented By** | "Presented by" label → organizer logo + name (clickable, arrow icon) + "Subscribe" button (bordered pill) |
| **Organizer Bio** | Short description text below the name |
| **Social Links** | Row of icons: Instagram, X/Twitter, YouTube, LinkedIn, Website (varies per organizer) |
| **Hosted By** | Separate section: avatar + host name + social icons per host. Multiple hosts supported. |
| **Contact the Host** | Text link |
| **Report Event** | Text link |
| **Category Tags** | Pill buttons: "# AI", "# Tech" etc. |

**RIGHT COLUMN (main content, ~65% width):**

| Section | Order | Details |
|---------|-------|---------|
| **Featured Badge** | 1 | Orange calendar icon + "Featured in [City] >" — only if featured |
| **Event Title** | 2 | Very large, bold heading. Multi-line for long titles. |
| **Date & Time** | 3 | Calendar badge (month + day number) + "Saturday, 11 April" + "11:30 am - 3:00 pm" |
| **Location** | 4 | Pin icon + venue name (or "Register to See Address" if hidden) + city/region. External link icon on venue name. |
| **Registration Card** | 5 | Bordered section containing: Registration header, approval badge (if applicable), welcome message, CTA button |
| **About Event** | 6 | Rich text description — supports bold, italic, numbered lists, bullet points, headings, emoji |
| **Location Map** | 7 | "Location" header + full address + "Maps" external link + embedded interactive map |
| **Guest List** | 8 | "X Going" count + row of attendee avatar circles + "Name, Name and X others" |

### 4.2 Registration Card Variations

**Free event (no approval):**
- "Registration" header
- "Register" button (full-width, white)

**Free event (approval required):**
- "Registration" header
- Person icon + "Approval Required" bold + "Your registration is subject to host approval."
- Welcome text: "To join the event, please register below."
- "Request to Join" button (full-width, white)

**Hidden address pattern:**
- Location shows "Register to See Address" + general area (e.g., "Gurugram, Haryana")
- Full address revealed only after registration

### 4.3 Registration Form (Observed in Chrome)

Clicking "Request to Join" opens a **slide-up panel overlay** that covers the bottom portion of the event page. Not a separate page or modal — it's an inline overlay.

**Form header:** "Your Info" with X close button (top-right)

**Standard fields (always present):**

| # | Field | Type | Required | Placeholder |
|---|-------|------|----------|-------------|
| 1 | Name | Text | Yes | "Your Name" |
| 2 | Email | Email | Yes (*) | "you@email.com" |

**Custom fields (organizer-configured, observed on "Build with AI Series" event):**

| # | Field | Type | Required | Details |
|---|-------|------|----------|---------|
| 3 | Mobile Number | Tel | Yes (*) | "+91 81234 56789" with country code auto-detected |
| 4 | LinkedIn | URL/Text | Yes (*) | Empty text input |
| 5 | Long-form question | Textarea | Yes (*) | Multi-paragraph question about AI tools/stack |
| 6 | Multi-select dropdown | Select | No | "Select one or more" with chevron dropdown |
| 7 | Single-select dropdown | Select | No | "Select an option" with chevron dropdown |

**Submit button:** "Request to Join" (matches the event page CTA text)

**Key observations:**
- Form is a **single scrollable step** — no multi-step wizard
- Required fields marked with asterisk (*)
- Phone number field includes country code prefix auto-detection (+91 for India)
- Custom questions can be very long/detailed (multi-sentence question text)
- Mix of field types: text, tel, textarea, single-select, multi-select
- Close button (X) always visible at top-right to dismiss form

### 4.4 Post-Registration (from web research)

- Confirmation email with calendar invite (auto-adds)
- QR code for in-person events
- Unique join link for online events
- Apple Wallet pass for ticket storage
- Reminders: 1 day before + 1 hour before (default)

---

## 5. Flow 4: QR Check-in

> **Note:** Requires login and event ownership. Details from help documentation.

### 5.1 Scanner Access
- Web browser scanner
- iOS app built-in scanner
- Android app built-in scanner
- **Cannot** use phone's native camera — must use Luma's scanner

### 5.2 Two Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| **Standard** | Scan → shows guest detail sheet → manual tap to confirm check-in | Smaller events, VIP verification |
| **Express** | Scan → auto check-in → color-coded instant feedback + recent scans list | High-volume (500+ attendees) |

### 5.3 Post-Scan Information
- Guest name
- Registration status
- Ticket type (if multiple)
- Confirm check-in button (Standard mode)
- Reverse check-in button (if mistake)

### 5.4 Manual Check-In
- Search by name or email
- Tap to check in without scanning
- Useful when guest doesn't have QR code

### 5.5 Staff Roles
- Invite team members as check-in staff (Luma Plus)
- Staff can: scan, check in, view guest list
- Staff cannot: edit events, send messages, manage
- Lock Mode: prevents staff from switching scanning modes

---

## 6. Flow 5: Blasts (Email Communications)

> **Note:** Requires login. Details from help documentation.

### 6.1 Overview
- Accessed via "Blasts" tab in Manage Event
- Multi-channel: email + SMS + push notifications (guests control preferences)
- Send announcements, reminders, and follow-up emails to attendees
- Scheduling support for future send times

### 6.2 Blast Editor
**Rich Text Editor capabilities:**
- Subject line + body text
- Buttons with customizable link and title
- Copy-paste from other editors (auto-detects formatting and images)
- PDF attachments (via toolbar or drag-and-drop)
- Link insertion (highlight text + paste)
- Nested bullet and ordered lists
- Luma event links auto-expand into rich blocks showing event photo, name, and time

**Sender Info:**
- Sender address and name come from the calendar that manages the event
- Blast content shows the name and profile photo of the person who sent it

### 6.3 Recipient Filtering
- Default: all guests with "Going" status
- "Advanced" option allows filtering by guest status (Going, Pending, Waitlist, Invited) AND by ticket type
- Cannot filter by check-in status

### 6.4 Analytics
- Email open tracking (via 1x1 tracking pixel)
- Delivery status indicators (Delivered = accepted by mail server)
- Per-guest email history: guest detail → all messages sent, delivery status, open status
- Newsletter stats via "View Stats" button (recipient-level detail)

### 6.5 Default Automated Emails
- Registration confirmation
- Pre-event reminders (1 day + 1 hour before)
- Post-event feedback request (customizable via Blasts tab)
- Approval/rejection notifications (when approval is enabled)

---

## 7. Discover Events Page

**URL:** `luma.com/discover`

### 7.1 Page Layout

| Section | Details |
|---------|---------|
| **Header** | "Discover Events" large heading |
| **Subtitle** | "Explore popular events near you, browse by category, or check out some of the great community calendars." |
| **Popular Events** | "Popular Events" + location name (auto-detected: "New Delhi"). "View All →" link to location page. |
| **Event Cards** | Grid of event cards (2 columns on desktop) |
| **Browse by Category** | Category links at bottom |

### 7.2 Event Card Design

Each event card in the Discover grid:
- **Square cover image thumbnail** (left)
- **Date + time** (above title, gray text): "Tomorrow, 11:00 am" or "Sat, 11 Apr, 11:00 am"
- **Event title** (bold, white text)
- **Organizer/location** (gray text below title)

### 7.3 Event Preview Panel

Clicking an event card opens a **slide-in panel from the right** (not a new page):

**Top bar:** Expand icon (↗↗) + "Copy Link" button + "Event Page ↗" external link + Up/Down chevrons for navigation

**Panel content mirrors the full event page layout but in a narrower column:**
- Cover image (full-width within panel)
- Featured badge
- Event title
- Organizer name + arrow
- Date/time with calendar badge
- Location with pin icon
- Registration card with CTA
- About Event (rich text)
- Location section with map
- Presented by + Subscribe
- Social icons
- Hosted By section
- Guest count + avatars
- Contact the Host / Report Event
- Category tags

### 7.4 Browse by Category

Categories observed (with event counts):

| Category | Events |
|----------|--------|
| Tech | 5K |
| Food & Drink | 3K |
| AI | 3K |
| Arts & Culture | 2K |
| Climate | 1K |
| Fitness | 2K |
| Wellness | 3K |
| Crypto | 796 |

---

## 8. Sign-In Flow

**URL:** `luma.com/signin`

### 8.1 Sign-In Page Layout

- Same dark background as homepage
- Centered card/modal with:
  - Luma door icon (animated) at top
  - "Welcome to Luma" heading
  - "Please sign in or sign up below." subtitle

### 8.2 Authentication Options

| Method | Control | Details |
|--------|---------|---------|
| **Email** | Text input + "Continue with Email" button | Placeholder: "you@email.com". White prominent button. |
| **Mobile** | "Use Mobile Number" toggle | Switches email field to phone input |
| **Google** | "Sign in with Google" button | Google icon, dark button |
| **Passkey** | "Sign in with Passkey" button | Key/person icon, dark button |

**Key note:** Sign in and sign up are unified — same form for both. New email = account creation. Existing email = magic link or OTP login.

---

## 9. Key Design Patterns for GEM App

### 9.1 Highest-Impact Patterns to Adopt

1. **Single-page event creation (WYSIWYG):** The create form mirrors the public page layout. This is Luma's signature UX — edit what you see.

2. **Slide-up registration overlay:** Registration form slides up inline over the event page, not a separate route. Maintains context while collecting data.

3. **Smart defaults eliminate friction:** Auto-fill date (today), time (evening), timezone (browser), cover image (gallery random), capacity (unlimited), price (free). User only fills what they want to change.

4. **Progressive disclosure on creation form:** Location and Description are collapsed "Add X" prompts. No empty text areas staring at the user.

5. **Two-column event page layout:** Cover image + organizer info (left sidebar), event details + registration (right main). Registration card is prominent and positioned right after date/location.

6. **Social proof via guest list:** "74 Going" + avatar row + names creates FOMO and trust.

7. **Category tagging:** Simple pill tags (# AI, # Tech) for discovery and filtering.

8. **Approval-required variant:** Changes CTA from "Register" → "Request to Join". Shows "Approval Required" badge with explanatory text.

9. **Hidden address pattern:** "Register to See Address" + general area. Reveals full address only after registration. Good for private/exclusive events.

10. **Event preview panel (Discover):** Clicking an event card opens a slide-in panel, not a new page. Quick preview with "Event Page" link for full view.

### 9.2 Design System Observations

| Element | Value |
|---------|-------|
| **Primary background** | Near-black (#1a1a1a range) |
| **Text color** | White (#ffffff) for headings, gray for secondary |
| **CTA buttons** | White background, black text, full-width, rounded |
| **Secondary buttons** | Dark/transparent with border, white text |
| **Calendar badge** | Small rounded rectangle: month abbreviation (top) + day number (bottom) |
| **Icons** | Simple line icons: pin (location), calendar, person, document, globe |
| **Typography** | Clean sans-serif, large for titles (possibly system or custom), hierarchical sizing |
| **Spacing** | Generous whitespace, clear visual hierarchy |
| **Themes** | Full page background + accent color changes, 40+ options |
| **Border radius** | Consistently rounded (cards, images, buttons, inputs) |

### 9.3 What We Cannot Replicate (Luma-Specific)

- Curated cover image gallery (requires content curation)
- 40+ hand-designed themes (major design investment)
- Apple Wallet pass integration
- One-click returning user registration
- Hardware QR scanner support (Zebra TC series)
- Stripe integration for payments
- Express check-in mode with color-coded feedback

### 9.4 What We Should Definitely Build

- Single-page event creation with WYSIWYG preview
- Two-column public event page layout
- Slide-up inline registration form
- Guest status management (7 tabs: Going, Pending, Waitlist, Invited, Not Going, Checked In, Not Checked In)
- Custom registration questions (text, textarea, dropdown, multi-select, phone, URL)
- Approval-required registration flow
- QR code check-in (standard mode at minimum)
- Guest count + avatar social proof on event page
- Category/track tagging
- Email blast system for organizer communications

---

*Teardown completed 2026-04-05. Authentication was not possible (account creation prohibited by safety rules), so organizer dashboard flows were documented from help documentation and web research. Public-facing flows (event pages, creation form, registration overlay, discover page, sign-in) were fully observed via Chrome.*
