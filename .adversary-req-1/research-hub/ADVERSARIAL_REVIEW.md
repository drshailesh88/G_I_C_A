# Adversarial Review — GEM India Conference App

Screen IDs below follow the naming in `research-hub/USER_FLOWS.md` even where the current 34-screen PDF does not print the `Mxx` label on-canvas.

## 1. CRITICAL ISSUES (must fix before coding)

### C1. The locked architecture contradicts the contract
- What's wrong: PDF Section 15 specifies responsive HTML/CSS/JS frontend, PHP/Laravel backend, MySQL/PostgreSQL, private-cloud hosting, SMTP/SES/SendGrid/Brevo email, and official WhatsApp Business API providers. `research-hub/DESIGN_DECISIONS.md` instead locks Next.js, Clerk, Neon, Vercel, R2, Inngest, and Evolution API. That is not a minor implementation detail; it is a direct contractual divergence.
- PDF section: 7, 15
- Screen impact: platform-wide; especially M13 Communications, M15 Branding, M19 Team & Roles
- Suggested fix: either get a signed change request approving the new stack/providers/hosting model, or rework the technical plan to match the contractual stack before any build starts.

### C2. WhatsApp path is non-compliant with the stated requirement
- What's wrong: PDF Section 7 says WhatsApp must go through WhatsApp Business API providers and that provider fees are billed directly to the client. The locked choice is Evolution API with a Baileys/WhatsApp Web path marketed as "zero per-message cost." That is a different commercial/compliance model and could fail legal, reliability, or template-approval expectations.
- PDF section: 7
- Screen impact: M13 Communications, M39 Template Editor, every automated send flow
- Suggested fix: decide now whether the product is official WABA only. If yes, remove Evolution API as the primary path and design around approved template, sender, and fee-management constraints.

### C3. Event setup does not implement the contract's dynamic field builder
- What's wrong: PDF Section 4 requires "dynamic ON/OFF fields aligned to the client Excel" and explicit support for radio, dropdown, text, date, time, and uploads. M14 Create Event is only a basic metadata form plus module toggles. M23 Add/Edit Session is a fixed form. There is no Excel-aligned field configuration UI, no field-type picker, no per-event on/off matrix, and no upload-field configuration.
- PDF section: 4
- Screen impact: M14 Create Event, M22 Session Manager, M23 Add/Edit Session Form
- Suggested fix: add an event-level form/schema builder screen with field library, on/off toggles, ordering, required/optional states, and Excel import mapping.

### C4. Versioning is not actually designed
- What's wrong: PDF Section 4 requires versioning for program edits and revised responsibility mailers when the program changes. The current set has M22 Session Manager, M23 Add Session, and M30 Admin Schedule Grid, but nothing for version history, named releases, change diff, approval/release, or "send revised mail based on what changed." An audit trail in the database is not the same thing as usable versioning.
- PDF section: 4, 6
- Screen impact: M22 Session Manager, M23 Add/Edit Session Form, M30 Admin Schedule Grid
- Suggested fix: add version history, compare/diff, release notes, and revised-mail confirmation flows before treating the schedule builder as complete.

### C5. Role-based access is underspecified in the wireframes and inconsistent in the docs
- What's wrong: PDF Section 2 is explicit about four roles and limited module access. The current wireframes show one generic admin shell. M08 More exposes Travel, Accommodation, Transport, WhatsApp, Certificates, Reports, Branding, and Settings in one menu. There is no Ops-only variant, no Read-only variant with disabled actions, and no evidence that Event Coordinators get the exact restricted mix the contract describes. The docs also conflict with each other on whether coordinators can see logistics.
- PDF section: 2
- Screen impact: M01 Dashboard, M08 More, M19 Team & Roles, all write screens
- Suggested fix: design at least three concrete role variants now: Super Admin, Ops, and Read-only. Show hidden vs disabled states explicitly instead of leaving RBAC to code.

### C6. Communications automation is only half-designed
- What's wrong: PDF Section 7 requires trigger-based personalized Email + WhatsApp for create/update event, assign responsibilities, travel saved, accommodation saved, and certificate generated, with audit logs. The current set has M13 Communications and M39 Template Editor, but no trigger management, no event-update template, no certificate-delivery template, and no admin control over which trigger fires which template/channel.
- PDF section: 7, 11
- Screen impact: M13 Communications, M39 Template Editor, M12 Certificates
- Suggested fix: add a trigger configuration screen and expand the template inventory to cover every contractual automation path before implementation starts.

### C7. Certificate editing and issued-certificate management are still not covered
- What's wrong: PDF Section 11 requires choosing an editable certificate template, bulk generation, delivery, and admin bulk download/ZIP. M12 only lets the user choose from pre-baked templates and click "Generate & Send." There is no M41-style certificate editor, no issued certificates list, and no ZIP/download management flow.
- PDF section: 11
- Screen impact: M12 Certificate Generation
- Suggested fix: add certificate template editing, generation progress/completion, issued-certificate management, and bulk download screens before treating certificates as solved.

