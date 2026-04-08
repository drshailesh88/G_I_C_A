# GEM India V1 — Product Requirements Document

## Problem Statement

Indian medical and academic conference organizers currently manage events using a fragmented combination of Excel spreadsheets, WhatsApp groups, email threads, and manual PDF generation. A typical 500-delegate conference requires a coordinator to track faculty assignments across multiple halls and time slots in Excel, send individual itinerary emails manually, coordinate airport pickups via WhatsApp groups, generate certificates one-by-one in Word, and maintain rooming lists in separate spreadsheets per hotel.

This fragmentation causes:
- Faculty receiving incorrect or duplicate responsibility emails when the program changes
- Delegates arriving at airports with no pickup arranged because a travel change wasn't communicated to the transport team
- Certificates issued with wrong names or designations because the master list was out of date
- Ops teams working from stale rooming lists because accommodation changes didn't propagate
- Hours of manual work generating agenda PDFs, attendance reports, and export files after every edit

No existing platform solves this end-to-end for Indian medical conferences. Zinvos (the closest competitor) lacks the logistics cascade system. Indico (CERN) doesn't handle travel/accommodation/transport. Commercial platforms like Cvent are prohibitively expensive and don't integrate WhatsApp.

## Solution

GEM India is a secure, role-based web dashboard that plans and runs medical/academic conferences end-to-end. It provides:

1. **One master people database** reusable across events — no re-entering delegate or faculty details year after year
2. **Per-event isolation** — each conference is a self-contained workspace with its own program, registrations, logistics, certificates, and communications
3. **A red-flag cascade system** — when travel changes, the system automatically flags accommodation and transport records for ops review, and notifies the delegate. No change falls through the cracks
4. **Aggregated faculty communications** — one email showing ALL of a faculty member's responsibilities across sessions, with structured A/B/C diffs when the program is revised
5. **Certificate generation with a visual editor** — design templates, bulk generate PDFs, deliver via email and WhatsApp, verify via QR
6. **WhatsApp integration** — same notifications that go via email also go via WhatsApp, using the communication channel Indian doctors actually check

The platform is mobile-first for attendee-facing screens (390px design, bottom tab navigation) and desktop-optimized for admin operations (data tables, schedule grids, kanban boards).

## User Stories

### Super Admin

1. As a Super Admin, I want to create a new event with name, dates, venue, and module toggles, so that I can set up a conference workspace.
2. As a Super Admin, I want to publish an event, so that its public landing page and registration form become accessible.
3. As a Super Admin, I want to duplicate a previous event's structure (sessions, halls, branding, triggers) into a new draft, so that annual conferences can be set up quickly without re-entering configuration.
4. As a Super Admin, I want to archive or cancel an event, so that completed or abandoned conferences become read-only while preserving all data.
5. As a Super Admin, I want to assign Event Coordinators and Ops staff to specific events, so that access is scoped per conference.
6. As a Super Admin, I want to transfer event ownership from one coordinator to another, so that team changes don't block operations.
7. As a Super Admin, I want to create, edit, and soft-delete person records in the master people database, so that the contact list stays accurate across events.
8. As a Super Admin, I want to import people from CSV with automatic column mapping and fuzzy duplicate detection, so that bulk lists from Excel can be loaded quickly.
9. As a Super Admin, I want to review and merge duplicate person records side-by-side, so that the master database stays clean.
10. As a Super Admin, I want to anonymize a person record (replacing PII with hashed placeholders), so that GDPR-like compliance requests can be handled without breaking referential integrity.
11. As a Super Admin, I want to view the change history of any person record (who changed what, when, from what source), so that disputes about data accuracy can be resolved.
12. As a Super Admin, I want to manage global notification templates that serve as defaults for all events, so that new events start with standard communications.
13. As a Super Admin, I want to toggle system-wide feature flags (WhatsApp enabled, email provider, certificate self-serve), so that capabilities can be enabled or disabled without code deployment.
14. As a Super Admin, I want to view cross-event reports and dashboards, so that I can see aggregate metrics across all conferences.
15. As a Super Admin, I want to revoke an issued certificate with a mandatory reason, so that incorrectly issued certificates are formally invalidated.

### Event Coordinator

