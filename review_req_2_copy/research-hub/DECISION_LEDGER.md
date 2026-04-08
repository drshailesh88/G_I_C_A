# GEM India — Decision Ledger

> Purpose: one management view of what is actually decided across frontend, wiring, and backend.
> Status values:
> - `Locked` = decision is concrete enough to build against now
> - `Partially Locked` = direction chosen, but one or more implementation/business details still need definition
> - `Missing` = do not build yet without filling this gap
>
> Date: 2026-04-06

---

## Executive Read

| Type | Locked | Partially Locked | Missing |
|---|---:|---:|---:|
| Frontend | 30 | 11 | 9 |
| Wiring | 18 | 6 | 2 |
| Backend | 5 | 21 | 7 |

### Core truth
- Infrastructure is mostly locked.
- Frontend information architecture is mostly locked, but several important states are still absent.
- Backend platform choices are strong, but backend **domain logic** is not fully locked.
- Bucket 3 work from [REPO_BUCKET_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/REPO_BUCKET_MAP.md) is where most `Partially Locked` and `Missing` items live.

---

## Frontend Ledger

| Area | Item | Status | Primary Source | Notes / Blocker |
|---|---|---|---|---|
| Frontend | App route map | Locked | [FRONTEND_ARCHITECTURE.md](/Users/shaileshsingh/G_I_C_A/research-hub/FRONTEND_ARCHITECTURE.md) | Public/auth/app route structure is defined |
| Frontend | Layout hierarchy | Locked | [FRONTEND_ARCHITECTURE.md](/Users/shaileshsingh/G_I_C_A/research-hub/FRONTEND_ARCHITECTURE.md) | `(auth)`, `(public)`, `(app)` split is clear |
| Frontend | Bottom tab navigation | Locked | [FRONTEND_ARCHITECTURE.md](/Users/shaileshsingh/G_I_C_A/research-hub/FRONTEND_ARCHITECTURE.md), [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | HOME / EVENTS / PEOPLE / PROGRAM / MORE locked |
| Frontend | Role-based nav visibility | Locked | [FINAL_SYNTHESIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/FINAL_SYNTHESIS.md), [DESIGN_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DESIGN_DECISIONS.md) | Hidden vs disabled behavior is defined |
| Frontend | Dashboard home layout | Locked | [DESIGN_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DESIGN_DECISIONS.md) | Event selector -> metrics -> quick actions |
| Frontend | Events list + event workspace hub | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md), [CLICK_MAP_AND_TRACEABILITY.md](/Users/shaileshsingh/G_I_C_A/research-hub/CLICK_MAP_AND_TRACEABILITY.md) | Event hub is now a defined screen |
| Frontend | People list UX | Locked | [FINAL_SYNTHESIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/FINAL_SYNTHESIS.md), [FRONTEND_ARCHITECTURE.md](/Users/shaileshsingh/G_I_C_A/research-hub/FRONTEND_ARCHITECTURE.md) | Table/filter/search pattern is clear |
| Frontend | Person detail screen | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Core screen exists |
| Frontend | CSV import mapping flow | Partially Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md), [DEFERRED_TICKETS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DEFERRED_TICKETS.md), [USER_FLOWS.md](/Users/shaileshsingh/G_I_C_A/research-hub/USER_FLOWS.md) | Mapping and success exist, but upload-start and preview/error states are incomplete |
| Frontend | Add person form | Missing | [DEFERRED_TICKETS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DEFERRED_TICKETS.md), [CLICK_MAP_AND_TRACEABILITY.md](/Users/shaileshsingh/G_I_C_A/research-hub/CLICK_MAP_AND_TRACEABILITY.md) | Explicit deferred item D3 |
| Frontend | Merge duplicates flow | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Merge screen exists |
| Frontend | Public event landing page | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Screen exists and route is defined |
| Frontend | Delegate registration form | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md), [FINAL_SYNTHESIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/FINAL_SYNTHESIS.md) | Primary public registration flow is clear |
| Frontend | Registration success state | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Success screen exists |
| Frontend | Terms & privacy page | Missing | [DEFERRED_TICKETS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DEFERRED_TICKETS.md) | Explicit deferred item D7 |
| Frontend | Speaker profile on public event page | Missing | [DEFERRED_TICKETS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DEFERRED_TICKETS.md) | Explicit deferred item D5 |
| Frontend | Registration admin list | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Main list screen exists |
| Frontend | Faculty invite form | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Main invite screen exists |
| Frontend | Faculty decline state | Partially Locked | [CLICK_MAP_AND_TRACEABILITY.md](/Users/shaileshsingh/G_I_C_A/research-hub/CLICK_MAP_AND_TRACEABILITY.md) | Decline action exists on M55, but no dedicated decline-result state is shown |
| Frontend | Session manager list | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Screen exists |
| Frontend | Add/edit session form | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Form screen exists |
| Frontend | Admin schedule builder | Partially Locked | [DESIGN_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DESIGN_DECISIONS.md), [CLICK_MAP_AND_TRACEABILITY.md](/Users/shaileshsingh/G_I_C_A/research-hub/CLICK_MAP_AND_TRACEABILITY.md) | Main grid exists, but mobile teaching/conflict-fix flow still weak |
| Frontend | Conflict fix flow | Partially Locked | [DEFERRED_TICKETS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DEFERRED_TICKETS.md), [CLICK_MAP_AND_TRACEABILITY.md](/Users/shaileshsingh/G_I_C_A/research-hub/CLICK_MAP_AND_TRACEABILITY.md) | Conflict banner and `Fix` CTA exist on M30, but the destination state still is not designed |
| Frontend | Program revision preview | Partially Locked | [DEFERRED_TICKETS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DEFERRED_TICKETS.md), [CLICK_MAP_AND_TRACEABILITY.md](/Users/shaileshsingh/G_I_C_A/research-hub/CLICK_MAP_AND_TRACEABILITY.md) | `Preview Revised Emails` action exists on M52, but dedicated preview modal/state is still missing |
| Frontend | Version history / diff detail | Partially Locked | [CLICK_MAP_AND_TRACEABILITY.md](/Users/shaileshsingh/G_I_C_A/research-hub/CLICK_MAP_AND_TRACEABILITY.md) | Published version rows are present on M52, but detail/diff destination is not shown |
| Frontend | Event field builder | Partially Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md), [CLICK_MAP_AND_TRACEABILITY.md](/Users/shaileshsingh/G_I_C_A/research-hub/CLICK_MAP_AND_TRACEABILITY.md) | Main screen exists; custom-field creation state missing |
| Frontend | Attendee program mobile/desktop split | Locked | [DESIGN_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DESIGN_DECISIONS.md) | Card list on mobile, grid on desktop is decided |
| Frontend | Communications list/log screen | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Screen exists |
| Frontend | Template editor | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md), [CLICK_MAP_AND_TRACEABILITY.md](/Users/shaileshsingh/G_I_C_A/research-hub/CLICK_MAP_AND_TRACEABILITY.md) | Editing surface, variables, channel toggle, and preview action are represented on M39 |
| Frontend | Campaign send flow | Missing | [USER_FLOWS.md](/Users/shaileshsingh/G_I_C_A/research-hub/USER_FLOWS.md) | No dedicated multi-step campaign UI in current wireframes |
| Frontend | Automation triggers screen | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Screen exists |
| Frontend | Travel records list + form | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Core screens exist |
| Frontend | Travel send confirmation/detail view | Partially Locked | [USER_FLOWS.md](/Users/shaileshsingh/G_I_C_A/research-hub/USER_FLOWS.md) | Form exists, but explicit detail/confirmation states are not fully screen-defined |
| Frontend | Accommodation list + flags | Locked | [DESIGN_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DESIGN_DECISIONS.md), [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Strongest ops screen; flag UX is concrete |
| Frontend | Accommodation export flow | Missing | [USER_FLOWS.md](/Users/shaileshsingh/G_I_C_A/research-hub/USER_FLOWS.md) | Export/share flow not yet drawn |
| Frontend | Transport grouped view | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Main transport screen exists |
| Frontend | Arrival batch detail | Missing | [USER_FLOWS.md](/Users/shaileshsingh/G_I_C_A/research-hub/USER_FLOWS.md) | Batch detail view not represented in current wireframes |
| Frontend | Vehicle assignment kanban | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Screen exists |
| Frontend | Certificate generation home | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Screen exists |
| Frontend | Certificate template editor | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md), [DESIGN_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DESIGN_DECISIONS.md) | pdfme editor direction is clear |
| Frontend | Issued certificates list | Missing | [DEFERRED_TICKETS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DEFERRED_TICKETS.md), [CLICK_MAP_AND_TRACEABILITY.md](/Users/shaileshsingh/G_I_C_A/research-hub/CLICK_MAP_AND_TRACEABILITY.md) | Explicit deferred item D6 |
| Frontend | Certificate verification portal | Partially Locked | [FRONTEND_ARCHITECTURE.md](/Users/shaileshsingh/G_I_C_A/research-hub/FRONTEND_ARCHITECTURE.md) | Route exists but marked deferred |
| Frontend | QR scanner main states | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Main scanner and success/duplicate/manual screens exist |
| Frontend | Invalid QR / manual confirm states | Partially Locked | [USER_FLOWS.md](/Users/shaileshsingh/G_I_C_A/research-hub/USER_FLOWS.md) | Some error/confirm states are described but not all are clearly screen-backed |
| Frontend | Reports & exports screen | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Main screen exists now |
| Frontend | Branding screen | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Screen exists |
| Frontend | Team & roles screen | Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Main screen exists |
| Frontend | Invite member modal | Partially Locked | [DEFERRED_TICKETS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DEFERRED_TICKETS.md) | Invite CTA exists on M19, but the actual modal/sheet state is still missing |
| Frontend | Notification drawer | Missing | [DEFERRED_TICKETS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DEFERRED_TICKETS.md) | Explicit deferred item D8 |
| Frontend | Profile/account sheet | Missing | [DEFERRED_TICKETS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DEFERRED_TICKETS.md) | Explicit deferred item D9 |

