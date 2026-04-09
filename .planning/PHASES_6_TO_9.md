# GEM India — Remaining Phases (6 through 9)
## Build → Test → Codex Adversarial → Fix → Loop

> Phases 1-5 are COMPLETE (74/116 requirements, 958 tests).
> What follows are the remaining 42 requirements plus critical
> infrastructure, hardening, and production readiness work.

---

## Execution Protocol (Every Requirement)

```
For each Req N:
  1. /gsd:discuss-phase N  → flesh out implementation approach
  2. /gsd:plan-phase N     → create atomic sub-tasks
  3. /gsd:execute-phase N  → build with TDD (RED → GREEN → REFACTOR)
  4. Run: npm run test:run → ALL tests must pass
  5. If tests fail → fix → re-run → loop until green
  6. /codex adversarial review → paste code for review
  7. Apply Codex findings → fix → re-run tests
  8. If tests fail → fix → re-run → loop until green
  9. git commit with conventional message
  10. Move to Req N+1
```

---

## PHASE 6: Notification Wiring + Branding + Reports

**Goal:** Every cascade and business event sends real notifications.
Per-event branding works. All export/report features functional.
This phase turns the "demo" into a "working system."

**Screens:** M13, M15, M19, M39, M47, M51, M52, M53, M54

### Sub-Phase 6A — Wire Real Notifications to Cascade (CRITICAL)

> The cascade system creates red-flags correctly but calls stub.ts
> instead of the real notification service. This sub-phase connects them.

**Req 6A-1: Replace notification stub with real service in cascade handlers**
```
Task: In src/lib/cascade/handlers/travel-cascade.ts and
accommodation-cascade.ts, replace imports of sendNotification
from './stub' with imports from '@/lib/notifications/send'.

Wire the real sendNotification with proper parameters:
- Resolve recipientEmail and recipientPhoneE164 from the person record
- Use the correct templateKey for each cascade event
- Pass all relevant variables from the cascade payload
- Maintain the existing idempotencyKey formula

Test: Create a travel record → verify notification_log gets a real entry
      with status 'queued' or 'sent' (not just console.log)
Update: travel record → verify red-flag created AND notification logged
Cancel: travel record → verify red-flag + notification

Must pass: All existing cascade tests still green + 6 new integration tests
Codex review focus: idempotency key collisions, missing variable resolution,
                    error swallowing in cascade-to-notification bridge
```

**Req 6A-2: Wire domain event handler (H7 from deferred tickets)**
```
Task: In the automation trigger system, handleDomainEvent currently
only logs. Wire it to call sendNotification() for each configured
automation trigger that matches the event.

For each trigger in automation_triggers table where:
  - trigger.eventId matches the domain event's eventId
  - trigger.domainEvent matches the event name
  - trigger.isActive is true

Call sendNotification with the trigger's configured templateKey and channel.

Test: Create automation trigger for 'conference/travel.saved' →
      save a travel record → verify notification sent via the trigger
Disable trigger → save travel record → verify NO notification sent

Must pass: All existing automation tests + 8 new tests
Codex review focus: infinite loop prevention (notification send triggers
                    another domain event that triggers another send),
                    event isolation on trigger queries
```

**Req 6A-3: Implement attachment flow (H5 from deferred tickets)**
```
Task: Email and WhatsApp adapters currently don't pass attachments.
Implement R2 signed URL attachment flow:

For email (Resend adapter):
- Accept AttachmentDescriptor[] from send input
- For each attachment, generate R2 signed URL (15-minute expiry)
- Pass as Resend attachment with filename and URL

For WhatsApp (Evolution API adapter):
- Accept mediaAttachments from send input
- For document type, send as media message with R2 signed URL
- For image type, send as image message

Test: Send email with certificate PDF attachment → verify Resend receives URL
      Send WhatsApp with ticket PDF → verify Evolution API receives media URL
      Send with expired URL → verify graceful error handling

Must pass: All existing notification tests + 12 new tests
Codex review focus: URL expiry timing, R2 signed URL security,
                    attachment size limits, media type validation
```

