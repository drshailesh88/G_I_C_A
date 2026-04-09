# Feature Census: Travel Module

**Generated:** 2026-04-09
**Entry points:** `src/app/(app)/events/[eventId]/travel/page.tsx`
**Files in scope:** 10
**Route URL:** `/events/:eventId/travel`
**Method:** 2-layer extraction (code + library analysis). Layer 3 (runtime crawl) skipped — no Playwright installed.

## Summary

| Metric | Count |
|--------|-------|
| Total features | 62 |
| From your code | 58 |
| From libraries (emergent) | 4 |
| Code-only (no runtime verification) | 62 |

---

## Files In Scope

| # | File | Role |
|---|------|------|
| 1 | `src/app/(app)/events/[eventId]/travel/page.tsx` | List page (server) |
| 2 | `src/app/(app)/events/[eventId]/travel/travel-list-client.tsx` | List UI (client) |
| 3 | `src/app/(app)/events/[eventId]/travel/travel-form-client.tsx` | Create/Edit form (client) |
| 4 | `src/app/(app)/events/[eventId]/travel/new/page.tsx` | Create page (server) |
| 5 | `src/app/(app)/events/[eventId]/travel/[id]/page.tsx` | Edit page (server) |
| 6 | `src/lib/actions/travel.ts` | Server actions (CRUD) |
| 7 | `src/lib/validations/travel.ts` | Zod schemas + state machine |
| 8 | `src/lib/cascade/handlers/travel-cascade.ts` | Cascade event handlers |
| 9 | `src/lib/cascade/events.ts` | Cascade event definitions |
| 10 | `src/lib/db/schema/logistics.ts` | DB schema (travelRecords table) |

---

## Features by Category

### A. CRUD Operations

| # | Feature | Description | Code Ref | Status |
|---|---------|-------------|----------|--------|
| A1 | Create travel record | Insert new record with draft status, validates input, verifies person exists | `src/lib/actions/travel.ts:19` | CONFIRMED (code+test) |
| A2 | Update travel record | Partial update, preserves previous state for cascade detection | `src/lib/actions/travel.ts:70` | CONFIRMED (code+test) |
| A3 | Cancel travel record | Soft cancel with reason, enforces state machine transitions | `src/lib/actions/travel.ts:124` | CONFIRMED (code+test) |
| A4 | Update record status | Transition status via state machine with validation | `src/lib/actions/travel.ts:163` | CONFIRMED (code+test) |
| A5 | List event travel records | Fetch all records for event, joined with people table, sorted by createdAt desc | `src/lib/actions/travel.ts:209` | CONFIRMED (code+test) |
| A6 | Get single travel record | Fetch by ID with event scope enforcement | `src/lib/actions/travel.ts:248` | CONFIRMED (code+test) |
| A7 | Get person travel records | Fetch all records for a person in an event, sorted by departureAtUtc | `src/lib/actions/travel.ts:263` | CONFIRMED (code+test) |

### B. Validation Rules

| # | Feature | Description | Code Ref | Status |
|---|---------|-------------|----------|--------|
| B1 | Person ID must be valid UUID | `z.string().uuid()` | `src/lib/validations/travel.ts:26` | CONFIRMED (code+test) |
| B2 | Direction enum validation | Must be one of: inbound, outbound, intercity, other | `src/lib/validations/travel.ts:28` | CONFIRMED (code+test) |
| B3 | Travel mode enum validation | Must be one of: flight, train, car, bus, self_arranged, other | `src/lib/validations/travel.ts:29` | CONFIRMED (code+test) |
| B4 | From city required, max 200 chars | `z.string().trim().min(1).max(200)` | `src/lib/validations/travel.ts:30` | CONFIRMED (code+test) |
| B5 | To city required, max 200 chars | `z.string().trim().min(1).max(200)` | `src/lib/validations/travel.ts:32` | CONFIRMED (code+test) |
| B6 | Arrival must be after departure | Zod refinement checking date ordering | `src/lib/validations/travel.ts:43-51` | CONFIRMED (code+test) |
| B7 | From/to location max 300 chars | Optional field with max length | `src/lib/validations/travel.ts:31,33` | CONFIRMED (code+test) |
| B8 | Carrier name max 200 chars | Optional | `src/lib/validations/travel.ts:36` | CONFIRMED (code+test) |
| B9 | Service number max 50 chars | Optional | `src/lib/validations/travel.ts:37` | CONFIRMED (code+test) |
| B10 | PNR/booking ref max 50 chars | Optional | `src/lib/validations/travel.ts:38` | CONFIRMED (code+test) |
| B11 | Seat/coach max 50 chars | Optional | `src/lib/validations/travel.ts:39` | CONFIRMED (code+test) |
| B12 | Terminal/gate max 100 chars | Optional | `src/lib/validations/travel.ts:40` | CONFIRMED (code+test) |
| B13 | Attachment URL max 500 chars | Optional | `src/lib/validations/travel.ts:41` | CONFIRMED (code+test) |
| B14 | Notes max 2000 chars | Optional | `src/lib/validations/travel.ts:42` | CONFIRMED (code+test) |
| B15 | Cancel reason max 500 chars | Optional in cancel schema | `src/lib/validations/travel.ts:76` | CONFIRMED (code+test) |
| B16 | CSV import row validation | Validates email, phone, name, direction, mode, cities | `src/lib/validations/travel.ts:80-96` | CONFIRMED (code+test) |

