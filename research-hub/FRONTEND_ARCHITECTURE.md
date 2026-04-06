# GEM India — Frontend Architecture Spec

> Companion to PROJECT_HANDOFF.md. Read that first.
> This doc covers: route map, component hierarchy, layouts, state ownership.

---

## 1. Route Map (Next.js App Router)

### Public Routes (no auth)
```
/                                → Redirect to /dashboard
/login                           → M16 Login
/forgot-password                 → M17 Forgot Password
/forgot-password/sent            → M63 Check Email Sent
/reset-password                  → M59 Reset Password (token in URL params)
/e/[eventSlug]                   → M25 Event Landing Page (public)
/e/[eventSlug]/register          → M07 Registration Form
/e/[eventSlug]/register/success  → M28 Registration Success
/e/[eventSlug]/confirm/[token]   → M55 Faculty Confirm Participation
/e/[eventSlug]/confirm/success   → M60 Faculty Confirmed
/verify/[certificateId]          → Certificate Verification Page (deferred)
```

### Authenticated Routes (behind Clerk middleware)
```
/dashboard                       → M01 Dashboard Home
/events                          → M02 Events List
/events/new                      → M14 Create Event
/events/[eventId]                → M21 Event Workspace (THE HUB)
/events/[eventId]/sessions       → M22 Session Manager
/events/[eventId]/sessions/new   → M23 Add Session Form
/events/[eventId]/sessions/[id]  → M23 Edit Session Form (same component, pre-filled)
/events/[eventId]/schedule       → M30 Admin Schedule Grid
/events/[eventId]/fields         → M51 Event Field Builder
/events/[eventId]/changes        → M52 Version History / Program Changes
/events/[eventId]/registrations  → M29 Registration Admin List
/events/[eventId]/faculty/invite → M26 Faculty Invitation
/events/[eventId]/certificates   → M12 Certificate Generation
/events/[eventId]/certificates/editor/[templateId] → M56 Certificate Template Editor
/events/[eventId]/certificates/done → M61 Certificate Progress + Done

/people                          → M03 People List
/people/[personId]               → M09 Person Detail
/people/import                   → M32 CSV Import
/people/import/success           → M62 Import Success
/people/merge/[id1]/[id2]        → M57 Merge Duplicates

/program                         → M04 Scientific Program (Attendee view)

/travel                          → M35 Travel Records List
/travel/new                      → M06 Travel Info Form
/travel/[id]                     → M06 Travel Info Form (edit mode)

/accommodation                   → M05 Accommodation + Flags
/accommodation/new               → M36 Accommodation Form
/accommodation/[id]              → M36 Accommodation Form (edit mode)

/transport                       → M10 Transport & Arrival Planning
/transport/assign/[batchId]      → M38 Vehicle Assignment Kanban

/communications                  → M13 Communications
/communications/templates/[id]   → M39 Template Editor
/communications/triggers         → M53 Automation Triggers

/scanner                         → M11 QR Scanner (standalone PWA-capable)
/scanner/manual                  → M46 Manual Check-in
/attendance                      → M58 Attendance Report

/reports                         → M47 Reports & Exports
/branding                        → M15 Branding & Letterheads
/settings/team                   → M19 Team & Roles
```

---

## 2. Layout Hierarchy

```
app/
├── layout.tsx                   → Root layout (html, body, ClerkProvider, Inngest)
├── (auth)/
│   ├── layout.tsx               → Auth layout (centered, no nav, no tab bar)
│   ├── login/page.tsx           → M16
│   ├── forgot-password/page.tsx → M17
│   ├── forgot-password/sent/page.tsx → M63
│   └── reset-password/page.tsx  → M59
├── (public)/
│   ├── layout.tsx               → Public layout (no auth, no tab bar, event-branded)
│   ├── e/[eventSlug]/page.tsx   → M25 Event Landing
│   ├── e/[eventSlug]/register/page.tsx → M07
│   ├── e/[eventSlug]/register/success/page.tsx → M28
│   ├── e/[eventSlug]/confirm/[token]/page.tsx → M55
│   └── e/[eventSlug]/confirm/success/page.tsx → M60
├── (app)/
│   ├── layout.tsx               → App layout (auth required, bottom tab bar, event context)
│   ├── dashboard/page.tsx       → M01
│   ├── events/
│   │   ├── page.tsx             → M02
│   │   ├── new/page.tsx         → M14
│   │   └── [eventId]/
│   │       ├── page.tsx         → M21 Event Workspace
│   │       ├── sessions/...     → M22, M23
│   │       ├── schedule/page.tsx → M30
│   │       ├── fields/page.tsx  → M51
│   │       ├── changes/page.tsx → M52
│   │       ├── registrations/page.tsx → M29
│   │       ├── faculty/invite/page.tsx → M26
│   │       └── certificates/... → M12, M56, M61
│   ├── people/...               → M03, M09, M32, M62, M57
│   ├── program/page.tsx         → M04
│   ├── travel/...               → M35, M06
│   ├── accommodation/...        → M05, M36
│   ├── transport/...            → M10, M38
│   ├── communications/...       → M13, M39, M53
│   ├── scanner/...              → M11, M46
│   ├── attendance/page.tsx      → M58
│   ├── reports/page.tsx         → M47
│   ├── branding/page.tsx        → M15
│   └── settings/team/page.tsx   → M19
```

