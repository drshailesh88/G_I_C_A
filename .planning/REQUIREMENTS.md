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
- [x] Notification templates: event-overridable, channel-specific (email vs WhatsApp), with variable placeholders
- [x] 10 V1 system template keys (registration_confirmation through event_reminder), each as email + WhatsApp
- [x] Automation triggers: one trigger = one channel = one template; execution gated by event status and feature flags
- [x] Notification service abstracts email (Resend) and WhatsApp (Evolution API) behind provider interfaces
- [x] Every notification send checks idempotency key in Redis before sending
- [x] Notification log: proof-of-send with rendered content, provider response, delivery lifecycle, retry/resend tracking
- [x] Delivery events: separate forensic table for raw provider webhook payloads
- [x] Retry Failed screen: filter by status = failed, show error, retry button
- [x] Manual resend creates new notification_log row (is_resend = true, resend_of_id)

### Certificates
- [x] Certificate templates designed in pdfme visual editor, stored as JSON in PostgreSQL
- [x] 7 certificate types (delegate_attendance through cme_attendance)
- [x] Bulk generation: select people by category/attendance, generate PDFs, upload to R2, deliver via email + WhatsApp
- [x] Supersession chain: regeneration creates new row, supersedes old one — never overwrite
- [x] Revocation: mandatory reason, revoked_at, irreversible
- [x] One current valid certificate per (person_id, event_id, certificate_type)
- [x] Storage via signed URLs only — no permanent public file URLs
- [x] Bulk ZIP download via node-archiver
- [x] Distributed lock prevents simultaneous bulk generation for same event/type

### QR & Attendance
- [x] Unique QR per registration (qr_code_token encoded via qrcode.react)
- [x] PWA scanner (@yudiel/react-qr-scanner) for crew phones/iPads
- [x] Scan feedback: success, duplicate, invalid
- [x] Manual check-in search by name when QR doesn't work
- [x] Attendance records separate from registration (repeatable per day/session)
- [x] Offline scanning: Service Worker + IndexedDB queue, sync on reconnect

### Phase 6A — Wire Real Notifications to Cascade (CRITICAL)
- [x] Req 6A-1: Replace notification stub with real service in cascade handlers — travel-cascade.ts and accommodation-cascade.ts import real sendNotification from '@/lib/notifications/send', resolve recipientEmail/phone from person record, maintain idempotencyKey, wrap in try/catch so cascade never fails on notification failure. Tests: create/update/cancel travel → verify notification_log gets real entries. Target: 6 new integration tests.
- [x] Req 6A-2: Wire domain event handler (H7) — handleDomainEvent queries automation_triggers for active triggers matching (eventId, domainEvent), calls sendNotification for each match. Add infinite-loop guard: if source='automation', domain event must NOT re-trigger automation. Tests: active trigger + matching event → notification sent; inactive → not sent; loop guard works. Target: 8 new tests.
- [ ] Req 6A-3: Implement attachment flow (H5) — Email adapter accepts AttachmentDescriptor[], generates R2 signed URLs (15-min expiry), passes to Resend. WhatsApp adapter sends document/image media via Evolution API with R2 signed URL. Add getSignedUrl helper to certificates/storage.ts. Wire certificate delivery to include PDF attachment. Tests: email with attachment, WhatsApp with PDF, expired URL handling, null attachments. Target: 12 new tests.
- [ ] Req 6A-4: Add Clerk middleware for route protection — Create src/middleware.ts with clerkMiddleware(). Public routes: /, /login, /forgot-password, /reset-password, /e/(.*), /verify/(.*), /api/webhooks/(.*). All other routes require auth. Tests: unauthenticated /events → redirect, /e/test-event → 200, /api/webhooks/email → 200. Target: 6 new tests.

### Phase 6B — Per-Event Branding
- [ ] Req 6B-1: Branding configuration CRUD — Add event_branding table or columns (logoUrl, headerImageUrl, primaryColor, secondaryColor, emailSenderName, emailFooterText, whatsappPrefix). Build branding settings page (M15) with image upload to R2, color pickers, text fields, preview button. Zod validation. Tests: upload logo → R2 key saved, set colors → persisted, preview → branding in sample render. Target: 10 new tests.
- [ ] Req 6B-2: Branding injection into notification templates — Modify renderTemplate() to load event branding and inject logo URL, colors, sender name as template variables. React Email templates use these variables. Tests: render with custom branding → logo in HTML, render with no branding → defaults, change branding → new values appear. Target: 6 new tests.