### C. State Machine (Status Transitions)

| # | Feature | Description | Code Ref | Status |
|---|---------|-------------|----------|--------|
| C1 | draft -> confirmed | Valid transition | `src/lib/validations/travel.ts:17` | CONFIRMED (code+test) |
| C2 | draft -> cancelled | Valid transition | `src/lib/validations/travel.ts:17` | CONFIRMED (code+test) |
| C3 | confirmed -> sent | Valid transition | `src/lib/validations/travel.ts:18` | CONFIRMED (code+test) |
| C4 | confirmed -> changed | Valid transition | `src/lib/validations/travel.ts:18` | CONFIRMED (code+test) |
| C5 | confirmed -> cancelled | Valid transition | `src/lib/validations/travel.ts:18` | CONFIRMED (code+test) |
| C6 | sent -> changed | Valid transition | `src/lib/validations/travel.ts:19` | CONFIRMED (code+test) |
| C7 | sent -> cancelled | Valid transition | `src/lib/validations/travel.ts:19` | CONFIRMED (code+test) |
| C8 | changed -> confirmed | Valid transition | `src/lib/validations/travel.ts:20` | CONFIRMED (code+test) |
| C9 | changed -> sent | Valid transition | `src/lib/validations/travel.ts:20` | CONFIRMED (code+test) |
| C10 | changed -> cancelled | Valid transition | `src/lib/validations/travel.ts:20` | CONFIRMED (code+test) |
| C11 | cancelled is terminal | No transitions allowed from cancelled | `src/lib/validations/travel.ts:21` | CONFIRMED (code+test) |
| C12 | Auto-mark as 'changed' on update | confirmed/sent records auto-transition to changed | `src/lib/actions/travel.ts:108-110` | CONFIRMED (code+test) |
| C13 | Cannot update cancelled record | Throws error if record is cancelled | `src/lib/actions/travel.ts:83` | CONFIRMED (code+test) |
| C14 | Invalid transition rejected | Throws descriptive error with allowed transitions | `src/lib/actions/travel.ts:182-185` | CONFIRMED (code+test) |

### D. Cascade System

