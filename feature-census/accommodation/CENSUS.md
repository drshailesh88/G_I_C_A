# Feature Census: Accommodation Module

**Generated:** 2026-04-09
**Entry points:** `src/app/(app)/events/[eventId]/accommodation/page.tsx`, `new/page.tsx`, `[id]/page.tsx`
**Files in scope:** 18 files (pages, components, actions, validations, cascade, inngest, exports, notifications)
**Route URLs:** `/events/:eventId/accommodation`, `/events/:eventId/accommodation/new`, `/events/:eventId/accommodation/:id`
**Method:** 2-layer extraction (code + library — runtime skipped, app not running)

## Summary

| Metric | Count |
|--------|-------|
| Total features | 52 |
| From your code | 48 |
| From libraries (emergent) | 4 |
| Confirmed (code + tests) | 46 |
| Code-only (not yet tested) | 6 |

---

## Features by Category

### 1. CRUD Operations

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 1 | Create accommodation record | Form submit | `src/lib/actions/accommodation.ts:19` | CONFIRMED |
| 2 | Update accommodation record | Form submit | `src/lib/actions/accommodation.ts:68` | CONFIRMED |
| 3 | Cancel accommodation record (soft cancel) | Cancel button + confirm dialog | `src/lib/actions/accommodation.ts:118` | CONFIRMED |
| 4 | List accommodation records for event | Page load | `src/lib/actions/accommodation.ts:156` | CONFIRMED |
| 5 | Get single accommodation record | Edit page load | `src/lib/actions/accommodation.ts:187` | CONFIRMED |
| 6 | Get people with travel records (person picker) | New form page load | `src/lib/actions/accommodation.ts:202` | CONFIRMED |
| 7 | Get shared room group members | Query | `src/lib/actions/accommodation.ts:228` | CONFIRMED |

### 2. Validation (Zod)

| # | Feature | Rule | Code Ref | Status |
|---|---------|------|----------|--------|
| 8 | Require personId (UUID) | `z.string().uuid()` | `src/lib/validations/accommodation.ts:21` | CONFIRMED |
| 9 | Require hotelName (1-300 chars, trimmed) | `z.string().trim().min(1).max(300)` | `src/lib/validations/accommodation.ts:23` | CONFIRMED |
| 10 | Require checkInDate | `z.string().min(1)` | `src/lib/validations/accommodation.ts:30` | CONFIRMED |
| 11 | Require checkOutDate | `z.string().min(1)` | `src/lib/validations/accommodation.ts:31` | CONFIRMED |
| 12 | Validate checkout > checkin | `.refine()` | `src/lib/validations/accommodation.ts:36-38` | CONFIRMED |
| 13 | Validate roomType enum | 7 values: single/double/twin/triple/suite/dormitory/other | `src/lib/validations/accommodation.ts:27` | CONFIRMED |
| 14 | Max length enforcement | hotelAddress(500), hotelCity(200), maps(1000), room(50), group(100), booking(100), attachment(500), requests(2000), notes(2000) | `src/lib/validations/accommodation.ts:24-35` | CONFIRMED |
| 15 | Cancel schema requires UUID | `accommodationRecordId: z.string().uuid()` | `src/lib/validations/accommodation.ts:60` | CONFIRMED |
| 16 | Cancel optional reason (max 500) | `reason: z.string().trim().max(500).optional()` | `src/lib/validations/accommodation.ts:62` | CONFIRMED |

### 3. Status Machine

| # | Feature | Rule | Code Ref | Status |
|---|---------|------|----------|--------|
| 17 | 5 record statuses | draft, confirmed, sent, changed, cancelled | `src/lib/validations/accommodation.ts:4` | CONFIRMED |
| 18 | Draft transitions | draft -> confirmed, cancelled | `src/lib/validations/accommodation.ts:8` | CONFIRMED |
| 19 | Confirmed transitions | confirmed -> sent, changed, cancelled | `src/lib/validations/accommodation.ts:9` | CONFIRMED |
| 20 | Sent transitions | sent -> changed, cancelled | `src/lib/validations/accommodation.ts:10` | CONFIRMED |
| 21 | Changed transitions | changed -> confirmed, sent, cancelled | `src/lib/validations/accommodation.ts:11` | CONFIRMED |
| 22 | Cancelled is terminal | cancelled -> [] (no transitions) | `src/lib/validations/accommodation.ts:12` | CONFIRMED |
| 23 | Auto-mark as "changed" on update | confirmed/sent -> changed on field update | `src/lib/actions/accommodation.ts:102-104` | CONFIRMED |
| 24 | Block update on cancelled records | Throws error | `src/lib/actions/accommodation.ts:80` | CONFIRMED |
| 25 | Block cancel on already cancelled | Transition check throws | `src/lib/actions/accommodation.ts:133` | CONFIRMED |

