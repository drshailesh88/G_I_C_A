# GEM India Conference App — UX Research Final Synthesis

> **Date:** 2026-04-05
> **Compiled by:** Master Coordinator
> **Sources:** 14 platform teardowns across 11 parallel research agents
> **Total platforms analyzed:** Whova, Sessionize, Lu.ma, HubSpot CRM, Certifier.io, WATI.io, TravelPerk, AppCraft Events, Airtable, Stripo.email, React Email, Clerk, Retool, Cvent

---

## Table of Contents

1. [Module 1: Roles & Access](#module-1-roles--access)
2. [Module 2: Master People Database](#module-2-master-people-database)
3. [Module 3: Event Management](#module-3-event-management)
4. [Module 4: Registration & Public Pages](#module-4-registration--public-pages)
5. [Module 5: Scientific Program](#module-5-scientific-program)
6. [Module 6: Communications — Email](#module-6-communications--email)
7. [Module 7: Communications — WhatsApp](#module-7-communications--whatsapp)
8. [Module 8: Travel Info](#module-8-travel-info)
9. [Module 9: Accommodation](#module-9-accommodation)
10. [Module 10: Transport & Arrival Planning](#module-10-transport--arrival-planning)
11. [Module 11: Certificates](#module-11-certificates)
12. [Module 12: QR & Attendance](#module-12-qr--attendance)
13. [Module 13: Dashboard & Reports](#module-13-dashboard--reports)
14. [Module 14: Branding & Letterheads](#module-14-branding--letterheads)
15. [Cross-Module Architecture](#cross-module-architecture)
16. [India-Specific Adaptations](#india-specific-adaptations)
17. [UX Pattern Library — Universal Patterns](#ux-pattern-library--universal-patterns)

---

## Module 1: Roles & Access

**Researched from:** Clerk (Session 12), Retool (Session 13)

### Architecture Decision: User → Organization → Role → Permissions

Adopt Clerk's hierarchy. Our "GEM India Conference 2026" is one Organization. Each staff member gets one of 4 roles.

### Our 4 Roles (Mapped to Clerk Keys)

| Role | Key | What They See |
|------|-----|---------------|
| **Super Admin** | `org:super_admin` | Everything. All nav items, all actions, all data. |
| **Event Coordinator** | `org:event_coordinator` | Speakers, schedule, sessions, communications. Logistics hidden. |
| **Ops** | `org:ops` | Logistics, badges, check-in, reports (read). Speaker management hidden. |
| **Read-only** | `org:read_only` | All sections visible, but all write actions **disabled/grayed** with tooltip. |

### Key UX Patterns to Steal

| Pattern | Source | Implementation |
|---------|--------|---------------|
| Permission key format: `org:<feature>:<action>` | Clerk | `org:speakers:manage`, `org:schedule:update`, `org:logistics:read` |
| `has()` helper for conditional rendering | Clerk | `{has({ permission: 'org:speakers:manage' }) && <Button>}` |
| Three-layer access control | Retool | Layer 1: Hidden (feature irrelevant) → Layer 2: Disabled/grayed (read-only) → Layer 3: Query-level enforcement (server) |
| Role-based sidebar navigation | Retool | Each role sees only their nav items. No empty sections. |
| Members table: User \| Joined \| Role (dropdown) \| Actions | Clerk | Direct pattern for our team management page. |
| Invitation: Email + Role dropdown + Invite button | Clerk | One-line invite form. |
| Destructive action confirmation | Retool | Red button + "Are you sure?" modal for deletes. |

### Admin Panel Layout (Retool Pattern)

```
+------------------+----------------------------------------+
| SIDEBAR          | MAIN CONTENT                           |
| [Logo]           | [Header: Page Title + Actions]         |
| [Nav Items]      | [Filters / Search Bar]                 |
| (role-filtered)  | [Data Table / Content]                 |
| [Settings]       | [Pagination]                           |
| [User Avatar]    |                                        |
+------------------+----------------------------------------+
```

---

## Module 2: Master People Database

**Researched from:** HubSpot CRM (Session 4)

### Key UX Patterns

| Pattern | Details |
|---------|---------|
| **Tabular list with saved views** | Tabs for "All People", "Speakers", "Delegates", "Sponsors", "Volunteers". Per-user column customization. |
| **Slide-over create form** | Right-hand panel for new contact — keeps list context visible. Not a full page. |
| **Contact detail: 3-column layout** | Left: action buttons + property cards. Middle: Overview/Activities tabs with timeline. Right: associations (events, sessions, committees). |
| **Activity timeline** | Registration → payment → check-in → session attendance → feedback — all in one chronological stream. |
| **CSV import: 6-step flow** | Upload → auto-map columns → manual override → create inline properties → duplicate handling (update/skip/create) → named import with history. |
| **Deduplication: side-by-side merge** | Confidence-scored duplicate pairs. Field-by-field selection during merge. |
| **Active vs Static segments** | Active: "All registered delegates" (auto-updates). Static: "Day 1 checked-in attendees" (frozen snapshot). |
| **Export-what-you-see** | Filter the list → export exactly what's displayed. Format choice at export time (CSV/XLS/XLSX). |
| **Bulk actions on selection** | Checkbox rows → toolbar transforms to: Delete, Edit property, Assign tag, Add to list, Export. |

### India Adaptation
- **Phone + Name** as primary duplicate detection (not just email). Many Indian attendees use phone-first, email-second.
- Name field should support Dr./Prof. prefixes common in Indian medical/academic conferences.

---

## Module 3: Event Management

**Researched from:** Whova (Session 1)

### Event Creation: Linear Wizard Pattern

```
Step 1: Account/Dashboard → Step 2: Import source → Step 3: Basic Info → Step 4: Logistics → Step 5: Permissions → Step 6: Submit
```

**Key fields:** Event name, logo, dates, venue address, description, passcode for app access.

### UX Patterns

| Pattern | Details |
|---------|---------|
| **Linear setup wizard** | Not freeform; guided step-by-step. Reduces overwhelm for first-time organizers. |
| **No draft/publish toggle** | Events go live on submit (non-academic). Academic events require approval. Consider adding draft mode for GEM. |
| **Auto-sync everywhere** | Changes propagate to app, web, and PDF automatically. No manual publish step. |
| **Excel as universal import** | Agenda, attendees, discount codes — all use spreadsheet templates. |
| **Promotional tools** | Email campaigns, downloadable slides/posters, social media portal, abandoned registration recovery. |

---

## Module 4: Registration & Public Pages

**Researched from:** Lu.ma (Session 3), Whova (Session 1)

### Event Page Design (Lu.ma — Primary Inspiration)

Top-to-bottom layout:
1. **Cover image** — 1:1 square, 800px min, rounded corners
2. **Event title** — large, bold
3. **Date & time** with timezone
4. **Location** with map embed
5. **Hosted by** — organizer avatar + name
6. **Registration CTA** — sticky sidebar on desktop, sticky bottom bar on mobile
7. **Rich text description**
8. **Guest list (social proof)** — attendee avatars + count
9. **Calendar info**

### Registration Flow

| Step | Pattern |
|------|---------|
| Form fields | Name + Email (required). Custom questions optional. |
| Returning users | **One-click sign-in** — system remembers previous info. |
| Confirmation | Immediate email with **calendar invite auto-add** + **QR code** for check-in. |
| Reminders | Default: 1 day before + 1 hour before. |
| Approval mode | Toggle on → registrants enter Pending state → organizer approves/declines with custom emails. |
| Capacity/Waitlist | Set max → auto-waitlist when full → auto-notify if spots open. |

### Registration Admin: 7 Status Tabs

| Going | Pending | Waitlist | Invited | Not Going | Checked In | Not Checked In |

Search by name, email, or **email domain** (e.g., "iitb.ac.in" finds all IIT Bombay registrants).

### Whova Registration Additions
- Multiple ticket types with early bird auto-pricing, group discounts, member-only tiers
- Custom fields for dietary preferences, session selections, badge labels
- Stripe integration (for India: swap with Razorpay/UPI)
- Discount codes with bulk upload/export via CSV

---

## Module 5: Scientific Program

**Researched from:** Sessionize (Session 2)

### This is the most complex module. Key patterns:

### Schedule Grid Builder (Gold Standard)

```
+---------------------+----------------------------------------+
|   SESSION LIST      |   Hall A    |   Hall B    |   Hall C   |
|   (Left Sidebar)    |-------------|-------------|------------|
|                     |  8:00 AM    |             |            |
|   - Session 1       |  9:00 AM    |  Session X  |            |
|   - Session 2       | 10:00 AM    |             |  Session Y |
|   - ...             | 11:00 AM    |             |            |
+---------------------+----------------------------------------+
```

- **Two-panel layout:** Session list sidebar + rooms-as-columns / timeslots-as-rows grid
- **Drag-and-drop:** Place from sidebar, resize by dragging bottom edge, swap by dropping on another, move across days
- **Plenum sessions** span all room columns (keynotes)
- **Service sessions** for breaks, lunch, registration (no speakers)
- **Color coding** by session type derived from custom fields

### Speaker Management

| Pattern | Details |
|---------|---------|
| 3 acquisition paths | CFP submission, email invitation, accountless placeholder (converts later) |
| 3-tier custom fields | **Submission** (during CFP) → **Additional** (post-acceptance: flight, dietary) → **Internal** (organizer-only notes) |
| Session Owner vs Speaker | Separates "who manages" from "who presents" — essential for chairs vs presenters |
| 6 session statuses | Nominated → Accept Queue → Decline Queue → Accepted → Waitlisted → Declined |

### Key Philosophy: "Speakers See Nothing Until Informed"

Deliberate two-step notification. Organizers change statuses freely. Speakers always see "In Evaluation" until the organizer explicitly triggers the **Inform** action. This prevents premature exposure.

### Notification Pipeline

```
Inform → Confirm Participation → Calendar Appointment (batched nightly)
```

- Decline: ONE email listing ALL rejected sessions
- Accept: SEPARATE email per accepted session
- Calendar appointments auto-sent overnight; manual override available
- "What changed" awareness through revision notifications

### GEM India Adaptations Needed
- **Role taxonomy expansion:** Chairperson, Co-chair, Moderator, Panelist, Invited Speaker, Free Paper Presenter, Poster Presenter, Discussant
- **Hierarchical sessions:** Scientific Session → Presentations → Speakers (Sessionize is flat)
- **Abstract management:** Structured fields (objectives, methods, results, conclusions)
- **CME credit tracking** per session
- **PDF programme book generation**

---

## Module 6: Communications — Email

**Researched from:** Stripo (Session 10), React Email (Session 11)

### Email Architecture: Hybrid Approach

- **React Email** for template structure (developer-controlled, type-safe, version-controlled)
- **Stripo-inspired brand kit UI** for non-technical organizers (swap logos/colors per event)
- **Resend or SendGrid** as delivery provider

### Universal Layout Rules

```
600px max-width container on light gray background
→ Event logo (top-center, 40-50px)
→ Personalized greeting
→ Body text (1-3 paragraphs)
→ Primary CTA button (centered, high contrast)
→ Fallback URL below button
→ Footer (event name, contact, unsubscribe)
```

### 8 Email Templates Needed

| Template | Pattern Source | Priority |
|----------|--------------|----------|
| Registration Confirmation | Welcome/Signup patterns | P0 |
| Event Itinerary | Receipt/Invoice (table layout) | P0 |
| Role Assignment Notification | User Invitation pattern | P0 |
| Certificate Delivery | Download notification | P1 |
| Schedule Change Alert | Comment notification | P1 |
| Payment Receipt | Invoice pattern | P1 |
| Password Reset | Security flow | P2 |
| Event Reminder | Urgency pattern | P2 |

### Personalization Variable Standard

```
{{delegate_name}}      {{delegate_email}}     {{event_name}}
{{event_date}}         {{event_venue}}        {{role}}
{{registration_id}}    {{itinerary_url}}      {{certificate_url}}
{{dashboard_url}}      {{unsubscribe_url}}
```

### Branding System (Stripo Pattern)

- **Project-per-event model:** Each conference = separate project with own brand kit
- **Synchronized modules:** Shared header/footer auto-update across all emails
- **Bulk brand update:** Change logo/colors once, propagate everywhere
- **Module library:** Reusable blocks (agenda section, speaker card, map embed) tagged for quick assembly

---

## Module 7: Communications — WhatsApp

**Researched from:** WATI.io (Session 6)

### Template System

| Aspect | Details |
|--------|---------|
| Variable syntax | `{{1}}` numbered (Meta native) or `{{name}}` named (WATI convenience) |
| Categories | **Utility** (event reminders — 1024 chars, lower cost) vs **Marketing** (promotional — 550 chars) |
| Buttons | CTA (website/phone) + up to 3 quick replies |
| Approval | Submit to Meta → 30 min to 24 hours → Approved/Rejected |

### Conference Template Design

```
Hi {{1}}, this is a reminder for {{2}}.

Venue: {{3}}
Hall: {{4}}
Date: {{5}}
Time: {{6}}
Your Role: {{7}}

Hotel: {{8}}
Room: {{9}}

We look forward to seeing you!
```

### Bulk Sending

1. Store attendee data as contact attributes in WATI
2. Create broadcast → select approved template
3. Map template variables to contact attributes OR upload CSV
4. Schedule immediate or future delivery

### Delivery Tracking (Webhook Lifecycle)

```
SENT → Delivered → Read → Replied
  or
SENT → Failed (with failedCode + failedDetail)
```

Track via `localMessageId` per message. Build dashboard: total sent/delivered/read/failed.

### Integration Architecture

```
Conference App DB → Our API → WATI API (V3) → WhatsApp Business API → Attendee's WhatsApp
                                                    ↓
                                            Webhook callbacks → Our backend → Status dashboard
```

---

## Module 8: Travel Info

**Researched from:** TravelPerk (Session 7)

### Per-Person Itinerary Card

Fields per travel segment:
- **Flights:** Departure/arrival city+airport, date/time, airline, flight number, PNR, seat, cabin class
- **Hotels:** Name, address, check-in/out, room type, confirmation number
- **Rail:** Station, times, operator, booking reference
- **Documents:** Ticket PDF, e-ticket attachments

### Admin Features

| Pattern | Details |
|---------|---------|
| Trips page | List all trips, filter by date/destination/status |
| Summary views | "5 people arriving March 10" aggregation |
| Role-based access | Admin (all trips) → Coordinator (assigned travelers) → Delegate (own itinerary) |
| Notifications | Booking confirmation with PNR, 24h check-in reminder, real-time flight alerts, change notifications |
| Export | CSV/PDF with customizable columns |

### Gaps GEM Must Fill
- Direct linkage between travel record and accommodation record for same person
- Visa and invitation letter tracking per delegate
- Multi-event context (delegate attends specific sessions, not just "a trip")

---

## Module 9: Accommodation

**Researched from:** AppCraft Events (Session 8)

### Rooming Assignment Interface

| Pattern | Details |
|---------|---------|
| **Grid view** | Spreadsheet-like with filter/sort/bulk-edit for all room assignments |
| **Fields per record** | Hotel, room type, room number, roommate, check-in/out, special notes |
| **Self-service roommate selection** | Participant picks from registrant list during registration |
| **Smart batch assignment** | Auto-assign unmatched participants by rules (department, country, gender) |
| **Quota tracking** | Real-time occupancy per hotel/room type with **orange box** indicators for fully booked |
| **Dynamic hotel sharing links** | Unique HTTPS link per hotel partner — auto-updating, GDPR-compliant, filtered view |
| **Profile-based restrictions** | VIP sees suites, standard delegates see standard rooms |

### Cross-Module Linkage (Critical)

```
Registration → Flight data → Accommodation → Transport/shuttle
                                                    ↓
                              All visible in unified participant mobile view
```

- Amadeus GDS integration for flight validation
- Auto-grouping by arrival time for shuttle coordination
- Change in one module → alert to ops team

---

## Module 10: Transport & Arrival Planning

**Researched from:** Airtable (Session 9)

### Core UX: Grouped Table Views

```
Day 1 (March 10)                          [14 arrivals]
  └── Morning 8-10 AM                     [8 arrivals]
      └── Mumbai (BOM)                    [5 arrivals]
          - Dr. Sharma    Flight AI-302   Confirmed ●
          - Prof. Gupta   Train 12345     Pending ●
      └── Delhi (DEL)                     [3 arrivals]
  └── Afternoon 2-4 PM                   [6 arrivals]
```

### Key Patterns

| Pattern | Implementation |
|---------|---------------|
| **Nested grouping** | Date > Time Slot > Origin City with auto record counts |
| **Saved views** | "Day 1 Arrivals", "Mumbai Arrivals", "Pending Confirmations" — each with independent filter/sort/group |
| **Color-coded status pills** | Confirmed (green), Pending (yellow), Cancelled (red) |
| **Kanban: status board** | Drag cards between Confirmed/Pending/Cancelled columns |
| **Kanban: vehicle assignment** | Drag delegates between Van-1/Van-2/Van-3/Unassigned columns with capacity counts |
| **Pre-bucketed time slots** | Formula-derived "Morning/Afternoon/Evening" instead of raw timestamps |

---

## Module 11: Certificates

**Researched from:** Certifier.io (Session 5)

### "Almost Exactly What We Need to Build"

### Template Editor (Design Builder)

- **Drag-and-drop** browser-based editor
- Left panel: Background, Images, Elements, Text, Dynamic Attributes, QR Code
- **Layer management** with drag-and-drop reordering
- **Preview** with sample data auto-filled
- 300+ templates, 45+ fonts, A4/US Letter sizes

### Dynamic Attribute System

| Attribute | Syntax | Source |
|-----------|--------|--------|
| Recipient Name | `[recipient.name]` | CSV / DB |
| Issue Date | `[certificate.issued_on]` | Auto-generated |
| Certificate ID | `[certificate.id]` | 16-digit unique |
| Event Name | `[event.name]` | Event settings |
| Custom fields | `[session.title]`, `[hours]`, etc. | CSV column mapping |

Grey tags = default attributes. Blue tags = custom attributes.

### Bulk Generation: 4-Step Flow

```
1. Upload CSV/XLSX → 2. Smart column-to-attribute mapping → 3. Preview with validation → 4. Publish OR Save as Draft
```

### Delivery & Verification

- **Branded email** with CTA → digital wallet → PDF download / LinkedIn add / QR sharing
- **QR verification:** UUID-based, links to verification page with issuer info
- **Post-issuance:** Fix typos, update expiry, revoke, resend, recipient-initiated corrections

### Architecture: 3-Layer Model
- **Design** (template) → **Group** (batch/credential set) → **Recipient** (individual certificate)

---

## Module 12: QR & Attendance

**Researched from:** Lu.ma (Session 3), Whova (Session 1)

### Two-Mode QR Check-in (Lu.ma)

| Mode | Behavior | Best For |
|------|----------|----------|
| **Standard** | Scan → review guest details → tap to confirm | Smaller events, VIP verification |
| **Express** | Scan → auto-check-in with color-coded feedback | High-volume (500+ attendees) |

### QR Code Types
- **Guest Key** (`g-` prefix): Checks in all guest tickets
- **Ticket Key**: Processes individual tickets only

### Additional Features (Whova)

| Feature | Details |
|---------|---------|
| 4 check-in methods | Kiosk self-service, staff QR scan, app name search, contactless self-check-in |
| Badge printing | Drag-and-drop editor, 17 templates, 40 label sizes, Zebra/Brother printers |
| On-demand printing | Triggered by check-in — no pre-printing needed |
| Session-level check-in | Configure per day and per session |
| Real-time analytics | Who checked in, when, at which session |
| Waiver prompts | Auto-prompt during check-in |

### Hardware Support
- Zebra TC52/TC57 for events with 5000+ attendees
- Standard smartphones via app for smaller events

---

## Module 13: Dashboard & Reports

**Researched from:** Whova (Session 1)

### Dashboard Structure

Primary sidebar navigation:
- Event List (home) → Event Setup → Agenda → Registration → Attendees → Check-In → Badges → Speakers → Sponsors → Surveys → Announcements → Reports → Settings

### 9 Report Categories

| Category | What It Tracks |
|----------|---------------|
| Downloads | App adoption rates |
| Networking | Attendee engagement actions |
| Agenda | Session view counts, top 3 sessions |
| Appreciation | Attendee feedback |
| Sponsor Impressions | Sponsor ROI metrics |
| Social Media | Event hashtag mentions |
| App Rating | User satisfaction percentage |
| Attendee Breakdown | Segmentation by location, affiliation, industry |
| Photos | Aggregated attendee photos (ZIP download) |

### Real-Time Monitoring
- Ticket sales, check-in status, poll results, session attendance, gamification progress

### Export
- PDF for stakeholder presentations
- Excel for data analysis
- Per-event archive access

---

## Module 14: Branding & Letterheads

**Researched from:** Stripo (Session 10)

### Per-Event Brand Kit System

| Component | Details |
|-----------|---------|
| Brand kit contents | Logo files, primary/secondary colors, fonts, paddings, button styles, social media links |
| Setup | 3-step: configure settings → add contact info → download/share |
| Multiple kits | One project per event = one brand kit. Unlimited projects on paid plans. |
| Application | Synchronized modules propagate style changes globally. Edit once, update everywhere. |
| Template duplication | Create master → duplicate → swap brand elements → save as new event template |

### Workflow for Multi-Event Branding

1. Create master email template with Brand Kit A (GEM India 2026)
2. Duplicate template
3. Swap logo, header image, colors
4. Save in different project with Brand Kit B (GEM Regional 2026)
5. Synchronized footer/social modules remain linked

---

## Cross-Module Architecture

**Researched from:** Cvent (Session 14), AppCraft (Session 8)

### The #1 Differentiation Opportunity

**Cvent (market leader) does NOT have:**
- Unified per-person admin view across registration + travel + housing
- Cross-module change flagging (travel date change → housing alert)
- Automatic cascade notifications

**We build what they don't have.**

### Event Bus Architecture (Recommended)

```
                    EVENT BUS (Central Notification System)
                    /              |                \
        Registration          Travel Module      Housing Module
                   \               |                /
                    → Per-Attendee Unified Record ←
                              |
                    Unified Admin Dashboard
```

### Cascade Change Rules

When a **travel record changes:**
1. **Transport Planning** → Recalculate shuttle assignment
2. **Accommodation Team** → Red-flag in dashboard with link to attendee's housing record
3. **Delegate** → Automated email/WhatsApp: "Your travel change may affect your hotel booking"

### Date Validation (EventPro Pattern)
- Auto-check accommodation check-in/check-out against travel arrival/departure
- Surface warnings on mismatch with severity indicators
- Support bulk multi-edit for cascade changes

---

## India-Specific Adaptations

Compiled from all research sessions:

| Area | Standard Pattern | India Adaptation |
|------|-----------------|------------------|
| **Payment** | Stripe | Razorpay, UPI, Paytm. Free-first model (many Indian events are free). |
| **Sharing** | Social media links | WhatsApp as **first-class** share channel. |
| **Communication** | Email-first | WhatsApp + SMS alongside email. Lower email open rates in India. |
| **Check-in** | Online QR scanning | **Offline-capable QR scanning** with sync-when-connected. Venue WiFi is unreliable. |
| **Registration** | Individual signup | **Bulk/corporate registration** flow for institutional delegates. |
| **Language** | English only | Hindi + English minimum. Regional languages for broader reach. |
| **Names** | First/Last | Support Dr./Prof. prefixes. Handle single-name entries (common in South India). |
| **Dedup key** | Email | Phone number + name as primary (not all attendees use email daily). |
| **Schedule** | Multi-track | Add **CME credit tracking** per session for medical conferences. |
| **Certificates** | Digital wallet | PDF download emphasis. Not all attendees use LinkedIn. |
| **Travel** | Self-booked | Coordinator-managed — delegates often don't book their own travel. |

---

## UX Pattern Library — Universal Patterns

These patterns appeared across 3+ platforms and should be treated as **industry-standard conventions:**

### Data Management
1. **Tabular list with saved views** (HubSpot, Airtable, Retool)
2. **Slide-over panel for create/edit** (HubSpot, Retool)
3. **CSV import with auto-mapping + manual override** (HubSpot, Certifier, WATI)
4. **Side-by-side merge for deduplication** (HubSpot)
5. **Export-what-you-see** pattern (HubSpot, TravelPerk)
6. **Bulk actions on checkbox selection** (HubSpot, Retool, Whova)

### Status & Visualization
7. **Color-coded status pills** — green/yellow/red (Airtable, Retool)
8. **Kanban drag-to-update-status** (Airtable)
9. **Nested grouping with auto counts** (Airtable)
10. **Real-time quota indicators** — orange for full (AppCraft)

### Forms & Templates
11. **Dynamic attributes/variables** — `{{name}}`, `[recipient.name]` (Certifier, WATI, Stripo, React Email)
12. **Preview before publish/send** (Certifier, WATI, Stripo)
13. **Drag-and-drop editor with layer management** (Certifier, Stripo, Whova badges)

### Notifications
14. **Deliberate two-step notification** — status change ≠ notification (Sessionize)
15. **Automated email cadence** — confirmation → reminder (1 day) → reminder (1 hour) → feedback (Lu.ma)
16. **Webhook lifecycle tracking** — sent → delivered → read → failed (WATI)

### Navigation & Access
17. **Sidebar + main content layout** (Retool, HubSpot, Whova)
18. **Role-based sidebar filtering** — hide irrelevant nav items (Retool)
19. **Three-layer access control** — hidden + disabled + query-level (Retool)

### Check-in & QR
20. **Two-mode QR scanning** — Standard (review-first) + Express (auto) (Lu.ma)
21. **4 check-in methods** — kiosk, QR scan, name search, self-service (Whova)

---

## Next Steps

1. **Chrome Teardowns:** Use the `chrome-brief.md` files in each session folder to guide interactive browser sessions for screenshots and click-by-click flow documentation.

2. **Feed into Playbook:**
   ```
   /capture-planning [paste research for each module]
   /ux-brief app
   /ui-brief app
   ```

3. **Build Order (recommended):**
   - Module 1 (Roles) → Module 2 (People DB) → Module 4 (Registration) → Module 3 (Event Mgmt) → Module 5 (Scientific Program) → remaining modules

4. **Architecture Priority:** Implement the Event Bus / central attendee record FIRST — it's the foundation that every module depends on and our key differentiator vs. Cvent.

---

*Research compiled from 14 sessions, 11 parallel agents, analyzing Whova, Sessionize, Lu.ma, HubSpot CRM, Certifier.io, WATI.io, TravelPerk, AppCraft Events, Airtable, Stripo.email, React Email, Clerk, Retool, and Cvent.*