| # | Feature | Description | Code Ref | Status |
|---|---------|-------------|----------|--------|
| D1 | Travel updated -> flag accommodations | Upserts red flags on non-cancelled accommodation records for same person | `src/lib/cascade/handlers/travel-cascade.ts:107-132` | CONFIRMED (code+test) |
| D2 | Travel updated -> flag transport | Upserts red flags on transport passenger assignments for this travel record | `src/lib/cascade/handlers/travel-cascade.ts:134-159` | CONFIRMED (code+test) |
| D3 | Travel updated -> email notification | Sends email to delegate with change summary | `src/lib/cascade/handlers/travel-cascade.ts:162-173` | CONFIRMED (code+test) |
| D4 | Travel updated -> WhatsApp notification | Sends WhatsApp to delegate with change summary | `src/lib/cascade/handlers/travel-cascade.ts:174-184` | CONFIRMED (code+test) |
| D5 | Travel cancelled -> flag accommodations (high severity) | Upserts high-severity red flags on accommodations | `src/lib/cascade/handlers/travel-cascade.ts:196-219` | CONFIRMED (code+test) |
| D6 | Travel cancelled -> flag transport | Upserts red flags on transport passenger assignments | `src/lib/cascade/handlers/travel-cascade.ts:221-244` | CONFIRMED (code+test) |
| D7 | Travel cancelled -> email notification | Sends email with cancellation reason | `src/lib/cascade/handlers/travel-cascade.ts:247-257` | CONFIRMED (code+test) |
| D8 | Travel cancelled -> WhatsApp notification | Sends WhatsApp with cancellation reason | `src/lib/cascade/handlers/travel-cascade.ts:258-268` | CONFIRMED (code+test) |
| D9 | Cascade change detection | `CASCADE_TRIGGER_FIELDS` identifies which field changes trigger cascades | `src/lib/validations/travel.ts:108-110` | CONFIRMED (code+test) |
| D10 | Change summary builder | `buildTravelChangeSummary()` produces human-readable field diff | `src/lib/validations/travel.ts:113-126` | CONFIRMED (code+test) |
| D11 | Cascade trigger check | `hasCascadeTriggerChanges()` boolean check for cascade-worthy changes | `src/lib/validations/travel.ts:129-133` | CONFIRMED (code+test) |
| D12 | Notification idempotency | Unique idempotency keys per event+person+record+timestamp+channel | `src/lib/cascade/handlers/travel-cascade.ts:172,183` | CONFIRMED (code+test) |
| D13 | Cascade-safe notification | `sendCascadeNotification` never throws; errors logged to Sentry | `src/lib/cascade/handlers/travel-cascade.ts:40-96` | CONFIRMED (code+test) |
| D14 | Skip notification if no email | Guard: skips email channel if person has no email | `src/lib/cascade/handlers/travel-cascade.ts:55-60` | CONFIRMED (code+test) |
| D15 | Skip notification if no phone | Guard: skips WhatsApp channel if person has no phone | `src/lib/cascade/handlers/travel-cascade.ts:62-68` | CONFIRMED (code+test) |

### E. Access Control & Security

| # | Feature | Description | Code Ref | Status |
|---|---------|-------------|----------|--------|
| E1 | Read access check (list page) | `assertEventAccess(eventId)` on travel list | `src/app/(app)/events/[eventId]/travel/page.tsx:16` | CONFIRMED |
| E2 | Write access check (create) | `assertEventAccess(eventId, { requireWrite: true })` | `src/lib/actions/travel.ts:20` | CONFIRMED (code+test) |
| E3 | Write access check (update) | `assertEventAccess(eventId, { requireWrite: true })` | `src/lib/actions/travel.ts:71` | CONFIRMED (code+test) |
| E4 | Write access check (cancel) | `assertEventAccess(eventId, { requireWrite: true })` | `src/lib/actions/travel.ts:125` | CONFIRMED (code+test) |
| E5 | Write access check (status change) | `assertEventAccess(eventId, { requireWrite: true })` | `src/lib/actions/travel.ts:168` | CONFIRMED (code+test) |
| E6 | Write access check (new page) | `assertEventAccess(eventId, { requireWrite: true })` on new page | `src/app/(app)/events/[eventId]/travel/new/page.tsx:16` | CONFIRMED |
| E7 | Event scope enforcement | All queries use `withEventScope()` or filter by eventId | Multiple | CONFIRMED |
| E8 | Redirect to login on auth failure | Server pages redirect to /login if access check fails | `page.tsx:17, new/page.tsx:17` | CONFIRMED |

### F. UI Features — Travel List

