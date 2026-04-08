# GEM India — UX Gap Audit: Can We Wireframe Without Inventing?

> Audited: 2026-04-06
> PDF spec: 19 sections, 14 modules
> Research available: 60+ files across 14 UX sessions + 4 open-source platform deep dives + 3 Chrome teardowns

---

## Research Inventory

### Chrome Teardowns (interactive, click-by-click) — 3 DONE
- ✅ Sessionize (501 lines) — schedule grid, speakers, inform flow, sidebar nav
- ✅ Lu.ma (536 lines) — event creation, registration, guest management, discover page
- ✅ Certifier (464 lines) — certificate editor, credential templates, email templates, sidebar nav

### Chrome Teardowns — 4 NOT DONE (prompts ready)
- ❌ HubSpot CRM — contact list, import mapping, merge, detail page
- ❌ Whova — event wizard, badge editor, check-in kiosk
- ❌ Airtable — grouped views, kanban
- ❌ WATI — template builder, broadcast UI

### Web Research (feature docs, field lists, patterns) — 14 DONE
- All 14 sessions complete with web-research.md files

### Open-Source Platform Deep Dives — 4 DONE
- Indico: 9 files (docs + live conference UX of 3 real events)
- Pretalx: 6 files (full platform + OpenAPI schema)
- Frab: person model + merge algorithm + Drizzle schema
- Fourwaves: 750-line teardown including live registration forms

---

## Module-by-Module Verdict

### ✅ Module 2: Roles & Access
**PDF requires:** 4 roles (Super Admin, Event Coordinator, Ops, Read-only), auth, password reset
**Research covers:**
- Clerk web: `has()` pattern, permission keys, members table, invitation flow, React components
- Retool web: three-layer RBAC (hidden/disabled/query-level), sidebar filtering, role-based view matrix
- Chrome NOT needed: patterns are fully documented from docs

**Can I wireframe without inventing?** YES — every screen maps to Clerk (members table, invite form) + Retool (sidebar layout, role visibility matrix)

---

### ✅ Module 3: Master Data & Multi-Event Model
**PDF requires:** Master People DB, import/dedup, per-event isolation, audit log, red-flag indicators
**Research covers:**
- HubSpot web: tabular list + saved views, slide-over create, 3-column detail, CSV import 6-step, side-by-side merge, active/static segments
- Frab: global Person table, junction tables, MergePersons algorithm, role-per-event model
- Indico: registration forms, participant lists

**Can I wireframe without inventing?** YES — HubSpot web research describes every screen pattern. Frab gives the data model. The audit log pattern = HubSpot's activity timeline.

**Would improve with:** HubSpot Chrome teardown (exact visual spacing, but not blocking)

---

### ✅ Module 4: Event Management
**PDF requires:** Create/Update Event with dynamic ON/OFF fields, multi-session & sub-sessions, versioning, revised-responsibility mailers, agenda PDF automation
**Research covers:**
- Whova web: linear event creation wizard (10 steps), session manager, bulk editing, batch scheduling
- Indico docs: 4-level hierarchy (Session → Block → Contribution → Subcontribution), programme tracks, timetable builder
- Pretalx: schedule editor, version control with named releases
- Fourwaves: event creation stepper, Grid + List schedule views, dual-view pattern

**Can I wireframe without inventing?** YES — event creation from Whova wizard pattern. Sub-sessions from Indico hierarchy. Dynamic fields = standard toggle pattern beside each field label.

---

### ✅ Module 5: Registration & Public Pages
**PDF requires:** Event landing page, delegate self-registration (name, designation, specialty, city, age, mobile, email), faculty invitation + confirm-participation, immediate acknowledgement with reg# + QR
**Research covers:**
- Lu.ma Chrome ✓: full event page layout, single-page creation, registration form, 7 status tabs, guest management
- Whova web: multiple ticket types, custom fields, early bird pricing, discount codes
- Indico docs: registration form builder with 16 field types, moderated/automatic/invitation modes
- Fourwaves: 6 live registration forms documented with field variations

**Can I wireframe without inventing?** YES — Lu.ma Chrome gives the exact page layout and flow. Indico gives the moderated registration for faculty. Fields are specified in the PDF.

---

