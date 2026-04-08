# Roadmap — GEM India V1

## Phases

- [x] Phase 1: Scaffold + Auth + Event CRUD (Tracer Bullet)
  - **Deliverable:** Admin can sign in, see dashboard, create an event, and view the event workspace — proving the full stack (Next.js + Clerk + Drizzle + Neon + Vercel) works end-to-end
  - **Requirements addressed:** Foundation (auth, dashboard, navigation, role-based visibility), Events (create, lifecycle states, halls, event workspace hub), Event isolation enforcement, Per-event access control
  - **Screens:** M16 Login, M17 Forgot Password, M63 Check Email, M59 Reset Password, M01 Dashboard, M02 Events List, M14 Create Event, M21 Event Workspace
  - **Schema:** organizations, events, halls, event_user_assignments, people (table only — CRUD in Phase 2), event_people (table only)
  - **Risk:** LOW — scaffold repo (ixartz/SaaS-Boilerplate) pre-wires Clerk + Drizzle + Neon. Biggest risk is configuration alignment.

- [x] Phase 2: People + Registration + Scientific Program
  - **Deliverable:** Coordinator can manage a master people database, accept delegate registrations on a public page, build a scientific program with sessions and faculty assignments, and invite faculty to confirm
  - **Requirements addressed:** People (master DB, CSV import, dedup, merge, search, saved views), Registration (public form, status state machine, QR token), Scientific Program (sessions, halls, role requirements, assignments, conflict detection, schedule grid, program versioning), Faculty Invitation (invite, confirm, revised responsibilities)
  - **Screens:** M03 People List, M09 Person Detail, M32 CSV Import, M62 Import Success, M57 Merge, M25 Event Landing, M07 Registration Form, M28 Success, M29 Admin List, M22 Session Manager, M23 Add/Edit Session, M30 Admin Schedule Grid, M04 Attendee Program, M26 Faculty Invitation, M55 Faculty Confirm, M60 Confirmed
  - **Schema:** people (full CRUD), event_people (auto-upsert wiring), event_registrations, sessions, session_role_requirements, session_assignments, faculty_invites, program_versions
  - **Deferred items to design FIRST:** D1 (Preview Revised Emails), D2 (Conflict Fix), D3 (Add Person form), D5 (Speaker Profile), D7 (Terms & Privacy)
  - **Risk:** MEDIUM — scientific program conflict detection and program versioning with structured diffs are the most complex domain logic in the app. Faculty invitation state machine needs careful implementation.

- [x] Phase 3: Logistics + Cascade System
  - **Deliverable:** Ops can manage travel, accommodation, and transport records. When travel changes, the cascade system automatically creates red flags on accommodation/transport and notifies affected delegates. The red-flag workflow (unreviewed → reviewed → resolved) works end-to-end.
  - **Requirements addressed:** Travel (CRUD, CSV import, cascade on update/cancel), Accommodation (CRUD, auto-filter people picker, rooming list export, cascade), Transport (three-tier model, batch suggestions, vehicle kanban, passenger assignment), Red Flag Cascade System (Inngest consumers, flag lifecycle, "show flagged only")
  - **Screens:** M35 Travel List, M06 Travel Form, M05 Accommodation + Flags, M36 Accommodation Form, M10 Transport Planning, M38 Vehicle Kanban
  - **Schema:** travel_records, accommodation_records, transport_batches, vehicle_assignments, transport_passenger_assignments, red_flags
  - **Risk:** HIGH — this is GEM India's core differentiator. The Inngest cascade with multi-consumer fan-out, idempotency, and red flag uniqueness constraints is the most operationally critical piece. Must be thoroughly tested before proceeding.

- [ ] Phase 4: Communications Engine
  - **Deliverable:** Notification templates are configurable per event, automation triggers fire on business events, emails and WhatsApp messages are delivered through abstracted provider interfaces, delivery is logged with retry/resend capability
  - **Requirements addressed:** Communications (templates, triggers, notification service, provider abstraction, idempotency, notification log, delivery events, retry/resend)
  - **Screens:** M13 Communications, M39 Template Editor, M53 Automation Triggers
  - **Schema:** notification_templates, notification_log, notification_delivery_events, automation_triggers
  - **Infrastructure:** Evolution API Docker sidecar on DigitalOcean, Resend integration, Upstash Redis idempotency
  - **Risk:** MEDIUM — provider integration is well-documented (Evolution API, Resend). Main risk is template variable resolution across 10 template keys and ensuring idempotency key formula works across all trigger types.

- [ ] Phase 5: Certificates + QR Attendance
  - **Deliverable:** Coordinator can design certificate templates visually, bulk generate PDFs for delegates/faculty, deliver via email + WhatsApp. Scanner crew can check in attendees via QR PWA with offline support.
  - **Requirements addressed:** Certificates (pdfme editor, 7 types, bulk gen, supersession chain, revocation, signed URLs, ZIP download), QR & Attendance (QR generation, PWA scanner, scan feedback, manual check-in, offline queue, attendance records)
  - **Screens:** M12 Certificate Generation, M56 Template Editor, M61 Progress + Done, M11 QR Scanner, M44 Scan Success, M45 Duplicate, M46 Manual Check-in, M58 Attendance Report
  - **Schema:** certificate_templates, issued_certificates, attendance_records
  - **Deferred items to design FIRST:** D6 (View All Issued Certificates)
  - **Risk:** MEDIUM — pdfme integration is proven (100K+ PDFs/month on < $10 infra). QR offline sync is standard PWA pattern but needs careful conflict resolution rules.

- [ ] Phase 6: Branding + Reports + Polish
  - **Deliverable:** Per-event branding configurable without code, all report exports working, team management, program version history, event field builder, event duplication, pre-event backup, and remaining polish items
  - **Requirements addressed:** Branding (logo, colors, header, sender name, letterhead), Reports (agenda, rosters, travel summary, rooming list, transport plan, attendance), Settings (team management, role assignment), Polish (program versioning UI, event fields, duplication, backup)
  - **Screens:** M15 Branding, M19 Team & Roles, M54 Ops Variant, M47 Reports, M52 Version History, M51 Event Fields
  - **Deferred items to design FIRST:** D4 (Invite Member modal), D8 (Notification drawer), D9 (Profile/account sheet)
  - **Risk:** LOW — these are mostly CRUD screens and export utilities. Event duplication is a well-defined clone operation. Pre-event backup is a single Inngest scheduled function.