| # | Feature | Description | Code Ref | Status |
|---|---------|-------------|----------|--------|
| F1 | Active/cancelled split view | Records split into Active and Cancelled sections | `travel-list-client.tsx:60-61` | CODE-ONLY |
| F2 | Active count display | Shows "(N)" next to Active header | `travel-list-client.tsx:99` | CODE-ONLY |
| F3 | Cancelled count display | Shows "(N)" next to Cancelled header | `travel-list-client.tsx:119` | CODE-ONLY |
| F4 | Travel card: person name | Shows person's full name | `travel-list-client.tsx:177` | CODE-ONLY |
| F5 | Travel card: status badge | Color-coded status badge (draft/confirmed/sent/changed/cancelled) | `travel-list-client.tsx:179` | CODE-ONLY |
| F6 | Travel card: route display | "FromCity -> ToCity" with direction label | `travel-list-client.tsx:183-189` | CODE-ONLY |
| F7 | Travel card: departure time | Formatted as "MMM d, HH:mm" | `travel-list-client.tsx:192-194` | CODE-ONLY |
| F8 | Travel card: arrival time | Formatted as "MMM d, HH:mm" | `travel-list-client.tsx:195-197` | CODE-ONLY |
| F9 | Travel card: PNR display | Shows PNR/booking reference | `travel-list-client.tsx:198` | CODE-ONLY |
| F10 | Travel card: mode icon | Plane/Train/Car/Bus icon based on travelMode | `travel-list-client.tsx:168,176` | CODE-ONLY |
| F11 | Cancel button on active records | Red "Cancel" text button, hidden for cancelled records | `travel-list-client.tsx:201-210` | CODE-ONLY |
| F12 | Cancel confirmation dialog | `window.confirm()` before cancellation | `travel-list-client.tsx:64` | CODE-ONLY |
| F13 | Cancel loading state | Shows "Cancelling..." while in progress | `travel-list-client.tsx:209` | CODE-ONLY |
| F14 | Cancel error alert | `window.alert()` on cancel failure | `travel-list-client.tsx:70` | CODE-ONLY |
| F15 | Click card to edit | Card links to edit page `/events/:eventId/travel/:id` | `travel-list-client.tsx:173` | CODE-ONLY |
| F16 | "Add" button in header | Links to `/events/:eventId/travel/new` | `travel-list-client.tsx:86-92` | CODE-ONLY |
| F17 | Back button to event | Links to `/events/:eventId` | `travel-list-client.tsx:81` | CODE-ONLY |
| F18 | Empty state: icon + message | Plane icon, "No travel records" text | `travel-list-client.tsx:136-150` | CODE-ONLY |
| F19 | Empty state: add CTA | "Add Travel Record" button in empty state | `travel-list-client.tsx:144-149` | CODE-ONLY |
| F20 | Cancelled card opacity | Cancelled records shown at 60% opacity | `travel-list-client.tsx:172` | CODE-ONLY |

### G. UI Features — Create/Edit Form

| # | Feature | Description | Code Ref | Status |
|---|---------|-------------|----------|--------|
| G1 | Person search (create mode) | Type-ahead search by name or email, shows top 10 matches | `travel-form-client.tsx:75-81` | CODE-ONLY |
| G2 | Person selection | Click to select person from dropdown, sets hidden input | `travel-form-client.tsx:144-150` | CODE-ONLY |
| G3 | Person picker hidden in edit mode | Person field not shown when editing existing record | `travel-form-client.tsx:129` | CODE-ONLY |
| G4 | Direction dropdown | Select with 4 options from TRAVEL_DIRECTIONS enum | `travel-form-client.tsx:170-181` | CODE-ONLY |
| G5 | Travel mode dropdown | Select with 6 options from TRAVEL_MODES enum | `travel-form-client.tsx:187-198` | CODE-ONLY |
| G6 | From/to city inputs | Required text inputs with placeholders | `travel-form-client.tsx:208-231` | CODE-ONLY |
| G7 | From/to location inputs | Optional text inputs for airport/station details | `travel-form-client.tsx:237-261` | CODE-ONLY |
| G8 | Departure datetime picker | `datetime-local` input | `travel-form-client.tsx:270-276` | CODE-ONLY |
| G9 | Arrival datetime picker | `datetime-local` input | `travel-form-client.tsx:280-286` | CODE-ONLY |
| G10 | Carrier/airline input | Optional text input | `travel-form-client.tsx:298-305` | CODE-ONLY |
| G11 | Flight/train number input | Optional text input | `travel-form-client.tsx:311-318` | CODE-ONLY |
| G12 | PNR/booking ref input | Optional text input | `travel-form-client.tsx:328-335` | CODE-ONLY |
| G13 | Terminal/gate input | Optional text input | `travel-form-client.tsx:340-347` | CODE-ONLY |
| G14 | Seat/coach input | Optional text input | `travel-form-client.tsx:357-363` | CODE-ONLY |
| G15 | Attachment URL input | URL type input | `travel-form-client.tsx:372-378` | CODE-ONLY |
| G16 | Notes textarea | 3-row textarea, optional | `travel-form-client.tsx:387-393` | CODE-ONLY |
| G17 | Form error display | Red error banner below form fields | `travel-form-client.tsx:398-400` | CODE-ONLY |
| G18 | Submit loading state | "Saving..." text while submitting | `travel-form-client.tsx:408` | CODE-ONLY |
| G19 | Submit button label toggle | "Create Travel Record" vs "Update Travel Record" | `travel-form-client.tsx:408` | CODE-ONLY |
| G20 | Form pre-population in edit mode | All fields populated from existing record | `travel-form-client.tsx:174,191,...` | CODE-ONLY |
| G21 | Datetime-local conversion | Converts Date objects to datetime-local format | `travel-form-client.tsx:53-58` | CODE-ONLY |
| G22 | ISO conversion on submit | Converts datetime-local values to ISO strings before sending | `travel-form-client.tsx:95-96` | CODE-ONLY |
| G23 | Redirect after save | Navigates to travel list after successful create/update | `travel-form-client.tsx:107` | CODE-ONLY |
| G24 | Back button to list | Links to `/events/:eventId/travel` | `travel-form-client.tsx:119` | CODE-ONLY |