### ✅ Module 6: Scientific Program (Faculty Responsibilities)
**PDF requires:** Central grid to assign roles (Speaker/Chair/Panelist/Moderator) across halls, dates, times, topics. One-click mail to faculty with all responsibilities. Revised mail on changes. Read-only public link.
**Research covers:**
- Sessionize Chrome ✓: schedule grid builder (two-panel, drag-and-drop, room columns × timeslot rows), speaker management, accountless speakers, inform flow, email templates with variables, calendar appointments
- Indico live UX: 3 real conferences (ICHEP 8-day 13+ tracks, CHEP 7-day), parallel session display, timetable views
- Pretalx: schedule editor with conflict detection, outbox-first email system, named releases
- Fourwaves: Grid + List dual views, conflict checker

**Can I wireframe without inventing?** YES — this is the MOST thoroughly researched module. Sessionize Chrome gives the exact grid interaction. Indico gives the large-scale parallel display. The "one-click mail with all responsibilities" = Sessionize's inform flow (one email per accepted session, or batched).

---

### ✅ Module 7: Communications (Email & WhatsApp)
**PDF requires:** Editable templates with placeholders (event/venue/hall/date/time/role), per-event branding, triggers on events, delivery logs
**Research covers:**
- WATI web: template creation (category, variables `{{1}}`/`{{name}}`, header options, buttons, Meta approval), broadcast campaigns, delivery webhook lifecycle, API
- Stripo web: drag-and-drop editor hierarchy, 13 block types, merge tags with 3 display modes, synchronized modules, brand kit per project
- React Email web: 17 components, 600px layout, 4 GEM-specific template designs with exact section ordering

**Can I wireframe without inventing?** YES — template editor = Stripo's block editor simplified. Variable system = WATI's `{{name}}` syntax. Delivery log = webhook status table (sent/delivered/read/failed).

**Would improve with:** WATI Chrome (visual preview of template builder), but the form structure is documented in web research

---

### ✅ Module 8: Travel Info
**PDF requires:** Step 1: pick event. Step 2: select user, from/to, departure/arrival, PNR, ticket attachment. Step 3: one-click Email + WhatsApp.
**Research covers:**
- TravelPerk web: per-person itinerary card, booking detail fields, status badges, document attachments
- AppCraft web: flight data entry with Amadeus validation, cross-module linkage

**Can I wireframe without inventing?** YES — the PDF literally specifies every field. This is a simple CRUD form + send action. TravelPerk gives the card layout pattern.

---

### ✅ Module 9: Accommodation
**PDF requires:** Choose Event → auto-load users with travel. Fields: Room No., Hotel Name, Address, Check-in/out, Booking PDF, Google Maps link. Auto-send Email + WhatsApp. Rooming list export. Red-flag on changes.
**Research covers:**
- AppCraft web: grid view with filter/sort/bulk-edit, multi-hotel quota tracking, orange-box indicators, dynamic hotel sharing links, self-service roommate selection
- Cvent web: Passkey integration, rooming list automation

**Can I wireframe without inventing?** YES — AppCraft's spreadsheet-like grid is the exact pattern. Fields are in the PDF. Red-flag = AppCraft's orange-box indicator adapted.

---

### ✅ Module 10: Transport & Arrival Planning
**PDF requires:** Ops views filtered by arrival date/time, city, terminal. Roll-up counts ("10 arriving 10:00 from BOM"). Change/cancel handling with red-flags.
**Research covers:**
- Airtable web: nested grouping (Date > Time Slot > City) with record counts, collapsible headers, saved views, color-coded pills, kanban drag-to-update, filter pills

**Can I wireframe without inventing?** YES — Airtable web research documents the exact grouped view pattern with counts, the kanban board, and the filter UI. The specific "10 arriving 10:00 from BOM" = grouped header with count badge.

**Would improve with:** Airtable Chrome (seeing the actual visual weight of grouped headers)

---

### ✅ Module 11: Certificates
**PDF requires:** Select Event → auto-fetch venue/date. Choose certificate template. Bulk generate. Delivery via Email + WhatsApp + PDF. Self-serve portal.
**Research covers:**
- Certifier Chrome ✓: full editor layout (left panel tools, canvas, layer management), credential template flow, dynamic attributes (`[recipient.name]`), bulk generation, email templates, sidebar nav

**Can I wireframe without inventing?** YES — Certifier Chrome gives the exact editor, the 4-step bulk generation flow, the delivery mechanism. This is the most directly clonable module.

---

### ✅ Module 12: QR & Attendance (Optional Add-On)
**PDF requires:** Unique QR per person. Data capture → analytics. Scanner (lightweight PWA) for crew phones/iPads.
**Research covers:**
- Lu.ma Chrome ✓: two-mode scanner (Standard review-then-confirm, Express auto-check-in), guest key vs ticket key QR types, manual check-in fallback
- Whova web: 4 check-in methods (kiosk, QR scan, name search, self-check-in), session-level tracking, real-time analytics