**Req 6A-4: Add Clerk middleware for route protection**
```
Task: Create src/middleware.ts with Clerk's clerkMiddleware().

Public routes (no auth required):
  /
  /login
  /forgot-password
  /reset-password
  /e/(.*)          (event landing, registration, faculty confirm)
  /verify/(.*)     (certificate verification)
  /api/webhooks/(.*) (Resend and Evolution API webhooks)

Protected routes (auth required):
  /dashboard/(.*)
  /events/(.*)
  /people/(.*)
  /program/(.*)

Test: Unauthenticated request to /events → redirects to /login
      Unauthenticated request to /e/test-event → renders (public)
      Unauthenticated request to /api/webhooks/email → proceeds (webhook)

Must pass: 6 new middleware tests
Codex review focus: webhook routes must NOT require auth,
                    public registration routes must NOT require auth,
                    redirect loop prevention
```

### Sub-Phase 6B — Per-Event Branding

**Req 6B-1: Branding configuration CRUD**
```
Task: Build the branding settings page (M15) where event coordinators
configure per-event branding:
- Logo upload (R2 storage, max 2MB, PNG/SVG/JPEG)
- Header image upload (R2, max 5MB)
- Primary color (hex picker)
- Secondary color (hex picker)
- Sender display name for emails
- Footer text for emails
- WhatsApp message prefix/suffix

Store in events table (add columns via migration) or a separate
event_branding table.

UI: Form with image preview, color picker inputs, text fields.
    "Preview" button shows sample email with branding applied.

Test: Upload logo → verify R2 key saved in DB
      Set colors → verify hex values persisted
      Preview → verify branding appears in sample template render

Must pass: 10 new tests (CRUD + validation + R2 upload)
Codex review focus: image type validation (magic bytes not just extension),
                    file size enforcement, XSS in footer text,
                    R2 key path structure (events/{eventId}/branding/*)
```

**Req 6B-2: Branding injection into notification templates**
```
Task: Modify the template renderer to load event branding and inject
it into every rendered template.

When renderTemplate() is called with an eventId:
1. Query event branding config
2. Pass logo URL, colors, sender name as template variables
3. React Email templates use these variables for header/footer/colors

Test: Render template for event with custom branding → verify logo URL in HTML
      Render template for event with NO branding → verify default fallback
      Change branding → re-render → verify new branding appears

Must pass: 6 new tests
Codex review focus: caching branding config (don't query DB per notification),
                    fallback to defaults, image URL accessibility from email clients
```

### Sub-Phase 6C — Reports & Exports

**Req 6C-1: Excel export engine**
```
Task: Build a reusable export service at src/lib/exports/excel.ts
using exceljs. Must support:
- Styled header row (bold, colored background)
- Auto-width columns
- Per-event filtering on all exports
- Download as .xlsx via API route

Implement these specific exports:
1. Attendee list (name, email, phone, designation, specialty, city, reg#, status)
2. Travel roster (name, from, to, departure, arrival, PNR, status)
3. Rooming list (name, hotel, room#, check-in, check-out, booking ref)
4. Transport plan (batch, time window, pickup hub, vehicle, passengers)
5. Faculty responsibilities (name, session, role, hall, date, time)
6. Attendance report (name, reg#, check-in time, session, status)

UI: Reports page (M47) with cards for each export type + "Download" button.
    Each card shows the record count before download.

Test: Generate attendee export for event with 5 registrations →
      verify .xlsx has 5 data rows + 1 header row
      Generate rooming list → verify all columns present
      Export for wrong eventId → verify empty result (not cross-event leak)

Must pass: 18 new tests (3 per export type)
Codex review focus: event isolation on EVERY export query,
                    memory usage for large exports (streaming),
                    column injection via user-controlled data
```

**Req 6C-2: Per-event PDF archive**
```
Task: Build archive generation that bundles all event PDFs into R2.

On demand (button on event workspace) or scheduled (pre-event backup):
1. Generate agenda PDF (pdfme with schedule data)
2. Collect all issued certificate PDFs (already in R2)
3. Collect all notification log entries (export as CSV)
4. Bundle into ZIP and upload to R2 at events/{eventId}/archives/

Return a signed download URL.

Test: Generate archive for event with certificates + travel + accommodation →
      verify ZIP contains agenda.pdf, certificates/, notifications.csv
      Generate for empty event → verify ZIP with just agenda.pdf

Must pass: 8 new tests
Codex review focus: memory usage (streaming ZIP, not in-memory),
                    timeout for large events, R2 upload error handling
```