### C8. Reporting misses both attendance reporting and per-event archives
- What's wrong: PDF Section 13 requires exports plus a per-event archive of PDFs and communications. M47 Reports & Exports only shows six download cards. There is no archive browser, no past-event drilldown, and no attendance report despite QR scanning being in scope via M11/M44/M45/M46.
- PDF section: 12, 13, 16
- Screen impact: M47 Reports & Exports, missing M48 Per-Event Archive
- Suggested fix: add a real reports area with report preview/filtering, attendance analytics, and a browsable event archive for PDFs, exports, and communication history.

### C9. Master data is missing the two things that keep it from collapsing: dedup and audit
- What's wrong: PDF Section 3 requires a deduped master people DB plus audit log for changes. M03 People List, M09 Person Detail, and M32 CSV Import exist, but there is no merge/dedup flow and no cross-module audit-log view. At 50-1000+ delegates per event, imports without merge tooling will create duplicate records fast.
- PDF section: 3
- Screen impact: M03 People List, M09 Person Detail, M32 CSV Import Flow; missing M33 Merge/Dedup and M49 Audit Log
- Suggested fix: add duplicate review/merge UI and an event/person audit log before calling the people model production-ready.

### C10. The faculty invitation flow stops before confirmation
- What's wrong: PDF Section 5 requires "Faculty via invitation & confirm-participation link." The current set includes M26 Invite Faculty, but there is no public confirmation page or accepted/declined state. That leaves a contractual flow only half-designed.
- PDF section: 5
- Screen impact: M26 Faculty Invitation; missing M27 Confirm Participation
- Suggested fix: add the public confirm/decline experience and the resulting admin state changes before coding invitation workflows.

## 2. IMPORTANT ISSUES (should fix, will cause problems)

### I1. Event update/editing is still weak
- What's wrong: PDF Section 4 says create/update event. The current set clearly shows M14 Create Event, but not a proper M21 Event Detail/Edit view with module tabs, attachments, event-level settings, and safe editing of a live event.
- PDF section: 4
- Screen impact: M02 Events List, M14 Create Event
- Suggested fix: add an event detail/edit surface for live events instead of assuming create and edit are the same thing.

### I2. Agenda PDF automation has no preview or approval step
- What's wrong: PDF Section 4 requires agenda PDF generation on save/update. M47 offers an "Agenda PDF" download card, but there is no screen showing the newly generated agenda, no pre-send preview, and no control over which version is being mailed.
- PDF section: 4
- Screen impact: M22 Session Manager, M30 Admin Schedule Grid, M47 Reports & Exports; missing M24 Agenda PDF Preview
- Suggested fix: add agenda preview/version selection before auto-mailing anything to faculty or delegates.

### I3. Cross-module cascade design is one-directional
- What's wrong: the design explicitly shows travel change cascading to accommodation and transport, but not the reverse cases the operations team will hit in real events: accommodation change affecting pickup/drop planning, accommodation cancellation freeing rooming/transport capacity, or registration cancellation releasing room + vehicle slot. This is partly inferred from PDF Sections 9 and 10, which both require live updates and cancellation handling across ops.
- PDF section: 9, 10
- Screen impact: M05 Accommodation, M10 Transport Planning, M35 Travel Records
- Suggested fix: define all supported cascade rules in UI and data design now, not just `travel.updated`.

### I4. Admin schedule on mobile is already at its limit
- What's wrong: M30 Admin Schedule Grid is readable only because it shows two halls and a tiny sample schedule. This app is supposed to be mobile-first for Indian conference organizers. On a real event with 3-5 halls, longer titles, and drag/drop edits, this screen will become horizontally scrollable, text-clipped, and error-prone.
- PDF section: 1, 6, 15
- Screen impact: M30 Admin Schedule Grid
- Suggested fix: design a mobile editing mode for schedule administration instead of assuming the desktop grid can simply shrink onto a phone.

### I5. Reset-password completion is missing
- What's wrong: PDF Section 2 requires forgot/reset. The current 34 screens include M17 Forgot Password but not a reset-password form or post-reset success state.
- PDF section: 2
- Screen impact: M16 Login, M17 Forgot Password
- Suggested fix: add the reset form and success path so auth is complete, not half-wired.

### I6. Reports are exports, not reporting
- What's wrong: M47 is essentially a download launcher. It does not show filters, preview, drilldown, grouped metrics, or archived history. That is a mismatch with the "dashboard + reporting" promise in PDF Section 13.
- PDF section: 13
- Screen impact: M01 Dashboard, M47 Reports & Exports
- Suggested fix: separate reporting screens from raw export shortcuts and show at least one detailed report state per major module.

