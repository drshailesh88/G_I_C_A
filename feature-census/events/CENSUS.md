# Feature Census: Events Module

**Generated:** 2026-04-09
**Entry points:** `src/app/(app)/events/page.tsx`, `src/app/(app)/events/new/page.tsx`, `src/app/(app)/events/[eventId]/page.tsx`, `src/app/(public)/e/[eventSlug]/page.tsx`
**Files in scope:** 18
**Method:** 2-layer extraction (code + library docs). Layer 3 (runtime) skipped — app not running.

## Summary

| Metric | Count |
|--------|-------|
| Total features | 68 |
| From your code | 62 |
| From libraries (emergent) | 6 |

---

## Features by Category

### 1. Event CRUD Operations

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 1 | Create event with Zod validation | Server action `createEvent()` | `src/lib/actions/event.ts:45` | CONFIRMED |
| 2 | Auto-generate slug from event name + timestamp | `createEvent()` internal | `src/lib/actions/event.ts:70` | CONFIRMED |
| 3 | Auto-create default organization if none exists | `createEvent()` internal | `src/lib/actions/event.ts:21-29` | CONFIRMED |
| 4 | Assign event creator as owner | `createEvent()` post-insert | `src/lib/actions/event.ts:94-99` | CONFIRMED |
| 5 | Get all events for current user | Server action `getEvents()` | `src/lib/actions/event.ts:107` | CONFIRMED |
| 6 | Get single event by ID | Server action `getEvent()` | `src/lib/actions/event.ts:162` | CONFIRMED |
| 7 | Get event by slug (public, no auth) | Server action `getEventBySlug()` | `src/lib/actions/event.ts:182` | CONFIRMED |
| 8 | Revalidate /events and /dashboard paths after create | `createEvent()` | `src/lib/actions/event.ts:101-102` | CONFIRMED |

### 2. Event Status Lifecycle

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 9 | Update event status with transition validation | Server action `updateEventStatus()` | `src/lib/actions/event.ts:213` | CONFIRMED |
| 10 | Draft -> Published transition | Status button click | `src/lib/validations/event.ts:9` | CONFIRMED |
| 11 | Draft -> Cancelled transition | Status button click | `src/lib/validations/event.ts:9` | CONFIRMED |
| 12 | Published -> Completed transition | Status button click | `src/lib/validations/event.ts:10` | CONFIRMED |
| 13 | Published -> Cancelled transition | Status button click | `src/lib/validations/event.ts:10` | CONFIRMED |
| 14 | Completed -> Archived transition | Status button click | `src/lib/validations/event.ts:11` | CONFIRMED |
| 15 | Archived is terminal (no transitions) | Enforced by state machine | `src/lib/validations/event.ts:12` | CONFIRMED |
| 16 | Cancelled is terminal (no transitions) | Enforced by state machine | `src/lib/validations/event.ts:13` | CONFIRMED |
| 17 | Set archivedAt timestamp on archive | `updateEventStatus()` | `src/lib/actions/event.ts:244` | CONFIRMED |
| 18 | Set cancelledAt timestamp on cancel | `updateEventStatus()` | `src/lib/actions/event.ts:245` | CONFIRMED |
| 19 | Post-update verification (concurrent modification detection) | `updateEventStatus()` | `src/lib/actions/event.ts:252-263` | CONFIRMED |
| 20 | Revalidate paths after status change | `updateEventStatus()` | `src/lib/actions/event.ts:265-266` | CONFIRMED |
| 21 | Block invalid transitions with descriptive error | `updateEventStatus()` | `src/lib/actions/event.ts:232-235` | CONFIRMED |

