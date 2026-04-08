# Open-source toolkit for building GEM India's conference platform

**Over 80 repositories across 10+ module areas** map directly to GEM India's requirements, with the strongest fits in WhatsApp integration, certificate generation, notification infrastructure, and admin UI scaffolding. The most critical finding: no single open-source conference system covers the logistics modules (travel, accommodation, transport) — these must be custom-built. However, proven libraries exist for every technical building block, and several repos match the exact Next.js + TypeScript + Drizzle + shadcn/ui + Clerk stack.

This report catalogs every significant repository found, organized by GEM India module. Each entry includes stars, license, tech stack, maintenance status, and a clear verdict on whether it can be used directly, adapted, or referenced for architecture only.

---

## MODULE 7: WhatsApp integration has the richest ecosystem

The WhatsApp automation space is mature, with multiple production-grade options spanning from low-level libraries to turnkey microservices.

### Tier 1 — Foundation libraries

| Repository | Stars | License | Stack | Approach |
|---|---|---|---|---|
| **WhiskeySockets/Baileys** | ~8,800 | MIT ✅ | TypeScript | Direct WebSocket to WhatsApp Web |
| **pedroslopez/whatsapp-web.js** | ~16,800 | Apache 2.0 ✅ | JavaScript | Puppeteer-based browser automation |
| **wppconnect-team/wppconnect** | ~1,000+ | LGPL v3 ⚠️ | TypeScript | Puppeteer + WA-JS injection |

**Baileys is the strongest foundation** — MIT-licensed, TypeScript-native, lightweight (no headless browser), and actively maintained through 2026 with v7.0.0-rc releases. It lacks a REST API, message queue, or delivery tracking out of the box, which is where the wrapper layer comes in.

### Tier 2 — REST API servers (deploy as microservices)

| Repository | Stars | License | Key Differentiator |
|---|---|---|---|
| **EvolutionAPI/evolution-api** | ~7,800 | Apache 2.0* | RabbitMQ/Kafka/SQS queuing, multi-session, webhook callbacks, Cloud API support |
| **EvolutionAPI/evolution-api-lite** | ~304 | Apache 2.0 ✅ | Stripped-down connectivity-only version, ideal sidecar |
| **wppconnect-team/wppconnect-server** | ~1,023 | Apache 2.0 ✅ | Multi-session, S3 media, configurable webhook events |
| **devlikeapro/waha** | Significant | Freemium ⚠️ | 3 engine options (WEBJS/NOWEB/GOWS), Docker-first |
| **PointerSoftware/Baileys-2025-Rest-API** | New | MIT ✅ | Modern Baileys wrapper with PostgreSQL (Prisma) + Redis + Docker |

**Evolution API is the top recommendation** for production deployment — it wraps Baileys into a Docker-deployable microservice with built-in message queuing (RabbitMQ, Kafka, or SQS), webhook delivery, and support for both free Baileys and official WhatsApp Cloud API connections. The asterisk on its license: it requires a "powered by Evolution API" attribution notice.

### Tier 3 — Full-stack and TypeScript SDKs worth noting

**ribato22/MultiWA** deserves special attention despite low stars. It uses **Next.js 14 + NestJS + BullMQ + PostgreSQL** — architecturally the closest match to GEM India's stack. Features include pluggable engine adapters (switch between Baileys and whatsapp-web.js), broadcast/bulk messaging with templates and tracking, an analytics dashboard, and audit trail logging.

For the official WhatsApp Cloud API path, **Secreto31126/whatsapp-api-js** (MIT, TypeScript, zero dependencies) provides a fully typed SDK that drops directly into Next.js API routes. **receevi/receevi** (Next.js + Supabase) demonstrates Cloud API integration with a familiar stack.

---

## MODULE 8: Travel and itinerary management requires custom building

**No open-source repository directly implements conference delegate travel tracking** with PNR management, ticket attachments, and personalized itinerary emails. This is a gap filled exclusively by commercial platforms like Cvent and EventsAir. However, strong architectural references exist.

| Repository | Stars | License | Stack | Useful For |
|---|---|---|---|---|
| **seanmorley15/AdventureLog** | ~2,900 | GPL-3.0 ⚠️ | SvelteKit + Django | Data model for visits, lodging, transportation entities with timezone-aware planning |
| **moizkamran/ExcursioX** | 18 | Unspecified | MERN | Travel CRM combining booking management + hotel management + customer records |
| **indico/indico** | ~2,000 | MIT ✅ | Python/Flask + React | Per-participant registration with custom fields (adaptable for travel data collection) |
| **adrianhajdin/event_platform** | High | MIT ✅ | Next.js 14 + TS + Clerk + shadcn | CRUD + filtering + file upload patterns directly transferable |