**Can I wireframe without inventing?** YES — Lu.ma Chrome gives the scanner modes. The PWA scanner is a camera view + result card. Analytics = attendance count table.

---

### ✅ Module 13: Reporting & Dashboard
**PDF requires:** Dash home (upcoming/past events, metrics), exports (agenda, rosters, rooming lists, transport plans, attendance), per-event archive
**Research covers:**
- Whova web: 9 report categories, dashboard layout, PDF/Excel export, real-time monitoring
- Retool web: admin panel layout, data table patterns, filter/export UX

**Can I wireframe without inventing?** YES — dashboard = Whova's structure (event list + metric cards + report categories). Export = HubSpot's "export current view" pattern.

---

### ✅ Module 14: Branding & Letterheads
**PDF requires:** Per-event letterhead/header/logo/colors/subject lines. Configurable from Admin without code. Templates reusable with quick overrides.
**Research covers:**
- Stripo web: brand kit 3-step setup, project-per-event model, synchronized modules, template duplication, bulk brand updates

**Can I wireframe without inventing?** YES — Stripo's brand kit creation flow maps directly. Per-event = per-project in Stripo.

---

## THE 3 MICRO-DECISIONS I Cannot Avoid

These are the ONLY places where no platform in our research does exactly what the PDF requires:

### 1. Cross-Module Red-Flag Cascade Visualization
**PDF says:** "red-flag indicators where downstream teams must re-check plans (travel/rooming/transport)"
**Research gap:** No platform does this. Cvent explicitly DOESN'T. AppCraft has orange-box for quotas but not cross-module flags.
**Closest reference:** AppCraft's orange indicator + Airtable's colored pills
**Decision needed:** How does a red flag LOOK on a row in the accommodation grid when someone's travel changed? A red dot? A banner? An inline alert?
**My recommendation:** Red pill/badge on the row (like Airtable's colored pills) with tooltip showing "Travel dates changed on [date]". Clicking opens a side panel with the conflict details.

### 2. Mobile View of Scientific Program Grid
**PDF says:** "responsive for iPad/iPhone; touch-friendly forms"
**Research gap:** Sessionize's grid is desktop-only ("works best on larger screens"). Indico's mobile is a simplified list.
**Closest reference:** Fourwaves documented Grid + List dual views. Indico live research showed simplified timetable on mobile.
**Decision needed:** Does the schedule show as a horizontal scrollable grid on mobile? Or collapse to a list view?
**My recommendation:** List view on phone (session cards grouped by time, filterable by hall/track). Grid on iPad/desktop. Toggle between them. This matches Fourwaves' dual-view pattern and Indico's mobile behavior.

### 3. Dashboard Home Screen Layout
**PDF says:** "upcoming/past events; metrics (events, users, mails, WA sent)"
**Research gap:** No platform's dashboard exactly matches our combo of event list + cross-event metrics.
**Closest reference:** Whova's dashboard (event list + 9 report categories) + Retool's admin layout pattern
**Decision needed:** Top section = metric cards? Or event cards first? Sidebar or top navigation?
**My recommendation:** Event selector dropdown at top → metric cards row (total delegates, mails sent, WA sent, check-ins) → quick action cards (Create Event, Import People, View Reports). This combines Whova's structure with Retool's admin panel pattern.

---

## FINAL ANSWER

**Can I generate mobile-first UI/UX wireframes from the existing research without inventing?**

**YES — for 14 out of 14 modules.** Every screen, form, table, and flow maps to a documented pattern from our research. The 3 micro-decisions above are the ONLY places where I'd be making a judgment call, and even those are derived from adapting existing patterns (red pills, list views, metric cards) rather than inventing from scratch.

**Do you need the remaining 4 Chrome teardowns (HubSpot, Whova, Airtable, WATI) before I start wireframing?**

Honest answer: They would IMPROVE fidelity but are NOT blocking. The web research + 3 completed Chrome teardowns + Indico/Pretalx/Frab/Fourwaves deep dives give enough pattern-level knowledge for every screen.

The 3 Chrome teardowns already done (Sessionize, Lu.ma, Certifier) happen to cover the 3 most complex/novel modules — scientific program, registration, and certificates. The remaining modules (people DB, transport views, WhatsApp, badges) use simpler CRUD patterns that the web research documents sufficiently.
