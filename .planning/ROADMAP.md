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

- [x] Phase 4: Communications Engine
  - **Deliverable:** Notification templates are configurable per event, automation triggers fire on business events, emails and WhatsApp messages are delivered through abstracted provider interfaces, delivery is logged with retry/resend capability
  - **Requirements addressed:** Communications (templates, triggers, notification service, provider abstraction, idempotency, notification log, delivery events, retry/resend)
  - **Screens:** M13 Communications, M39 Template Editor, M53 Automation Triggers
  - **Schema:** notification_templates, notification_log, notification_delivery_events, automation_triggers
  - **Infrastructure:** Evolution API Docker sidecar on DigitalOcean, Resend integration, Upstash Redis idempotency
  - **Risk:** MEDIUM — provider integration is well-documented (Evolution API, Resend). Main risk is template variable resolution across 10 template keys and ensuring idempotency key formula works across all trigger types.

- [x] Phase 5: Certificates + QR Attendance — COMPLETE (2026-04-08)
  - **Deliverable:** Certificate templates via pdfme, 7 types, bulk generation with R2 storage, supersession chain, revocation. QR PWA scanner with offline sync, manual check-in, attendance records.
  - **Screens:** M12, M56, M61, M11, M44, M45, M46, M58
  - **Schema:** certificate_templates, issued_certificates, attendance_records
  - **Tests:** 958 total passing (157 new in Phase 5)
  - **Codex Reviews:** 6 sessions, 13 bugs found and fixed

- [ ] Phase 6: Notification Wiring + Branding + Reports (Milestone 3 — 20% payment)
  - **Goal:** Every cascade and business event sends real notifications. Per-event branding works. All export/report features functional. Turns "demo" into "working system."
  - **Screens:** M13, M15, M19, M39, M47, M51, M52, M53, M54
  - **Sub-phases:**
    - [ ] 6A: Wire Real Notifications to Cascade (4 requirements — CRITICAL)
      - [ ] 6A-1: Replace notification stub with real service in cascade handlers
      - [ ] 6A-2: Wire domain event handler (H7 from deferred tickets)
      - [ ] 6A-3: Implement attachment flow (H5 from deferred tickets)
      - [ ] 6A-4: Add Clerk middleware for route protection
    - [ ] 6B: Per-Event Branding (2 requirements)
      - [ ] 6B-1: Branding configuration CRUD (M15)
      - [ ] 6B-2: Branding injection into notification templates
    - [ ] 6C: Reports & Exports (2 requirements)
      - [ ] 6C-1: Excel export engine + Reports page (M47)
      - [ ] 6C-2: Per-event PDF archive
    - [ ] 6D: Team Management (1 requirement)
      - [ ] 6D-1: Team management page (M19)

- [ ] Phase 7: Certificate UI + QR UI + Dashboard Polish (Milestone 4 part 1)
  - **Goal:** Placeholder pages become fully functional. Dashboard becomes operational command center.
  - **Sub-phases:**
    - [ ] 7A: Certificate Template Editor UI (3 requirements)
      - [x] 7A-1: Integrate pdfme Designer component (M56)
      - [ ] 7A-2: Certificate generation page UI (M12)
      - [ ] 7A-3: View all issued certificates (D6)
    - [ ] 7B: QR Check-in UI (2 requirements)
      - [ ] 7B-1: Build QR scanner page (M11)
      - [ ] 7B-2: Offline sync indicator and manual trigger
    - [ ] 7C: Dashboard Enrichment (1 requirement)
      - [ ] 7C-1: Dashboard with real metrics and quick actions (M01)

- [ ] Phase 8: Infrastructure Hardening (Milestone 4 part 2 — 20% payment)
  - **Goal:** Everything that separates "it works" from "it survives a live 500-person conference."
  - **Sub-phases:**
    - [ ] 8A: Background Job Migration (2 requirements)
      - [ ] 8A-1: Install and configure Inngest (replace sync cascade)
      - [ ] 8A-2: Move bulk operations to Inngest step functions
    - [ ] 8B: Monitoring & Safety (4 requirements)
      - [ ] 8B-1: Sentry integration
      - [ ] 8B-2: Feature flags via Upstash Redis
      - [ ] 8B-3: GitHub Actions CI pipeline
      - [ ] 8B-4: Pre-event backup automation
    - [ ] 8C: Circuit Breakers & Resilience (1 requirement)
      - [ ] 8C-1: Provider timeout and circuit breaker (H6)

- [ ] Phase 9: Production Readiness + UAT (Milestone 5 — 10% payment)
  - **Goal:** Ship. Everything tested end-to-end with real data.
  - **Sub-phases:**
    - [ ] 9A: End-to-End Integration Test (1 requirement)
      - [ ] 9A-1: Full journey test script (Playwright or documented manual)
    - [ ] 9B: Production Deploy & UAT (2 requirements)
      - [ ] 9B-1: Environment setup (Vercel, Neon, Clerk, R2, Evolution API, Upstash, Sentry, Inngest)
      - [ ] 9B-2: Client UAT with pilot event