---

## Wiring Ledger

| Area | Item | Status | Primary Source | Notes / Blocker |
|---|---|---|---|---|
| Wiring | Hosting platform | Locked | [INFRA_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/INFRA_DECISIONS.md) | Vercel chosen |
| Wiring | Function region | Locked | [INFRA_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/INFRA_DECISIONS.md), [vercel.json](/Users/shaileshsingh/G_I_C_A/vercel.json) | Mumbai region locked |
| Wiring | Database host | Locked | [INFRA_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/INFRA_DECISIONS.md) | Neon chosen |
| Wiring | ORM / migrations | Locked | [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | Drizzle chosen |
| Wiring | Auth provider | Locked | [INFRA_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/INFRA_DECISIONS.md), [DESIGN_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DESIGN_DECISIONS.md) | Clerk chosen |
| Wiring | File storage | Locked | [INFRA_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/INFRA_DECISIONS.md) | R2 chosen |
| Wiring | Email delivery provider | Locked | [INFRA_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/INFRA_DECISIONS.md) | Resend chosen |
| Wiring | Email rendering | Locked | [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | React Email chosen |
| Wiring | WhatsApp provider path | Locked | [DESIGN_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DESIGN_DECISIONS.md) | Evolution API chosen for current path |
| Wiring | WhatsApp abstraction layer | Partially Locked | [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md), [REPO_BUCKET_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/REPO_BUCKET_MAP.md) | Principle is clear; service interface contract still needs writing |
| Wiring | Background jobs / event bus | Locked | [DESIGN_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DESIGN_DECISIONS.md), [INFRA_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/INFRA_DECISIONS.md) | Inngest chosen |
| Wiring | Redis cache / locks / flags | Locked | [INFRA_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/INFRA_DECISIONS.md), [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | Upstash chosen |
| Wiring | Rate limiting strategy | Locked | [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | Rate-limited provider behavior described |
| Wiring | Idempotency key strategy | Locked | [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | Redis key pattern defined |
| Wiring | Feature flag mechanism | Locked | [INFRA_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/INFRA_DECISIONS.md), [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | Upstash flags chosen |
| Wiring | Monitoring / error tracking | Locked | [INFRA_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/INFRA_DECISIONS.md) | Sentry chosen |
| Wiring | Health checks / uptime | Locked | [INFRA_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/INFRA_DECISIONS.md), [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | OpenStatus + `/api/health` defined |
| Wiring | CI/CD path | Locked | [INFRA_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/INFRA_DECISIONS.md) | GitHub + Vercel auto-deploy |
| Wiring | Secret management | Locked | [INFRA_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/INFRA_DECISIONS.md) | Vercel env vars policy defined |
| Wiring | Audit logging mechanism | Partially Locked | [DESIGN_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DESIGN_DECISIONS.md), [COMPLETE_GAP_ANALYSIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/COMPLETE_GAP_ANALYSIS.md) | Bemi named, but DB-level design and admin surfacing still need work |
| Wiring | Notification engine | Partially Locked | [DESIGN_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DESIGN_DECISIONS.md), [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | Docs mention both Novu and direct providers; final architecture should be simplified |
| Wiring | PWA/offline scanner stack | Partially Locked | [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md), [COMPLETE_GAP_ANALYSIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/COMPLETE_GAP_ANALYSIS.md) | Tech path exists; exact offline sync contract not yet defined |
| Wiring | Multi-tenant strategy | Partially Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md), [COMPLETE_GAP_ANALYSIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/COMPLETE_GAP_ANALYSIS.md) | Current docs mix Clerk org multi-tenancy and per-event isolation; this needs one clean model |
| Wiring | Public file delivery / signed URL policy | Missing | [INFRA_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/INFRA_DECISIONS.md), [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | No explicit policy yet for ticket/certificate/privacy-sensitive documents |
| Wiring | Webhook handling topology | Partially Locked | [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | Provider callbacks are mentioned, but endpoint/event contract is not yet spelled out |
| Wiring | Pre-event backup job | Missing | [INFRA_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/INFRA_DECISIONS.md) | Mentioned in disaster recovery, but not yet converted into concrete job design |

---

## Backend Ledger

| Area | Item | Status | Primary Source | Notes / Blocker |
|---|---|---|---|---|
| Backend | Canonical role model | Locked | [FINAL_SYNTHESIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/FINAL_SYNTHESIS.md), [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | 4 roles are defined |
| Backend | Permission model | Partially Locked | [FINAL_SYNTHESIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/FINAL_SYNTHESIS.md) | Permission key pattern exists, but full permission matrix per module is not yet written |
| Backend | Global person vs auth user separation | Locked | [worker-N-frab-person-reuse analysis](/Users/shaileshsingh/G_I_C_A/research-hub/worker-N-frab-person-reuse/frab-person-reuse-analysis.md) | Critical architectural choice is clear |
| Backend | Master People schema | Partially Locked | [worker-N-frab-person-reuse analysis](/Users/shaileshsingh/G_I_C_A/research-hub/worker-N-frab-person-reuse/frab-person-reuse-analysis.md), [REPO_BUCKET_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/REPO_BUCKET_MAP.md) | Direction is strong, but final Drizzle schema is not yet ratified |
| Backend | Dedup / merge rules | Partially Locked | [FINAL_SYNTHESIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/FINAL_SYNTHESIS.md), [REPO_BUCKET_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/REPO_BUCKET_MAP.md) | UX exists, but merge precedence rules and irreversible fields need explicit policy |
| Backend | Event entity schema | Partially Locked | [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | Core fields are sketched, but canonical schema still missing |
| Backend | Per-event data isolation | Partially Locked | [COMPLETE_GAP_ANALYSIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/COMPLETE_GAP_ANALYSIS.md), [REPO_BUCKET_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/REPO_BUCKET_MAP.md) | Principle is mandatory; exact enforcement pattern must be codified in query/service conventions |
| Backend | Event module toggles / dynamic fields | Partially Locked | [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md), [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Screen exists, but data structure and propagation rules need locking |
| Backend | Session hierarchy model | Partially Locked | [FINAL_SYNTHESIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/FINAL_SYNTHESIS.md), [worker-1-indico-docs](/Users/shaileshsingh/G_I_C_A/research-hub/worker-1-indico-docs/02-timetable.md) | GEM needs hierarchical sessions; final schema not yet signed off |
| Backend | Faculty role taxonomy | Locked | [FINAL_SYNTHESIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/FINAL_SYNTHESIS.md) | Expanded medical-conference role list is decided |
| Backend | Program conflict rules | Partially Locked | [worker-2-pretalx/verdict.md](/Users/shaileshsingh/G_I_C_A/research-hub/worker-2-pretalx/verdict.md), [DESIGN_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DESIGN_DECISIONS.md) | Need formal rule table: person overlap, hall overlap, buffer, plenum behavior |
| Backend | Program versioning / revisions | Partially Locked | [COMPLETE_GAP_ANALYSIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/COMPLETE_GAP_ANALYSIS.md), [CLICK_MAP_AND_TRACEABILITY.md](/Users/shaileshsingh/G_I_C_A/research-hub/CLICK_MAP_AND_TRACEABILITY.md) | Direction exists, but published version model and diff payload are not locked |
| Backend | Registration schema | Partially Locked | [FINAL_SYNTHESIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/FINAL_SYNTHESIS.md), [FRONTEND_ARCHITECTURE.md](/Users/shaileshsingh/G_I_C_A/research-hub/FRONTEND_ARCHITECTURE.md) | Core fields are known, but registration statuses, invitation links, and preference sections need final schema |
| Backend | Registration state machine | Missing | [USER_FLOWS.md](/Users/shaileshsingh/G_I_C_A/research-hub/USER_FLOWS.md), [FINAL_SYNTHESIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/FINAL_SYNTHESIS.md) | Need exact transition table for pending/approved/waitlist/cancelled/checked-in |
| Backend | Faculty invitation state machine | Missing | [FINAL_SYNTHESIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/FINAL_SYNTHESIS.md), [CLICK_MAP_AND_TRACEABILITY.md](/Users/shaileshsingh/G_I_C_A/research-hub/CLICK_MAP_AND_TRACEABILITY.md) | Need nominated/invited/opened/accepted/declined/reminded/expired states |
| Backend | Travel record schema | Partially Locked | [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | Core fields are listed, but attachment semantics and edit history need defining |
| Backend | Accommodation schema | Partially Locked | [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | Core fields are listed, but room occupancy/inventory assumptions need locking |
| Backend | Transport batch schema | Missing | [REPO_BUCKET_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/REPO_BUCKET_MAP.md), [USER_FLOWS.md](/Users/shaileshsingh/G_I_C_A/research-hub/USER_FLOWS.md) | Need explicit `arrival_batch`, `vehicle_assignment`, `driver`, `status` model |
| Backend | Red-flag entity model | Partially Locked | [DESIGN_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DESIGN_DECISIONS.md) | Lifecycle is clear; final schema and polymorphic target model still need design |
| Backend | Cascade event taxonomy | Missing | [DESIGN_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DESIGN_DECISIONS.md), [REPO_BUCKET_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/REPO_BUCKET_MAP.md) | Must define canonical domain events before building travel/accommodation/transport |
| Backend | Notification abstraction interface | Missing | [REPO_BUCKET_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/REPO_BUCKET_MAP.md), [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | Must define provider-agnostic email/WhatsApp service layer |
| Backend | Notification log schema | Locked | [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | Good base shape already documented |
| Backend | Template variable model | Partially Locked | [FINAL_SYNTHESIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/FINAL_SYNTHESIS.md), [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md) | Variable picker exists, but canonical variable registry is not yet specified |
| Backend | Branding model | Partially Locked | [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | Asset prefixing is known; DB shape and override inheritance still need definition |
| Backend | Certificate template schema | Locked | [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | pdfme JSON storage direction is clear |
| Backend | Certificate issuance rules | Partially Locked | [REPO_BUCKET_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/REPO_BUCKET_MAP.md), [USER_FLOWS.md](/Users/shaileshsingh/G_I_C_A/research-hub/USER_FLOWS.md) | Need regenerate/resend/revoke policy and eligibility logic |
| Backend | Certificate verification model | Partially Locked | [FRONTEND_ARCHITECTURE.md](/Users/shaileshsingh/G_I_C_A/research-hub/FRONTEND_ARCHITECTURE.md) | Route exists, but token/public exposure rules are deferred |
| Backend | QR token design | Partially Locked | [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | URL pattern exists; token security and expiry policy need definition |
| Backend | Attendance check-in rules | Missing | [USER_FLOWS.md](/Users/shaileshsingh/G_I_C_A/research-hub/USER_FLOWS.md) | Need duplicate policy, manual override policy, scanner permissions, hall/session granularity |
| Backend | Offline scan sync contract | Missing | [COMPLETE_GAP_ANALYSIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/COMPLETE_GAP_ANALYSIS.md), [BACKEND_ARCHITECTURE_MAP.md](/Users/shaileshsingh/G_I_C_A/research-hub/BACKEND_ARCHITECTURE_MAP.md) | Queue conflict resolution and replay rules not yet defined |
| Backend | Reports / export definitions | Partially Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md), [USER_FLOWS.md](/Users/shaileshsingh/G_I_C_A/research-hub/USER_FLOWS.md) | Export types are named; exact fields/filters/permissions still need contract |
| Backend | Audit timeline surfacing | Partially Locked | [FINAL_SYNTHESIS.md](/Users/shaileshsingh/G_I_C_A/research-hub/FINAL_SYNTHESIS.md), [DESIGN_DECISIONS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DESIGN_DECISIONS.md) | Capture path exists, but human-readable timeline UX/schema remains to define |
| Backend | Team/member invitation flow | Partially Locked | [PROJECT_HANDOFF.md](/Users/shaileshsingh/G_I_C_A/research-hub/PROJECT_HANDOFF.md), [DEFERRED_TICKETS.md](/Users/shaileshsingh/G_I_C_A/research-hub/DEFERRED_TICKETS.md) | Main page exists; invite modal/state details still deferred |

---

## Immediate Build Blockers

These should be resolved before full module implementation starts.

| Priority | Item | Why it blocks |
|---|---|---|
| P0 | Program revision preview + diff model | Scientific Program is not safe to build without a real revision workflow |
| P0 | Notification abstraction interface | WhatsApp must remain swappable; do not wire provider code directly into modules |
| P0 | Cascade event taxonomy | Travel/accommodation/transport cannot be built safely without canonical events |
| P0 | Per-event isolation contract | Every query/report/mutation must enforce the same scoping rule |
| P0 | Registration state machine | Registration touches public flows, QR, attendance, messaging |
| P0 | Faculty invitation state machine | Core medical-conference workflow; ambiguity here causes messaging chaos |
| P0 | Transport batch schema | Ops module has no clean backend model yet |
| P0 | Attendance rules + offline sync contract | Scanner build will be fragile without these rules |

---

## Next Artifacts To Create

| Artifact | Purpose |
|---|---|
| `STATE_MACHINES.md` | Registration, faculty invite, travel/accommodation flags, certificate, attendance |
| `EVENT_ISOLATION_RULES.md` | Exact query/mutation scoping rules for every module |
| `CASCADE_EVENT_MAP.md` | Domain events, producers, consumers, idempotency keys |
| `SERVICE_CONTRACTS.md` | `EmailService`, `WhatsAppService`, `FileService`, `QrService` interfaces |
| `DB_DECISIONS.md` | Final schema choices after `/data-grill` and `/db-architect` |
