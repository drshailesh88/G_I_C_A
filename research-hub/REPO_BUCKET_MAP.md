# GEM India — Repository Mapping in 3 Buckets

> Purpose: separate what we will actually install/use from what we will only study, and from what we must own as custom product logic.
> Date: 2026-04-06

---

## Bucket 1 — Use Directly

These are permissive-license repos/packages or chosen services that are safe to use directly in the commercial build.

| Area | Repo / Package | License | Role in GEM India | Decision |
|---|---|---:|---|---|
| App scaffold | `ixartz/SaaS-Boilerplate` | MIT | Base app scaffold: Next.js + Clerk + Drizzle + multi-tenant foundations | Use directly |
| Admin shell patterns | `Kiranism/next-shadcn-dashboard-starter` | MIT | Dashboard shell, nav, charts, kanban reference/components | Use directly as pattern/component source |
| Data tables | `sadmann7/shadcn-table` / `tablecn` | MIT | Admin tables, filters, saved views, bulk actions | Use directly |
| ORM | `drizzle-orm`, `drizzle-kit` | Apache 2.0 | Type-safe Postgres ORM and migrations | Use directly |
| Database driver | `@neondatabase/serverless` | Vendor | Neon Postgres serverless connection | Use directly |
| Auth | `@clerk/nextjs` | Vendor | Auth, RBAC, orgs, session management | Use directly |
| File storage | `@aws-sdk/client-s3` with Cloudflare R2 | Apache 2.0 | Uploads and file retrieval for tickets, PDFs, branding assets | Use directly |
| Cache / locks | `@upstash/redis`, `@upstash/ratelimit` | Vendor | Rate limiting, idempotency, distributed locks, feature flags | Use directly |
| Jobs / cascades | `inngest` | Apache 2.0 SDK | Event-driven fan-out for red-flag cascade and notification workflows | Use directly |
| Email templates | `react-email`, `@react-email/components` | MIT | Email rendering in TSX | Use directly |
| Email delivery | `resend` | Vendor | Email delivery provider | Use directly |
| WhatsApp transport | `EvolutionAPI/evolution-api` | Apache 2.0 with attribution note | Self-hosted REST WhatsApp gateway over Baileys | Use directly behind service abstraction |
| Phone normalization | `libphonenumber-js` | MIT | Normalize Indian numbers to E.164 | Use directly |
| Timezone handling | `date-fns-tz` | MIT | UTC storage, IST rendering | Use directly |
| CSV import | `react-spreadsheet-import` | MIT | CSV import + column mapping UI | Use directly |
| Duplicate search | `fuse.js` | Apache 2.0 | Client-side duplicate candidate detection | Use directly |
| Certificate designer / generator | `@pdfme/ui`, `@pdfme/generator` | MIT | Certificate template editor and bulk PDF generation | Use directly |
| ZIP exports | `archiver` | MIT | Bulk ZIP downloads for certificates and exports | Use directly |
| Excel exports | `exceljs` | MIT | Rooming lists, reports, transport plans, delegate exports | Use directly |
| Spreadsheet parse | `xlsx` / SheetJS | Apache 2.0 | Import/export spreadsheet parsing | Use directly |
| QR generation | `qrcode.react` | ISC | Unique QR generation for registrations/certificates | Use directly |
| QR scanning | `@yudiel/react-qr-scanner` | MIT | Scanner UI for PWA check-in | Use directly |
| Monitoring | `@sentry/nextjs` | Vendor | Error tracking and performance monitoring | Use directly |
| Uptime | OpenStatus | OSS/service | External uptime monitoring and status checks | Use directly |
| Public event reference | `vercel/virtual-event-starter-kit` | MIT | Registration/ticketing/public event UX patterns in Next.js | Use directly as reference |
| Registration flow reference | `asyncapi/conference-website` | Apache 2.0 | Consent capture, registration confirmation patterns | Use directly as reference |
| Conference architecture reference | `indico/indico` | MIT | Event, registration, timetable, document-generation patterns | Use directly as architecture reference |
| Person reuse reference | `frab/frab` | MIT | Global person + event junction modeling | Use directly as architecture reference |
| Conference ops reference | `opensuse/osem` | MIT | Conference domain modeling reference | Use directly as architecture reference |
| Compact academic reference | `ctpug/wafer` | ISC | Small readable conference schedule/review reference | Use directly as architecture reference |

