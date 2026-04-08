# Whova Platform -- UX Teardown: Web Research

**Date:** 2026-04-05
**Researcher:** UX Research Agent
**Sources:** whova.com public pages, Whova blog posts, third-party review sites

---

## 1. Platform Overview

Whova is an all-in-one event management platform serving 15 million+ users across 50,000+ events in 170+ countries. It targets corporate, academic, government, association, and trade-show organizers.

**Core Product Suite (8 modules):**
1. Event App (iOS 14.0+, Android, Web)
2. Event Management Tools (badges, check-in, surveys, certificates)
3. Registration & Ticketing
4. Abstract Management / Call for Speakers
5. Event Website Builder (20+ templates, no-code)
6. Hybrid & Virtual Events (live streaming, interactive sessions)
7. Exhibitor & Sponsor Management
8. MicroEvents (lightweight setup with reusable templates)

**Compliance:** SOC2 Type II, PCI certified
**App Rating:** 4.8 stars / 164,253+ reviews
**Support SLA:** Response within 30 minutes on business days; weekend/holiday availability

---

## 2. Event Management -- Creation & Configuration

### 2.1 Event Creation Flow

The organizer workflow follows a linear, submit-then-live model:

1. **Account creation** -- organizer signs up, lands on an Event List dashboard showing previous events.
2. **New Event** -- click to start; system asks for registration data source.
3. **Registration system import** -- supports Eventbrite, Constant Contact, RegOnline, Cvent, Wufoo, eTouch. Unsupported systems use manual Excel upload. Authentication triggers auto-pull of event name, logo, venue, description, and attendee roster. Attendee list auto-updates as new tickets are purchased.
4. **Basic Information page** -- fields include:
   - Event name
   - Logo upload
   - Date(s)
   - Venue address
   - Event description
   - **Passcode** -- required for attendees to access the event in the Whova app after download. Organizer creates and distributes via communications.
5. **Administrative permissions** -- define team member access levels for collaborative editing.
6. **Logistics section** -- open-ended, customizable. Supports:
   - GPS guidance
   - Additional learning resources
   - Special events information
   - Parking instructions
   - Hotel recommendations
   - Video content
7. **Sponsor list** -- build sponsor profiles within the platform.
8. **Surveys** -- connect SurveyMonkey or use built-in survey tools.
9. **File sharing** -- upload documents for attendee distribution.
10. **Submit** -- event goes live in the Whova app immediately.

**Key UX patterns:**
- No explicit draft/publish toggle found in public docs. Non-academic events are "automatically published" upon submission. Academic events require an approval step.
- Post-launch editing is preserved -- organizers can modify event details after going live.
- Invitation codes are always required to access events (security layer).
- Dashboard shows status notifications: "ready for launch" (non-academic) or "awaiting approval" (academic).

### 2.2 Promotional Tools (from Dashboard)

- Email campaign distribution
- Downloadable customized slides and posters
- Social media event portal sharing
- Abandoned registration recovery campaigns
- Campaign link tracking for promotion effectiveness

---

## 3. Agenda / Schedule Management

### 3.1 Agenda Builder -- Input Methods

| Method | Details |
|--------|---------|
| **Excel template import** | Download template, fill in agenda data (includes track column), upload. Bulk import processes immediately. |
| **Academic review system import** | Direct import from HotCRP and similar systems. Accepted presentations flow in automatically. |
| **Manual entry** | Create sessions one-by-one via Session Manager. |
| **Call for Speakers conversion** | Accepted abstract submissions auto-convert into agenda sessions. |

### 3.2 Session Fields (Organizer Side)

Based on aggregated research, sessions include these fields:
- **Title**
- **Date and start time**
- **Duration**
- **Room / location assignment**
- **Track(s)** -- session can belong to multiple tracks
- **Tags** -- for filtering and categorization
- **Session type** (e.g., panel, workshop, keynote, poster)
- **Speaker(s)** -- linked from Speaker Center
- **Description**
- **Sponsor information** (optional)

### 3.3 Multi-Track Support

- Tracks are created via Dashboard (Session Manager or Track Manager) or via Excel import column.
- Each track gets a **custom color** for visual identification.
- Sessions can be assigned to **one or multiple tracks** simultaneously.
- **Track filtering** -- attendees filter the full agenda by track. Example: 300 sessions narrows to 8 after filtering.
- Colorful tags appear on session cards in both mobile app and embedded web agendas.
- Whova-generated web agendas fully support track color tagging and filtering.

