# Wireframe Audit — Every PDF Requirement vs Every Screen

> Brutally honest. No sugarcoating.

## What We Have: 16 Screens (Primary Views)
## What We're Missing: ~20 Screens (Secondary Flows, States, Editors)

---

## Module 2: Roles & Access

| PDF Requirement | Screen Exists? | Gap |
|----------------|---------------|-----|
| Super Admin: full access, configure templates, branding, sender names, permissions | ❌ NO | No role management / team settings screen |
| Event Coordinator: create events, sci program, comms, travel, accommodation, certs | ❌ NO | No role-specific view showing filtered nav |
| Ops: read/write only their module, see red-flags | ❌ NO | No Ops-restricted view example |
| Read-only: view program/rosters | ❌ NO | No read-only state (grayed buttons) shown |
| Auth: email + password | ✅ M16 Login | |
| Forgot/reset password | ❌ NO | Missing: forgot password flow (enter email → check inbox → reset) |
| Session security | — | Backend concern, no screen needed |

**MISSING SCREENS:**
1. **Team & Roles** — invite member, assign role, members list (the Clerk members table pattern)
2. **Forgot Password** — enter email screen
3. **Role-restricted view example** — showing grayed/hidden elements for Read-only user

---

## Module 3: Master Data & Multi-Event Model

| PDF Requirement | Screen Exists? | Gap |
|----------------|---------------|-----|
| Master People DB (list, search, filter) | ✅ M03 People List | |
| Person detail with activity timeline | ✅ M09 Person Detail | |
| Imports (CSV + sign-ups add to master) | ❌ NO | **CRITICAL: No CSV import flow (column mapping screen)** |
| Deduplication | ❌ NO | **No merge/dedup screen (side-by-side comparison)** |
| Per-event isolation | — | Architectural, shown via event selector in M01 |
| Scales to thousands | — | Backend concern |
| Audit log | ❌ NO | No audit log view anywhere |
| Red-flag indicators | ✅ M05 Accommodation | Only in accommodation — not shown in People or Travel |

**MISSING SCREENS:**
4. **CSV Import Flow** — upload → column mapping → preview → import (the HubSpot 6-step)
5. **Merge/Dedup Screen** — side-by-side comparison, field-by-field selection
6. **Audit Log View** — timeline of all changes across modules for one person or one event

---

## Module 4: Event Management

| PDF Requirement | Screen Exists? | Gap |
|----------------|---------------|-----|
| Create Event with dynamic ON/OFF fields | ✅ M14 Create Event | |
| Event list (upcoming/past) | ✅ M02 Events List | |
| Session Name, Time, Duration, Moderator, Topic, Speaker, Chairperson, Panelist fields | ❌ NO | **No session/sub-session creation form** |
| Multi-session & sub-sessions | ❌ NO | **No session management screen within an event** |
| Versioning for edits | — | Backend + audit log |
| Revised-responsibility mailers to faculty on changes | — | Trigger logic, but no "send revised mail" UI or confirmation |
| Attachments: agenda/Excel uploads | ❌ NO | No attachment management section |
| Automations: on save → generate agenda PDF | ❌ NO | No agenda PDF preview/generation screen |

**MISSING SCREENS:**
7. **Event Detail/Edit** — view and edit an existing event (not just create)
8. **Session Manager** — list of sessions within an event, add/edit/reorder
9. **Add/Edit Session Form** — fields: name, time, duration, hall, topic, speaker, chair, panelist, moderator
10. **Agenda PDF Preview** — generated PDF preview with download/share actions

---

## Module 5: Registration & Public Pages