---

## Bucket 2 — Study Patterns Only

These repos are useful for domain modeling, UX, or architecture, but are not good bases for a closed-source commercial product because of license, mismatch, or maintenance concerns.

| Area | Repo / Package | Why not direct use | What to learn from it |
|---|---|---|---|
| Scheduling / CFP | `pretalx/pretalx` | License ambiguity in current research; treat as unsafe for direct reuse | Schedule editor, versioned releases, speaker notification patterns |
| Ticketing / check-in | `pretix/pretix` | AGPL/additional terms | Orders, attendees, check-in lists, audit shape |
| Event back office | `HiEventsDev/Hi.Events` | AGPL/commercial license path | Registration + QR check-in back-office patterns |
| Ticketing | `Attendize/Attendize` | Attribution Assurance License, commercial branding friction | Ticketing/admin/reporting patterns |
| Event backend | `fossasia/open-event-server` | GPL-3.0 | Event/ticket/check-in backend object model |
| Academic conference system | `leconfe/leconfe` | GPL-3.0 | Paper workflow and scholarly conference assumptions |
| Scholarly conference system | `pkp/ocs` | GPL and maintenance uncertainty | Proceedings/publication-oriented workflows |
| Historical conference system | `pinax/symposion` | Old/unmaintained for modern production | Older proposal/speaker/schedule model ideas |
| Travel domain inspiration | `seanmorley15/AdventureLog` | GPL-3.0 and wrong product shape | Travel, lodging, transportation entity relationships |
| Accommodation domain inspiration | `Qloapps/QloApps` | OSL-3.0; not stack-compatible | Hotel/room inventory and allocation concepts |
| WhatsApp alt gateway | `wppconnect-team/wppconnect`, `wppconnect-server` | Lesser fit and licensing/ops tradeoffs | Multi-session WA orchestration ideas |
| WhatsApp alt gateway | `devlikeapro/waha` | Freemium/commercial friction | Engine abstraction and Docker deployment ideas |
| Notification platform | `novuhq/novu` | Strong product, but adds another major subsystem to own/self-host | Multi-channel workflow concepts and delivery-log design |
| CRM inspiration | `twentyhq/twenty` | AGPL-3.0 | Custom object and CRM-style people management ideas |
| CRM inspiration | `erxes/erxes` | GPL/Commons Clause | Segmentation, communication, plugin thinking |
| Badge / certificate alt | `fossasia/badgeyay` | GPL-3.0 | Badge generation workflow concepts |
| Low-level PDF | `Hopding/pdf-lib`, `foliojs/pdfkit` | Too low-level for admin-edited templates | PDF fallback primitives if pdfme hits limits |
| Fleet / transport inspiration | `neozhu/tms` | Different stack | Dispatch and assignment status modeling |
| Fleet / transport inspiration | `FleetFusion` | Low maturity, tiny signal | Vehicle-driver-load patterns close to our stack |
| Travel/booking UI inspiration | small hostel/hotel repos in research | Low maturity / unspecified licenses | Allocation and approval UI patterns only |

---

## Bucket 3 — Custom Build, No Repo Owner

These are core GEM India product capabilities. We may use libraries underneath them, but the product logic, schema, rules, and UX must be owned by us.