16. As an Event Coordinator, I want to create and configure events I own, so that I can manage conferences independently.
17. As an Event Coordinator, I want to create halls within my event, so that sessions can be assigned to specific physical spaces.
18. As an Event Coordinator, I want to create sessions with type, track, time, hall, and CME credits, so that the scientific program is fully defined.
19. As an Event Coordinator, I want to create sub-sessions under a parent session (one level), so that symposia with multiple talks are properly structured.
20. As an Event Coordinator, I want to define role requirements per session (e.g., "needs 1 Chair, 3 Speakers"), so that I can track unfilled slots on the schedule grid.
21. As an Event Coordinator, I want to assign faculty to sessions with specific responsibility roles, so that the program grid shows who is doing what, where, and when.
22. As an Event Coordinator, I want to see conflict warnings when a person is double-booked across overlapping sessions, so that scheduling errors are caught before publishing.
23. As an Event Coordinator, I want to publish a program version with a structured diff (added/changed/removed sessions and assignments), so that affected faculty receive accurate revised-responsibility notifications.
24. As an Event Coordinator, I want to send one aggregated email to each faculty member showing ALL their responsibilities across all sessions, so that faculty receive a single clear communication instead of per-session fragments.
25. As an Event Coordinator, I want to invite faculty via email with a unique confirmation link, so that faculty can accept or decline their responsibility bundle.
26. As an Event Coordinator, I want to view the faculty invitation status (sent, opened, accepted, declined, expired) for each invited person, so that I can follow up with non-responders.
27. As an Event Coordinator, I want to manage delegate registrations (approve, decline, waitlist, cancel), so that event capacity is controlled.
28. As an Event Coordinator, I want to configure registration settings per event (open/closed, approval required, capacity, waitlist, cutoff date, preference fields), so that each event's registration behavior is tailored.
29. As an Event Coordinator, I want to create and edit notification templates per event (email and WhatsApp separately), with variable placeholders, so that communications are customized per conference.
30. As an Event Coordinator, I want to configure automation triggers that bind business events to notification sends, so that routine communications fire automatically.
31. As an Event Coordinator, I want to view the notification log for my event (who was sent what, when, via which channel, delivery status), so that I can verify communications were delivered.
32. As an Event Coordinator, I want to resend a failed or previously sent notification, so that delivery gaps are addressed.
33. As an Event Coordinator, I want to design certificate templates using a visual editor (pdfme), so that certificates match the conference branding without code.
34. As an Event Coordinator, I want to bulk generate certificates for selected delegates or faculty, so that hundreds of certificates are produced in one action.
35. As an Event Coordinator, I want to configure per-event branding (logo, colors, header image, sender display name, letterhead footer), so that all communications and certificates carry the conference brand.
36. As an Event Coordinator, I want to export reports (agenda, faculty roster, delegate list, travel summary, rooming list, transport plan, attendance) as Excel/PDF files, so that data can be shared with hotels, transport vendors, and the organizing committee.

### Ops Staff

37. As an Ops staff member, I want to create and edit travel records (from/to, departure/arrival, PNR, carrier, terminal, ticket attachment) for delegates and faculty in my assigned events, so that itineraries are tracked.
38. As an Ops staff member, I want to see that the accommodation form auto-filters to people who already have travel records for this event, so that I'm only assigning hotels to people who are actually travelling.
39. As an Ops staff member, I want to create and edit accommodation records (hotel, room, check-in/out, Google Maps link, booking PDF) for people in my assigned events, so that rooming plans are managed.
40. As an Ops staff member, I want to export rooming lists grouped by hotel, so that I can send each hotel its specific guest list.
41. As an Ops staff member, I want to see red flags on accommodation and transport records when travel details change, so that I know which plans need re-checking.
42. As an Ops staff member, I want to review red flags (mark as reviewed, then resolved with optional note), so that the flag lifecycle tracks who handled each change.
43. As an Ops staff member, I want to filter accommodation and transport views to "show flagged only", so that I can focus on records that need attention.
44. As an Ops staff member, I want to view transport batches grouped by date, time window, and hub, with roll-up passenger counts, so that I can plan vehicle assignments.
45. As an Ops staff member, I want to assign passengers to vehicles using a drag-and-drop kanban board, so that shuttle planning is visual and fast.
46. As an Ops staff member, I want to import travel records and accommodation records from CSV, so that bulk data from travel agents and hotels can be loaded.
47. As an Ops staff member, I want to resend logistics notifications (travel itinerary, accommodation details, transport pickup) for my assigned events, so that delegates get updated information.

### Delegate (Public, No Auth)