### Sub-Phase 6D — Team Management & Settings

**Req 6D-1: Team management page (M19)**
```
Task: Build team management page showing all users with access to the
current organization in Clerk. Display role, email, last active.

Actions:
- Invite member (email + role selection)
- Change role (dropdown per member)
- Remove member (with confirmation)

Uses Clerk's organization member management APIs.

Test: List members → verify current user appears
      Invite with email → verify Clerk invitation created
      Change role → verify Clerk membership updated
      Remove member → verify Clerk membership deleted

Must pass: 8 new tests
Codex review focus: cannot remove yourself, cannot downgrade the
                    last super_admin, invitation rate limiting
```

---

## PHASE 7: Certificate UI + QR UI + Dashboard Polish

**Goal:** The two placeholder pages become fully functional.
Dashboard becomes the operational command center.

### Sub-Phase 7A — Certificate Template Editor UI

**Req 7A-1: Integrate pdfme Designer component**
```
Task: Build the certificate template editor page (M56) using
@pdfme/ui Designer component.

Page at /events/[eventId]/certificates/editor/[templateId]

The Designer must:
- Load template JSON from the certificate_templates table
- Show WYSIWYG canvas with drag-drop text, image, QR placeholders
- Sidebar with available dynamic fields: recipient_name, designation,
  registration_number, event_name, event_dates, venue, qr_code
- Save button persists template JSON back to DB
- Preview button generates sample PDF with mock data

Dependencies: @pdfme/ui, @pdfme/common, @pdfme/schemas

Test: Load existing template → verify Designer renders
      Add a text field → save → reload → verify field persists
      Preview with mock data → verify PDF generates without error

Must pass: 8 new tests
Codex review focus: template JSON schema validation on save,
                    XSS in template text content,
                    max template size limit
```

**Req 7A-2: Certificate generation page UI (M12)**
```
Task: Replace the placeholder certificates page with full UI:

1. Template selector (dropdown of saved templates)
2. Recipient selector:
   - "All delegates" / "All faculty" / "All attendees" / "Custom selection"
   - Custom selection shows searchable checkbox list
3. Preview section: shows one sample certificate with real data
4. "Generate" button → calls certificate-issuance action
5. Progress indicator during bulk generation
6. When complete: show count + "Download ZIP" + "Send via Email" + "Send via WhatsApp"

Test: Select template + all delegates → generate → verify issued_certificates
      rows created for each delegate
      Download ZIP → verify ZIP contains correct number of PDFs
      Send via Email → verify notification_log entries created

Must pass: 10 new tests
Codex review focus: large batch handling (500+ delegates),
                    duplicate generation prevention (idempotency),
                    UI state during async generation
```

**Req 7A-3: View all issued certificates (D6 from deferred tickets)**
```
Task: Build the issued certificates list page linked from M61.

Table with columns: recipient name, reg#, certificate type, issued date,
                    status (issued/superseded/revoked), delivery status

Actions per row: Preview PDF, Resend, Revoke
Filters: certificate type, status, delivery status
Search: by name or registration number

Test: List issued certificates → verify correct count
      Revoke → verify status changes to 'revoked'
      Resend → verify new notification_log entry

Must pass: 8 new tests
Codex review focus: event isolation, superseded certificates
                    should not be resendable
```

### Sub-Phase 7B — QR Check-in UI

**Req 7B-1: Build QR scanner page (M11)**
```
Task: Replace the placeholder QR page with full check-in interface.

Three-panel layout:
1. Scanner panel: @yudiel/react-qr-scanner with camera feed
   - Continuous scan mode (don't stop after first scan)
   - Audio feedback (beep on success, buzz on error)
   - Visual feedback overlay (green flash = success, red = error)

2. Result panel: ScanFeedback component (already built) showing
   last scan result with delegate name, photo placeholder, reg#

3. Stats panel: live attendance count, checked-in count,
   remaining count, session breakdown

Bottom bar: "Manual Check-in" button → opens CheckInSearch (already built)

Test: Scan valid QR → verify attendance record created
      Scan duplicate → verify "already checked in" feedback
      Scan invalid → verify error feedback
      Manual search → check in → verify record created

Must pass: 8 new tests (UI integration tests)
Codex review focus: camera permissions handling, rapid successive scans,
                    offline mode activation, concurrent scan race condition
```