| Module / Capability | Why it must be custom | Underlying tools we can use |
|---|---|---|
| Master People DB | Needs India-specific dedup, one global person across events, cross-role reuse, merge audit trail | Drizzle, shadcn-table, react-spreadsheet-import, Fuse.js |
| Event data isolation | Every query/report/action must enforce per-event scoping | Clerk org context, Drizzle query helpers, middleware |
| Event setup + dynamic field toggles | Needs client-specific modules, branding, and event configuration logic | Next.js, Drizzle, RHF/Zod |
| Faculty invite + confirm workflow | Medical faculty politics and confirmation states are domain-specific | Clerk optional login, token links, Resend, WhatsApp service |
| Scientific program domain model | GEM needs role-aware faculty assignments, halls, sessions, revisions, conflict rules, and attendee/admin split views | react-big-schedule, react-big-calendar, Drizzle |
| Revision / change-diff system | “What changed” and who must be informed is core operational logic | Drizzle audit tables, Inngest |
| Red-flag cascade engine | Travel change -> accommodation impact -> transport replan -> notification is a GEM differentiator | Inngest, Upstash, notification service |
| Travel records | PNR, itinerary, attachments, and notification behavior are custom ops logic | R2, Drizzle, RHF/Zod |
| Accommodation assignment | Room allocation, hotel-level exports, and flag handling are custom | Drizzle, exceljs, R2 |
| Transport batching / vehicle assignment | Airport/rail batching rules and vehicle planning are custom ops workflows | shadcn-table, dnd-kit, Drizzle |
| Notification abstraction layer | We must be able to swap Evolution API for official WABA later | EmailService + WhatsAppService interfaces, notification log |
| Notification log + retry semantics | Delivery lifecycle, idempotency, and auditability are product-critical | Upstash, Drizzle, provider webhooks |
| Certificate issuance rules | Eligibility, regeneration, delivery, verification, archival rules are ours | pdfme, R2, Resend, WhatsApp service |
| QR attendance model | Check-in semantics, duplicate policy, offline sync, and analytics definitions are ours | qrcode.react, qr scanner, IndexedDB, Drizzle |
| Reports / exports | Exact filters, columns, archive behavior, and role-based visibility are custom | exceljs, Recharts, Drizzle |
| Branding model | Per-event logos, colors, sender names, letterheads, and template variables are custom | R2, React Email, DB JSON config |
| Audit log surfacing | Bemi or triggers help, but the admin-facing timeline and “who changed what” UX is custom | Bemi/triggers, Drizzle, UI components |
| Ops-grade mobile flows | Scanner, live transport views, flagged-only filters, quick actions under event pressure are custom | PWA, Next.js, shadcn/ui |

---

## Module-by-Module Decision Summary

| GEM Module | Primary Bucket | Notes |
|---|---|---|
| Roles & Access | Use directly | Clerk + scaffold choice is solid |
| Master People DB | Custom build | Repo support exists only for components/patterns |
| Event Management | Custom build | Strong references, no direct repo fit |
| Registration | Custom build on direct-use stack | Public flow is ours; underlying tooling is mapped |
| Scientific Program | Custom build | Strong UX inspiration, no drop-in conference-grade React repo |
| Communications: Email | Use directly + custom orchestration | React Email/Resend direct, workflow logic custom |
| Communications: WhatsApp | Use directly behind abstraction | Evolution API direct, service layer mandatory |
| Travel | Custom build | No strong direct repo exists |
| Accommodation | Custom build | Domain inspiration only |
| Transport | Custom build | Domain inspiration only |
| Certificates | Use directly + custom rules | pdfme is direct; issuance logic is ours |
| QR & Attendance | Direct tools + custom rules | Scanner/generator direct, attendance semantics custom |
| Reports & Dashboard | Direct tools + custom queries | Recharts/table/export tools direct |
| Branding & Letterheads | Custom build on direct-use tools | Asset storage and templates direct, model custom |

---

## Management Readout

### What is safely repo-backed right now
- Platform scaffold
- Auth/RBAC foundation
- Tables/admin shell
- Email rendering/sending
- WhatsApp gateway
- Background jobs
- PDF certificate engine
- QR generation/scanning
- File storage/cache/monitoring

### What is not repo-backed and should not be pretended otherwise
- Travel
- Accommodation
- Transport
- Red-flag cascade logic
- Faculty responsibility lifecycle
- Program revision workflow
- Attendance policy and analytics
- Most cross-module state machines

### Rule for build planning
- If a feature is in Bucket 1, we can integrate it.
- If a feature is in Bucket 2, we can borrow ideas only.
- If a feature is in Bucket 3, we must define schema, states, permissions, and flows before writing code.