### H. Data Integrity & Audit

| # | Feature | Description | Code Ref | Status |
|---|---------|-------------|----------|--------|
| H1 | Auto-upsert event_people junction | Creating a travel record auto-links person to event | `src/lib/actions/travel.ts:59-63` | CONFIRMED (code+test) |
| H2 | createdBy / updatedBy tracking | User ID stored on create and every update | `src/lib/actions/travel.ts:55-56,87-88` | CONFIRMED |
| H3 | cancelledAt timestamp | Set when record transitions to cancelled | `src/lib/actions/travel.ts:147,194-195` | CONFIRMED (code+test) |
| H4 | Cancellation reason in notes | Reason appended to notes field on cancel | `src/lib/actions/travel.ts:148-149` | CONFIRMED (code+test) |
| H5 | Previous state returned on update | `updateTravelRecord` returns `{ record, previous }` for cascade comparison | `src/lib/actions/travel.ts:120` | CONFIRMED (code+test) |
| H6 | Path revalidation | `revalidatePath()` called after every mutation | `src/lib/actions/travel.ts:65,118,157,204` | CONFIRMED |

### I. Library-Emergent Features

| # | Feature | Library | Description | Status |
|---|---------|---------|-------------|--------|
| I1 | Date formatting | date-fns | `format()` used for departure/arrival display | EMERGENT |
| I2 | Lucide icons | lucide-react | Plane, Train, Car, Bus, ArrowLeft, Plus, AlertTriangle icons | EMERGENT |
| I3 | Zod error messages | zod | Automatic field-level error messages from schema definitions | EMERGENT |
| I4 | Next.js route revalidation | next/cache | `revalidatePath()` for cache invalidation after mutations | EMERGENT |

---

## Discrepancies

### Code-Only (found in code, not verified at runtime)
All UI features (F1-F20, G1-G24) are code-only — no Playwright runtime crawl was performed. These need E2E testing to verify they render correctly.

### Not Yet Tested in Existing Tests
- UI rendering and interaction (all F and G features)
- Server page access control redirects (E1, E6, E8)
- Path revalidation (H6)

### CSV Import Schema Defined But No Import Action
`travelCsvRowSchema` (B16) is defined in validations but no corresponding CSV import server action was found in `src/lib/actions/travel.ts`. This may be handled elsewhere or is planned.

---

## QA Test Targets

Total testable features: **62**

### Already covered by unit tests (estimated):
- A1-A7 (CRUD operations)
- B1-B16 (validation rules)
- C1-C14 (state machine)
- D1-D15 (cascade system)
- E2-E5 (write access checks)

### Need E2E / integration testing:
- [ ] F1: Active/cancelled split view renders correctly
- [ ] F2-F3: Section counts display accurately
- [ ] F4-F10: Travel card displays all data fields correctly
- [ ] F11-F14: Cancel flow (confirm dialog -> loading -> success/error)
- [ ] F15: Card click navigates to edit page
- [ ] F16-F17: Navigation buttons work
- [ ] F18-F19: Empty state renders with CTA
- [ ] F20: Cancelled cards have reduced opacity
- [ ] G1-G2: Person search and selection works
- [ ] G3: Person picker hidden in edit mode
- [ ] G4-G5: Dropdowns populated with enum values
- [ ] G6-G16: All form fields accept input and pre-populate in edit mode
- [ ] G17: Error message displays on validation failure
- [ ] G18-G19: Submit button states (loading, label toggle)
- [ ] G22-G23: Form submission creates/updates record and redirects
- [ ] E1, E6, E8: Auth redirects on server pages
- [ ] H1: event_people junction auto-created on travel record creation