### 3. Access Control & Authorization

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 22 | Clerk auth gate on events list page | Page load | `src/app/(app)/events/page.tsx:7-8` | CONFIRMED |
| 23 | Clerk auth gate on create event page | Page load | `src/app/(app)/events/new/page.tsx` | CONFIRMED |
| 24 | Clerk auth gate on event workspace page | Page load | `src/app/(app)/events/[eventId]/page.tsx:8-9` | CONFIRMED |
| 25 | Per-event access control via assertEventAccess | `getEvent()`, `updateEventStatus()` | `src/lib/auth/event-access.ts:95` | CONFIRMED |
| 26 | Super admin sees all events (no join filtering) | `getEvents()` | `src/lib/actions/event.ts:112-117` | CONFIRMED |
| 27 | Non-super-admin sees only assigned events (innerJoin) | `getEvents()` | `src/lib/actions/event.ts:120-158` | CONFIRMED |
| 28 | Super admin bypasses event assignment check | `checkEventAccess()` | `src/lib/auth/event-access.ts:63-65` | CONFIRMED |
| 29 | Event coordinator with assignment is authorized | `checkEventAccess()` | `src/lib/auth/event-access.ts:68-78` | CONFIRMED |
| 30 | Ops role with assignment is authorized | `checkEventAccess()` | `src/lib/auth/event-access.ts:68-78` | CONFIRMED |
| 31 | Read-only role with assignment is authorized (read) | `checkEventAccess()` | `src/lib/auth/event-access.ts:68-78` | CONFIRMED |
| 32 | Read-only users blocked from write operations | `assertEventAccess({ requireWrite: true })` | `src/lib/auth/event-access.ts:104-106` | CONFIRMED |
| 33 | Users with no recognized Clerk role are denied | `checkEventAccess()` | `src/lib/auth/event-access.ts:58-60` | CONFIRMED |
| 34 | Unauthenticated users rejected from getEvents | `getEvents()` | `src/lib/actions/event.ts:109` | CONFIRMED |
| 35 | Unauthenticated users rejected from createEvent | `createEvent()` | `src/lib/actions/event.ts:47` | CONFIRMED |

### 4. Validation & Input Sanitization

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 36 | Event name required, trimmed, max 200 chars | Zod schema | `src/lib/validations/event.ts:35` | CONFIRMED |
| 37 | Start date required | Zod schema | `src/lib/validations/event.ts:36` | CONFIRMED |
| 38 | End date required | Zod schema | `src/lib/validations/event.ts:37` | CONFIRMED |
| 39 | End date >= start date refinement | Zod refine | `src/lib/validations/event.ts:45-48` | CONFIRMED |
| 40 | Same-day event allowed (start == end) | Zod refine (>=) | `src/lib/validations/event.ts:46` | CONFIRMED |
| 41 | Venue name required, trimmed, max 300 chars | Zod schema | `src/lib/validations/event.ts:39` | CONFIRMED |
| 42 | Venue address optional, max 500 chars | Zod schema | `src/lib/validations/event.ts:40` | CONFIRMED |
| 43 | Venue city optional, max 100 chars | Zod schema | `src/lib/validations/event.ts:41` | CONFIRMED |
| 44 | Venue map URL validates as URL or empty string | Zod schema | `src/lib/validations/event.ts:42` | CONFIRMED |
| 45 | Description optional, max 2000 chars | Zod schema | `src/lib/validations/event.ts:43` | CONFIRMED |
| 46 | Default timezone Asia/Kolkata | Zod default | `src/lib/validations/event.ts:38` | CONFIRMED |
| 47 | Module toggles validated as boolean object | Zod schema | `src/lib/validations/event.ts:27-32` | CONFIRMED |
| 48 | Module toggles default all to true | Zod default per key | `src/lib/validations/event.ts:28` | CONFIRMED |
| 49 | eventId validated as UUID before query | Zod schema | `src/lib/validations/event.ts:50` | CONFIRMED |
| 50 | Safe JSON parsing before Zod (malformed moduleToggles) | `safeJsonParse()` | `src/lib/actions/event.ts:32-43` | CONFIRMED |
| 51 | Slug sanitized: lowercase, alphanumeric + hyphens, max 80 chars | `slugify()` | `src/lib/actions/event.ts:13-19` | CONFIRMED |
| 52 | Public slug lookup rejects empty/long slugs | `getEventBySlug()` | `src/lib/actions/event.ts:183` | CONFIRMED |
| 53 | Draft events hidden from public lookup | `getEventBySlug()` | `src/lib/actions/event.ts:208` | CONFIRMED |

### 5. Events List UI

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 54 | Split events into Upcoming vs Past sections | Client-side filter | `src/app/(app)/events/events-list-client.tsx:28-29` | CONFIRMED |
| 55 | Status badge with color coding (5 statuses) | Render per card | `src/app/(app)/events/events-list-client.tsx:18-24` | CONFIRMED |
| 56 | Date range display on event card | Render | `src/app/(app)/events/events-list-client.tsx:93-94` | CONFIRMED |
| 57 | Venue display (name + city) on event card | Render | `src/app/(app)/events/events-list-client.tsx:96` | CONFIRMED |
| 58 | Empty state with CTA to create first event | Zero events | `src/app/(app)/events/events-list-client.tsx:69-86` | CONFIRMED |
| 59 | "New" button navigates to /events/new | Header button | `src/app/(app)/events/events-list-client.tsx:37-41` | CONFIRMED |
| 60 | Click event card navigates to workspace | Link on card | `src/app/(app)/events/events-list-client.tsx:99` | CONFIRMED |