48. As a delegate, I want to view an event landing page with public info, speakers, and schedule, so that I can learn about the conference before registering.
49. As a delegate, I want to self-register for an event (name, designation, specialty, city, age, mobile, email, preferences), so that I can attend the conference.
50. As a delegate, I want to receive an immediate acknowledgement with a registration number and QR code after registering, so that I have proof of registration.
51. As a delegate, I want to receive my travel itinerary via email and WhatsApp when it's entered by the organizing team, so that I have my travel details in one place.
52. As a delegate, I want to receive my hotel details with a Google Maps link via email and WhatsApp, so that I can navigate to my accommodation.
53. As a delegate, I want to receive my certificate via email and WhatsApp after the event, so that I have proof of attendance.

### Faculty (Public, Limited Auth)

54. As a faculty member, I want to receive an invitation email with all my responsibilities listed and a confirm/decline link, so that I can review and respond in one step.
55. As a faculty member, I want to accept my responsibility bundle via a single confirmation page (no account creation required), so that confirming is frictionless.
56. As a faculty member, I want to receive a revised-responsibilities email when the program changes, showing what was added, changed, and removed, so that I always know my current obligations.
57. As a faculty member, I want to view a read-only scientific program on the event website, so that I can see the published schedule.

### Scanner Crew (QR Check-in)

58. As a scanner crew member, I want to scan delegate QR codes using a lightweight PWA on my phone, so that I can check people in at event entry points.
59. As a scanner crew member, I want to see immediate feedback on scan (success, duplicate, invalid), so that I can handle each attendee quickly.
60. As a scanner crew member, I want to manually search and check in a delegate by name when their QR code doesn't work, so that no one is turned away.
61. As a scanner crew member, I want scans to queue locally when offline and sync when connectivity returns, so that check-in works even with poor WiFi at the venue.

### Read-Only User

62. As a read-only user, I want to view all data for my assigned events (program, registrations, logistics, reports) without being able to edit anything, so that I can monitor without risk of accidental changes.
63. As a read-only user, I want to see red flag states and details on logistics records, so that I'm aware of operational issues even if I can't act on them.

## Implementation Decisions

### Platform Architecture

- **Framework:** Next.js 16 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Auth:** Clerk (`@clerk/nextjs`) — 4 global roles, per-event access via `event_user_assignments` table
- **Database:** Neon (serverless PostgreSQL, Mumbai region) + Drizzle ORM
- **Storage:** Cloudflare R2 (S3-compatible, zero egress) — all files accessed via signed URLs, never permanent public URLs
- **Background Jobs:** Inngest (event-driven fan-out for cascade system and notification orchestration)
- **Cache/Locks/Flags:** Upstash Redis (rate limiting, idempotency keys, distributed locks, feature flags)
- **Email:** Resend + React Email (TSX templates with variable props)
- **WhatsApp:** Evolution API (Docker sidecar on DigitalOcean, Baileys-based, zero per-message cost) behind a provider abstraction for future WABA swap
- **Certificates:** pdfme (`@pdfme/ui` designer + `@pdfme/generator` bulk PDF)
- **QR:** qrcode.react (generation) + @yudiel/react-qr-scanner (PWA scanning)
- **CSV Import:** react-spreadsheet-import (fuzzy auto-mapping)
- **Data Tables:** sadmann7/shadcn-table (TanStack Table + Drizzle + server-side pagination)
- **Monitoring:** Sentry (errors) + OpenStatus (uptime)
- **Audit:** Bemi (`@bemi-db/drizzle` — automatic PG-level CDC)
- **Scaffold:** ixartz/SaaS-Boilerplate (Next.js + Clerk + Drizzle + shadcn pre-wired)

### Database Schema (24 Tables)

Schema is fully designed in `SCHEMA_DECISIONS.md` with 23 numbered design decisions. Key tables:

- **organizations** — future multi-tenancy boundary (V1: single row)
- **events** — primary data boundary with JSONB config blocks (module_toggles, branding, registration_settings, communication_settings, public_page_settings)
- **halls** — prevents "Hall A" vs "Hall-A" typos, enables clean schedule grid grouping
- **event_user_assignments** — per-event access control (Clerk user to event)
- **event_people** — auto-upserted junction establishing person-event membership (never manually created)
- **people** — master identity database with salutation, full_name, email, phone_e164, tags
- **sessions** — with parent_session_id self-FK (one level nesting only), hall_id FK, UTC timestamps
- **session_role_requirements** — planning demand ("needs 1 Chair, 3 Speakers"), no person_id
- **session_assignments** — confirmed person-session-role links, always non-null person_id
- **faculty_invites** — invitation/confirmation workflow separate from assignments
- **program_versions** — published snapshots with structured diffs (added/changed/removed)
- **event_registrations** — category-based (not ticket-type), no payment fields, preferences as JSONB
- **travel_records** — per-segment with direction, hub, terminal, carrier, PNR, attachment
- **accommodation_records** — with shared_room_group, Google Maps URL, booking attachment
- **transport_batches** + **vehicle_assignments** + **transport_passenger_assignments** — three-tier transport model
- **certificate_templates** + **issued_certificates** — supersession chain (never overwrite)
- **notification_templates** + **notification_log** + **notification_delivery_events** — split operational log from forensic webhook payloads
- **automation_triggers** — one trigger = one channel = one template
- **red_flags** — polymorphic target with source change summary, unique active constraint
- **attendance_records** — separate from registration, repeatable per day/session

### State Machines (Frozen in `STATE_MACHINES.md`)

- **Registration:** pending → confirmed/waitlisted/declined/cancelled (check-in is separate)
- **Faculty Invite:** sent → opened → accepted/declined/expired
- **Red Flag:** unreviewed → reviewed → resolved
- **Notification:** queued → sending → sent → delivered → read (or failed → retrying)
- **Certificate:** issued → superseded/revoked
- **Transport Batch:** planned → ready → in_progress → completed/cancelled
- **Vehicle Assignment:** assigned → dispatched → completed/cancelled
- **Passenger Assignment:** pending → assigned → boarded → completed/no_show/cancelled

### Event Isolation (Frozen in `EVENT_ISOLATION_RULES.md`)

- Every event-scoped table has `event_id` FK + index
- Every repository method takes `eventId` explicitly
- Every query filters by `event_id`
- Every join includes event_id matching
- Background jobs carry and re-verify eventId
- Cross-event reads are Super Admin only

### Cascade System (Frozen in `CASCADE_EVENT_MAP.md`)

11 domain events with typed payloads, consumer lists, and idempotency keys:
- `conference/travel.saved|updated|cancelled`
- `conference/accommodation.saved|updated|cancelled`
- `conference/registration.cancelled`
- `conference/session.cancelled`
- `conference/program.version_published`
- `conference/certificate.generated`
- `conference/transport.updated`

Cascade direction is strictly one-way: Travel → Accommodation + Transport. Accommodation → Transport. Transport → nothing (terminal node).

### Service Contracts (Frozen in `SERVICE_CONTRACTS.md`)

9 TypeScript interfaces: NotificationService, EmailProvider, WhatsAppProvider, TemplateRenderer, FileService, CertificateService, QrVerificationService, EventAutomationService, ProviderWebhookIngestService.

Dependency direction: route → domain service → repository + event emitter + service contracts → provider adapters.

### Navigation & UI Architecture