**AdventureLog's data model** — with its collections → activities → lodging → transportation entity hierarchy — maps remarkably well to the conference travel record structure (event → delegate → flight → hotel). Use it for schema design inspiration, though the GPL-3.0 license prohibits direct code reuse in proprietary software.

For the actual implementation scaffold, **adrianhajdin/event_platform** provides MIT-licensed Next.js 14 CRUD patterns with Clerk auth, file uploads via Uploadthing, search/filtering, and Zod validation — essentially the exact UI patterns needed for a travel record management interface.

---

## MODULE 9: Accommodation and rooming lists draw from hotel management systems

| Repository | Stars | License | Stack | Useful For |
|---|---|---|---|---|
| **Qloapps/QloApps** | ~12,600 | OSL-3.0 ⚠️ | PHP | Gold-standard room type management, availability tracking, check-in/out, multi-hotel support |
| **mayankjain25/Hostel-Management-System** | Low | Unspecified | Next.js + Node | Room allocation to residents — admin vs. student panels map to admin vs. delegate views |
| **OthmaneNissoukin/nextjs-hotel-booking** | Low | Unspecified | Next.js + Supabase | Date range filtering, room availability checking, reservation status management |
| **richardkanai123/hostelBookingSite** | Low | Unspecified | Next.js + Vercel | Admin approve/reject workflow for room assignments |
| **jordansalagala21/Hostel-Management-System** | Low | Unspecified | Django | Floor → room → bed hierarchy with occupancy analytics |

**QloApps** at **12,600 stars** provides the most comprehensive room management domain model in open source — room types, inventory, availability calendars, guest records, booking workflows, and multi-property support. Its OSL-3.0 license restricts derivative works, so use it purely for **data model and workflow inspiration**. The room block → room type → room → guest assignment hierarchy directly maps to conference hotel → room category → room → delegate allocation.

For code that's closer to the target stack, the **three Next.js hostel/hotel repos** collectively demonstrate room allocation UIs, date filtering, availability checking, and admin approval workflows — all patterns needed for conference rooming list management.

---

## MODULE 10: Transport and arrival planning is the most niche gap

Airport transfer coordination for conferences is extremely niche in open source. The closest analogies come from transportation management systems (TMS) and fleet management tools.

| Repository | Stars | License | Stack | Useful For |
|---|---|---|---|---|
| **neozhu/tms** | Medium | MIT ✅ | Blazor/.NET | Carrier + dispatch order + multi-leg transport planning with status tracking |
| **loadpartner/tms** | Low | Unspecified | Laravel | Load-carrier matching workflow (maps to vehicle-delegate-batch matching) |
| **S-Kottissa/Shuttle-Management-System** | Low | Unspecified | SQL | Route/schedule/passenger/driver schema for shuttle coordination |
| **FleetFusion** | 1 | Unspecified | Next.js + Prisma + Clerk + Neon | Vehicle/driver/load management — **closest tech stack match** |

**FleetFusion** is the most interesting find despite having just 1 star — it was created in March 2026 using **Next.js + React Server Components + Prisma + Neon Postgres + Clerk + Tailwind CSS v4**, which is nearly identical to GEM India's stack. Its vehicle/driver/load management patterns translate directly to transport/driver/delegate-batch management for airport pickups.

For the dispatch model, **neozhu/tms** (MIT-licensed) provides a clean architecture for assigning carriers to shipments with status tracking — the same pattern needed for assigning vehicles to arrival batches grouped by time and airport.

---

## Cascade and red-flag system: three strong job queue options

The "when record A changes, notify/update records B and C" pattern has excellent tooling in the Next.js ecosystem.

| Repository | Stars | License | Integration Model | Best For |
|---|---|---|---|---|
| **triggerdotdev/trigger.dev** | 13,600 | Apache 2.0 ✅ | `tasks.trigger()` from API routes | Long-running cascading workflows with `triggerAndWait()` |
| **inngest/inngest** | ~5,000 | SSPL (server) / Apache 2.0 (SDK) | Event emission + auto-invocation | Event-driven fan-out: emit `travel.updated` → multiple functions react |
| **taskforcesh/bullmq** | ~8,700 | MIT ✅ | Redis-based FlowProducer | Parent-child job cascades with fine-grained control |