### 4. Cascade System

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 26 | Cascade trigger fields detection | hotelName, checkInDate, checkOutDate, hotelCity, sharedRoomGroup | `src/lib/validations/accommodation.ts:73-75` | CONFIRMED |
| 27 | Build change summary (diff) | Compares previous vs current for trigger fields | `src/lib/validations/accommodation.ts:77-90` | CONFIRMED |
| 28 | hasAccomCascadeTriggerChanges helper | Boolean check for any cascade field change | `src/lib/validations/accommodation.ts:92-97` | CONFIRMED |
| 29 | Flag transport on accommodation update | Red flag on transport_passenger_assignment | `src/lib/cascade/handlers/accommodation-cascade.ts:94-118` | CONFIRMED |
| 30 | Flag shared room co-occupants | Red flag on linked accommodation_records when sharedRoomGroup changes | `src/lib/cascade/handlers/accommodation-cascade.ts:121-149` | CONFIRMED |
| 31 | Flag transport on accommodation cancel | Red flag on transport_passenger_assignment | `src/lib/cascade/handlers/accommodation-cascade.ts:199-222` | CONFIRMED |
| 32 | Inngest function: accommodation.updated | 3 retries, exponential backoff | `src/lib/inngest/functions.ts:65-78` | CONFIRMED |
| 33 | Inngest function: accommodation.cancelled | 3 retries, exponential backoff | `src/lib/inngest/functions.ts:81-94` | CONFIRMED |

### 5. Notifications (Dual-channel)

| # | Feature | Channel | Code Ref | Status |
|---|---------|---------|----------|--------|
| 34 | Email notification on accommodation update | email | `src/lib/cascade/handlers/accommodation-cascade.ts:161-173` | CONFIRMED |
| 35 | WhatsApp notification on accommodation update | whatsapp | `src/lib/cascade/handlers/accommodation-cascade.ts:175-187` | CONFIRMED |
| 36 | Email notification on accommodation cancel | email | `src/lib/cascade/handlers/accommodation-cascade.ts:235-247` | CONFIRMED |
| 37 | WhatsApp notification on accommodation cancel | whatsapp | `src/lib/cascade/handlers/accommodation-cascade.ts:249-261` | CONFIRMED |
| 38 | Safe notification wrapper (never throws) | try/catch + Sentry | `src/lib/cascade/handlers/accommodation-cascade.ts:46-82` | CONFIRMED |
| 39 | Idempotency keys per notification | Unique key per event+person+record+timestamp+channel | `src/lib/cascade/handlers/accommodation-cascade.ts:170` | CONFIRMED |
| 40 | System templates: accommodation_details (email+whatsapp) | On save | `src/lib/notifications/system-templates.ts:383,412` | CONFIRMED |
| 41 | System templates: accommodation_update (email+whatsapp) | On update | `src/lib/notifications/system-templates.ts:440,469` | CONFIRMED |
| 42 | System templates: accommodation_cancelled (email+whatsapp) | On cancel | `src/lib/notifications/system-templates.ts:492,515` | CONFIRMED |

### 6. Red Flag System

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 43 | Flag types: accommodation_change, accommodation_cancelled, shared_room_affected | Cascade events | `src/lib/cascade/red-flags.ts:17-24` | CONFIRMED |
| 44 | Mark flag as reviewed | Button click | `src/app/(app)/events/[eventId]/accommodation/accommodation-list-client.tsx:97-107` | CONFIRMED |
| 45 | Resolve flag | Button click | `src/app/(app)/events/[eventId]/accommodation/accommodation-list-client.tsx:109-119` | CONFIRMED |
| 46 | Show flagged-only filter toggle | Button toggle | `src/app/(app)/events/[eventId]/accommodation/accommodation-list-client.tsx:65,143-156` | CONFIRMED |

### 7. UI / List Features

