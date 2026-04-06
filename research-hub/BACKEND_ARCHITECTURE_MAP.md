# GEM India — Backend Architecture Map

> Module → Library → npm package → How it connects
> This is the developer handoff document. Everything needed to set up the backend.

---

## Platform Foundation

| Layer | Library | Package | Stars | License | Purpose |
|-------|---------|---------|-------|---------|---------|
| **Scaffold** | ixartz/SaaS-Boilerplate | Fork/clone | 6.2K | MIT | Next.js 16 + Clerk + Drizzle + shadcn + multi-tenant |
| **Admin UI** | Kiranism/dashboard-starter | Reference | 5.3K | MIT | Dashboard shell, RBAC nav, Kanban (dnd-kit), Recharts |
| **Data Tables** | sadmann7/shadcn-table (tablecn) | `tablecn` | 5K | MIT | Server-side pagination/sort/filter, TanStack Table + Drizzle + Neon |
| **ORM** | Drizzle | `drizzle-orm` + `drizzle-kit` | 28K | Apache 2.0 | Type-safe PostgreSQL ORM |
| **Database** | Neon | `@neondatabase/serverless` | — | — | Serverless PostgreSQL |
| **Auth** | Clerk | `@clerk/nextjs` | — | — | Auth, orgs, roles, permissions, pre-built React components |
| **Storage** | Cloudflare R2 | `@aws-sdk/client-s3` (S3-compatible) | — | — | File uploads (tickets, certificates, brand assets) |

---

## Module-by-Module Library Map

### Module 2: Roles & Access
```
Clerk SDK (@clerk/nextjs)
├── SignIn, SignUp, UserButton components
├── OrganizationSwitcher for event switching
├── has() helper for permission checks
├── Custom roles: org:super_admin, org:event_coordinator, org:ops, org:read_only
└── Custom permissions: org:<feature>:<action>
```

### Module 3: Master People DB
```
sadmann7/shadcn-table → People list with saved views, column customization
react-spreadsheet-import → CSV import with fuzzy auto-mapping (MIT)
  npm: react-spreadsheet-import
  Integration: Drop into Next.js page, configure fields, handle onSubmit
Fuse.js → Client-side fuzzy search for duplicate detection
  npm: fuse.js
  Integration: On import preview, run Fuse against existing records
```

### Module 4: Event Management
```
Custom CRUD on Drizzle ORM
├── Events table: name, dates, venue, description, module toggles (JSON)
├── Sessions table: FK to event, name, time, duration, hall, type, topic
├── Session-Faculty junction: session_id, person_id, role (speaker/chair/moderator/panelist)
└── Agenda PDF: pdfme generator triggered by Inngest on event.updated
```

### Module 5: Registration
```
Custom forms (React Hook Form + Zod validation)
├── Public registration page (Next.js SSG)
├── qrcode.react → Generate QR code on registration success
│   npm: qrcode.react (ISC license)
│   Integration: <QRCodeSVG value={registrationUrl} />
└── Novu → Send confirmation email + WhatsApp on registration.created event
```

### Module 6: Scientific Program
```
react-big-schedule → Multi-track schedule grid (admin)
  npm: react-big-schedule
  Integration: Resource view with halls as resources, sessions as events
  Conflict detection: Built-in overlap detection
react-big-calendar → Agenda/day view (attendee)
  npm: react-big-calendar
  Alternative: lramos33/big-calendar (Next.js + TS + Tailwind reimplementation)
```

### Module 7: Communications — Email
```
Novu (@novu/nextjs) → Multi-channel notification orchestration
  npm: @novu/nextjs
  Features: Workflow engine, template variables (Liquid), delivery logging,
            subscriber management, topic broadcasting, tenant context (per-event branding)
  Self-host: Docker (community edition)
React Email (react-email) → Build email templates in TSX
  npm: react-email, @react-email/components
  Integration: Write templates as React components, render to HTML, send via Novu
Resend or SendGrid → SMTP delivery
  npm: resend or @sendgrid/mail
```

### Module 7: Communications — WhatsApp
```
Evolution API (Docker microservice)
  Repo: EvolutionAPI/evolution-api (Apache 2.0, 7.8K stars)
  Deploy: Docker sidecar, REST API at localhost:8080
  Features: Baileys WebSocket engine, RabbitMQ/SQS queuing, webhook callbacks
  Integration from Next.js:
    POST /message/sendText → individual messages
    POST /message/sendTemplate → template messages with variables
    Webhooks → SENT/DELIVERED/READ/FAILED status callbacks to our API routes
  Alternative path: WhatsApp Cloud API via whatsapp-api-js (MIT, zero deps)
    npm: whatsapp-api-js
    For official WABA (paid per conversation, Meta-approved)
```

### Module 8: Travel Info
```
Custom CRUD (Drizzle)
├── Travel table: person_id, event_id, from_city, to_city, departure, arrival,
│   pnr, ticket_number, mode, attachment_url (R2)
├── On save → Inngest event: conference/travel.created
└── Inngest handler → Novu notification (email + WA with itinerary)
```

### Module 9: Accommodation
```
Custom CRUD (Drizzle)
├── Accommodation table: person_id, event_id, hotel_name, room_no, room_type,
│   address, check_in, check_out, booking_pdf_url (R2), google_maps_url
├── On save → Inngest event: conference/accommodation.created
├── Inngest handler → Novu notification (email + WA with hotel details + map)
├── On travel.updated → Inngest creates red-flag on accommodation record
│   flag_type, flag_detail, flag_created_at, flag_status (unreviewed/reviewed/resolved)
└── Rooming list export: exceljs → per-hotel Excel file
```