### 6. Event Workspace UI

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 61 | Event info banner (name, dates, venue, status) | Render | `src/app/(app)/events/[eventId]/event-workspace-client.tsx:128-138` | CONFIRMED |
| 62 | Status transition buttons (contextual per state) | Render per valid transition | `src/app/(app)/events/[eventId]/event-workspace-client.tsx:141-159` | CONFIRMED |
| 63 | Confirmation dialog before status change | `confirm()` on click | `src/app/(app)/events/[eventId]/event-workspace-client.tsx:90-94` | CONFIRMED |
| 64 | Cancel event warns "cannot be undone" | Confirmation message | `src/app/(app)/events/[eventId]/event-workspace-client.tsx:91-93` | CONFIRMED |
| 65 | Module tiles filtered by toggles | Client-side filter | `src/app/(app)/events/[eventId]/event-workspace-client.tsx:108-111` | CONFIRMED |
| 66 | Module tiles grouped by section (6 sections) | Client-side grouping | `src/app/(app)/events/[eventId]/event-workspace-client.tsx:113` | CONFIRMED |
| 67 | Settings link in workspace header | Link | `src/app/(app)/events/[eventId]/event-workspace-client.tsx:122-124` | CONFIRMED |
| 68 | Back arrow navigates to /events | Link | `src/app/(app)/events/[eventId]/event-workspace-client.tsx:119-121` | CONFIRMED |

### 7. Public Event Landing Page

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 69 | Public event landing page via slug | URL `/e/{slug}` | `src/app/(public)/e/[eventSlug]/page.tsx:7` | CONFIRMED |
| 70 | Display event name, description, dates, venue | Render | `src/app/(public)/e/[eventSlug]/event-landing-client.tsx:47-106` | CONFIRMED |
| 71 | Show "Registration Open" for published events | Status check | `src/app/(public)/e/[eventSlug]/event-landing-client.tsx:49` | CONFIRMED |
| 72 | Show "Registration is currently closed" for non-published | Status check | `src/app/(public)/e/[eventSlug]/event-landing-client.tsx:129-131` | CONFIRMED |
| 73 | Register Now CTA links to /e/{slug}/register | Link | `src/app/(public)/e/[eventSlug]/event-landing-client.tsx:122-127` | CONFIRMED |
| 74 | Max capacity display from registrationSettings | JSONB read | `src/app/(public)/e/[eventSlug]/event-landing-client.tsx:109-116` | CONFIRMED |
| 75 | Venue map link with protocol validation | Anchor with href check | `src/app/(public)/e/[eventSlug]/event-landing-client.tsx:85-94` | CONFIRMED |
| 76 | Date formatting in en-IN locale | `formatDate()` | `src/app/(public)/e/[eventSlug]/event-landing-client.tsx:24-29` | CONFIRMED |
| 77 | Time formatting in IST timezone | `formatTime()` | `src/app/(public)/e/[eventSlug]/event-landing-client.tsx:31-37` | CONFIRMED |
| 78 | 404 on event not found | Server page | `src/app/(public)/e/[eventSlug]/page.tsx:17-19` | CONFIRMED |

### 8. Event Create Form UI

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 79 | Event name input (required) | Form field | `src/app/(app)/events/new/create-event-form.tsx:66-77` | CONFIRMED |
| 80 | Start date picker (required) | Form field | `src/app/(app)/events/new/create-event-form.tsx:82-91` | CONFIRMED |
| 81 | End date picker (required) | Form field | `src/app/(app)/events/new/create-event-form.tsx:93-102` | CONFIRMED |
| 82 | Venue name input (required) | Form field | `src/app/(app)/events/new/create-event-form.tsx:109-119` | CONFIRMED |
| 83 | Description textarea (optional) | Form field | `src/app/(app)/events/new/create-event-form.tsx:123-133` | CONFIRMED |
| 84 | Module toggles with ON/OFF switches | Toggle buttons | `src/app/(app)/events/new/create-event-form.tsx:137-159` | CONFIRMED |
| 85 | All modules default ON | State initialization | `src/app/(app)/events/new/create-event-form.tsx:24-26` | CONFIRMED |
| 86 | Loading state on submit (disables button) | Submit handler | `src/app/(app)/events/new/create-event-form.tsx:30,172` | CONFIRMED |
| 87 | Error display on form submission failure | State | `src/app/(app)/events/new/create-event-form.tsx:161` | CONFIRMED |
| 88 | Navigate to workspace after successful create | `router.push()` | `src/app/(app)/events/new/create-event-form.tsx:39` | CONFIRMED |
| 89 | Cancel button returns to /events | Link | `src/app/(app)/events/new/create-event-form.tsx:165-170` | CONFIRMED |
| 90 | Back arrow in header returns to /events | Link | `src/app/(app)/events/new/create-event-form.tsx:56` | CONFIRMED |

