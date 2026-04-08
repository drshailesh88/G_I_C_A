# Requirements — GEM India V1

## Version
v1 — GEM India Conference Management Platform

## Must Have (v1)

### Foundation
- [x] Admin can sign in with email/password and access the dashboard based on their Clerk-managed global role (Super Admin, Event Coordinator, Ops, Read-only)
- [x] Admin can reset a forgotten password via email link
- [x] Dashboard shows event selector dropdown, metric cards (events, people, mails/WA sent), and quick action buttons
- [x] Bottom tab bar navigation persists across main screens (HOME, EVENTS, PEOPLE, PROGRAM, MORE)
- [x] Role-based navigation hides or disables menu items based on global role

### Events
- [x] Super Admin or Event Coordinator can create an event with name, dates, venue, timezone, description, and module toggles
- [x] Event transitions through lifecycle states: draft → published → completed → archived, plus cancelled as terminal state
- [x] Published events have a public landing page showing event info, speakers, and schedule
- [ ] Super Admin or Event Coordinator can duplicate an event's structure (sessions, halls, branding, triggers) without copying person-linked data
- [x] Super Admin can archive, cancel, or transfer ownership of any event
- [x] Per-event access control scopes Event Coordinator, Ops, and Read-only to assigned events only
- [x] Super Admin sees all events; other roles see only assigned events
- [x] Every event-scoped query, mutation, export, and background job filters by event_id

### People
- [x] Master people database stores global person records (salutation, full_name, email, phone_e164, designation, specialty, organization, city, tags)
- [x] Person records require full_name plus at least one of email or mobile — no exceptions
- [x] Deduplication matches on email OR mobile (E.164 normalized); matched records reuse existing person, flag updated fields for admin review
- [x] Admin can import people from CSV with automatic column mapping and fuzzy duplicate detection (Fuse.js)
- [ ] Admin can review and merge duplicate person records side-by-side
- [x] Person records support soft delete, restore (Super Admin), and anonymize (Super Admin, irreversible)
- [ ] Change history visible on person detail screen (timestamp, actor, action, field diff, source) via Bemi audit log
- [x] Person search: partial name, email domain, exact phone, organization, city, specialty — all server-side indexed
- [x] Saved views: All People, Faculty, Delegates, Sponsors, VIPs, Recently Added
- [x] event_people junction auto-upserted on first event touchpoint (registration, invite, assignment, travel, accommodation) — never a manual step

### Registration
- [x] Delegates self-register on public event page (name, designation, specialty, city, age, mobile, email, preferences)
- [x] Registration creates/links a person record in the master database (dedup on email/mobile)
- [x] Immediate acknowledgement: registration number + QR code displayed and emailed
- [x] Registration status state machine: pending → confirmed/waitlisted/declined/cancelled (check-in is separate)
- [x] If event requires_approval: new registration starts as pending; otherwise directly confirmed
- [x] Capacity enforcement: registrations beyond capacity go to waitlisted (if enabled) or blocked
- [x] Super Admin and Event Coordinator can manage registrations (approve, decline, waitlist, cancel)
- [ ] Registration cancellation creates red flags on linked logistics records — no auto-delete of downstream data

### Scientific Program
- [x] Halls managed per event (name, capacity, sort_order) — prevents typo duplicates
- [x] Sessions created with type, track, time (UTC), hall, CME credits, description, is_public flag
- [x] Sub-sessions supported (one level only; parent_session_id self-FK)
- [x] Session role requirements define planning demand per role ("needs 1 Chair, 3 Speakers") without person_id
- [x] Session assignments link confirmed people to sessions with responsibility roles (always non-null person_id)
- [x] Conflict detection: faculty double-booked or hall overlap — warnings, not hard blocks
- [x] Schedule grid view: admin always sees grid (horizontal scroll on mobile); attendee auto-switches (cards < 768px, grid >= 768px)
- [x] Program version publishing creates a snapshot with structured diff (added/changed/removed sessions and assignments)
- [ ] Revised-responsibility notifications sent to affected faculty showing A/B/C changes
- [ ] Aggregated faculty email: one email per person showing ALL responsibilities across sessions

### Faculty Invitation
- [x] Faculty invited via email with unique confirmation link (token-based, no account required)
- [x] Faculty invite state machine: sent → opened → accepted/declined/expired
- [x] Invite covers entire responsibility bundle per person per event, not per-session
- [ ] Accept creates/confirms registration and auto-upserts event_people
- [x] Faculty invitation status visible to coordinator (sent/opened/accepted/declined/expired)

### Travel
- [x] Travel records created by admin or Ops (manual entry or CSV import) — not delegate self-service in V1
- [x] Each record is one journey segment with direction, mode, from/to, departure/arrival (UTC), PNR, carrier, terminal, attachment
- [x] Multiple travel records per person per event (inbound + outbound legs)
- [x] Travel update emits cascade: red flag on accommodation, transport recalculation, delegate notification
- [x] Travel cancellation emits high-severity red flag on accommodation + transport
- [x] Soft cancel only, no hard delete; record stays for audit

### Accommodation
- [x] Accommodation form auto-filters people picker to those with existing travel records for the event
- [x] Record stores hotel name, address, city, room type, room number, shared_room_group, check-in/out, Google Maps URL, booking PDF
- [ ] Save triggers personalized email + WhatsApp with hotel details and map link
- [x] Accommodation update emits cascade: red flag on transport, delegate notification
- [x] Shared room group change flags all linked occupants
- [ ] Rooming list export grouped by hotel (exceljs)
- [x] Soft cancel only; cascade fires red flags downstream