### Phase 6C — Reports & Exports
- [x] Req 6C-1: Excel export engine — Build src/lib/exports/excel.ts using exceljs with styled headers, auto-width. Implement 6 exports (attendee list, travel roster, rooming list, transport plan, faculty responsibilities, attendance report), each scoped by eventId. API routes at /api/events/[eventId]/exports/[type]. Reports page (M47) with cards + download buttons. Tests: 3 per export type (correct rows, correct columns, no cross-event leak). Target: 18 new tests.
- [ ] Req 6C-2: Per-event PDF archive — Generate agenda PDF, collect certificate PDFs from R2, export notification log as CSV, bundle into ZIP, upload to R2 at events/{eventId}/archives/. Return signed download URL. Stream ZIP to avoid memory issues. Tests: archive with data → ZIP has all files, empty event → ZIP with just agenda. Target: 8 new tests.

### Phase 6D — Team Management & Settings
- [ ] Req 6D-1: Team management page (M19) — Show all Clerk organization members with role, email, last active. Actions: invite member (email + role), change role (dropdown), remove member (with confirmation). Uses Clerk organization member management APIs. Guards: cannot remove yourself, cannot downgrade last super_admin. Tests: list members, invite, change role, remove. Target: 8 new tests.

### Phase 7A — Certificate Template Editor UI
- [x] Req 7A-1: Integrate pdfme Designer component — Build /events/[eventId]/certificates/editor/[templateId] page. Load @pdfme/ui Designer (dynamic import, ssr: false). Load template JSON from DB, show WYSIWYG canvas, sidebar with dynamic fields ({recipient_name}, {designation}, etc.). Save persists to DB, Preview generates sample PDF. Tests: Designer renders, add field + save + reload persists, preview generates. Target: 8 new tests.
- [ ] Req 7A-2: Certificate generation page UI (M12) — Template selector, recipient selector (all delegates/faculty/attendees/custom), preview section, Generate button with progress, Download ZIP + Send via Email/WhatsApp buttons. Tests: select template + all delegates → issued_certificates rows, download ZIP → correct PDFs, send email → notification_log entries. Target: 10 new tests.
- [x] Req 7A-3: View all issued certificates (D6) — Table with recipient name, reg#, certificate type, issued date, status, delivery status. Actions: Preview PDF, Resend, Revoke. Filters by type, status, delivery. Search by name/reg#. Tests: list correct count, revoke changes status, resend creates log entry. Target: 8 new tests.

### Phase 7B — QR Check-in UI
- [x] Req 7B-1: Build QR scanner page (M11) — Replace placeholder with three-panel layout: scanner feed (QrScanner), result panel (ScanFeedback overlay 3s), stats panel (total/checked-in/remaining). Bottom bar: Manual Check-in toggle + offline badge. Wire QrScanner onScan → processQrScan, result → ScanFeedback, CheckInSearch → processManualCheckIn. Mobile-first (375px). Tests: scan valid QR → record created, duplicate → feedback, invalid → error, manual → record. Target: 8 new tests.
- [x] Req 7B-2: Offline sync indicator and manual trigger — Amber banner when offline ("scans will sync when connected"), scanner continues (queues to IndexedDB), queued count badge. On reconnect: auto-sync via processBatchSync, green banner "Synced X check-ins", update stats. Tests: offline → scan 3 → IndexedDB has 3, online → batch sync fires → entries removed, sync failure → retained. Target: 6 new tests.

### Phase 7C — Dashboard Enrichment
- [ ] Req 7C-1: Dashboard with real metrics and quick actions — Event selector dropdown (remembers last via localStorage). Metric cards: registrations (with +N today), faculty confirmed/invited, certificates issued/eligible, notifications sent/failed, red flags pending. "Needs Attention" section: red flags → link, failed notifications → link, pending faculty → link, upcoming event without emergency kit → link. Quick actions: Export Attendee List, Generate Certificates, Download Emergency Kit, View Transport. ALL queries filter by eventId, use single aggregation (no N+1). Target: 10 new tests.