### 3.4 Bulk Editing Capabilities

Accessible via a **"Bulk edit" button** in Session Manager:
- Bulk assign **rooms** to multiple sessions (with double-booking conflict detection and flagging).
- Bulk assign **tracks** to multiple sessions.
- Bulk assign **tags** to multiple sessions.
- Filter and search before applying bulk edits.
- Final review step before changes take effect.
- Bulk edits overwrite existing assignments for selected sessions.

### 3.5 Non-Session Agenda Items

Added via **"Add non-session items"** option in Session Manager:
- Breaks / meals
- Registration / check-in periods
- Exhibitor hall hours
- Networking events
- Other speaker-free activities

Required fields: title, date, time. Optional: description, room assignment, sponsor info.

**Recurring items:** Check "Repeat this on other days" and select applicable dates. System auto-generates instances for each day.

### 3.6 Back-to-Back (Batch) Scheduling

Three-step process for scheduling multiple sessions at once:

1. **Select sessions** -- filter by track, tag, session type, or search by speaker/title. Multi-select via checkboxes.
2. **Configure** -- set date, start time, individual session duration, break interval (5/10/15/20 minutes), room assignment.
3. **Review & order** -- preview scheduled sessions, drag to reorder, one-click to confirm.

Sub-sessions under a parent session can also be batch-scheduled (must stay within parent timeframe).

**UI pattern:** Visual toggle between individual and batch-scheduling modes.

### 3.7 Attendee View vs. Organizer View

**Attendee-facing (mobile app):**
- Personalized agenda builder ("My Agenda")
- Track filtering with color-coded tags
- Session reminders
- Note-taking on sessions
- Slide/handout downloads
- Offline access to full agenda
- Interactive maps for session locations
- Real-time push notifications for schedule changes

**Organizer-facing (web dashboard):**
- Session Manager with search, filter, bulk edit
- Track Manager for track CRUD operations
- Excel import/export
- Agenda PDF generation for printing/sharing
- Real-time sync across mobile app, web agenda, and event website
- Session attendance monitoring via live polling

### 3.8 Sync & Publishing

- All changes sync automatically across mobile apps and embedded web agendas.
- PDF download available for offline distribution.
- No explicit "publish agenda" step found -- changes appear live upon save.

---

## 4. Speaker Management

### 4.1 Speaker Center

- Centralized hub for all speaker data.
- Adding a speaker to a session **automatically adds them to Speaker Center**.
- Accepted abstract submissions also auto-populate Speaker Center.

### 4.2 Speaker Self-Service Forms

- Customizable forms allow speakers to directly input:
  - Bio
  - Photo
  - Talk details
  - Custom fields (A/V needs, dietary restrictions, accessibility needs, etc.)
- Reduces organizer manual data entry.

### 4.3 Speaker Communication

- Dedicated email templates for:
  - Welcome messages
  - Logistics details
  - Registration instructions
- Interaction tracking: timestamps, send history, response status visible to organizer.

### 4.4 Speaker Promotion

- Speaker webpage builder with professional templates (no design experience needed).
- All speaker info changes auto-sync to speaker webpage.

---

## 5. Abstract Management / Call for Speakers

### 5.1 Submission Portal

- Professional web portal, customizable per event.
- Multiple concurrent submission types within one event (e.g., separate portals for speakers, poster presenters, workshop proposals).
- Customizable submission forms with file uploads and multiple custom fields.
- Login + 2FA protection for submission security.
- Bulk invitation system.
- Portal embeddable on event website.

### 5.2 Review Process

- **Reviewer assignment methods:** by topic, random, or manual.
- **Conflict of interest detection** to maintain fairness.
- **Customizable evaluation criteria** (scoring frameworks).
- Reviewers provide ratings and comments.
- **Progress monitoring** with reminder functionality for delinquent reviewers.
- Automatic reminder emails based on submission deadline.

### 5.3 Decision & Notification

- Sort abstracts by rating to facilitate decisions.
- Accept or reject individually or in bulk.
- Tag submissions for filtering and coordination.
- Personalized acceptance/rejection notifications.

### 5.4 Integration with Event Ecosystem

- Accepted submissions auto-convert into agenda sessions.
- Accepted speakers auto-added to Speaker Center, event app, and speaker webpage.
- Eliminates manual export/import between abstract management and event setup.

---