### Module 10: Transport & Arrival Planning
```
sadmann7/shadcn-table → Grouped table views (Date > Time Slot > City)
  Server-side GROUP BY + COUNT queries in Drizzle
dnd-kit → Kanban vehicle assignment board
  npm: @dnd-kit/core, @dnd-kit/sortable
  Integration: Kiranism/dashboard-starter already includes Kanban with dnd-kit
```

### Module 11: Certificates
```
pdfme → WYSIWYG template designer + bulk PDF generator
  npm: @pdfme/ui (designer component), @pdfme/generator (Node.js PDF gen)
  Integration:
    1. Admin designs template in @pdfme/ui Designer React component
    2. Template saved as JSON in PostgreSQL via Drizzle
    3. Bulk generation: @pdfme/generator in Next.js API route
    4. PDFs uploaded to R2, URLs stored in certificates table
    5. Delivery via Novu (email with download link + WA message)
  Bulk ZIP: node-archiver
    npm: archiver
    Integration: Stream PDFs from R2 into ZIP, return download URL
```

### Module 12: QR & Attendance
```
@yudiel/react-qr-scanner → Camera-based QR scanning in PWA
  npm: @yudiel/react-qr-scanner
  Integration: Continuous scan mode, camera controls, Next.js SSR compatible
  Offline: Service Worker (next-pwa or serwist) + IndexedDB for offline queue
    Scan results stored locally → sync to server when connectivity returns
qrcode.react → Generate unique QR per person
  npm: qrcode.react
  Integration: QR encodes URL like /verify/{registrationId}
```

### Module 13: Reporting & Dashboard
```
Recharts → Charts and metrics on dashboard
  npm: recharts
  Integration: Already in Kiranism/dashboard-starter
exceljs → Excel exports for all report types
  npm: exceljs
  Reports: Agenda, Faculty Roster, Delegate List, Travel Summary,
           Rooming List, Transport Plan, Delivery Log, Attendance
SheetJS → CSV/XLSX parsing (import side)
  npm: xlsx
```

### Module 14: Branding & Letterheads
```
Novu tenant context → Per-event branding in notifications
  Each event = one Novu tenant with brand colors, logo URL, sender name
usewaypoint/email-builder-js → Visual email template builder
  npm: @usewaypoint/email-builder
  Integration: Admin builds email template visually, stores as JSON,
               renders to HTML via React Email at send time
Brand assets stored in R2 with event-scoped prefixes:
  /{eventId}/logo.png, /{eventId}/header.png, /{eventId}/brand.json
```

### Cross-Module: Cascade System
```
Inngest → Event-driven background job orchestration
  npm: inngest
  Self-host: Docker (Go server, SSPL) or use Inngest Cloud
  Events:
    conference/travel.created    → Send itinerary notification
    conference/travel.updated    → Flag accommodation + recalculate transport + notify delegate
    conference/accommodation.created → Send hotel notification
    conference/accommodation.updated → Flag transport
    conference/registration.created  → Send confirmation + assign QR
    conference/session.updated       → Send revised responsibilities to affected faculty
    conference/certificate.generated → Send certificate notification
  Each event triggers multiple independent Inngest functions (fan-out pattern)
```

### Cross-Module: Audit Log
```
BemiHQ/bemi-io-drizzle → Automatic PostgreSQL change tracking
  npm: @bemi-db/drizzle
  Integration: Wrap Drizzle client with withBemi()
  Captures: Full before/after state for every INSERT/UPDATE/DELETE
  User context: Enriched with Clerk user ID from request context
Alternative (lighter): drizzle-pg-notify-audit-table
  PostgreSQL triggers + NOTIFY/LISTEN + Zod-typed audit records
```

---

## Infrastructure Map

```
                    ┌─────────────────────┐
                    │   Vercel (Frontend)  │
                    │   Next.js App        │
                    │   API Routes         │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼──────┐  ┌─────▼──────┐  ┌──────▼───────┐
     │  Neon DB       │  │ Cloudflare │  │  Inngest     │
     │  PostgreSQL    │  │ R2 Storage │  │  Background  │
     │  (Drizzle ORM) │  │ (S3-compat)│  │  Jobs        │
     └───────────────┘  └────────────┘  └──────────────┘
              │
     ┌────────▼──────────┐
     │  Evolution API     │
     │  (Docker sidecar)  │
     │  WhatsApp engine   │
     └───────────────────┘
              │
     ┌────────▼──────────┐
     │  Novu              │
     │  (Docker or Cloud) │
     │  Email + WA + Push │
     └───────────────────┘
```

---

## npm Install Summary

```bash
# Foundation
npx create-next-app@latest gem-india --typescript --tailwind --app
npm i drizzle-orm @neondatabase/serverless
npm i -D drizzle-kit
npm i @clerk/nextjs

# UI
npm i @tanstack/react-table recharts @dnd-kit/core @dnd-kit/sortable

# Communications
npm i inngest @novu/nextjs react-email @react-email/components resend

# Certificates & QR
npm i @pdfme/ui @pdfme/generator qrcode.react @yudiel/react-qr-scanner

# Data management
npm i react-spreadsheet-import fuse.js exceljs xlsx archiver

# Email builder
npm i @usewaypoint/email-builder

# Storage
npm i @aws-sdk/client-s3

# Audit
npm i @bemi-db/drizzle
```

---

## Data Model (Key Tables — Drizzle Schema Sketch)

```typescript
// Core
events, sessions, session_faculty (junction with role enum)

// People
people (master), event_registrations (per-event junction)

// Logistics
travel_records, accommodation_records, transport_batches, vehicle_assignments

// Certificates
certificate_templates (JSON from pdfme), issued_certificates

// Communications
notification_templates (JSON), delivery_logs

// System
audit_log (via Bemi), red_flags (type, detail, status, created_at, reviewed_by)
```