| # | Feature | Element | Code Ref | Status |
|---|---------|---------|----------|--------|
| 47 | Status badge with color coding | 5 statuses: draft/confirmed/sent/changed/cancelled | `accommodation-list-client.tsx:40-46` | CODE-ONLY |
| 48 | Active vs cancelled sections | Separate sections with counts | `accommodation-list-client.tsx:81-82,159-204` | CODE-ONLY |
| 49 | Empty state with CTA | Hotel icon + "Add Accommodation" button | `accommodation-list-client.tsx:206-222` | CODE-ONLY |
| 50 | Cancel button with confirm dialog | `confirm()` + loading state | `accommodation-list-client.tsx:84-95,321-331` | CODE-ONLY |

### 8. Form Features

| # | Feature | Element | Code Ref | Status |
|---|---------|---------|----------|--------|
| 51 | Person search/picker (filtered to travel records) | Search input + dropdown | `accommodation-form-client.tsx:56-145` | CODE-ONLY |
| 52 | Create/edit mode toggle | `isEdit` based on `existing` prop | `accommodation-form-client.tsx:55` | CODE-ONLY |

### 9. Auth & Access Control

| # | Feature | Rule | Code Ref | Status |
|---|---------|------|----------|--------|
| A1 | assertEventAccess on every page | Redirect to /login on failure | `page.tsx:17-19`, `new/page.tsx:15-18`, `[id]/page.tsx:15-18` | CONFIRMED |
| A2 | requireWrite for create/update/cancel | Write-access gate | `accommodation.ts:20,69,119` | CONFIRMED |
| A3 | requireWrite for new page | Write-access gate on new/ route | `new/page.tsx:16` | CONFIRMED |

### 10. Database Schema

| # | Feature | Detail | Code Ref | Status |
|---|---------|--------|----------|--------|
| D1 | eventId scoping on all queries | withEventScope helper | `accommodation.ts:76,125,194,219,244` | CONFIRMED |
| D2 | Auto-upsert event_people junction | On create, upserts event_people | `accommodation.ts:58-61` | CONFIRMED |
| D3 | Person existence check on create | Throws "Person not found" | `accommodation.ts:24-30` | CONFIRMED |
| D4 | 7 database indexes | event_id, person_id, registration_id, event+person, event+status, shared_group, hotel | `logistics.ts:107-114` | CONFIRMED |

### 11. Exports

| # | Feature | Detail | Code Ref | Status |
|---|---------|--------|----------|--------|
| E1 | Rooming list export (grouped by hotel) | ExcelJS worksheet | `src/lib/exports/excel.ts` | CONFIRMED |
| E2 | Emergency kit includes accommodation | Pre-event backup | `src/lib/exports/emergency-kit.ts` | CONFIRMED |

---

## Discrepancies

### Code-Only (found in code, not verified at runtime)
_UI rendering features — cannot verify without running app._

| Feature | Code Ref | Possible Reason |
|---------|----------|----------------|
| Status badges with colors | `accommodation-list-client.tsx:40-46` | Needs browser verification |
| Active/cancelled sections | `accommodation-list-client.tsx:81-82` | Needs browser verification |
| Empty state with CTA | `accommodation-list-client.tsx:206-222` | Needs browser verification |
| Cancel confirm dialog | `accommodation-list-client.tsx:84-95` | Needs browser verification |
| Person search/picker | `accommodation-form-client.tsx:56-145` | Needs browser verification |
| Create/edit mode toggle | `accommodation-form-client.tsx:55` | Needs browser verification |

### Form Room Types vs Schema Room Types
The form offers 5 room types (single, double, twin, suite, deluxe) while the schema defines 7 (single, double, twin, triple, suite, dormitory, other). The form is missing: **triple**, **dormitory**, **other**; and has **deluxe** which is not in the schema enum. This is a potential bug.

---

## QA Test Targets

_Every CONFIRMED and CODE-ONLY feature is a QA test target. Total: 52 features._

### Already tested (46 checkpoints via existing unit/integration tests):
- All CRUD operations (7)
- All validation rules (9)
- All status machine transitions (9)
- All cascade behaviors (8)
- All notification flows (9)
- Red flag system (4)

### Gap tests needed (6 features not yet directly tested):
- [ ] UI: Status badge color coding renders correctly
- [ ] UI: Active vs cancelled section separation
- [ ] UI: Empty state displays when no records
- [ ] UI: Cancel button shows confirm dialog and loading state
- [ ] Form: Person search/picker filters by name/email with 2-char minimum
- [ ] Form: Create vs edit mode renders correct title and fields
- [ ] BUG: Form room types (deluxe) not matching schema room types (triple, dormitory, other)
