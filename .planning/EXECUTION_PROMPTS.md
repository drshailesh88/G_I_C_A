# GEM India — Claude Code Execution Prompts
## Paste these into Claude Code terminal for each sub-phase

---

## HOW TO USE

1. Open Claude Code in your project directory
2. Paste the prompt for the current sub-phase
3. Let Claude Code execute (build → test → fix loop)
4. When all tests pass, run the Codex adversarial prompt
5. Fix findings, re-test
6. Commit and move to next sub-phase

---

## PHASE 6A — Wire Real Notifications to Cascade

### Prompt 6A-1: Replace notification stub in cascade handlers

```
We are in Phase 6A of the GEM India build. Read .planning/ROADMAP.md and .planning/STATE.md for context.

TASK: Wire the real notification service to cascade handlers.

Currently, src/lib/cascade/handlers/travel-cascade.ts and accommodation-cascade.ts import sendNotification from '../stub' which only console.logs. The real notification service at src/lib/notifications/send.ts is fully built and tested.

REQUIREMENTS:
1. In travel-cascade.ts, replace the stub import with the real sendNotification from '@/lib/notifications/send'
2. Before calling sendNotification, query the person's email and phone from the people table
3. Build the full SendNotificationInput object with:
   - channel: 'email' (send email first, WhatsApp second)
   - templateKey: matching the cascade event (e.g., 'travel_update', 'travel_cancelled')
   - personId from the cascade payload
   - variables including recipientEmail, recipientPhoneE164, and all cascade payload data
   - triggerType: 'automation'
   - triggerEntityType: 'travel_record'
   - triggerEntityId: from the cascade payload
   - sendMode: 'automatic'
   - idempotencyKey: keep the existing formula from the stub calls
4. Do the same for accommodation-cascade.ts
5. Add a second sendNotification call for WhatsApp channel (same data, different channel)
6. Wrap each send in try/catch — cascade must not fail if notification fails

APPROACH: TDD
- Write failing tests first that verify notification_log gets entries when cascade fires
- Then implement
- Then refactor

Run all tests after implementation. Every existing test must still pass. Target: 6+ new integration tests.

When done, show me the test output and the changed files.
```

### Prompt 6A-1 Codex Review:

```
/codex

Review the changes made in Phase 6A-1 (wiring real notifications to cascade handlers).

Focus your adversarial review on:
1. Can a cascade handler failure cause the cascade to stop processing other handlers?
2. Is the idempotency key truly unique per (person, event, trigger, channel) combination?
3. If the person has no email or no phone, does it fail gracefully or throw?
4. If the notification_templates table has no matching template for the templateKey, what happens?
5. Are there any event isolation leaks — can cascade for Event A accidentally notify people from Event B?
6. What happens if sendNotification is called with an invalid eventId?
7. Is there a risk of infinite loop — notification send triggers a domain event that triggers another cascade?

For each issue found, provide the exact file, line, and suggested fix.
```

### Prompt 6A-2: Wire domain event handler (H7)

```
We are in Phase 6A-2. Context: .planning/ROADMAP.md, research-hub/DEFERRED_TICKETS.md (item H7).

TASK: The handleDomainEvent function in the automation trigger system currently only logs. Wire it to actually send notifications.

REQUIREMENTS:
1. When handleDomainEvent is called with a domain event name and eventId:
   a. Query automation_triggers table for active triggers matching (eventId, domainEvent)
   b. For each matching trigger, call sendNotification with:
      - The trigger's configured templateKey
      - The trigger's configured channel
      - The person/recipient from the event payload
      - Variables from the event payload
2. Prevent infinite loops: add a 'source' field to notification sends. If source is 'automation', the resulting domain event must NOT re-trigger automation. Add a guard check.
3. Log each trigger execution to the notification_log

APPROACH: TDD — RED → GREEN → REFACTOR
Write tests first:
- Active trigger + matching event → notification sent
- Inactive trigger → notification NOT sent
- No matching trigger → no action
- Infinite loop guard → second-level trigger does NOT fire

Run all tests. Target: 8+ new tests.
```

### Prompt 6A-3: Attachment flow (H5)