- **Mobile-first:** 390px base design, bottom tab bar (HOME, EVENTS, PEOPLE, PROGRAM, MORE)
- **48 wireframes** designed and audited (see `CLICK_MAP_AND_TRACEABILITY.md`)
- **Event Workspace (M21)** is the central hub — all event-specific modules route from here
- **Design tokens:** Paytm-inspired palette (#00325B primary, #00B9F5 accent, Inter font)
- **Schedule grid:** admin always grid (horizontal scroll on mobile), attendee auto-switches (card list < 768px, grid >= 768px)
- **Red flags:** inline pill badges with what-changed detail, 3-state lifecycle, "Show flagged only" filter toggle

### Notification Architecture (No Novu)

- Email rendering: React Email TSX components with props
- Email delivery: Resend SDK called from Inngest step functions
- WhatsApp delivery: Evolution API REST calls from Inngest step functions
- Orchestration: Inngest event-driven fan-out (replaces Novu)
- Delivery tracking: `notification_log` table with status enum
- Retry: Inngest built-in step retries
- Per-event branding: brand config fetched from event record, passed to template at render time
- Provider abstraction: EmailProvider and WhatsAppProvider interfaces for future swap

## Build Phases

### Phase 1: Foundation
1. Scaffold (fork ixartz/SaaS-Boilerplate, configure Clerk + Drizzle + Neon)
2. Auth (M16 Login, M17 Forgot Password, M63 Check Email, M59 Reset Password)
3. Dashboard shell (M01 Dashboard Home + bottom tab bar)
4. Event CRUD (M02 Events List, M14 Create Event, M21 Event Workspace hub)
5. Halls CRUD (within event context)
6. Initial Drizzle migration (organizations, events, halls, event_user_assignments, people, event_people)

### Phase 2: Core Data
7. People (M03 People List, M09 Person Detail, M32 CSV Import, M62 Import Success, M57 Merge Duplicates)
8. Registration (M25 Event Landing, M07 Registration Form, M28 Success, M29 Admin List)
9. Scientific Program (M22 Session Manager, M23 Add/Edit Session, M30 Admin Schedule Grid, M04 Attendee Program View)
10. Faculty invitation flow (M26 Faculty Invitation, M55 Faculty Confirm, M60 Confirmed Success)

### Phase 3: Operations
11. Travel (M35 Travel Records List, M06 Travel Info Form)
12. Accommodation (M05 Accommodation + Red Flags, M36 Accommodation Form)
13. Transport (M10 Transport & Arrival Planning, M38 Vehicle Assignment Kanban)
14. Cascade system (Inngest events + red flag creation + notification sends)

### Phase 4: Communications
15. Notification templates (M13 Communications, M39 Template Editor)
16. Automation triggers (M53)
17. WhatsApp integration (Evolution API Docker sidecar)
18. Notification log + retry failed screen

### Phase 5: Certificates & QR
19. Certificate templates (M12 Certificate Generation, M56 Template Editor)
20. Bulk generation + delivery (M61 Certificate Progress + Done)
21. QR Scanner PWA (M11 Scanner, M44 Success, M45 Duplicate, M46 Manual Check-in, M58 Attendance Report)

### Phase 6: Polish
22. Branding (M15 Branding & Letterheads)
23. Team & Roles (M19 Team & Roles, M54 Ops Role Variant)
24. Reports & Exports (M47 Reports & Exports)
25. Program versioning (M52 Version History)
26. Event Fields builder (M51)
27. Event duplication feature
28. Pre-event backup Inngest job (24h before event start)

### Deferred Items (Design Before Their Module Ships)

| Item | What's Needed | Design Before |
|------|--------------|---------------|
| D1: Preview Revised Emails | Modal on M52 showing sample email with diff | Phase 2 Sci Program |
| D2: Conflict Fix action | M30 "Fix" → navigate to conflicting session edit | Phase 2 Sci Program |
| D3: Add Person form | Slide-up bottom sheet from M03 | Phase 2 People |
| D4: Invite Member modal | Bottom sheet on M19 | Phase 6 Team |
| D5: Speaker Profile view | Expandable card from M25 speaker cards | Phase 2 Registration |
| D6: View All Issued Certificates | List screen from M61 | Phase 5 Certificates |
| D7: Terms & Privacy page | Simple text page linked from M07 | Phase 2 Registration |
| D8: Notification drawer | Slide-down from M01 bell icon | Phase 6 |
| D9: Profile/account sheet | From M01 avatar | Phase 6 |

## Testing Decisions

### Test Philosophy

- Test business risk, not implementation trivia
- Test permissions and state transitions
- Test idempotency and cross-module cascades
- Do NOT unit test simple CRUD save/update forms — those are covered by Zod validation + Drizzle types

### Frameworks

- **Vitest** — backend/domain/service tests (state machines, service contracts, event isolation, cascade consumers, notification idempotency)
- **Playwright** — critical end-to-end flows (public registration, faculty confirmation, QR check-in happy path, key admin workflows)

### Priority Test Targets

1. **Event isolation enforcement** — prove that same record ID from another event cannot be read or mutated; background handlers refuse mismatched event payloads
2. **Cascade system** — Inngest consumers correctly create red flags, recalculate transport, and send notifications on travel/accommodation changes
3. **Notification service** — idempotency prevents duplicate sends; retry creates new attempt on same row; resend creates new row
4. **Registration state machine** — all transitions validated; privileged reinstatement restricted to Super Admin; invalid transitions rejected
5. **Faculty invite state machine** — sent → accepted/declined flows; no reopen after terminal states; revised responsibility notifications fire correctly
6. **Certificate supersession chain** — regeneration creates new row and supersedes old; only one `issued` per (person, event, type); revocation is irreversible with mandatory reason
7. **Attendance duplicate/override rules** — duplicate scan detection; manual override permissions; offline queue sync

### Test Exclusions

- Simple CRUD operations (form save, record update) — covered by Zod + Drizzle types
- UI component rendering tests — covered by Playwright E2E
- Third-party provider internals (Resend, Evolution API) — mock at provider adapter boundary

## Out of Scope

The following are explicitly excluded from V1:

- **Self-serve certificate portal** — delegates downloading certificates via reg#/mobile (Nice-to-have, Later Phase)
- **QR heatmap** — PWA scanner with hall/meal tracking analytics (Nice-to-have, Later Phase)
- **Role-based mobile views** — dedicated mobile-optimized UI per role beyond responsive usability (Nice-to-have, Later Phase)
- **Campaign console** — ESP/BSP dashboard shortcuts for bulk campaign management (Nice-to-have, Later Phase)
- **Payment/ticketing** — no payment integration, no ticket tiers, no UPI/Razorpay (owner spec has no payment requirements)
- **Native mobile apps** — web-only, PWA for scanner (owner spec explicitly excludes native apps)
- **SMS gateway** — email and WhatsApp only (owner spec explicitly excludes SMS)
- **Multi-language support** — English only in V1 (owner spec: English base)
- **Advanced BI/analytics** — operational dashboards only, no behavioral analytics or data warehousing
- **Public API** — no external API keys, developer portal, or third-party integrations in V1
- **Self-serve onboarding** — no sign-up flow for new organizations; admin accounts provisioned manually via Clerk

## Further Notes

### Key Reference Documents

| Document | Purpose | Location |
|----------|---------|----------|
| Owner's spec | Original client requirements | `/Users/shaileshsingh/Downloads/document_pdf.pdf` |
| Schema decisions | 23 numbered design decisions, 24 tables, ERD | `SCHEMA_DECISIONS.md` |
| State machines | 8 state machines with transitions and guardrails | `STATE_MACHINES.md` |
| Event isolation rules | Enforcement patterns with code examples | `EVENT_ISOLATION_RULES.md` |
| Cascade event map | 11 domain events with typed payloads | `CASCADE_EVENT_MAP.md` |
| Service contracts | 9 TypeScript interfaces | `SERVICE_CONTRACTS.md` |
| Ubiquitous language | 60+ canonical domain terms | `UBIQUITOUS_LANGUAGE.md` |
| Data requirements | Grilled field-level spec (960 lines) | `.planning/data-requirements.md` |
| Design decisions | Locked UX + tech decisions | `research-hub/DESIGN_DECISIONS.md` |
| Click map | Button-to-screen traceability for 48 wireframes | `research-hub/CLICK_MAP_AND_TRACEABILITY.md` |
| Backend architecture | Module-to-npm-package mapping | `research-hub/BACKEND_ARCHITECTURE_MAP.md` |
| Frontend architecture | Route map, layouts, state ownership | `research-hub/FRONTEND_ARCHITECTURE.md` |
| Project handoff | Start-here guide for new context windows | `research-hub/PROJECT_HANDOFF.md` |
| Repo bucket map | Direct-use vs pattern-only vs custom-build | `research-hub/REPO_BUCKET_MAP.md` |

### Client Obligations

- 90-day warranty for bug fixes post go-live
- Monthly backups and housekeeping
- Client receives full source code on acceptance
- Annual server/domain/SSL billed directly to client
- Third-party fees (Resend, Evolution API, R2) billed directly to client

### Infrastructure Cost

| Service | Free Tier | Production |
|---------|-----------|------------|
| Vercel | $0 | $20/mo |
| Neon | $0 | $19/mo |
| Clerk | $0 | $25/mo |
| Cloudflare R2 | $0 | ~$1/mo |
| Inngest | $0 | $25/mo |
| Upstash Redis | $0 | $2/mo |
| Resend | $0 | $20/mo |
| Sentry | $0 | $0 |
| DigitalOcean (Evolution API) | - | $6/mo |
| **Total** | **$6/mo** | **~$115/mo** |

### Staging & UAT

- Neon branching for staging database (free on Neon)
- Vercel preview deployments for staging
- Seed data script for a sample conference (UAT pilot event)
- Design-first preview (wireframes/screens) to lock UI flows before code
- Post-UAT tweaks within agreed scope; net-new features follow change requests