**Req 7B-2: Offline sync indicator and manual trigger**
```
Task: Add offline status indicator to QR scanner page.

When offline:
- Show amber banner "Offline — scans will sync when connected"
- Scanner continues to work (queues to IndexedDB)
- Show queued count badge

When back online:
- Auto-sync queued scans (processBatchSync already built)
- Show green banner "Synced X check-ins"
- Update stats panel

Test: Go offline → scan 3 QRs → verify IndexedDB has 3 entries
      Come online → verify batch sync fires → entries removed from IndexedDB
      Sync failure → verify entries retained for retry

Must pass: 6 new tests
Codex review focus: IndexedDB quota limits, sync conflict resolution,
                    network detection reliability
```

### Sub-Phase 7C — Dashboard Enrichment

**Req 7C-1: Dashboard with real metrics and quick actions**
```
Task: Expand dashboard-client.tsx (currently 116 lines) to full M01:

Event selector dropdown at top (if multiple events).

Metric cards row:
- Total registrations (with trend arrow vs yesterday)
- Faculty confirmed / total invited
- Certificates issued / total eligible
- Emails sent / failed count
- Red flags pending review

"Needs Attention" section:
- Unreviewed red-flags count → link to accommodation/transport
- Failed notifications count → link to /communications/failed
- Pending faculty confirmations → link to faculty list
- Registrations without QR → link to registrations

Quick actions:
- "Send Bulk Email" → link to communications
- "Export Attendee List" → direct download trigger
- "Generate Certificates" → link to certificates
- "Download Emergency Kit" → triggers archive generation

Test: Dashboard with 10 registrations → verify count shows 10
      Dashboard with 3 red flags → verify "Needs Attention" shows 3
      Quick action "Export" → verify download triggers

Must pass: 10 new tests
Codex review focus: N+1 queries (use single aggregation query, not
                    separate count for each metric), event isolation,
                    empty state handling for new events
```

---

## PHASE 8: Infrastructure Hardening

**Goal:** Everything that separates "it works" from "it survives
a live 500-person conference."

### Sub-Phase 8A — Background Job Migration

**Req 8A-1: Install and configure Inngest**
```
Task: Install inngest package. Create /api/inngest API route.

Replace the synchronous cascade emitter with Inngest events:
- emitCascadeEvent() now calls inngest.send() instead of looping handlers
- Each cascade handler becomes an inngest.createFunction()
- Each function retries independently (max 3 retries, exponential backoff)

The handler code stays the same — only the execution wrapper changes.

Test: Save travel record → verify Inngest event emitted
      Simulate handler failure → verify retry occurs
      All existing cascade tests must still pass

Must pass: All existing cascade + notification tests + 6 new Inngest tests
Codex review focus: Inngest function naming conventions,
                    retry idempotency (handler must be safe to re-run),
                    event payload serialization (no Date objects, use ISO strings)
```

**Req 8A-2: Move bulk operations to Inngest**
```
Task: Move these long-running operations to Inngest step functions:

1. Bulk certificate generation (currently in server action)
   → Inngest function with step.run() per batch of 50
2. Bulk email send (future)
   → Inngest function with step.run() per batch of 20 + step.sleep('30s')
3. Bulk WhatsApp send (future)
   → Inngest function with step.run() per message + step.sleep('2s')
4. Archive generation
   → Inngest function with steps for each export type

Test: Trigger bulk cert gen for 100 delegates →
      verify Inngest function runs in batches
      Simulate failure at batch 3 → verify batches 1-2 persisted,
      batch 3 retries, batches 4+ eventually complete

Must pass: 8 new tests
Codex review focus: step function idempotency, partial completion recovery,
                    progress tracking (how does UI know current batch?)
```

### Sub-Phase 8B — Monitoring & Safety