```
Phase 6A-3. Context: research-hub/DEFERRED_TICKETS.md (item H5).

TASK: Email and WhatsApp adapters don't pass file attachments. Implement R2 signed URL attachment flow.

REQUIREMENTS:
1. In src/lib/notifications/email.ts (Resend adapter):
   - Accept AttachmentDescriptor[] from the send input
   - For each attachment with storageKey, generate R2 signed URL (15 min expiry)
   - Map to Resend's attachment format: { filename, path (URL) }
   - Pass attachments array to resend.emails.send()

2. In src/lib/notifications/whatsapp.ts (Evolution API adapter):
   - Accept mediaAttachments from send input
   - For document type (PDF): send as document message via Evolution API
   - For image type: send as image message
   - Include R2 signed URL as the media URL

3. In src/lib/certificates/storage.ts, add a getSignedUrl(storageKey, expirySeconds) helper

4. Update the certificate delivery flow: when sending certificate via email/WhatsApp,
   include the certificate PDF as an attachment

APPROACH: TDD
Tests:
- Send email with attachment → verify Resend called with attachment URL
- Send WhatsApp with PDF → verify Evolution API called with document media
- Expired signed URL → verify error captured gracefully
- Null/empty attachments → verify send proceeds without attachments

Run all tests. Target: 12+ new tests.
```

### Prompt 6A-4: Clerk middleware

```
Phase 6A-4.

TASK: Add Clerk authentication middleware to protect routes.

Create src/middleware.ts:

1. Use clerkMiddleware() from @clerk/nextjs/server
2. Define public routes that do NOT require auth:
   - / (root redirect)
   - /login, /forgot-password, /reset-password
   - /e/(.*) (all public event pages — landing, registration, faculty confirm)
   - /verify/(.*) (certificate verification)
   - /api/webhooks/(.*) (Resend and Evolution API webhooks)
3. All other routes require authentication
4. Add matcher config to exclude static files and Next.js internals

APPROACH: TDD
Tests:
- Request to /events/123 without auth → 302 redirect to /login
- Request to /e/test-event without auth → 200 OK (public)
- Request to /api/webhooks/email without auth → 200 OK (webhook)
- Request to /dashboard with valid Clerk session → 200 OK

Run all tests. Target: 6 new tests.
```

---

## PHASE 6B — Branding

### Prompt 6B-1: Branding CRUD

```
Phase 6B-1. We are building per-event branding configuration (M15 screen).

TASK: Build branding settings page and storage.

REQUIREMENTS:
1. Add branding columns to events table OR create event_branding table:
   - logoUrl (text, nullable) — R2 storage key
   - headerImageUrl (text, nullable) — R2 storage key
   - primaryColor (text, default '#1e40af')
   - secondaryColor (text, default '#f97316')
   - emailSenderName (text, nullable)
   - emailFooterText (text, nullable)
   - whatsappPrefix (text, nullable)

2. Create Zod validation schema for branding input

3. Create server action: updateEventBranding(eventId, data)
   - Validates input with Zod
   - Enforces event isolation
   - Handles logo/header image upload to R2

4. Build UI page at /events/[eventId]/branding:
   - Logo upload with preview (accept PNG, SVG, JPEG, max 2MB)
   - Header image upload with preview (max 5MB)
   - Color picker inputs for primary/secondary
   - Text inputs for sender name, footer, WhatsApp prefix
   - "Preview Email" button → shows sample rendered email
   - Save button

APPROACH: TDD for server action + validation. Build UI after tests pass.
Target: 10+ new tests.
```

---

## PHASE 6C — Reports & Exports

### Prompt 6C-1: Excel export engine

```
Phase 6C-1. Build the report export system.

TASK: Create reusable Excel export service and Reports page (M47).

REQUIREMENTS:
1. Create src/lib/exports/excel.ts:
   - Generic function: exportToExcel(columns, rows, sheetName) → Buffer
   - Styled header row (bold, colored background)
   - Auto-width columns based on content

2. Create 6 specific export functions, each scoped by eventId:
   a. exportAttendeeList(eventId) — name, email, phone, designation, specialty, city, reg#, status
   b. exportTravelRoster(eventId) — name, direction, from, to, departure, arrival, PNR, mode, status
   c. exportRoomingList(eventId) — name, hotel, room#, type, check-in, check-out, booking ref
   d. exportTransportPlan(eventId) — batch, date, time window, pickup, drop, vehicle, passengers
   e. exportFacultyResponsibilities(eventId) — name, session, role, hall, date, time, status
   f. exportAttendanceReport(eventId) — name, reg#, check-in time, method, session

3. Create API routes: /api/events/[eventId]/exports/[type]
   - Validate eventId + user auth + role permission
   - Call export function → return .xlsx as download

4. Build Reports page (M47):
   - Card per export type showing record count
   - Download button per card
   - "Export All" button → generates ZIP with all exports

APPROACH: TDD for each export function (verify columns, row count, event isolation).
Target: 18+ new tests (3 per export type).
```