### 9. Database Schema & Data Model

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 91 | Events table with UUID PK | Schema | `src/lib/db/schema/events.ts:18` | CONFIRMED |
| 92 | Organization foreign key (restrict delete) | Schema | `src/lib/db/schema/events.ts:19` | CONFIRMED |
| 93 | Unique constraint on (org_id, slug) | Schema | `src/lib/db/schema/events.ts:57` | CONFIRMED |
| 94 | Timestamp columns with timezone | Schema | `src/lib/db/schema/events.ts:25-26` | CONFIRMED |
| 95 | 6 JSONB config blocks (moduleToggles, fieldConfig, branding, registrationSettings, communicationSettings, publicPageSettings) | Schema | `src/lib/db/schema/events.ts:42-47` | CONFIRMED |
| 96 | Halls table with cascade delete on event | Schema | `src/lib/db/schema/events.ts:69-71` | CONFIRMED |
| 97 | Unique hall name per event | Schema | `src/lib/db/schema/events.ts:79` | CONFIRMED |
| 98 | Event user assignments with cascade delete | Schema | `src/lib/db/schema/events.ts:88-90` | CONFIRMED |
| 99 | Unique assignment per (event, user) | Schema | `src/lib/db/schema/events.ts:102` | CONFIRMED |
| 100 | Assignment types: owner, collaborator | Schema | `src/lib/db/schema/events.ts:92` | CONFIRMED |
| 101 | isActive flag for soft deactivation | Schema | `src/lib/db/schema/events.ts:94` | CONFIRMED |
| 102 | Indexes on organization_id, status, start_date, event_id, auth_user_id | Schema | `src/lib/db/schema/events.ts:55-58,78,100-101` | CONFIRMED |

### 10. Event Scoping Utility

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 103 | withEventScope appends eventId filter to queries | Utility function | `src/lib/db/with-event-scope.ts:12` | CONFIRMED |
| 104 | withEventScope rejects empty eventId | Guard clause | `src/lib/db/with-event-scope.ts:17-19` | CONFIRMED |
| 105 | withEventScope composes with additional conditions | Variadic args | `src/lib/db/with-event-scope.ts:21-28` | CONFIRMED |

### 11. Library-Emergent Features

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 106 | date-fns: format() for date range display | EventCard, Workspace | `events-list-client.tsx:93`, `event-workspace-client.tsx:86` | EMERGENT |
| 107 | lucide-react: icon set (Plus, ArrowLeft, Settings, etc.) | UI components | Multiple files | EMERGENT |
| 108 | next/navigation: useRouter for client navigation | `CreateEventForm`, `EventWorkspaceClient` | Multiple files | EMERGENT |
| 109 | next/cache: revalidatePath for ISR invalidation | `createEvent`, `updateEventStatus` | `src/lib/actions/event.ts:101,265` | EMERGENT |
| 110 | next/navigation: notFound() for 404 handling | Event workspace page, public landing | `src/app/(app)/events/[eventId]/page.tsx:19`, `src/app/(public)/e/[eventSlug]/page.tsx:18` | EMERGENT |
| 111 | drizzle-orm: relations for type-safe joins | Schema relations | `src/lib/db/schema/events.ts:61-65,82-84,105-107` | EMERGENT |

---

## Module Toggle Keys (7)

| Key | Label | Default |
|-----|-------|---------|
| `scientific_program` | Scientific Program | ON |
| `registration` | Registration | ON |
| `travel_accommodation` | Travel & Accommodation | ON |
| `certificates` | Certificates | ON |
| `qr_checkin` | QR Check-in | ON |
| `transport_planning` | Transport Planning | ON |
| `communications` | Communications | ON |

## Status State Machine

```
draft ──┬── published ──┬── completed ── archived (terminal)
        │               │
        └── cancelled   └── cancelled (terminal)
```

## Existing Test Coverage

| File | Test Count | Focus |
|------|-----------|-------|
| `src/lib/actions/event.test.ts` | 11 | CRUD actions, access control, concurrency |
| `src/lib/validations/event.test.ts` | 7 | Schema validation, transitions |
| `src/lib/auth/event-access.test.ts` | 10 | Auth checks, RBAC, write blocking |
| `src/lib/db/with-event-scope.test.ts` | (exists) | Event scope utility |

**Total existing tests:** ~28+