**Req 8B-1: Sentry integration**
```
Task: Install @sentry/nextjs. Run the Sentry wizard.
Configure: DSN, environment (preview/production), source maps.

Add Sentry.captureException() to:
- Notification send failures
- Cascade handler errors
- R2 upload/download failures
- Unhandled API route errors

Add Sentry user context from Clerk session.

Test: Trigger a deliberate error → verify it appears in Sentry dashboard
Must pass: Manual verification (Sentry is external)
Codex review focus: PII in error context (don't send full delegate records),
                    performance impact of source map upload
```

**Req 8B-2: Feature flags via Upstash Redis**
```
Task: Create src/lib/flags.ts with feature flag reader.

Flags to implement:
- whatsapp_enabled (boolean) — gates all WhatsApp sends
- email_enabled (boolean) — gates all email sends
- certificate_generation_enabled (boolean)
- registration_open (per-event, boolean)
- maintenance_mode (boolean — shows maintenance page)

Admin page or section in settings to toggle flags.

Check flags before: every notification send, certificate generation,
registration submission.

Test: Set whatsapp_enabled=false → trigger notification →
      verify email sent but WhatsApp skipped (not failed, SKIPPED)
      Set maintenance_mode=true → verify public pages show maintenance message

Must pass: 10 new tests
Codex review focus: Redis connection failure fallback (default to enabled?
                    or default to disabled?), cache TTL for flags
```

**Req 8B-3: GitHub Actions CI pipeline**
```
Task: Create .github/workflows/ci.yml

On every push and pull request:
1. Install dependencies (npm ci)
2. TypeScript type check (npx tsc --noEmit)
3. Lint (npx next lint)
4. Run all tests (npx vitest run)
5. Build (npm run build)

On push to main only:
6. Deploy to Vercel production (via Vercel GitHub integration)

Test: Push with type error → verify CI fails
      Push with all tests passing → verify CI passes

Must pass: Manual verification via GitHub
Codex review focus: Node version pinning, caching node_modules,
                    env vars needed for build (mock DB URL for type check)
```

**Req 8B-4: Pre-event backup automation**
```
Task: Create Inngest scheduled function that runs 24 hours before
every event's start_date.

Function queries events where start_date is within 24-25 hours.
For each matching event:
1. Export attendee list as CSV
2. Export travel roster as CSV
3. Export rooming list as CSV
4. Export transport plan as CSV
5. Export scientific program as JSON
6. Export all issued certificates (list R2 keys)
7. Bundle all into ZIP → upload to R2 at events/{eventId}/emergency-kit/

Also make this triggerable manually from dashboard ("Download Emergency Kit").

Test: Create event starting tomorrow → verify Inngest function fires
      Verify ZIP contains all expected files
      Manual trigger → verify same ZIP generated

Must pass: 8 new tests
Codex review focus: timezone handling (IST), event with no data (empty CSVs),
                    memory usage for large events
```

### Sub-Phase 8C — Circuit Breakers & Resilience

**Req 8C-1: Provider timeout and circuit breaker (H6)**
```
Task: Add AbortController timeout to all provider calls:
- Resend email: 10-second timeout
- Evolution API WhatsApp: 15-second timeout
- R2 upload: 30-second timeout
- R2 signed URL generation: 5-second timeout

If timeout fires, mark notification as 'failed' with error
'PROVIDER_TIMEOUT' and the timeout duration.

Implement simple circuit breaker:
- Track consecutive failures per provider in Redis
- After 5 consecutive failures, mark circuit as 'open'
- When circuit is open, immediately fail sends with 'CIRCUIT_OPEN'
- After 60 seconds, allow one probe request (half-open)
- If probe succeeds, close circuit

Test: Mock provider that takes 20 seconds → verify timeout at 10s
      Mock provider that fails 5 times → verify circuit opens
      Wait 60s → verify half-open probe

Must pass: 12 new tests
Codex review focus: AbortController cleanup, Redis key expiry,
                    circuit state across multiple Vercel serverless instances
```

---

## PHASE 9: Production Readiness + UAT

**Goal:** Ship. Everything tested end-to-end with real data.

### Sub-Phase 9A — End-to-End Integration Test