| PDF Requirement | Screen Exists? | Gap |
|----------------|---------------|-----|
| Event Landing (public info, speakers, schedule) | ❌ NO | **No public event landing page** |
| Delegate self-register | ✅ M07 Registration Form | |
| Faculty invitation + confirm-participation link | ❌ NO | **No faculty invitation screen** |
| Immediate Acknowledgement (reg# + QR) | ❌ NO | **No confirmation/success screen after registration** |
| Preference Capture at Registration (travel date/time) | ✅ M07 | Travel preferences section exists |
| Bulk campaigns (export lists for invites) | ❌ NO | No bulk export/campaign launch screen |

**MISSING SCREENS:**
11. **Event Landing Page (public)** — the Lu.ma-inspired public page with schedule, speakers, register CTA
12. **Faculty Invitation Screen** — invite by email, assign role, send invitation link
13. **Registration Success** — "You're registered!" with reg#, QR code, calendar add button
14. **Registration Admin List** — admin view of all registrations with status filters (Going/Pending/Waitlist — the 7 tabs from Lu.ma)

---

## Module 6: Scientific Program

| PDF Requirement | Screen Exists? | Gap |
|----------------|---------------|-----|
| Central grid: faculty roles × halls × dates × times | ❌ NO | **CRITICAL: No admin schedule grid builder** |
| Attendee card list view (mobile) | ✅ M04 Program | |
| One-click mail to faculty with all responsibilities | ❌ NO | **No "send responsibilities" trigger/confirmation** |
| Revised mail on changes (A/B/C) | ❌ NO | No revision comparison or send-revised-mail flow |
| Read-only scientific program link on event site | — | Part of Event Landing Page (also missing) |

**MISSING SCREENS:**
15. **Admin Schedule Grid** — the Sessionize two-panel builder (session list + hall×time grid), horizontal scroll on mobile
16. **Faculty Responsibilities Summary** — per-faculty view: "all your sessions" with one-click send mail action
17. **Send Responsibilities Confirmation** — preview email → confirm send

---

## Module 7: Communications

| PDF Requirement | Screen Exists? | Gap |
|----------------|---------------|-----|
| Template list (email + WhatsApp) | ✅ M13 Communications | |
| Delivery log | ✅ M13 | |
| Template EDITOR (editable text + placeholders) | ❌ NO | **No template editing screen (the actual editor with variable picker)** |
| Per-event branding in templates | — | Branding screen exists (M15), but link to templates not shown |
| Triggers (auto-send on events) | ❌ NO | No trigger configuration UI |
| Bulk campaigns | ❌ NO | No campaign creation / recipient selection / send flow |

**MISSING SCREENS:**
18. **Template Editor** — edit email/WA body, insert {{variables}} from picker, preview
19. **Send Campaign Flow** — select template → choose recipients (all delegates / filtered / custom) → preview → send
20. **Trigger Configuration** — "When travel record is saved → send Travel Itinerary template" (simple toggle list)

---

## Module 8: Travel Info

| PDF Requirement | Screen Exists? | Gap |
|----------------|---------------|-----|
| Step 1: Pick active event | ✅ M06 (event shown in context) | |
| Step 2: Form (user, from/to, departure/arrival, PNR, attachment) | ✅ M06 Travel Form | |
| Step 3: One-click send Email + WhatsApp | ✅ M06 "Save & Send" | But no send confirmation / success state |
| Admin export/summary for transport planning | ❌ NO | No travel list view for an event |

**MISSING SCREENS:**
21. **Travel Records List** — all travel records for the active event, with search/filter
22. **Send Confirmation** — "Itinerary sent to Dr. Sharma via Email + WhatsApp" success toast/state

---

## Module 9: Accommodation

| PDF Requirement | Screen Exists? | Gap |
|----------------|---------------|-----|
| Choose Event → auto-load users with Travel Info | ✅ M05 (context shown) | |
| Per-user fields: Room No., Hotel Name, Address, Check-in/out, PDF, Google Maps | ❌ NO | **No accommodation add/edit form** |
| Save → auto-send Email + WhatsApp | — | Similar to travel, needs send confirmation |
| Rooming List exports for hotel | ❌ NO | No export/sharing screen |
| Red-flag markers | ✅ M05 | Full 3-state cascade shown |

**MISSING SCREENS:**
23. **Accommodation Add/Edit Form** — all fields from PDF (Room No., Hotel, Address, Check-in/out, Booking PDF, Google Maps link)
24. **Rooming List Export** — hotel selector → preview list → export/share via link

---

## Module 10: Transport & Arrival Planning

| PDF Requirement | Screen Exists? | Gap |
|----------------|---------------|-----|
| Ops views: filter by date/time, city, terminal | ✅ M10 | |
| Roll-up counts | ✅ M10 | |
| Vehicle batching (plan cars) | ❌ NO | **No kanban/vehicle assignment board** |
| Change/cancel handling → red-flag | ✅ via cascade system | |

**MISSING SCREENS:**
25. **Vehicle Assignment Board** — kanban: drag delegates between Van-1/Van-2/Unassigned (the Airtable kanban pattern)

---

## Module 11: Certificates

| PDF Requirement | Screen Exists? | Gap |
|----------------|---------------|-----|
| Select Event → venue/date auto-fetched | ✅ M12 | |
| Choose certificate template | ✅ M12 | |
| Bulk generate | ✅ M12 | |
| Certificate template EDITOR (editable text + fields) | ❌ NO | **No visual template editor (the pdfme WYSIWYG)** |
| Delivery: Email + WhatsApp link (PDF) | ✅ M12 note text | But no send progress/success state |
| Admin bulk download/ZIP | ❌ NO | No download options screen |
| Self-serve portal | ❌ NO | No public certificate verification page |

**MISSING SCREENS:**
26. **Certificate Template Editor** — visual editor with text, placeholders, logo, QR code, background
27. **Certificate Verification Page (public)** — enter reg# or scan QR → see certificate → download PDF
28. **Generation Progress + Download** — "Generating 1,247 certificates..." → "Done! Download ZIP"

---

## Module 12: QR & Attendance

| PDF Requirement | Screen Exists? | Gap |
|----------------|---------------|-----|
| Unique QR per person | — | Generated, no UI needed |
| Scanner PWA | ✅ M11 QR Scanner | |
| Data capture → analytics | ❌ NO | **No attendance analytics/report screen** |
| Scan result states | ❌ NO | **No success/already-checked-in/invalid scan states** |

**MISSING SCREENS:**
29. **Scan Success State** — "Dr. Rajesh Sharma ✓ Checked In" green card with name, role, photo
30. **Scan Already-Checked-In State** — "Already checked in at 09:12" yellow warning
31. **Attendance Report** — hall popularity, check-in rate by session, timeline

---

## Module 13: Reporting & Dashboard

| PDF Requirement | Screen Exists? | Gap |
|----------------|---------------|-----|
| Dash home: upcoming/past events, metrics | ✅ M01 Dashboard | |
| Exports: agenda, rosters, rooming lists, transport plans, attendance | ❌ NO | **No exports/reports screen** |
| Per-event archive of PDFs & communications | ❌ NO | **No archive browser** |

**MISSING SCREENS:**
32. **Reports & Exports Screen** — list of exportable reports with format options (PDF/Excel/CSV)
33. **Per-Event Archive** — browse past events, view/download archived PDFs and communications

---

## Module 14: Branding & Letterheads

| PDF Requirement | Screen Exists? | Gap |
|----------------|---------------|-----|
| Per-event letterhead/header/logo/colors/subject lines | ✅ M15 Branding | |
| Configurable from Admin without code | ✅ M15 | |
| Templates reusable year-to-year with quick overrides | — | Implied by per-event branding |

**No missing screens — this module is complete.**

---

## SUMMARY

### What We Have: 16 screens
### What We Need: ~17 more screens

**CRITICAL MISSING (will block development):**
1. CSV Import Flow (column mapping)
2. Admin Schedule Grid Builder (the Sessionize-style grid)
3. Template Editor (email/WhatsApp with variable picker)
4. Certificate Template Editor (pdfme WYSIWYG)
5. Session Manager (add/edit sessions within an event)
6. Registration Success (confirmation with QR)

**IMPORTANT MISSING (will cause user confusion if absent):**
7. Team & Roles management
8. Forgot Password flow
9. Faculty Invitation flow
10. Event Landing Page (public)
11. Accommodation Add/Edit Form
12. Travel Records List
13. Reports & Exports screen
14. Scan result states (success/duplicate/invalid)
15. Send Campaign flow
16. Vehicle Assignment kanban
17. Merge/Dedup screen

---

## RECOMMENDATION

**Do NOT start coding yet.** We need:

1. **Complete the missing ~17 screens** in Pencil — another wireframing session
2. **Create a user flow diagram** (FigJam or Mermaid) showing every click path: Login → Dashboard → Event → Session → Send Mail, etc.
3. **Run adversarial review** (/codex:adversarial-review) on the completed set to catch anything we both missed
4. THEN lock the wireframes and start building

The 16 screens we have are the **primary list views**. What's missing are the **forms, editors, confirmation states, and secondary flows** — which is where 80% of the real UX complexity lives.