**Trigger.dev** offers the best Next.js developer experience — first-class TypeScript support, `@trigger.dev/sdk` with type-safe task definitions, automatic retries, concurrency controls, and a real-time observability dashboard. Tasks are defined as code, triggered from API routes, and can cascade via `triggerAndWait()`. Self-hostable via Kubernetes or Docker.

**Inngest** excels at the event-driven pattern specifically. Emit events like `conference/travel.updated` or `conference/accommodation.changed`, and multiple independent functions react automatically. Its step function model provides per-step retries and automatic recovery. The SDK is Apache 2.0 (the Go server is SSPL, which matters only for self-hosting the server itself).

For **audit logging with Drizzle ORM**, two repos stand out:

- **BemiHQ/bemi-io-drizzle** (LGPL-3.0) — automatic PostgreSQL change tracking via WAL/CDC with a `withBemi()` Drizzle wrapper. Captures full before/after state for every INSERT/UPDATE/DELETE with user context enrichment.
- **grmkris/drizzle-pg-notify-audit-table** — a reference implementation using PostgreSQL triggers + NOTIFY/LISTEN for real-time change subscriptions with Drizzle + Zod typed audit records. Excellent for building a custom, lightweight audit system.

Note: Drizzle ORM does **not** currently have built-in hooks or middleware. The community has open discussions requesting this feature, but for now, PostgreSQL-level triggers (as demonstrated above) or service-layer wrappers are the standard approach.

---

## Certificate template editor: pdfme is the clear winner

**pdfme/pdfme** (~4,200 stars, MIT, TypeScript) is the single most important library for this module. It uniquely combines a **WYSIWYG template designer** (React component), **JSON template format** (database-storable), and a **bulk PDF generator** (Node.js compatible) in one package. The author's own service generates **100K+ PDFs per month on less than $10/month infrastructure**.

| Repository | Stars | License | Visual Editor | Variables | Bulk Gen | PDF Export | React/TS |
|---|---|---|---|---|---|---|---|
| **pdfme/pdfme** | 4,200 | MIT ✅ | ✅ WYSIWYG | ✅ JSON | ✅ | ✅ Native | ✅/✅ |
| **Hopding/pdf-lib** | 7,780 | MIT ✅ | ❌ | ❌ | ✅ Code | ✅ Native | ❌/✅ |
| **fabricjs/fabric.js** | 29,000 | MIT ✅ | ✅ Canvas | ❌ | ❌ | ❌ | ❌/❌ |
| **salgum1114/react-design-editor** | 1,700 | MIT ✅ | ✅ | ❌ | ❌ | ❌ | ✅/❌ |
| **fossasia/badgeyay** | ~1,200 | GPL-3.0 ⚠️ | Partial | ✅ CSV | ✅ | ✅ | ❌/❌ |
| **google/certificate-maker** | ~200 | Apache 2.0 ✅ | ❌ | ✅ HTML | ✅ | ✅ Puppeteer | ❌/❌ |

The recommended architecture: embed `@pdfme/ui` Designer for visual template creation, store templates as JSON in PostgreSQL via Drizzle, use `@pdfme/generator` in Next.js API routes for bulk generation, and handle email delivery through the notification engine. pdfme's built-in QR code schema also enables badge generation with scannable check-in codes.

For email template design (certificate delivery emails), **usewaypoint/email-builder-js** (~1,500 stars, MIT, React + TypeScript) provides a block-based drag-and-drop email builder with clean JSON output that renders to HTML for any email service.

---

## Notification engine: Novu plus React Email covers all channels

| Repository | Stars | License | Channels | Templates | Self-Host |
|---|---|---|---|---|---|
| **novuhq/novu** | ~37,000 | MIT (open core) | In-App, Email, SMS, Push, Chat | ✅ Workflows + Liquid | ✅ Docker |
| **resend/react-email** | ~18,300 | MIT ✅ | Email only | ✅ React components | N/A (library) |
| **notifme/notifme-sdk** | ~2,000 | MIT ✅ | Email, SMS, Push, Slack, Voice | ❌ Basic | N/A (library) |

**Novu** is the comprehensive solution — **37,000 stars**, MIT-licensed open core, with a `@novu/nextjs` package for direct integration. It provides a unified API for in-app inbox, email, SMS, push, and chat notifications with workflow orchestration, Liquid/Handlebars template variables (`{{speaker_name}}`, `{{session_title}}`), delivery logging, subscriber management, topic-based broadcasting, and **multi-tenant context routing**. The self-hostable community edition runs via Docker.

**React Email** (18,300 stars, MIT) complements Novu for building beautiful conference emails using React components. Version 5.0 supports **Tailwind CSS 4**, React 19.2, and Next.js 16. Templates are written in TSX with variable props, then rendered to HTML for delivery through Novu, Resend, or any SMTP provider.

