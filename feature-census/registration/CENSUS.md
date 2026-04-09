# Registration Module — Feature Census

**Generated:** 2026-04-09
**Module:** registration
**Layers:** Code extraction + Library enrichment

---

## 1. Database Schema

**Table:** `eventRegistrations` (`src/lib/db/schema/registrations.ts`)

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| eventId | UUID | FK → events, cascade delete |
| personId | UUID | FK → people, restrict delete |
| registrationNumber | TEXT | Unique, format: GEM2026-DEL-00412 |
| category | TEXT | delegate/faculty/invited_guest/sponsor/volunteer |
| age | INTEGER | Captured at registration time |
| status | TEXT | pending/confirmed/waitlisted/declined/cancelled |
| preferencesJson | JSONB | Travel/dietary/accessibility |
| qrCodeToken | TEXT | Unique, 32-char alphanumeric |
| registeredAt | TIMESTAMP | Registration time |
| cancelledAt | TIMESTAMP | Cancellation time |
| createdBy/updatedBy | TEXT | Audit trail |

**Indexes:** event+status, event+category, qrToken, registrationNumber, unique(eventId,personId)

---

## 2. Validation Schemas (Zod)

**File:** `src/lib/validations/registration.ts`

- `publicRegistrationSchema` — fullName, email, phone (required); designation, specialty, organization, city (optional); age (1-120); preferences (record)
- `updateRegistrationStatusSchema` — registrationId (UUID) + newStatus (enum)
- `registrationIdSchema` — UUID validation
- `generateRegistrationNumber(eventSlug, category, sequence)` — format: GEM2026-DEL-00412
- `generateQrToken()` — 32-char crypto-secure alphanumeric
- `REGISTRATION_TRANSITIONS` — state machine rules

---

## 3. Server Actions

**File:** `src/lib/actions/registration.ts`

### registerForEvent(eventId, input)
- Zod validation
- Feature flag check (`registration_open` via Redis)
- Event existence + status check (must be 'published')
- Capacity enforcement (maxCapacity + enableWaitlist)
- Person deduplication by email/phone
- Phone normalization to E.164
- Registration number + QR token generation
- Status determination (confirmed/pending/waitlisted based on event settings)
- eventPeople junction upsert

### updateRegistrationStatus(input)
- Clerk auth required
- Per-event write access check
- State transition validation
- cancelledAt timestamp management
- Cache revalidation

### getEventRegistrations(eventId)
- Auth + read access
- Joined person details
- Ordered by registeredAt desc

### getRegistrationPublic(registrationId)
- No auth (public)
- Non-sensitive fields only

---

## 4. Public Pages

### Registration Form
- **Page:** `src/app/(public)/e/[eventSlug]/register/page.tsx` (server)
- **Client:** `registration-form-client.tsx`
- Fields: fullName, email, phone, designation, specialty, organization, city, age
- Form state: isSubmitting, error, fieldErrors
- Redirects to success page on completion

### Registration Success
- **Page:** `src/app/(public)/e/[eventSlug]/register/success/page.tsx` (server)
- **Client:** `registration-success-client.tsx`
- Status-specific UI: pending (clock), waitlisted (alert), confirmed (check + QR placeholder)
- Shows registration number

---

## 5. Admin Registration Management

- **Page:** `src/app/(app)/events/[eventId]/registrations/page.tsx`
- **Client:** `registrations-list-client.tsx`
- Status summary cards (confirmed/pending/waitlisted counts)
- Search by name, registration number, email, phone
- Filter by status
- Status-aware action buttons per transition rules
- Write permission via `useRole()` hook
- Optimistic UI updates

---

## 6. QR Code & Check-in

- **Utils:** `src/lib/attendance/qr-utils.ts`
  - `buildQrPayloadUrl()`, `buildCompactQrPayload()`, `parseQrPayload()`
  - `isValidQrToken()`, `checkRegistrationEligibility()`, `determineScanResult()`
- **Component:** `src/components/shared/RegistrationQrCode.tsx`
  - QRCodeSVG from qrcode.react
  - Full URL or compact format
  - Error fallback
- **Check-in Actions:** `src/lib/actions/checkin.ts`, `checkin-search.ts`

---

## 7. Notification Templates

**File:** `src/lib/notifications/system-templates.ts`

| Template | Channels | Trigger | Mode |
|----------|----------|---------|------|
| registration_confirmation | Email + WhatsApp | registration.created | automatic |
| registration_cancelled | Email + WhatsApp | registration.cancelled | automatic |

---

## 8. Feature Flags

- `registration_open` — Redis key: `flags:event:{eventId}:registration_open`, default: true

---

## 9. Libraries (Emergent Capabilities)

| Library | Capability |
|---------|-----------|
| zod@^3.24 | Schema validation |
| qrcode.react@^4.2 | QR code rendering |
| @yudiel/react-qr-scanner@^2.5 | QR scanning |
| exceljs@^4.4 | Excel export |
| inngest@^4.2 | Background jobs |
| @upstash/redis@^1.37 | Feature flags |
| @clerk/nextjs@^6.12 | Auth & RBAC |
| libphonenumber-js | Phone normalization |

---

## 10. Existing Tests

| File | Coverage |
|------|----------|
| `src/lib/validations/registration.test.ts` | Schema validation, state transitions, registration number format, QR token |
| `src/lib/actions/registration.test.ts` | registerForEvent, updateRegistrationStatus, getEventRegistrations |
| `src/lib/attendance/qr-utils.test.ts` | QR payload building/parsing |

---

## 11. Feature Inventory (37 capabilities)

### Core Registration (10)
1. Public registration form with Zod validation
2. Registration number generation (format: GEM2026-DEL-00412)
3. QR token generation (32-char crypto-secure)
4. Auto-confirm vs approval-required workflow
5. Capacity enforcement with maxCapacity
6. Auto-waitlist when capacity exceeded
7. Person deduplication by email + phone
8. Phone normalization to E.164
9. Feature flag gating (registration_open)
10. Event status check (must be 'published')

### Status Management (6)
11. State machine transitions (REGISTRATION_TRANSITIONS)
12. Admin status update with auth check
13. cancelledAt timestamp management
14. Cache revalidation on status change
15. Status-specific success page messaging
16. Optimistic UI updates on admin actions

### Admin Dashboard (6)
17. Registration list with person details (joined query)
18. Status summary cards with counts
19. Search by name/number/email/phone
20. Filter by status
21. Status-aware action buttons
22. Write permission gating via useRole()

### QR & Check-in (6)
23. QR code rendering (SVG, configurable size)
24. Full URL QR payload format
25. Compact QR payload format
26. QR payload parsing (both formats)
27. Registration eligibility check (confirmed only)
28. Scan result determination (success/duplicate/invalid/ineligible)

### Notifications (2)
29. Registration confirmation (email + WhatsApp)
30. Registration cancelled notification (email + WhatsApp)

### Data Integrity (5)
31. Unique constraint: one registration per person per event
32. eventId filtering on all queries
33. Per-event auth (assertEventAccess)
34. Audit trail (createdBy/updatedBy)
35. Preferences stored as JSONB

### Public Pages (2)
36. Registration form page (server + client components)
37. Success page with status-specific UI