### Phase 8A — Background Job Migration
- [ ] Req 8A-1: Install and configure Inngest — Install inngest, create /api/inngest route. Replace synchronous cascade emitter: emitCascadeEvent() → inngest.send(), each cascade handler → inngest.createFunction() with max 3 retries + exponential backoff. Handler code stays identical — only wrapper changes. Tests: travel record → Inngest event emitted, handler failure → retry, all existing cascade tests green. Target: 6 new tests.
- [ ] Req 8A-2: Move bulk operations to Inngest — Bulk certificate gen → step.run() per batch of 50. Bulk email → step.run() per batch of 20 + step.sleep('30s'). Bulk WhatsApp → step.run() per message + step.sleep('2s'). Archive gen → steps per export type. Tests: bulk cert 100 delegates → batched execution, failure at batch 3 → 1-2 persisted + 3 retries. Target: 8 new tests.

### Phase 8B — Monitoring & Safety
- [ ] Req 8B-1: Sentry integration — Install @sentry/nextjs, configure DSN/environment/source maps. Add captureException to notification failures, cascade errors, R2 failures, unhandled API errors. Add Clerk user context. No PII in error payloads.
- [ ] Req 8B-2: Feature flags via Upstash Redis — Create src/lib/flags.ts. Flags: whatsapp_enabled, email_enabled, certificate_generation_enabled, registration_open (per-event), maintenance_mode. Admin UI to toggle. Check before every notification send, cert gen, registration. Tests: whatsapp_enabled=false → email sent but WhatsApp skipped (not failed), maintenance_mode=true → maintenance page. Target: 10 new tests.
- [x] Req 8B-3: GitHub Actions CI pipeline — .github/workflows/ci.yml: type check, lint, test, build on push/PR. Node 20.x, cache node_modules, mock env vars for build. Fail fast on type check failure.
- [ ] Req 8B-4: Pre-event backup automation — Inngest scheduled function 24h before event start_date. Exports: attendee CSV, travel CSV, rooming CSV, transport CSV, program JSON, certificate R2 keys → ZIP → R2. Manual trigger from dashboard ("Download Emergency Kit"). Tests: event starting tomorrow → function fires, ZIP has all files, manual trigger works. Target: 8 new tests.

### Phase 8C — Circuit Breakers & Resilience
- [ ] Req 8C-1: Provider timeout and circuit breaker (H6) — AbortController timeouts: Resend 10s, Evolution API 15s, R2 upload 30s, R2 signed URL 5s. On timeout → status 'failed' with 'PROVIDER_TIMEOUT'. Circuit breaker in Redis: 5 consecutive failures → open, immediate fail with 'CIRCUIT_OPEN', 60s half-open probe. Tests: 20s provider → timeout at 10s, 5 failures → circuit opens, 60s → half-open probe. Target: 12 new tests.

### Phase 9A — End-to-End Integration Test
- [ ] Req 9A-1: Full journey test script — Playwright or documented manual test: create event → add halls → create sessions → assign faculty → publish → register 10 delegates → verify QRs → create travel → verify cascade red flags → create accommodation → verify transport suggestions → assign vehicles → generate certificates → verify R2 PDFs → send via email → verify notification_log → check in 5 via QR → verify attendance → export Excel → export rooming list → generate emergency kit ZIP → verify all files.

### Phase 9B — Production Deploy & UAT
- [ ] Req 9B-1: Environment setup — Vercel project, env vars, Neon production branch, Clerk production, R2 bucket with CORS, Evolution API on DigitalOcean, Upstash Redis production, Sentry production DSN, Inngest production key, custom domain. Run migrations + seed templates + full journey test on production.
- [ ] Req 9B-2: Client UAT with pilot event — Support client running real event: real faculty/delegate import, real program, 20-30 live registrations, real travel/accommodation, certificates generated and sent, QR check-in on physical phones, all reports exported. Fix bugs found during UAT using same build→test→codex loop.

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