### Transport
- [x] Transport batches group people by date, movement type, time window, and hub (not just city)
- [ ] System suggests batches from travel records; Ops accepts, merges, splits, or discards — no auto-assignment
- [x] Vehicle assignments within batches: vehicle label, type, plate, vendor, driver, capacity
- [x] Passenger assignments link people to vehicles via drag-and-drop kanban board
- [x] Transport is the terminal cascade node — changes don't cascade further
- [x] Three-tier status machines: batch (planned → ready → in_progress → completed), vehicle (assigned → dispatched → completed), passenger (pending → assigned → boarded → completed/no_show)

### Red Flag Cascade System
- [x] Red flags created automatically by Inngest consumers when upstream records change
- [x] Three-state lifecycle: unreviewed → reviewed → resolved (Super Admin can skip to resolved)
- [x] Flag shows what changed (human-readable detail) and when
- [x] One active flag per (event_id, target_entity_type, target_entity_id, flag_type)
- [x] "Show flagged only" filter toggle on accommodation and transport lists
- [x] Every review/resolve action captures actor, timestamp, and optional resolution note
- [x] Cascade direction: Travel → Accommodation + Transport. Accommodation → Transport. Transport → nothing.

### Communications
- [ ] Notification templates: event-overridable, channel-specific (email vs WhatsApp), with variable placeholders
- [ ] 10 V1 system template keys (registration_confirmation through event_reminder), each as email + WhatsApp
- [ ] Automation triggers: one trigger = one channel = one template; execution gated by event status and feature flags
- [ ] Notification service abstracts email (Resend) and WhatsApp (Evolution API) behind provider interfaces
- [ ] Every notification send checks idempotency key in Redis before sending
- [ ] Notification log: proof-of-send with rendered content, provider response, delivery lifecycle, retry/resend tracking
- [ ] Delivery events: separate forensic table for raw provider webhook payloads
- [ ] Retry Failed screen: filter by status = failed, show error, retry button
- [ ] Manual resend creates new notification_log row (is_resend = true, resend_of_id)

### Certificates
- [ ] Certificate templates designed in pdfme visual editor, stored as JSON in PostgreSQL
- [ ] 7 certificate types (delegate_attendance through cme_attendance)
- [ ] Bulk generation: select people by category/attendance, generate PDFs, upload to R2, deliver via email + WhatsApp
- [ ] Supersession chain: regeneration creates new row, supersedes old one — never overwrite
- [ ] Revocation: mandatory reason, revoked_at, irreversible
- [ ] One current valid certificate per (person_id, event_id, certificate_type)
- [ ] Storage via signed URLs only — no permanent public file URLs
- [ ] Bulk ZIP download via node-archiver
- [ ] Distributed lock prevents simultaneous bulk generation for same event/type

### QR & Attendance
- [ ] Unique QR per registration (qr_code_token encoded via qrcode.react)
- [ ] PWA scanner (@yudiel/react-qr-scanner) for crew phones/iPads
- [ ] Scan feedback: success, duplicate, invalid
- [ ] Manual check-in search by name when QR doesn't work
- [ ] Attendance records separate from registration (repeatable per day/session)
- [ ] Offline scanning: Service Worker + IndexedDB queue, sync on reconnect

### Branding & Reports
- [ ] Per-event branding: logo, colors, header image, sender display name, letterhead footer — configurable without code
- [ ] Reports screen with export actions: agenda, faculty roster, delegate list, travel summary, rooming list, transport plan, attendance
- [ ] Excel/PDF exports via exceljs
- [ ] Per-event archive of PDFs and communications in R2

### Settings & Team
- [ ] Team & Roles screen showing event members with their roles
- [ ] Super Admin can invite new members and assign roles
- [ ] Ops role variant of More menu (travel, accommodation, transport only)

### Infrastructure
- [ ] All timestamps stored in UTC, displayed in IST (event.timezone)
- [ ] Phone numbers normalized to E.164 on input (libphonenumber-js)
- [ ] Zod validation on all API inputs
- [ ] Sentry error monitoring with Clerk user context + event ID
- [ ] Health endpoint checking Neon, Clerk, R2, Evolution API, Inngest, Upstash
- [ ] Pre-event backup Inngest job (24h before event start) → emergency ZIP in R2
- [ ] Feature flags in Upstash Redis (WhatsApp enabled, email provider, certificate self-serve, registration open per event)

## Should Have (v1.1)
- [ ] Bulk/group registration for institutional sign-ups
- [ ] Offline QR scanning with Service Worker + IndexedDB sync
- [ ] Category-level registration capacity (separate caps for delegate, faculty, workshop)
- [ ] Event field builder for custom form fields beyond the standard set
- [ ] Delegate self-service travel preference correction workflow
- [ ] Notification preference center (opt-out per channel)

## Out of Scope
- Self-serve certificate portal (delegates downloading via reg#/mobile)
- QR heatmap with hall/meal tracking analytics
- Role-based mobile views beyond responsive usability
- Campaign console / ESP dashboard shortcuts
- Payment/ticketing integration
- Native mobile apps (web + PWA only)
- SMS gateway
- Multi-language support (English only)
- Advanced BI/analytics
- Public API / external integrations
- Self-serve onboarding for new organizations

## Source
- PRD: `.planning/PRD.md`
- GitHub Issue: [drshailesh88/G_I_C_A#1](https://github.com/drshailesh88/G_I_C_A/issues/1)
- Planning decisions: `.planning/decisions/`
- Schema: `SCHEMA_DECISIONS.md`
- State machines: `STATE_MACHINES.md`
- Cascade events: `CASCADE_EVENT_MAP.md`
- Service contracts: `SERVICE_CONTRACTS.md`
- Event isolation: `EVENT_ISOLATION_RULES.md`
- Domain language: `UBIQUITOUS_LANGUAGE.md`
- Data requirements: `.planning/data-requirements.md`
