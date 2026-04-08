# Lu.ma (Luma) UX Teardown -- Web Research

> **Research Date:** 2026-04-05
> **Researcher:** UX Research Agent
> **Purpose:** Design inspiration for GEM India Conference App -- Registration and Public Pages module
> **Note:** Lu.ma has rebranded its domain from `lu.ma` to `luma.com` (301 redirects in place). Help docs live at `help.luma.com`. API docs at `docs.luma.com`.

---

## Table of Contents

1. [Event Page Design (Primary Inspiration)](#1-event-page-design-primary-inspiration)
2. [Event Creation Flow](#2-event-creation-flow)
3. [Registration Flow (Attendee Experience)](#3-registration-flow-attendee-experience)
4. [QR Check-In System](#4-qr-check-in-system)
5. [Attendee Management (Organizer Dashboard)](#5-attendee-management-organizer-dashboard)
6. [Visual Design System](#6-visual-design-system)
7. [API and Embed Capabilities](#7-api-and-embed-capabilities)
8. [Key Takeaways for GEM App](#8-key-takeaways-for-gem-app)
9. [Sources](#9-sources)

---

## 1. Event Page Design (Primary Inspiration)

Luma is widely regarded as the gold standard for beautiful, minimal event pages. Their design philosophy condenses complexity into a single elegant screen.

### 1.1 Page Layout Structure (Top to Bottom)

| Section | Details |
|---------|---------|
| **Cover Image** | Full-width, rounded corners, square 1:1 aspect ratio. Minimum 800x800px recommended. Corners are clipped by border-radius so no critical content should be placed there. |
| **Event Title** | Large, bold headline -- the primary text element. Clear, descriptive. Uses hierarchical semibold typography. |
| **Date & Time** | Displayed immediately below title. Includes timezone. Multi-day events show start and end dates. |
| **Location** | Venue name + address for in-person events. Map embed appears on the page. For online events, a meeting link section replaces this. |
| **Hosted By** | Organizer/calendar name with avatar, creating trust and identity. |
| **Registration Button** | Prominent CTA -- "Register" or "Get Tickets". Positioned in a sticky sidebar on desktop, inline on mobile. Blue accent color for contrast. |
| **Description** | Rich text area supporting bold, italic, bullet points, numbered lists, links, and emoji. Covers event purpose, audience, expectations, special instructions. |
| **Guest List (Social Proof)** | "Show Who's Coming" feature displays attendee avatars and count. Publicly visible when enabled by organizer. Encourages attendance through social proof. |
| **Calendar Info** | Link to the parent calendar/community the event belongs to. |

### 1.2 Cover Image Specifications

- **Aspect Ratio:** 1:1 (square)
- **Minimum Size:** 800 x 800 px (larger is better for multi-device rendering)
- **File Types:** PNG, JPG recommended; GIF supported but unreliable
- **Display Behavior:** Rounded corners applied automatically -- avoid placing logos, text, or decorative frames in corners
- **Design Guidance:** Avoid excessive text on the image (illegible at small sizes on mobile/preview cards). Leave padding around edges. Design for both large event-page display and small preview-card thumbnails.
- **Curated Gallery:** Luma provides pre-designed cover images organized by theme (party, happy hour, seasonal, etc.) as an alternative to custom uploads.

### 1.3 Theme System

- **40+ built-in themes** available: Minimal, Confetti, Emoji, Pattern, Seasonal categories
- Live preview when selecting themes
- Color customization for brand matching
- Themes affect background, accent colors, and overall page atmosphere
- Dark theme is the primary app color scheme (gray accent text, white interactive elements, blue CTAs)

### 1.4 Event Visibility Options

| Visibility | Behavior |
|------------|----------|
| **Public** | Shown on calendar, eligible for Discover featuring, indexed by search engines |
| **Private** | Unlisted, not on any calendar, link-only access |
| **Member-Only** | Visible only to active calendar membership holders |

### 1.5 Mobile vs. Desktop Layout

- **Desktop:** Two-column layout. Event details on the left, registration card/sidebar on the right (sticky on scroll).
- **Mobile:** Single-column stack. Cover image at top, then title, date, location, description. Registration button becomes a sticky bottom bar or inline CTA.
- **Transitions:** Custom slide-up animations for detail screens. Hover states with background-color changes and `transform: scale(1.05)` on cards.

---

## 2. Event Creation Flow

Luma's event creation is celebrated for condensing a traditional multi-page form into a **single, elegant screen** with overlay modals for secondary details.

### 2.1 Access Points

- **Web:** `luma.com/create` or "Create Event" button from dashboard
- **iOS:** Tap the `+` button
- **Android:** Tap the `+ Create` button

### 2.2 Form Fields (In Order)

1. **Event Title** -- Free text. Clear, descriptive headline.
2. **Event Type** -- Three options:
   - In-Person (physical venue)
   - Online (virtual via Zoom, Google Meet, etc.)
   - Hybrid (both physical and online)
3. **Date and Time** -- Date picker + time picker. Timezone selector (defaults based on event location). Multi-day event support with start/end dates. Overlay modal for date/time selection keeps the flow contained.
4. **Location** -- For in-person: venue name or address (map appears on event page). For online: meeting link field (Zoom, Google Meet, etc.). Luma auto-creates unique join links per guest for attendance tracking. For hybrid: physical address as primary + online instructions in description.
5. **Cover Image** -- Select from curated gallery OR upload custom image. Square 1:1 format.
6. **Description** -- Rich text editor with bold, italic, bullets, numbered lists, links, emoji.
7. **Theme Selection** -- Visual picker from 40+ themes with live preview.
8. **Calendar Assignment** -- Personal calendar (default), existing team calendar, or create new calendar.
9. **Visibility** -- Public / Private / Member-Only (see Section 1.4).

### 2.3 Post-Creation Configuration (Manage Event Page)

After creation, the event is live immediately but fully editable. The Manage Event page has these tabs:

| Tab | Contents |
|-----|----------|
| **Registration** | Ticket types, pricing, capacity limits, custom registration questions, approval toggle, waitlist toggle |
| **Guests** | Guest list view, invitations, check-in status, bulk operations |
| **Blasts** | Email reminders, announcements, post-event feedback emails |
| **More** | Custom URLs, integrations, analytics, advanced settings |

### 2.4 Ticket and Payment Configuration

- Multiple ticket types per event (free, paid, sliding scale, donation)
- Stripe integration for payment processing
- Next-day payouts
- Fixed prices or flexible donation amounts
- Coupon/discount code support (via API)

---

## 3. Registration Flow (Attendee Experience)

### 3.1 Step-by-Step Attendee Journey

```
Event Page  -->  Register Button  -->  Registration Form  -->  Confirmation Email  -->  Calendar Add  -->  Pre-Event Reminders  -->  Event Day (QR / Join Link)
```

**Step 1: Event Page**
Attendee lands on the event page (shared via link, social media, SMS, email, or discovered via Explore). They see cover image, title, date, location, description, and the registration CTA.

**Step 2: Registration Form**
- **Required fields:** Name and Email (always mandatory for all guests)
- **Returning users:** System remembers previous information, enabling **one-click sign-in** registration
- **Custom questions:** Organizer can add additional questions beyond name/email via the Registration tab
- **Payment:** If tickets are paid, payment is collected during registration via Stripe

**Step 3: Confirmation**
- Automated confirmation email sent immediately
- Contains a **calendar invite** that auto-adds to the attendee's calendar (no manual download needed)
- For in-person events: includes a **QR code** for check-in
- For online events: includes a **unique join link** (`luma.com/join/...`) per guest
- Organizers can customize confirmation email body text (but not dynamic per-guest personalization)
- **Apple Wallet pass** available for ticket storage

**Step 4: Pre-Event Reminders**
- Default reminders: 1 day before and 1 hour before (for in-person events)
- Organizers can customize or add additional reminder blasts

**Step 5: Post-Event**
- Automated feedback collection email (customizable via Blasts tab)
- Attendees can share the event with friends via social/link

### 3.2 Approval-Required Events

When approval is enabled:
- Registrant submits form and enters **Pending** state
- Organizer reviews registration (including custom question responses) in Guest tab
- Organizer approves or declines
- Separate customizable approval/rejection emails are sent
- Declined registrants do not receive event access

### 3.3 Capacity and Waitlist

- Organizers can set maximum attendee capacity
- When capacity is reached, a waitlist is automatically enabled
- Waitlisted guests are notified if spots open up
- Registration can be disabled entirely or time-limited

### 3.4 Social Sharing

- After registering, attendees see easy share options for social media and direct links
- "You are going" confirmation state is displayed on the event page
- Accessible ticket information shown post-registration

---

## 4. QR Check-In System

### 4.1 Overview

Luma has a built-in QR code scanner for checking in guests at in-person events. Guests receive a QR code in their confirmation email. Organizers scan it on arrival.

### 4.2 Scanner Access

- **Web:** Open Luma scanner via browser
- **iOS App:** Built-in scanner in the Luma app
- **Android App:** Built-in scanner in the Luma app
- **Important:** Cannot scan from the phone's native camera app -- must use Luma's scanner

### 4.3 Two Scanning Modes

| Mode | Behavior | Best For |
|------|----------|----------|
| **Standard Mode** | Scans QR, opens guest details sheet. Staff reviews name/info, then taps button to confirm check-in. Allows reviewing before committing. | Smaller events, approval-gated entry, VIP verification |
| **Express Mode** | Automatically checks in guest on valid QR scan. Instant visual feedback with **color-coded results**. Shows recently scanned guests. Multi-ticket guests can still select specific tickets. | High-volume events (500+ attendees), conference entry lines |

### 4.4 Information Displayed on Scan

- Guest name
- Current registration status
- Ticket type (if multiple types exist)
- Button to confirm check-in (Standard mode)
- Button to reverse check-in (if checked in by mistake)
- Color-coded visual feedback (Express mode)

### 4.5 QR Code Types

| Type | Prefix | Behavior |
|------|--------|----------|
| **Guest Key** | `g-` | Sent in confirmation emails. Checks in all guest tickets, or allows selecting specific ones |
| **Ticket Key** | (from CSV export) | Processes individual tickets only |

### 4.6 Manual Check-In

- Search for guest by name or email
- Tap to check them in without scanning
- Useful when guest doesn't have their QR code

### 4.7 Check-In Staff Roles

- Organizers can invite team members as **check-in staff** (requires Luma Plus)
- Staff permissions: scan tickets, check in guests, view guest list
- Staff restrictions: cannot edit events, send messages, or access other management features
- **Lock Mode:** Organizer can enable Lock Mode to prevent staff from switching between Standard and Express scanning modes

### 4.8 Hardware Scanner Support

- **Supported devices:** Zebra TC series (TC52, TC57) and other Android-based handheld scanners
- **Requirement:** Android OS + QR code decoding capability
- **Interface:** Standard Luma Android app -- no special software
- **Ideal for:** Events with 5,000+ attendees where speed is critical
- **Advantages:** Better than smartphones in poor lighting and crowded entry areas
- **Setup:** Enterprise contact form at `luma.com/pricing` for guidance

---

## 5. Attendee Management (Organizer Dashboard)

### 5.1 Dashboard Overview

The organizer dashboard consolidates guest stats, blasts (announcements), and chat creation in one interface. Accessible via web and mobile app.

### 5.2 Guest List View

**Access:**
- **Web:** Manage Event > Guests tab. Expand icon enables full-screen table view.
- **Mobile:** Luma app > Event > Manage > Guests.

**Status Tabs (Filtering):**

| Tab | Description |
|-----|-------------|
| **Going** | Approved guests attending the event |
| **Pending** | Registrants awaiting organizer approval |
| **Waitlist** | Guests on the waitlist |
| **Invited** | People invited but not yet registered |
| **Not Going** | Declined attendees |
| **Checked In** | Arrived and scanned/confirmed |
| **Not Checked In** | Approved but no check-in record |

Web users can additionally filter by **ticket type** for multi-ticket events.

### 5.3 Search

- Search by: first name, last name, full name, email address, partial email, email domain (e.g., "acme.com" finds all @acme.com addresses)
- Search works alongside active status filters

### 5.4 Sorting

- Available on web and iOS
- Sort by: name, email, registration time (default), check-in time

### 5.5 Organizer Actions

| Action | Details |
|--------|---------|
| **Approve/Decline** | For approval-required events. View registration responses before deciding. |
| **Change Status** | Modify any attendee's status. Optionally send notification with personalized message. |
| **Check In** | Manual check-in or via QR scanner |
| **Bulk Operations** | Web expanded-table view enables batch approvals, batch declines, CSV-based status uploads |
| **Export** | Download guest list as CSV for external tools (badge printing, analytics, CRM import) |
| **Send Invites** | Mass SMS or email invites with calendar integration |
| **Messaging** | Email blasts to registered attendees (reminders, updates, announcements) |

### 5.6 Automated Communications

| Email | Timing | Customizable? |
|-------|--------|---------------|
| Confirmation | Immediately on registration | Yes (body text) |
| Approval/Rejection | On organizer action | Yes (separate templates) |
| Reminder (1 day) | 24 hours before event | Default, adjustable |
| Reminder (1 hour) | 1 hour before event | Default, adjustable |
| Feedback Request | After event | Yes (via Blasts tab) |

### 5.7 Attendance Tracking

- **In-person:** QR scan check-in data
- **Online:** Join link click tracking + Zoom data pull
- **Analytics:** Cross-event attendance tracking for repeat attendees

---

## 6. Visual Design System

### 6.1 Color and Theme

- **Primary app theme:** Dark mode (dark background, gray accent text, white interactive elements)
- **CTA color:** Blue (`#099ef1` range) for primary buttons
- **Gradient accents:** Hero text uses gradient from `#099ef1` (blue) to `#ff891f` (orange)
- **Light/dark toggle:** System-preference-based automatic switching
- **Backdrop blur:** Navigation bar uses backdrop-blur for depth

### 6.2 Typography

- **Headlines:** 4rem on desktop, scaling to 2.5rem on mobile
- **Hierarchy:** Semibold headers distinguish sections from body text
- **Font feel:** Clean, modern sans-serif (system font stack)

### 6.3 Spacing and Layout

- **Container:** `min-height: 80vh` for hero sections
- **Generous whitespace:** Extensive padding and gap variables create breathing room
- **Card hover effects:** `box-shadow` + `transform: scale(1.05)` on event cards
- **Rounded corners:** Applied to images, cards, and buttons throughout
- **Grid:** Two-column on desktop, single-column on mobile with horizontal scrolling for carousels

### 6.4 Interaction Patterns

- Custom slide-up animations for detail screens
- Smooth scroll with snap alignment on mobile horizontal lists
- Hover state background-color transitions
- Overlay modals for date/time selection (keeps creation flow on single page)
- Sticky navigation bar with subtle blur effect

### 6.5 Discovery Page (luma.com/discover)

- **Layout:** Grid + card layout. Two-column grid on desktop, horizontal scroll on mobile.
- **Event cards:** Cover image, title, date/time, location with icon, organizer info. Hover: scale + shadow.
- **Categories (8):** Tech, Food & Drink, AI, Arts & Culture, Climate, Fitness, Wellness, Crypto
- **Geographic filters:** Regions (Asia & Pacific, Europe, Africa, North America) with city drill-down showing event counts (e.g., "Singapore: 31 Events")
- **Featured sections:** Popular events, featured calendars with "Subscribe" buttons
- **View All** links for expanded browsing per category

---

## 7. API and Embed Capabilities

### 7.1 Public API

- **Base URL:** `https://public-api.luma.com`
- **Auth:** `x-luma-api-key` header (requires Luma Plus subscription)
- **Spec:** OpenAPI 3.1 at `https://public-api.luma.com/openapi.json`
- **Endpoints:** 24 event endpoints, 27 calendar endpoints, 3 membership endpoints, 6 webhook endpoints
- **Webhook events:** event.created, event.updated, guest.registered, guest.updated, ticket.registered, calendar events, event.canceled

### 7.2 Embeddable Registration Button

Organizers can embed a checkout button on external websites:

```html
<button
  class="luma-checkout--button"
  type="button"
  data-luma-action="checkout"
  data-luma-event-id="evt-YOUR-EVENT-ID"
>
  Register for Event
</button>
```

Custom styling is supported by removing the default class.

### 7.3 Integrations

- **Zoom:** Auto-creates Zoom Meetings/Webinars, embeds join links
- **Stripe:** Payment processing for tickets and donations
- **Zapier:** Automation workflows (Luma Plus only)
- **Make.com:** 4 trigger modules, 14 action modules, 3 search modules
- **Crypto:** SOL and USDC payments, token-gating for Web3 communities
- **Apple Wallet:** Ticket pass integration

---

## 8. Key Takeaways for GEM App

### 8.1 What to Adopt (Design Patterns Worth Replicating)

1. **Single-page event creation** -- Condense the creation form into one elegant screen with overlay modals for date/time. Avoid multi-step wizards for basic event setup.

2. **Square cover images with rounded corners** -- 1:1 ratio, min 800px, with automatic corner rounding. Provide a curated gallery of pre-designed options alongside custom upload.

3. **Sticky registration CTA** -- On desktop, keep the registration card in a sticky sidebar. On mobile, use a sticky bottom bar or prominent inline button.

4. **One-click returning-user registration** -- Remember user info so returning attendees can register with a single tap. This dramatically reduces friction.

5. **Social proof via guest list display** -- Show "Who's Coming" with avatars and count. Creates FOMO and validates the event.

6. **Two-mode QR check-in** -- Standard (review-then-confirm) for controlled entry, Express (auto-check-in) for high-volume. Color-coded visual feedback is essential.

7. **Status-tab guest management** -- Going / Pending / Waitlist / Invited / Not Going / Checked In / Not Checked In as quick-filter tabs.

8. **Automated email cadence** -- Confirmation (immediate), reminders (1 day, 1 hour), and feedback (post-event) as sensible defaults.

9. **Dark theme as primary** -- Luma's dark-first approach with blue CTAs and generous whitespace creates a premium feel appropriate for tech/conference audiences.

10. **Discovery by category + geography** -- Category chips (Tech, AI, etc.) plus city-based filtering with event counts is an effective discovery pattern.

### 8.2 What to Adapt for GEM India Context

1. **Language support** -- Luma is English-only. GEM needs Hindi and regional language support for broader India reach.

2. **Payment integration** -- Replace Stripe-centric flow with UPI/Razorpay/Paytm for the Indian market. Consider free-first model since many Indian tech events are free.

3. **WhatsApp sharing** -- WhatsApp is the primary sharing channel in India; make it a first-class share option (Luma focuses on general social/link sharing).

4. **Offline check-in** -- Indian conference venues often have unreliable WiFi. Build offline-capable QR scanning with sync-when-connected, which Luma doesn't emphasize.

5. **Bulk registration** -- Indian conferences often have group/corporate registrations. Consider a bulk-register flow that Luma doesn't natively support.

6. **SMS reminders** -- Email open rates are lower in India; add SMS/WhatsApp reminder channels alongside email.

7. **Conference-specific features** -- Luma is optimized for single events. GEM needs multi-track scheduling, speaker profiles, session-level registration, and an agenda builder that Luma doesn't provide.

### 8.3 What to Skip

1. **Crypto/token-gating** -- Not relevant for GEM India's audience.
2. **Community calendars/membership tiers** -- Overkill for a single conference app.
3. **40+ theme gallery** -- For a branded conference, one strong branded theme is better than a theme picker.

---

## 9. Sources

- [Luma Homepage](https://luma.com/)
- [Luma Discover Page](https://luma.com/discover)
- [Luma API Documentation](https://docs.luma.com/)
- [Creating an Event -- Luma Help](https://help.luma.com/p/creating-an-event)
- [Event Registration Process -- Luma Help](https://help.luma.com/p/helpart-ULf0wUFr7qsv6r8/event-registration-process)
- [Check In Guests for In Person Events -- Luma Help](https://help.luma.com/p/helpart-CBQRlYKtvQZciSd/check-in-guests-for-in-person-events)
- [Managing Your Guest List -- Luma Help](https://help.luma.com/p/managing-your-guest-list)
- [Hardware Scanners for High-Volume Events -- Luma Help](https://help.luma.com/p/hardware-scanners)
- [Event Cover Images -- Luma Help](https://help.luma.com/p/event-cover-images)
- [Luma Event Platform: Best Tips, Tricks, and Things to Know -- Party.pro](https://party.pro/luma/)
- [Luma: Events & Invites -- ScreensDesign](https://screensdesign.com/showcase/luma-delightful-events)
- [Luma Event Details UI Design -- SaaSFrame](https://www.saasframe.io/examples/luma-event-details)
- [Luma Web Creating an Event Flow -- Mobbin](https://mobbin.com/explore/flows/70a3e849-a039-482e-a704-c59c6ae1bea2)
- [Luma Features & Pricing -- SaaSWorthy](https://www.saasworthy.com/product/lu-ma)
- [Event and Ticketing System: Luma -- unDavos Playbook](https://coda.io/@robin-t-sverd/undavos-playbook/event-and-ticketing-system-luma-130)
- [Lu.ma Integration -- Codex Solutions International](https://codexsolutionsint.com/lu-ma/)