## 6. Registration & Ticketing

### 6.1 Ticket Types & Pricing

| Feature | Details |
|---------|---------|
| **Multiple ticket types** | Paid and free; no fees on complimentary tickets |
| **Early bird pricing** | Dynamic, auto-adjusts based on purchase date |
| **Quantity controls** | Per-ticket quantity limits and sales windows (start/end dates) |
| **Group discounts** | Encourages bulk registration |
| **Member/invite-only tickets** | Restricted access control |
| **Add-ons** | Supplementary purchases (merchandise, extra sessions) |
| **Exhibitor/sponsor tiers** | Dedicated registration forms with booth selection on interactive floor maps |
| **A-la-carte sponsorship** | Flexible sponsorship package options |

### 6.2 Registration Form Builder

- **Custom fields** for event-specific data collection (dietary preferences, session selections, etc.).
- **Separate registration pages** for different audience segments (avoids confusion).
- **Session sign-up** at registration for early headcount planning.
- **Badge label information** collected during registration.
- Up to **3 custom fields visible on attendee profiles** (e.g., pronouns, chapter, field of expertise).
- Customized fields also available for sponsor and exhibitor forms.

**Missing from public docs:** Specific field types (dropdown, checkbox, text, etc.), conditional logic details, form preview capabilities.

### 6.3 Discount Codes

- Amount-based and percentage-based codes.
- Codes can be scoped to specific ticket types or applied globally.
- **Bulk upload and export** of discount codes (CSV workflow).

### 6.4 Payment Processing

- **Stripe integration** (PCI-compliant).
- Instant fund transfers to organizer Stripe accounts.
- Early payout option for covering event expenses.
- Offline payment support: checks, cash, wire transfers.
- Automated receipt generation and sending.
- Optional fee pass-through to registrants.
- Refunds processed through organizer's Stripe account.

### 6.5 Confirmation & Communication

- Tailored confirmation emails per ticket type.
- Abandoned registration recovery campaigns (retargeting incomplete signups).
- Email campaigns targeting new contacts or past attendees.
- Social media sharing prompts post-registration.

### 6.6 Registration Analytics

- Visual analytics charts for registrant responses.
- Excel spreadsheet export.
- Attendee segmentation for targeted messaging.
- Registration data auto-syncs to event app, name badges, check-in, and certificates.

### 6.7 Embeddable Widgets

- Registration widget embeddable on external websites.
- Branded ticketing webpages.
- Campaign link tracking.

**Note:** No explicit approval workflow (manual review of registrations before confirmation) was found in public documentation. The platform appears to focus on automated confirmation rather than manual gatekeeping.

---

## 7. QR Check-In & Badge Printing

### 7.1 Four Check-In Methods

| Method | Description |
|--------|-------------|
| **Event Check-In Kiosk** | Self-service touch-screen stations. Attendee scans QR code or searches by email/name. Instant badge printing if configured. Fully branded. |
| **QR Code Scanning** | Staff scan attendee QR codes using the Whova app on any phone/tablet. No specialized hardware needed. |
| **App Search (Manual)** | Staff enter attendee name directly in the Whova app to check in. |
| **Self Check-In** | Unlimited contactless stations where attendees initiate their own check-in. |

### 7.2 QR Code Locations

Attendees find their unique QR code in:
- Registration confirmation email
- Name badge (printed)
- Event mobile app under "My Contact Info & QR Code"

### 7.3 Kiosk Check-In Flow

1. Attendee walks up to kiosk.
2. Scans QR code from app or confirmation email, OR searches email/name on screen.
3. System confirms check-in (seconds).
4. Badge prints automatically (if printer connected).
5. Attendee proceeds to venue.

**Kiosk features:**
- Fully branded self-service interface.
- Two-factor authentication option.
- Multiple kiosks can run simultaneously for high-volume events.

### 7.4 Badge Printing

**Badge Editor:**
- **Drag-and-drop editor** with live preview.
- **17 ready-made templates** (diverse aesthetics).
- Design from scratch or customize templates.
- **40 different label and paper sizes** supported.

**Badge Content:**
- Attendee name
- Job title
- Organization
- Ticket type classification
- Unique QR code per attendee
- Company logos and custom images
- Custom branding colors

**Printer Compatibility:**
- Works with existing Zebra and Brother printers.
- 3-step setup with connected printer.
- Supports standard badge sizes.