---

## 3. Shared Layouts

### (auth) layout — `app/(auth)/layout.tsx`
- Centered container, max-width 390px
- No navigation, no tab bar
- Light background
- Used by: M16, M17, M59, M63

### (public) layout — `app/(public)/layout.tsx`
- No auth required (Clerk public route)
- Event-branded header (logo, colors from event's brand kit)
- No tab bar
- Used by: M25, M07, M28, M55, M60

### (app) layout — `app/(app)/layout.tsx`
- Clerk auth required (`auth.protect()`)
- Bottom tab bar (HOME, EVENTS, PEOPLE, PROGRAM, MORE)
- Event context provider (active event from URL or selector)
- Role context provider (filters nav based on user role)
- Used by: everything else

### Bottom Tab Bar Component
```tsx
// components/tab-bar.tsx
// 5 tabs: HOME, EVENTS, PEOPLE, PROGRAM, MORE
// Active state: filled dark blue pill
// Inactive: transparent with muted icon+text
// Rendered in (app) layout only
// Hidden on scanner pages (M11 is fullscreen dark)
```

---

## 4. State Ownership

### URL State (in the URL, survives refresh)
| State | Where | Example |
|-------|-------|---------|
| Active event | URL segment | `/events/evt_123/sessions` |
| Active person | URL segment | `/people/per_456` |
| Active tab | Route group | `/travel` = MORE tab active |
| Filters/search | URL search params | `/people?filter=faculty&search=sharma` |
| Import step | URL segment | `/people/import` vs `/people/import/success` |

### Server State (fetched from Neon via Drizzle, cached by Next.js)
| State | Fetched By | Cached? |
|-------|-----------|---------|
| Events list | `getEvents()` server action | React cache, revalidate on mutation |
| People list | `getPeople(filters)` server action | React cache + search params |
| Sessions for event | `getSessions(eventId)` | React cache |
| Travel records | `getTravelRecords(eventId)` | React cache |
| Accommodation records | `getAccommodation(eventId)` | React cache |
| Red flags | `getFlags(eventId, module)` | React cache, revalidate on cascade |
| Registration list | `getRegistrations(eventId)` | React cache |
| Delivery log | `getDeliveryLog(eventId)` | React cache |

### Form State (local, dies on navigate)
| State | Managed By | Example |
|-------|-----------|---------|
| Create Event form | React Hook Form + Zod | M14 fields |
| Add Session form | React Hook Form + Zod | M23 fields |
| Travel form | React Hook Form + Zod | M06 fields |
| Accommodation form | React Hook Form + Zod | M36 fields |
| Registration form | React Hook Form + Zod | M07 fields |
| Template editor body | Controlled textarea state | M39 body text |
| CSV column mapping | Local component state | M32 mapping selections |
| Certificate editor | pdfme internal state | M56 canvas state |

### UI State (local, ephemeral)
| State | Scope | Example |
|-------|-------|---------|
| Active day filter | Component state | M04 "Day 1" selected |
| Active hall filter | Component state | M04 "Hall A" selected |
| Active status tab | Component state | M29 "Pending" tab |
| Flag filter toggle | Component state | M05 "Show flagged only" |
| Scanner mode | Component state | M11 Standard vs Express |
| Merge field selections | Component state | M57 which value to keep per field |
| Kanban drag state | dnd-kit state | M38 dragging a card |

---

## 5. Key Shared Components

| Component | Used By | Props |
|-----------|---------|-------|
| `<StatusBar />` | All mobile screens | — |
| `<TabBar />` | All (app) layout screens | `activeTab` |
| `<ScreenHeader />` | Most detail screens | `title`, `backHref`, `actions` |
| `<MetricCard />` | M01, M58 | `icon`, `value`, `label` |
| `<Badge />` | Everywhere | `variant: success|warning|error|info`, `text` |
| `<PersonCard />` | M03, M29 | `person`, `tags`, `onClick` |
| `<SessionCard />` | M04, M22 | `session`, `colorBorder`, `typeBadge` |
| `<InputGroup />` | All forms | `label`, `placeholder`, `required` |
| `<FlagBanner />` | M05 | `count`, `onToggleFilter` |
| `<FlagCard />` | M05 | `flag: {type, detail, status, createdAt}`, `onReview`, `onResolve` |
| `<EventSelector />` | M01 | `activeEvent`, `onSwitch` |
| `<DayFilter />` | M04, M10, M30 | `days`, `activeDay`, `onSelect` |
| `<FilterChips />` | M03, M29 | `options`, `active`, `onSelect` |
| `<StepIndicator />` | M06, M32 | `steps`, `currentStep` |
| `<FileUpload />` | M06, M36, M56 | `accept`, `maxSize`, `onUpload` |
| `<VariablePicker />` | M39, M56 | `variables`, `onInsert` |

---

## 6. Event Context Provider

Almost every (app) route needs to know the active event. This is managed by a React context:

```tsx
// providers/event-context.tsx
interface EventContext {
  activeEvent: Event | null;        // Current event object
  setActiveEvent: (id: string) => void;
  isLoading: boolean;
}

// In (app) layout:
// - If URL has /events/[eventId]/*, extract eventId from params
// - If URL is /dashboard or /people etc., use last-selected event from cookie/localStorage
// - EventSelector dropdown (M01) calls setActiveEvent → updates cookie + revalidates
```

---

## 7. Role-Based Rendering

```tsx
// hooks/use-role.ts
// Uses Clerk's useAuth() + has() helper

function useRole() {
  const { has } = useAuth();
  return {
    isSuperAdmin: has({ role: 'org:super_admin' }),
    isCoordinator: has({ role: 'org:event_coordinator' }),
    isOps: has({ role: 'org:ops' }),
    isReadOnly: has({ role: 'org:read_only' }),
    can: (permission: string) => has({ permission }),
  };
}

// In components:
// - Tab bar: hide/show tabs based on role
// - More menu: M08 for admin/coordinator, M54 for ops
// - Write buttons: visible but disabled for read-only (tooltip: "Read-only access")
// - Server actions: always verify role server-side, never trust client
```

---

## 8. Inngest Event Contracts

```typescript
// inngest/events.ts
type Events = {
  'conference/registration.created': { personId: string; eventId: string; regId: string };
  'conference/travel.created':       { personId: string; eventId: string; travelId: string };
  'conference/travel.updated':       { personId: string; eventId: string; travelId: string; changes: Record<string, {old: any; new: any}> };
  'conference/accommodation.created': { personId: string; eventId: string; accomId: string };
  'conference/accommodation.updated': { personId: string; eventId: string; accomId: string; changes: Record<string, {old: any; new: any}> };
  'conference/session.updated':      { eventId: string; sessionId: string; changes: Record<string, {old: any; new: any}> };
  'conference/program.published':    { eventId: string; version: number; affectedFacultyIds: string[] };
  'conference/certificate.generated': { eventId: string; templateId: string; recipientIds: string[]; batchId: string };
};
```

---

## 9. Data Model (Core Tables — Drizzle Schema)

```
events
  id, name, slug, start_date, end_date, venue, description,
  module_toggles (jsonb), brand_kit (jsonb), status (draft|live|archived),
  created_by, created_at, updated_at

people (master, global)
  id, name, email, phone, designation, specialty, city, age,
  avatar_color, created_at, updated_at

event_registrations (per-event junction)
  id, event_id → events, person_id → people,
  reg_number, type (delegate|faculty), status (going|pending|waitlist|cancelled),
  travel_preference_date, travel_preference_city,
  qr_code_url, registered_at

sessions
  id, event_id → events, name, date, start_time, end_time,
  hall, type (plenary|symposium|workshop|free_papers),
  topic, parent_session_id (self-ref for sub-sessions),
  sort_order, created_at, updated_at

session_faculty (junction with role)
  id, session_id → sessions, person_id → people,
  role (speaker|chairperson|moderator|panelist),
  invitation_status (invited|confirmed|declined),
  invited_at, confirmed_at

travel_records
  id, event_id → events, person_id → people,
  from_city, to_city, departure, arrival, pnr, ticket_number,
  mode (flight|train|bus|car), attachment_url,
  notification_status (pending|sent|failed), created_at, updated_at

accommodation_records
  id, event_id → events, person_id → people,
  hotel_name, room_number, room_type, address,
  check_in, check_out, booking_pdf_url, google_maps_url,
  notification_status, created_at, updated_at

red_flags
  id, event_id → events, record_type (accommodation|transport),
  record_id, flag_type, flag_detail, flag_created_at,
  flag_status (unreviewed|reviewed|resolved),
  reviewed_by, reviewed_at, resolved_by, resolved_at

transport_batches
  id, event_id → events, date, time_slot, origin_city,
  arrival_count, vehicle_id → vehicles (nullable)

vehicles
  id, event_id → events, name (Van-1, Van-2...), capacity, driver_name

certificate_templates
  id, event_id → events, name, template_json (pdfme format),
  background_url, created_at, updated_at

issued_certificates
  id, template_id → certificate_templates, person_id → people,
  certificate_url, qr_verification_url, uuid,
  issued_at, delivered_via, delivery_status

notification_templates
  id, event_id → events, name, channel (email|whatsapp|both),
  subject, body_json, variables (jsonb), created_at, updated_at

delivery_log
  id, event_id → events, template_id → notification_templates,
  person_id → people, channel, status (sent|delivered|read|failed),
  sent_at, delivered_at, read_at, failed_reason

automation_triggers
  id, event_id → events, event_type (string matching Inngest event names),
  template_id → notification_templates,
  channels (jsonb: {email: bool, whatsapp: bool}),
  enabled (bool)

program_versions
  id, event_id → events, version_number, published_at,
  published_by, changes_json (array of diffs),
  faculty_notified_count

audit_log (via Bemi — automatic)
  table_name, record_id, operation (insert|update|delete),
  old_values (jsonb), new_values (jsonb),
  user_id, timestamp
```