---

## PHASE 7A — Certificate Template Editor UI

### Prompt 7A-1: pdfme Designer integration

```
Phase 7A-1. This is the biggest remaining UI feature.

TASK: Build the certificate template editor using @pdfme/ui Designer.

CONTEXT: Certificate template CRUD already exists (server actions + DB).
We need the visual editor UI.

REQUIREMENTS:
1. Install: npm install @pdfme/ui @pdfme/common @pdfme/schemas

2. Create page at /events/[eventId]/certificates/editor/[templateId]

3. On page load:
   - Fetch template JSON from certificate_templates table
   - If new template (templateId='new'), use a default template

4. Render pdfme Designer component:
   - basePdf: blank A4 landscape (standard certificate size)
   - Available schemas: text, image, qrcode (from @pdfme/schemas)
   - Sidebar shows available dynamic fields as draggable elements:
     * {recipient_name}, {designation}, {registration_number}
     * {event_name}, {event_dates}, {venue_name}
     * {certificate_type}, {certificate_number}, {issue_date}
     * {qr_verification_url}

5. Save button:
   - Extract template JSON from Designer
   - Call server action to persist to DB
   - Show success toast

6. Preview button:
   - Use @pdfme/generator to create sample PDF with mock data
   - Open in new tab or show in iframe

IMPORTANT: @pdfme/ui uses dynamic imports. It must be loaded client-side only.
Use next/dynamic with ssr: false.

APPROACH: Build incrementally:
Step 1: Get Designer rendering with default template (no save)
Step 2: Add save functionality
Step 3: Add load existing template
Step 4: Add preview
Step 5: Add dynamic field sidebar

Test each step. 8+ tests total.
```

---

## PHASE 7B — QR Check-in UI

### Prompt 7B-1: QR scanner page

```
Phase 7B-1. Replace the placeholder QR check-in page.

TASK: Build the full QR scanner check-in interface (M11).

CONTEXT: All backend actions exist and are tested:
- processQrScan (src/lib/actions/checkin.ts)
- ScanFeedback component (src/components/shared/ScanFeedback.tsx)
- QrScanner component (src/components/shared/QrScanner.tsx)
- CheckInSearch component (src/components/shared/CheckInSearch.tsx)

REQUIREMENTS:
1. Replace /events/[eventId]/qr/page.tsx placeholder with real page

2. Layout (mobile-first, this runs on phones):
   Top: Event name + "QR Check-In" title + stats badge (checked: X / total: Y)
   
   Main area: QR scanner feed (QrScanner component)
   - Full width on mobile
   - When scanned, show ScanFeedback overlay for 3 seconds then reset
   
   Bottom bar:
   - "Manual Check-in" button → toggles CheckInSearch panel
   - "Offline: X queued" badge (when offline)

3. Wire QrScanner onScan → processQrScan server action
4. Wire result → ScanFeedback display
5. Wire CheckInSearch → processManualCheckIn
6. Show live stats (total registered, checked in, remaining)

APPROACH: Build incrementally. Test on mobile viewport (375px width).
8+ tests for the page integration.
```

---

## PHASE 7C — Dashboard

### Prompt 7C-1: Dashboard enrichment

```
Phase 7C-1. Expand the dashboard from 116 lines to operational command center.

TASK: Build the full M01 dashboard.

REQUIREMENTS:
1. Event selector dropdown (top of page)
   - Shows all events user has access to
   - Selecting an event loads its metrics below
   - Remembers last selected event (localStorage)

2. Metric cards row (use shadcn Card component):
   - Total Registrations: count with +N today badge
   - Faculty Status: confirmed / total invited
   - Certificates Issued: count / eligible count
   - Notifications: sent count | failed count (red if > 0)
   - Red Flags: pending count (red badge if > 0)

3. "Needs Attention" section (only shows if items exist):
   - Each item: icon + count + description + link to relevant page
   - Red flags pending → link to accommodation
   - Failed notifications → link to /communications/failed
   - Pending faculty → link to faculty list
   - Upcoming event in < 48 hours without emergency kit → link to generate

4. Quick actions grid:
   - Export Attendee List → triggers download
   - Generate Certificates → links to certificates page
   - Download Emergency Kit → triggers archive generation
   - View Transport Plan → links to transport page

5. ALL metric queries must:
   - Filter by selected eventId
   - Use a SINGLE aggregation query (not N+1)
   - Handle empty event gracefully

APPROACH: TDD for the data-fetching server action, then build UI.
10+ tests.
```