**Printing Workflow:**
- **On-demand printing** triggered by check-in (no pre-printing needed).
- Walk-in attendees get real-time badge generation.
- Instant reprint for corrections.
- Selective generation (speakers, exhibitors, general attendees separately).
- "Print only previously ungenerated" option to avoid duplicates.

### 7.5 Session & Ticket-Level Check-In

- Configure separate check-in for specific **days** and **sessions**.
- Map tickets to particular sessions or event days.
- Track session-level attendance records.

### 7.6 Additional Check-In Features

- **Waiver prompts** -- automatically prompt attendees to complete waivers during check-in.
- **Form submission tracking** in dashboard.
- **Real-time sync** -- check-in data syncs immediately across all Whova platforms.
- **New attendees** (walk-ins) become instantly available in check-in features.
- **Data import/export** for attendance reporting.

### 7.7 Check-In Analytics

Real-time dashboard shows:
- Who's checked in
- When they checked in
- At which session they checked in
- Overall attendance numbers

---

## 8. Organizer Dashboard & Reporting

### 8.1 Dashboard Structure

The organizer dashboard is a **web-based interface** serving as the central control panel. Based on available research, the primary navigation includes:

- Event List (home)
- Basic Information / Event Setup
- Agenda / Session Manager
- Registration & Ticketing
- Attendee Management
- Check-In
- Name Badges
- Speakers
- Sponsors / Exhibitors
- Surveys
- Announcements
- Reports
- Settings / Permissions

### 8.2 Event Reports Dashboard (9 Categories)

| Report Category | What It Tracks |
|----------------|----------------|
| **Downloads** | App adoption rates; how many people downloaded the event app. Measures promotional effectiveness. |
| **Networking Activities** | Aggregate attendee networking engagement; total actions taken via networking features. |
| **Agenda** | Session view counts; top 3 sessions by attendee interaction. |
| **Organizer Appreciation** | Attendee feedback on what they liked and enjoyed. |
| **Sponsor Impressions** | How many impressions sponsors had on attendees. Critical for sponsor ROI reporting. |
| **Tweets** | Social media mentions using event hashtag. Reflects marketing performance. |
| **Love Whova** | Percentage of users rating the app positively. Useful for stakeholder presentations. |
| **Attendee Breakdown** | Segmentation by location, affiliation, and industry (powered by SmartProfile technology). |
| **Photos** | Aggregated attendee photos with downloadable ZIP for social media use. |

### 8.3 Report Export

- **Export PDF** -- download full event report as PDF for stakeholder presentations.
- **Excel export** -- registration analytics and attendee data.
- Reports feature "upgraded visuals, clarity, and detail" with organized, systematized layout.

### 8.4 Real-Time Monitoring

From the dashboard, organizers can monitor in real-time:
- Ticket sales
- Gamified activities progress
- Poll results
- Check-in status
- Session attendance

### 8.5 Announcement System

- Announcement button on dashboard.
- Send to all attendees or filter by attendee labels.
- Push notifications for conference updates.
- Restrict event access to registered attendees only.

---

## 9. Attendee Engagement Features

### 9.1 Networking Tools

| Feature | Details |
|---------|---------|
| **SmartProfiles** | Auto-generated professional profiles from registration and public data |
| **Business card scanning** | Supports English, Chinese, Korean. One-click digital card exchange. |
| **1:1 & Group messaging** | In-app chat pre-, during, and post-event |
| **Video calling** | Real-time video between attendees |
| **Attendee matchmaking** | Algorithm-based suggestions from shared interests |
| **Meeting scheduler** | Facilitates 1:1 business meetings |
| **Speed networking** | Shuffling video chatrooms for rapid connections |
| **Round table sessions** | Structured group discussions |

### 9.2 Community & Engagement

- **Community Board** -- self-organized meetups, icebreakers, job postings, lost-and-found.
- **Live polling** -- real-time audience response and headcount.
- **Gamification** -- leaderboards, photo contests, competitive activities.
- **Attendee Passport Contest** -- gamified booth visit incentives.
- **Photo sharing** -- event media documentation.
- **Social media integration** -- Twitter sharing, hashtag promotion.

### 9.3 Sponsor & Exhibitor Tools