**Req 9A-1: Full journey test script**
```
Task: Create a test script (not vitest — a manual/scripted walkthrough)
that exercises the complete flow:

1. Create event "Test Cardiology Conference 2026"
2. Add 3 halls
3. Create 5 sessions across halls
4. Assign 5 faculty members (from people DB) to sessions
5. Publish event
6. Register 10 delegates via public registration form
7. Verify 10 QR codes generated
8. Create travel records for 5 delegates
9. Verify cascade: accommodation red-flags created
10. Create accommodation records for 5 delegates
11. Verify transport batches auto-suggested
12. Assign vehicles to 2 batches
13. Generate certificates for all 10 delegates
14. Verify 10 PDFs in R2
15. Send certificates via email to 3 delegates
16. Verify notification_log has 3 entries with status 'sent'
17. Check in 5 delegates via QR scanner
18. Verify attendance records created
19. Export attendee list as Excel
20. Export rooming list as Excel
21. Generate emergency kit ZIP
22. Verify ZIP contains all files

This can be a Playwright test or a documented manual test plan.
Either way, it must be run before any demo or deployment.

Test: The script itself IS the test
Codex review: not needed — this is a human verification step
```

### Sub-Phase 9B — Production Deploy

**Req 9B-1: Environment setup**
```
Task: Set up production environment:
1. Vercel project connected to GitHub repo
2. All env vars set in Vercel (document each one)
3. Neon production database branch created
4. Clerk production instance configured
5. R2 bucket created with appropriate CORS
6. Evolution API deployed on DigitalOcean
7. Upstash Redis production instance
8. Sentry production DSN
9. Inngest production key
10. Custom domain configured (if client has one)

Run database migrations on production.
Seed system notification templates.
Run the full journey test on production.
```

**Req 9B-2: Client UAT with pilot event**
```
Task: Support the client in running a pilot event:
1. Client creates a real event
2. Client imports real faculty and delegate lists
3. Client builds the scientific program
4. 20-30 real delegates register
5. Travel and accommodation records entered
6. Certificates generated and sent
7. QR check-in tested with physical phones
8. All reports exported and verified

Fix any bugs found during UAT.
Each bug follows the same loop: fix → test → codex → fix → test.
```

---

## Phase-to-Milestone Payment Mapping

| Phase | Maps To | Payment Trigger |
|-------|---------|----------------|
| Phase 6 (Notifications + Branding + Reports) | Milestone 3 | 20% payment |
| Phase 7 (Certificate UI + QR UI + Dashboard) | Milestone 4 (part 1) | — |
| Phase 8 (Infrastructure Hardening) | Milestone 4 (part 2) | 20% payment |
| Phase 9 (Production + UAT) | Milestone 5 | 10% payment |

---

## Quick Reference — Run Commands

```bash
# Start the phase
/gsd:discuss-phase 6

# Plan requirements for sub-phase
/gsd:plan-phase 6A

# Execute a specific requirement
/gsd:execute-phase 6A-1

# After each requirement is built and tests pass
# Copy the changed files and paste into Codex with:
/codex review these changes adversarially — focus on:
  - edge cases that break under concurrent access
  - event isolation leaks (cross-event data exposure)
  - idempotency violations
  - error swallowing (catch blocks that don't log/rethrow)
  - missing input validation

# After Codex review, fix findings
/gsd:execute-phase 6A-1  (continue with fixes)

# When all tests pass after Codex fixes
git commit -m "feat(notifications): wire cascade to real send service"

# Check progress
/where-am-i
```

## Estimated Timeline

| Phase | Sub-phases | Estimated Duration |
|-------|-----------|-------------------|
| Phase 6 | 6A (3d) + 6B (1d) + 6C (2d) + 6D (1d) | 7 days |
| Phase 7 | 7A (3d) + 7B (1d) + 7C (1d) | 5 days |
| Phase 8 | 8A (2d) + 8B (2d) + 8C (1d) | 5 days |
| Phase 9 | 9A (1d) + 9B (2-3d) | 3 days |
| **Total** | | **~20 working days** |

This assumes full-time focus and the build→test→codex loop
averaging 3-4 hours per requirement.