---

## PHASE 8A — Inngest Migration

### Prompt 8A-1: Install and migrate cascade to Inngest

```
Phase 8A-1. Migrate from synchronous cascade to Inngest background jobs.

TASK: Install Inngest and convert cascade handlers to Inngest functions.

REQUIREMENTS:
1. npm install inngest

2. Create src/lib/inngest/client.ts:
   - Initialize Inngest client with id: 'gem-india'

3. Create /api/inngest/route.ts:
   - Serve all Inngest functions

4. Convert each cascade handler to an Inngest function:
   - handleTravelUpdated → inngest.createFunction({ id: 'cascade/travel-updated' }, { event: 'conference/travel.updated' }, handler)
   - handleTravelCancelled → same pattern
   - handleAccommodationUpdated → same pattern
   - handleAccommodationCancelled → same pattern

5. Modify emitCascadeEvent to call inngest.send() instead of running handlers in-process

6. Each function must be idempotent (safe to retry)
7. Each function gets max 3 retries with exponential backoff

8. The handler code inside each function stays EXACTLY the same —
   only the wrapper changes from onCascadeEvent() to inngest.createFunction()

CRITICAL: All existing cascade tests must still pass. The behavior is identical,
only the execution model changes (sync → async).

APPROACH: 
Step 1: Install + configure Inngest (verify /api/inngest responds)
Step 2: Create one function (travel-updated), test it
Step 3: Convert remaining functions
Step 4: Update emitCascadeEvent
Step 5: Run ALL tests

6+ new tests + all existing tests green.
```

---

## PHASE 8B — Monitoring & Safety

### Prompt 8B-3: GitHub Actions CI

```
Phase 8B-3.

TASK: Create GitHub Actions CI pipeline.

Create .github/workflows/ci.yml:

Trigger: push to any branch, pull request to main

Jobs:
1. Type check: npx tsc --noEmit
2. Lint: npx next lint
3. Test: npx vitest run
4. Build: npm run build

Requirements:
- Node.js 20.x
- Cache node_modules between runs
- DATABASE_URL must be set as a secret (use Neon branch URL for CI)
- CLERK keys can be mocked for type check/build
- Fail fast: if type check fails, skip test and build

Create .env.ci with mock values for build-only env vars.
Add DATABASE_URL to GitHub repo secrets.

APPROACH: Create the file, push, verify it runs. Fix until green.
```

---

## AFTER EVERY SUB-PHASE: Codex Adversarial Prompt Template

```
/codex

Adversarial review of Phase [X] changes in GEM India Conference App.

Context: This is a medical conference management platform handling
50-1000 delegates per event. Reliability during live conferences is critical.

Files changed in this phase:
[paste file list or git diff --stat]

Review for:
1. EVENT ISOLATION: Every DB query must filter by eventId. Flag any query that doesn't.
2. IDEMPOTENCY: Every notification send must be safe to retry. Flag any that aren't.
3. ERROR HANDLING: Catch blocks must log AND propagate or return meaningful error. Flag any that swallow silently.
4. INPUT VALIDATION: Every server action must validate with Zod before DB access. Flag any that don't.
5. RACE CONDITIONS: Any read-then-write pattern without locking. Flag any you find.
6. SECURITY: XSS, SQL injection, path traversal, unauthorized access. Flag any vectors.
7. TYPE SAFETY: Any use of 'any', unsafe type assertions, or runtime type mismatches. Flag them.
8. PERFORMANCE: N+1 queries, unbounded SELECTs without LIMIT, missing indexes. Flag them.

For each issue: file, line number, severity (CRITICAL/HIGH/MEDIUM), and exact fix.
```

---

## Progress Tracking: Update STATE.md After Each Sub-Phase

After completing each sub-phase and its Codex review, tell Claude Code:

```
Update .planning/STATE.md:
- Current Phase: Phase [X]
- Completed: [list completed sub-phases]
- Tests passing: [current count]
- Next: Phase [X+1] or Sub-Phase [X-next]

Also update .planning/ROADMAP.md to check off the completed phase.
Then git commit with message: "chore: update state — Phase [X] complete"
```