- **Sponsor banner ads** -- 20+ placement locations for continuous visibility.
- **Digital booth profiles** -- brochures, videos, live chat, giveaways, coupons.
- **QR code lead capture** -- mobile lead retrieval from app.
- **Appointment scheduling** -- exhibitor-attendee meeting facilitation.
- **Sponsor tier packages** -- customizable visibility levels.
- **ROI reporting** -- quantitative sponsor performance metrics.
- **Lead retrieval dashboards** for exhibitors.
- **Outreach campaigns** for sponsors.

---

## 10. Key UX Patterns Identified

### 10.1 Information Architecture

- **Linear setup wizard** for event creation (not a tabbed or free-form editor).
- **Centralized dashboard** with sectioned navigation (not a sidebar tree; appears to be top-level categories).
- **Auto-sync everywhere** -- changes propagate to app, web, and PDF automatically.
- **Excel as universal import format** -- agenda, attendees, discount codes all use spreadsheet templates.

### 10.2 Interaction Patterns

- **Bulk operations** -- bulk edit button pattern for rooms, tracks, tags; bulk accept/reject abstracts; bulk discount code upload.
- **Filter-then-act** -- search/filter sessions before applying bulk edits.
- **Drag-and-drop** -- badge editor, session reordering in batch scheduling.
- **Live preview** -- badge editor shows real-time preview.
- **Conflict detection** -- room double-booking flagged automatically during bulk assignment.
- **Confirmation dialogs** -- final review step before bulk changes take effect.

### 10.3 Navigation & Status

- **Status indicators** -- "ready for launch" vs. "awaiting approval" notifications.
- **Real-time dashboards** -- ticket sales, check-in, polls update live.
- **Color-coded tracks** -- consistent visual language across mobile, web, and PDF.

### 10.4 Automation

- **Auto-population** -- registration data flows into badges, check-in, certificates.
- **Auto-convert** -- accepted abstracts become agenda sessions and speaker profiles.
- **Auto-update** -- attendee list refreshes as new tickets are purchased.
- **Auto-prompt** -- waivers triggered during check-in.

### 10.5 Gaps / Limitations Noted

- **No explicit draft/publish for events** -- events go live immediately upon submission (non-academic). No staging or preview mode documented.
- **No documented approval workflow for registration** -- appears to be auto-confirm only.
- **No conditional logic details** for registration form builder in public docs.
- **No conflict detection for session scheduling** -- only room assignment has conflict flagging.
- **Limited offline organizer capabilities** -- dashboard is web-only; offline access is attendee-side only.
- **No documented role-based access granularity** -- "administrative permissions" mentioned but specific roles/permissions not detailed publicly.

---

## 11. Sources

- [Whova Homepage](https://whova.com)
- [Whova Event App Features](https://whova.com/whova-event-app/)
- [Upgraded Organizer Dashboard Blog](https://whova.com/blog/upgraded-organizer-dashboard-renewed-mobile-app/)
- [Renovated Event Reports Blog](https://whova.com/blog/new-on-your-organizer-dashboard-renovated-event-reports/)
- [Paperless Check-In](https://whova.com/event-management-software/paperless-check-in/)
- [Event Check-In Kiosk](https://whova.com/event-management-software/event-check-in-kiosk/)
- [Badge Printing Software](https://whova.com/event-management-software/event-badge-printing-software/)
- [Name Badge Generation](https://whova.com/event-management-software/name-badge-generation/)
- [Event Agenda Center](https://whova.com/event-management-software/event-agenda-center/)
- [Registration Software](https://whova.com/event-registration-software/)
- [Introducing Whova EMS Blog](https://whova.com/blog/introducing-whova-event-management-system/)
- [Agenda Importing Blog](https://whova.com/blog/upgrade-organizer-dashboard-agenda-importing/)
- [Multitrack Agendas Blog](https://whova.com/blog/multitrack-agendas-approachable-and-manageable/)
- [Bulk Agenda Editing Blog](https://whova.com/blog/bulk-agenda-editing/)
- [Back-to-Back Scheduling Blog](https://whova.com/blog/back-to-back-scheduling/)
- [Speaker Management Software](https://whova.com/speaker-management-software/)
- [Abstract Management Software](https://whova.com/abstract-management/)
- [Bulk Discount Code Blog](https://whova.com/blog/bulk-discount-code-import-and-export/)
- [Kiosk Blog Post](https://whova.com/blog/kiosk-check-in-badge-printing/)
- [GetApp Whova Review](https://www.getapp.com/customer-management-software/a/whova/)
- [Capterra Whova Review](https://www.capterra.com/p/149712/Whova/)