### I7. Public registration assumes one-by-one signup only
- What's wrong: the contract is silent on payments, but the research explicitly calls out India-specific bulk/institutional registrations. The public flow is M25 landing -> M07 registration -> M28 success, all optimized for a single attendee. If GEM India expects hospital/institution coordinators to register teams, this design will break operationally.
- PDF section: none explicit; inferred from India-specific research and target market
- Screen impact: M25 Event Landing Page, M07 Registration Form, M29 Registrations
- Suggested fix: confirm scope now. Either mark group registration explicitly out of scope or design it before build.

### I8. Offline/poor-network scanning is not designed
- What's wrong: PDF Section 12 requires a lightweight PWA, and the research repeatedly flags unreliable venue WiFi. M11, M44, M45, and M46 cover live scanning states, but there is no offline badge, queue indicator, sync-on-reconnect state, or duplicate-resolution behavior for delayed sync.
- PDF section: 12
- Screen impact: M11 QR Scanner, M44 QR Success, M45 QR Duplicate, M46 Manual Check-in
- Suggested fix: add offline and sync states now if the QR add-on is intended for actual venue use.

### I9. Communications and branding do not clearly show per-event context together
- What's wrong: PDF Sections 7 and 14 require per-event branding, sender display name, and event-specific communications without code changes. M13 Communications does not visibly show active event context, and M15 Branding sits elsewhere. That raises a real risk of editing or sending the wrong event's assets/templates on mobile.
- PDF section: 7, 14
- Screen impact: M13 Communications, M15 Branding
- Suggested fix: surface the active event and brand kit context directly inside communications screens.

## 3. MINOR ISSUES (nice to fix, won't block)

### M1. Scope around payments is muddy
- What's wrong: research recommends Razorpay/UPI/Paytm, but the contract does not ask for payments and the wireframes present "Free Registration." That is not a design failure yet, but it is a lurking scope argument.
- PDF section: 5, 17
- Screen impact: M25 Event Landing Page, M07 Registration Form
- Suggested fix: explicitly mark paid registration as out of scope for phase 1 or add it to the requirements.

### M2. The registration admin statuses are thinner than the source patterns
- What's wrong: M29 shows All, Going, Pending, Waitlist, and Checked In, but not Invited, Not Going, or Not Checked In from the researched control pattern. Not contractual, but it weakens follow-up and invitation ops.
- PDF section: 5
- Screen impact: M29 Registrations
- Suggested fix: decide whether those missing states matter operationally and add them if yes.

### M3. The schedule builder does not show how multi-hall scrolling works
- What's wrong: the locked UX decision says admin schedule is always a grid with horizontal scroll on mobile, but M30 does not visibly teach that behavior. Users may not discover hidden halls.
- PDF section: 6, 15
- Screen impact: M30 Admin Schedule Grid
- Suggested fix: show a scroll hint, hall count, or alternate hall switcher in the mobile design.

### M4. Several list screens lack explicit bulk actions
- What's wrong: People, Registrations, Travel, and Accommodation are all list-heavy modules, but the mobile wireframes mostly show row cards without selected-state bulk actions. That will slow high-volume event operations.
- PDF section: 3, 5, 8, 9
- Screen impact: M03 People List, M29 Registrations, M35 Travel Records, M05 Accommodation
- Suggested fix: add mobile bulk-select patterns where event teams need mass resend/export/update actions.

### M5. Some success/error states are still inconsistent across modules
- What's wrong: QR has explicit result states, registration has a success page, but travel, accommodation, communications campaign send, and certificate generation still rely on implied success more than explicit completion states.
- PDF section: 7, 8, 9, 11
- Screen impact: M06 Travel Form, M36 Accommodation Form, M13 Communications, M12 Certificates
- Suggested fix: standardize submit -> progress -> success/failure states for every outbound workflow.

## 4. THINGS DONE WELL

- M05 Accommodation is the strongest operations screen in the set. The red/yellow flag lifecycle is concrete, understandable, and better than hand-wavy "needs review" badges.
- M06 Travel Form and M36 Accommodation Form capture the right real-world fields, including attachments and map link, without pretending the ops workflow is simple.
- M10 Transport Planning plus M38 Vehicle Assignment give the team a usable logistics model instead of stopping at raw exports.
- M25 Event Landing, M07 Registration, and M28 Registration Success form a coherent public funnel and are materially better than the earlier incomplete set.
- M30 Schedule Builder at least acknowledges conflict detection and operational editing, which is the right direction even though the mobile execution still needs work.
- M13 Communications + M39 Template Editor + M15 Branding establish a credible foundation for reusable event-specific messaging once trigger/configuration gaps are fixed.