The integration pattern: React Email builds the templates → Novu orchestrates multi-channel delivery with workflows, conditions, and logging.

---

## Master people database draws from CRM and import tooling

### CRM systems

| Repository | Stars | License | Stack | Key Strength |
|---|---|---|---|---|
| **twentyhq/twenty** | ~39,700 | AGPL-3.0 ⚠️ | TypeScript + React + NestJS + PostgreSQL | Contact/company management, custom objects, CSV import, GraphQL API |
| **erxes/erxes** | ~3,900 | GPL v3 + Commons Clause ⚠️ | TypeScript + Node + React + MongoDB | Contact segmentation, omnichannel communication, plugin architecture |

**Twenty CRM** at nearly **40,000 stars** has the most relevant feature set — custom objects (modelable as speakers, reviewers, committee members), CSV import with column mapping, and Kanban/table views. However, its **AGPL-3.0 license** means any modifications must be open-sourced if deployed as a network service. Use it as deep architectural inspiration or fork it with the AGPL obligations understood.

### CSV import components (directly usable)

| Repository | Stars | License | Key Feature |
|---|---|---|---|
| **UgnisSoftware/react-spreadsheet-import** | ~2,000 | MIT ✅ | Auto-mapping columns via fuzzy matching, validation UI, stepper navigation |
| **tableflowhq/csv-import** | ~1,800 | MIT ✅ | Smart column mapping, dark mode, i18n, modal wizard |
| **beamworks/react-csv-importer** | ~500 | MIT ✅ | Drag-and-drop column mapping, streaming large files |

**react-spreadsheet-import** is the top pick — MIT-licensed, TypeScript, with automatic column mapping (fuzzy header matching), inline data editing and validation, and a polished stepper UI. Drop it directly into a Next.js page for importing speaker lists, attendee CSVs, or committee rosters.

### Deduplication libraries

**Fuse.js** (~18,000 stars, Apache 2.0) handles fuzzy search for client-side duplicate detection during import. **fuzzball.js** (~400 stars, GPL-2.0) goes further with a dedicated `dedupe()` function using multiple scoring algorithms (ratio, partial_ratio, token_sort, token_set). For ML-powered deduplication on the server side, **dedupeio/dedupe** (~4,200 stars, MIT, Python) is the gold standard — deploy as a microservice for batch deduplication jobs.

---

## Full conference management systems for architectural reference

| Repository | Stars | License | Stack | Covers |
|---|---|---|---|---|
| **indico/indico** | ~2,000 | MIT ✅ | Python/Flask + React + PostgreSQL | Registration, abstract review, scheduling, room booking, speaker management, badges |
| **pretalx/pretalx** | ~885 | Apache 2.0 ✅ | Python/Django + PostgreSQL | CfP, submission review, drag-and-drop scheduling, speaker management |
| **fossasia/open-event-server** | ~2,900 | GPL v3 ⚠️ | Python/Flask + PostgreSQL | Multi-track scheduling, ticketing, QR check-in, companion mobile apps |
| **HiEventsDev/Hi.Events** | ~2,000 | AGPL-3.0 ⚠️ | PHP/Laravel + React/TypeScript | Registration, ticketing, QR check-in, embeddable widget |
| **openSUSE/osem** | ~809 | MIT ✅ | Ruby on Rails | CfP, scheduling, registration, sponsor management |

**Indico** is the strongest reference — MIT-licensed, **25,951 commits** over 20+ years, maintained by CERN, and used by the United Nations (180,000+ participants) and 300+ institutions. Its registration system with custom forms, abstract double-blind review, drag-and-drop timetable, and plugin architecture (55+ plugins) provide the most comprehensive model for academic/medical conference software. The React frontend components are extractable for UI patterns.

**Pretalx** excels specifically at the Call for Participation workflow with a rich plugin ecosystem including **pretalx-hitlax** (speaker travel and expense management — directly relevant to Module 8). Apache 2.0 licensed and actively maintained through 2026.

---

## Additional libraries complete the toolkit

### Schedule and agenda builder

**react-big-calendar** (~8,700 stars, MIT) is the most popular React calendar with month/week/day/agenda views, drag-and-drop, and resource views (~870K weekly npm downloads). For multi-track conference scheduling specifically, **react-big-schedule** (~800 stars, MIT) adds resource allocation with conflict detection. **lramos33/big-calendar** (MIT) provides a modern reimplementation using **Next.js + TypeScript + Tailwind CSS** that's directly compatible with the target stack.

### QR code and check-in

- **@yudiel/react-qr-scanner** (MIT, TypeScript) — modern scanner with continuous/single scan modes, camera controls, and documented Next.js SSR compatibility
- **qrcode.react** (~3,800 stars, ISC) — SVG/Canvas QR generation with embedded logos and error correction
- **mebjas/html5-qrcode** (~5,794 stars, Apache 2.0) — cross-browser scanning engine with 197K weekly npm downloads

### Multi-tenant and white-label

**ixartz/SaaS-Boilerplate** (~6,200 stars, MIT) matches the **exact GEM India stack**: Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui, Clerk auth, Drizzle ORM, PostgreSQL. It includes multi-tenancy, team/organization support, role-based access, i18n, and Stripe payments. **boxyhq/saas-starter-kit** (~4,300 stars, Apache 2.0) adds enterprise features like SAML SSO, SCIM directory sync, and audit logs.

### Data tables and admin dashboard

**sadmann7/shadcn-table (tablecn)** (~5,000 stars, MIT) is the definitive shadcn data table implementation — server-side pagination/sorting/filtering, Notion/Airtable-like advanced filtering, floating action bars, and it uses **TanStack Table + Drizzle ORM + Neon DB**. This is the exact component needed for attendee management, registration lists, and rooming list views.

**Kiranism/next-shadcn-dashboard-starter** (~5,300 stars, MIT) provides a complete admin dashboard foundation with Next.js 16, React 19, Clerk auth, TanStack Table, Recharts analytics, Kanban boards (dnd-kit), and RBAC navigation — essentially a ready-made admin shell for the entire platform.

### Export and generation utilities

| Library | Stars | License | Purpose |
|---|---|---|---|
| **exceljs** | ~14,000 | MIT ✅ | Full-featured Excel generation with styling, streaming (1B+ cells tested) |
| **SheetJS/sheetjs** | ~35,000 | Apache 2.0 ✅ | Universal spreadsheet parsing/export (XLSX, XLS, CSV, ODS) |
| **archiverjs/node-archiver** | ~2,900 | MIT ✅ | Streaming ZIP creation for bulk certificate/badge downloads (~22M weekly npm downloads) |
| **foliojs/pdfkit** | ~10,000 | MIT ✅ | Low-level programmatic PDF generation |

---

## Recommended architecture integrates these pieces into one system

The highest-leverage combination for GEM India uses these repos as the foundation:

**Platform scaffold**: ixartz/SaaS-Boilerplate (Next.js + Drizzle + Clerk + shadcn + multi-tenant) as the starting point, with Kiranism/next-shadcn-dashboard-starter for admin UI patterns and sadmann7/shadcn-table for all data table views.

**WhatsApp (Module 7)**: Deploy Evolution API as a Docker sidecar microservice, calling it from Next.js API routes. Use BullMQ or Trigger.dev for message queuing and delivery tracking.

**Travel/Accommodation/Transport (Modules 8-10)**: Custom-build on top of the scaffold using CRUD patterns from adrianhajdin/event_platform, data models inspired by Indico (travel), QloApps (rooms), and neozhu/tms (transport dispatch).

**Cascade system**: Inngest or Trigger.dev for event-driven background jobs (`travel.updated` → cascade to accommodation and transport). Bemi or PostgreSQL triggers for audit logging with Drizzle.

**Certificates**: pdfme for visual template design + bulk PDF generation. Node-archiver for ZIP downloads of bulk certificates.

**Notifications**: Novu for multi-channel orchestration (email + WhatsApp + in-app). React Email for template design. Per-event branding via Novu's tenant context routing.

**People/CRM**: react-spreadsheet-import for CSV import with auto-column mapping. Fuse.js for duplicate detection. Twenty CRM's data model for architectural reference.

**Scheduling**: react-big-schedule for multi-track session scheduling. react-big-calendar for agenda display.

## Conclusion

The open-source ecosystem covers GEM India's needs asymmetrically. **WhatsApp integration, certificate generation, notification infrastructure, background job processing, and admin UI components have mature, production-ready solutions** that can be integrated with minimal custom code. The major gap is in **conference logistics modules (travel, accommodation, transport)** — these remain a proprietary domain where commercial platforms dominate and open source provides only architectural inspiration. The recommended strategy is to build on a proven multi-tenant Next.js boilerplate, integrate the module-specific libraries identified above, and custom-develop the logistics CRUD modules using patterns from analogous systems. Every primary recommendation listed uses **MIT or Apache 2.0 licensing**, ensuring commercial safety for the GEM India platform.