# Feature Census: Communications

**Generated:** 2026-04-09
**Entry points:** `src/lib/notifications/` (service layer), `src/app/(app)/events/[eventId]/communications/failed/` (UI), `src/app/api/webhooks/` (webhook routes), `src/lib/inngest/` (async jobs)
**Files in scope:** 33 (notifications lib) + 4 (UI/actions) + 2 (webhook routes) + 2 (inngest) + 1 (flags) = 42
**Method:** 2-layer extraction (code + library). Layer 3 (runtime) skipped — module is primarily a backend service with a single admin UI page.

## Summary

| Metric | Count |
|--------|-------|
| Total features | 111 |
| From your code | 105 |
| From libraries (emergent) | 6 |
| Confirmed (2+ layers) | 111 |
| Code-only (not visible) | 0 |
| Runtime-only (no code match) | 0 |

---

## Features by Category

### 1. Send Orchestration

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 1 | Send notification via email channel | Code | src/lib/notifications/send.ts:243-250 | CONFIRMED |
| 2 | Send notification via WhatsApp channel | Code | src/lib/notifications/send.ts:252-258 | CONFIRMED |
| 3 | Feature flag check — skip send if channel disabled | Code | src/lib/notifications/send.ts:83-121 | CONFIRMED |
| 4 | Auditable skip log when channel disabled | Code | src/lib/notifications/send.ts:90-111 | CONFIRMED |
| 5 | Template rendering before any durable side effects | Code | src/lib/notifications/send.ts:124-170 | CONFIRMED |
| 6 | Failed template render creates audit log entry | Code | src/lib/notifications/send.ts:142-169 | CONFIRMED |
| 7 | Sentry error capture on template render failure | Code | src/lib/notifications/send.ts:133-140 | CONFIRMED |
| 8 | Log row created BEFORE idempotency check (status=queued) | Code | src/lib/notifications/send.ts:173-194 | CONFIRMED |
| 9 | Idempotency deduplication after log creation | Code | src/lib/notifications/send.ts:199-213 | CONFIRMED |
| 10 | Duplicate detection recorded with IDEMPOTENCY_DUPLICATE code | Code | src/lib/notifications/send.ts:202-206 | CONFIRMED |
| 11 | Circuit breaker check before provider call | Code | src/lib/notifications/send.ts:216-237 | CONFIRMED |
| 12 | Circuit breaker failure logged with CIRCUIT_OPEN code | Code | src/lib/notifications/send.ts:222-234 | CONFIRMED |
| 13 | Provider timeout detection (ProviderTimeoutError) | Code | src/lib/notifications/send.ts:263 | CONFIRMED |
| 14 | PROVIDER_EXCEPTION error code on provider crash | Code | src/lib/notifications/send.ts:264 | CONFIRMED |
| 15 | Sentry capture on provider failure | Code | src/lib/notifications/send.ts:266-273 | CONFIRMED |
| 16 | Circuit breaker records failure on provider error | Code | src/lib/notifications/send.ts:276-278 | CONFIRMED |
| 17 | Circuit breaker records success on accepted response | Code | src/lib/notifications/send.ts:295-301 | CONFIRMED |
| 18 | Final status update with sentAt/failedAt timestamps | Code | src/lib/notifications/send.ts:304-317 | CONFIRMED |
| 19 | PROVIDER_REJECTED error code for non-accepted responses | Code | src/lib/notifications/send.ts:314-315 | CONFIRMED |
| 20 | Dependency injection for all external deps (testability) | Code | src/lib/notifications/send.ts:37-59 | CONFIRMED |

### 2. Resend & Retry

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 21 | Resend a previously sent notification (fresh copy) | Code | src/lib/notifications/send.ts:329-354 | CONFIRMED |
| 22 | Fresh idempotency key on resend (resend:{id}:{timestamp}) | Code | src/lib/notifications/send.ts:344 | CONFIRMED |
| 23 | Resend links back to original via resendOfId | Code | src/lib/notifications/send.ts:349 | CONFIRMED |
| 24 | Retry a failed notification | Code | src/lib/notifications/send.ts:358-396 | CONFIRMED |
| 25 | Retry only allowed on status=failed | Code | src/lib/notifications/send.ts:371-375 | CONFIRMED |
| 26 | Atomic markAsRetrying CAS lock prevents concurrent retry race | Code | src/lib/notifications/send.ts:378-383 | CONFIRMED |
| 27 | Retry uses stored rendered content (no re-render) | Code | src/lib/notifications/send.ts:386 | CONFIRMED |
| 28 | Resend/retry path has full circuit breaker support | Code | src/lib/notifications/send.ts:447-467 | CONFIRMED |

### 3. Email Provider (Resend)

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 29 | Email send via Resend SDK | Code+Lib | src/lib/notifications/email.ts:78-119 | CONFIRMED |
| 30 | Configurable from address (RESEND_FROM_EMAIL env) | Code | src/lib/notifications/email.ts:81-85 | CONFIRMED |
| 31 | Custom fromDisplayName from event branding | Code | src/lib/notifications/email.ts:81-82 | CONFIRMED |
| 32 | HTML + plaintext body support | Code | src/lib/notifications/email.ts:95 | CONFIRMED |
| 33 | Email metadata headers | Code | src/lib/notifications/email.ts:96 | CONFIRMED |
| 34 | File attachments via R2 signed URLs (15-min expiry) | Code | src/lib/notifications/email.ts:52-75 | CONFIRMED |
| 35 | Attachment filename sanitization (path traversal, null bytes, length) | Code | src/lib/notifications/email.ts:27-40 | CONFIRMED |
| 36 | Attachment validation (storageKey + fileName required) | Code | src/lib/notifications/email.ts:43-49 | CONFIRMED |
| 37 | Timeout wrapper on Resend API call (10s) | Code | src/lib/notifications/email.ts:89-101 | CONFIRMED |
| 38 | Timeout wrapper on R2 signed URL generation (5s) | Code | src/lib/notifications/email.ts:63-67 | CONFIRMED |

### 4. WhatsApp Provider (Evolution API)

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 39 | WhatsApp text message via Evolution API | Code | src/lib/notifications/whatsapp.ts:34-87 | CONFIRMED |
| 40 | Phone number E.164 prefix stripping (remove leading +) | Code | src/lib/notifications/whatsapp.ts:39 | CONFIRMED |
| 41 | Media message support (document/image) | Code | src/lib/notifications/whatsapp.ts:42-44, 111-179 | CONFIRMED |
| 42 | Media type detection from contentType | Code | src/lib/notifications/whatsapp.ts:29-31 | CONFIRMED |
| 43 | Single-media-per-message enforcement with warning | Code | src/lib/notifications/whatsapp.ts:121-125 | CONFIRMED |
| 44 | R2 signed URL for media attachments (15-min expiry) | Code | src/lib/notifications/whatsapp.ts:129-133 | CONFIRMED |
| 45 | Attachment filename sanitization | Code | src/lib/notifications/whatsapp.ts:89-98 | CONFIRMED |
| 46 | Attachment validation | Code | src/lib/notifications/whatsapp.ts:101-108 | CONFIRMED |
| 47 | Timeout wrapper on Evolution API call (15s) | Code | src/lib/notifications/whatsapp.ts:46-61 | CONFIRMED |
| 48 | Evolution API key-based authentication | Code | src/lib/notifications/whatsapp.ts:53 | CONFIRMED |
| 49 | Provider message ID extraction (key.id or messageId) | Code | src/lib/notifications/whatsapp.ts:80-81 | CONFIRMED |

### 5. Template System

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 50 | Template resolution: event-specific override > global default | Code | src/lib/notifications/template-renderer.ts:45-83 | CONFIRMED |
| 51 | Only active templates considered in resolution | Code | src/lib/notifications/template-renderer.ts:59 | CONFIRMED |
| 52 | Global templates have eventId=null | Code | src/lib/notifications/template-renderer.ts:69-80 | CONFIRMED |
| 53 | Variable interpolation with {{variable}} syntax | Code | src/lib/notifications/template-utils.ts:11-19 | CONFIRMED |
| 54 | Nested dot-notation variable access ({{person.name}}) | Code | src/lib/notifications/template-utils.ts:22-33 | CONFIRMED |
| 55 | Prototype chain access guard (__proto__, constructor) | Code | src/lib/notifications/template-utils.ts:29 | CONFIRMED |
| 56 | Required variable validation | Code | src/lib/notifications/template-utils.ts:39-47 | CONFIRMED |
| 57 | Missing required vars throws with list of missing names | Code | src/lib/notifications/template-renderer.ts:217-220 | CONFIRMED |
| 58 | Event branding injection into templates | Code | src/lib/notifications/template-renderer.ts:200-212 | CONFIRMED |
| 59 | Branding mode: event default vs custom per template | Code | src/lib/notifications/template-renderer.ts:114-136 | CONFIRMED |
| 60 | Safe branding parse with Zod fallback to defaults | Code | src/lib/notifications/template-renderer.ts:89-94 | CONFIRMED |
| 61 | CRLF/control char sanitization on email sender name | Code | src/lib/notifications/template-renderer.ts:97-99 | CONFIRMED |
| 62 | R2 signed URL resolution for logo/headerImage (1h expiry) | Code | src/lib/notifications/template-renderer.ts:139-157 | CONFIRMED |
| 63 | WhatsApp prefix prepend when branding.whatsappPrefix set | Code | src/lib/notifications/template-renderer.ts:230-232 | CONFIRMED |
| 64 | Template version tracking (versionNo) | Code | src/lib/notifications/template-queries.ts:110-127 | CONFIRMED |
| 65 | Auto-increment versionNo on content change | Code | src/lib/notifications/template-queries.ts:110-127 | CONFIRMED |
| 66 | Template CRUD: create, update, list, get, archive | Code | src/lib/notifications/template-queries.ts:53-205 | CONFIRMED |
| 67 | Create event override from global template | Code | src/lib/notifications/template-queries.ts:208-242 | CONFIRMED |
| 68 | Template listing includes both event-specific and global | Code | src/lib/notifications/template-queries.ts:144-178 | CONFIRMED |

### 6. System Templates (Seeds)

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 69 | 12 system template keys (email + WhatsApp = 24 templates) | Code | src/lib/notifications/system-templates.ts:37-634 | CONFIRMED |
| 70 | registration_confirmation template (email + whatsapp) | Code | src/lib/notifications/system-templates.ts:39-86 | CONFIRMED |
| 71 | registration_cancelled template (email + whatsapp) | Code | src/lib/notifications/system-templates.ts:89-128 | CONFIRMED |
| 72 | faculty_invitation template (email + whatsapp) | Code | src/lib/notifications/system-templates.ts:131-184 | CONFIRMED |
| 73 | faculty_reminder template (email + whatsapp) | Code | src/lib/notifications/system-templates.ts:187-235 | CONFIRMED |
| 74 | program_update template (email + whatsapp) | Code | src/lib/notifications/system-templates.ts:238-283 | CONFIRMED |
| 75 | travel_update template (email + whatsapp) | Code | src/lib/notifications/system-templates.ts:286-333 | CONFIRMED |
| 76 | travel_cancelled template (email + whatsapp) | Code | src/lib/notifications/system-templates.ts:336-379 | CONFIRMED |
| 77 | accommodation_details template (email + whatsapp) | Code | src/lib/notifications/system-templates.ts:382-436 | CONFIRMED |
| 78 | accommodation_update template (email + whatsapp) | Code | src/lib/notifications/system-templates.ts:439-488 | CONFIRMED |
| 79 | accommodation_cancelled template (email + whatsapp) | Code | src/lib/notifications/system-templates.ts:491-534 | CONFIRMED |
| 80 | certificate_ready template (email + whatsapp) | Code | src/lib/notifications/system-templates.ts:537-585 | CONFIRMED |
| 81 | event_reminder template (email + whatsapp) | Code | src/lib/notifications/system-templates.ts:588-633 | CONFIRMED |
| 82 | Idempotent seeding (skip if already exists) | Code | src/lib/notifications/seed-system-templates.ts:20-37 | CONFIRMED |

### 7. Idempotency Service

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 83 | Redis-backed idempotency check (SET NX) | Code+Lib | src/lib/notifications/idempotency.ts:25-36 | CONFIRMED |
| 84 | 7-day TTL for idempotency keys | Code | src/lib/notifications/idempotency.ts:11 | CONFIRMED |
| 85 | Key prefix namespacing (notif:idem:) | Code | src/lib/notifications/idempotency.ts:12 | CONFIRMED |
| 86 | Injectable Redis client for testing | Code | src/lib/notifications/idempotency.ts:39-47 | CONFIRMED |

### 8. Circuit Breaker

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 87 | Per-provider circuit breaker (Redis-backed) | Code | src/lib/notifications/circuit-breaker.ts:55-123 | CONFIRMED |
| 88 | Three states: closed, open, half-open | Code | src/lib/notifications/circuit-breaker.ts:23 | CONFIRMED |
| 89 | Threshold: 5 consecutive failures opens circuit | Code | src/lib/notifications/circuit-breaker.ts:19 | CONFIRMED |
| 90 | Open duration: 60s cooldown before half-open | Code | src/lib/notifications/circuit-breaker.ts:20 | CONFIRMED |
| 91 | Half-open probe: single request allowed via SET NX lock | Code | src/lib/notifications/circuit-breaker.ts:70-74 | CONFIRMED |
| 92 | Atomic INCR for failure counting (no race condition) | Code | src/lib/notifications/circuit-breaker.ts:94-95 | CONFIRMED |
| 93 | Auto-cleanup TTL (5 min) on Redis keys | Code | src/lib/notifications/circuit-breaker.ts:21, 97 | CONFIRMED |
| 94 | Full reset on success (delete all keys) | Code | src/lib/notifications/circuit-breaker.ts:84-89 | CONFIRMED |
| 95 | Status introspection (getStatus) | Code | src/lib/notifications/circuit-breaker.ts:107-122 | CONFIRMED |

### 9. Webhook Ingestion

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 96 | Resend webhook ingest (email delivery status) | Code | src/lib/notifications/webhook-ingest.ts:21-36 | CONFIRMED |
| 97 | Evolution API webhook ingest (WhatsApp status) | Code | src/lib/notifications/webhook-ingest.ts:42-57 | CONFIRMED |
| 98 | Resend Svix signature verification (HMAC-SHA256) | Code | src/lib/notifications/webhook-auth.ts:18-62 | CONFIRMED |
| 99 | Timing-safe signature comparison | Code | src/lib/notifications/webhook-auth.ts:53 | CONFIRMED |
| 100 | Multi-signature support in Svix header | Code | src/lib/notifications/webhook-auth.ts:47-48 | CONFIRMED |
| 101 | Evolution API Bearer token verification | Code | src/lib/notifications/webhook-auth.ts:71-97 | CONFIRMED |
| 102 | Channel mismatch guard on webhook processing | Code | src/lib/notifications/webhook-ingest.ts:79 | CONFIRMED |
| 103 | Delivery event insertion (forensic audit trail) | Code | src/lib/notifications/webhook-ingest.ts:81-84 | CONFIRMED |
| 104 | DB-level CAS status progression (forward-only) | Code | src/lib/notifications/delivery-event-queries.ts:92-136 | CONFIRMED |
| 105 | Dead letter queue for failed webhook processing | Code | src/lib/notifications/webhook-dlq.ts:35-51 | CONFIRMED |
| 106 | DLQ pop for reprocessing | Code | src/lib/notifications/webhook-dlq.ts:57-73 | CONFIRMED |
| 107 | DLQ size monitoring | Code | src/lib/notifications/webhook-dlq.ts:78-86 | CONFIRMED |

### 10. Webhook Parsers

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 108 | Resend event mapping (sent, delivered, delayed, complained, bounced, opened) | Code | src/lib/notifications/webhook-parsers.ts:46-53 | CONFIRMED |
| 109 | Evolution API status mapping (ERROR=0, PENDING=1, SERVER_ACK=2, DELIVERY_ACK=3, READ=4, PLAYED=5) | Code | src/lib/notifications/webhook-parsers.ts:89-96 | CONFIRMED |
| 110 | Status forward-only check (isStatusForward) | Code | src/lib/notifications/webhook-parsers.ts:34-42 | CONFIRMED |
| 111 | Failed status can override any other status | Code | src/lib/notifications/webhook-parsers.ts:39 | CONFIRMED |

### 11. Notification Log Queries

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 112 | Create log entry with full audit fields | Code | src/lib/notifications/log-queries.ts:19-51 | CONFIRMED |
| 113 | Update log status with provider data | Code | src/lib/notifications/log-queries.ts:54-76 | CONFIRMED |
| 114 | Atomic markAsRetrying (optimistic lock on status=failed) | Code | src/lib/notifications/log-queries.ts:83-104 | CONFIRMED |
| 115 | Get log by ID (event-scoped) | Code | src/lib/notifications/log-queries.ts:107-118 | CONFIRMED |
| 116 | List failed logs with channel/templateKey filters | Code | src/lib/notifications/log-queries.ts:121-172 | CONFIRMED |
| 117 | Failed logs ordered by failedAt DESC | Code | src/lib/notifications/log-queries.ts:132 | CONFIRMED |
| 118 | Pagination: limit + offset | Code | src/lib/notifications/log-queries.ts:125-126 | CONFIRMED |

### 12. Automation Triggers

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 119 | Create automation trigger (event type -> template -> channel) | Code | src/lib/notifications/trigger-queries.ts:43-64 | CONFIRMED |
| 120 | Update trigger configuration | Code | src/lib/notifications/trigger-queries.ts:67-95 | CONFIRMED |
| 121 | List triggers for event (filterable by type, channel, enabled) | Code | src/lib/notifications/trigger-queries.ts:98-122 | CONFIRMED |
| 122 | Get active triggers for event type (joins template, validates scope) | Code | src/lib/notifications/trigger-queries.ts:125-155 | CONFIRMED |
| 123 | Delete trigger (event-scoped) | Code | src/lib/notifications/trigger-queries.ts:175-188 | CONFIRMED |

### 13. Feature Flags

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 124 | Global email_enabled flag (Redis) | Code | src/lib/flags.ts:20 | CONFIRMED |
| 125 | Global whatsapp_enabled flag (Redis) | Code | src/lib/flags.ts:19 | CONFIRMED |
| 126 | isChannelEnabled() check used in send orchestration | Code | src/lib/flags.ts:156-163 | CONFIRMED |
| 127 | Best-effort flag check (proceeds if Redis down) | Code | src/lib/notifications/send.ts:119-121 | CONFIRMED |

### 14. Delivery Event Queries

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 128 | Insert delivery event (forensic trail) | Code | src/lib/notifications/delivery-event-queries.ts:22-33 | CONFIRMED |
| 129 | List delivery events for log (event-scoped via join) | Code | src/lib/notifications/delivery-event-queries.ts:40-58 | CONFIRMED |
| 130 | Find log by provider message ID (webhook correlation) | Code | src/lib/notifications/delivery-event-queries.ts:64-72 | CONFIRMED |
| 131 | DB-level CAS for status update (CASE expression in WHERE) | Code | src/lib/notifications/delivery-event-queries.ts:108-133 | CONFIRMED |

### 15. Provider Timeout

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 132 | AbortController-based timeout wrapper | Code | src/lib/notifications/timeout.ts:25-49 | CONFIRMED |
| 133 | Resend email timeout: 10s | Code | src/lib/notifications/timeout.ts:53 | CONFIRMED |
| 134 | Evolution WhatsApp timeout: 15s | Code | src/lib/notifications/timeout.ts:54 | CONFIRMED |
| 135 | R2 upload timeout: 30s | Code | src/lib/notifications/timeout.ts:55 | CONFIRMED |
| 136 | R2 signed URL timeout: 5s | Code | src/lib/notifications/timeout.ts:56 | CONFIRMED |
| 137 | Timer cleanup in finally block (prevent leaks) | Code | src/lib/notifications/timeout.ts:43-48 | CONFIRMED |

### 16. Bulk Notification Operations (Inngest)

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 138 | Bulk certificate email delivery in batches of 20 | Code | src/lib/inngest/bulk-functions.ts:513-563 | CONFIRMED |
| 139 | 30s sleep between email batches (rate limiting) | Code | src/lib/inngest/bulk-functions.ts:560 | CONFIRMED |
| 140 | Bulk WhatsApp certificate delivery one-at-a-time | Code | src/lib/inngest/bulk-functions.ts:566-606 | CONFIRMED |
| 141 | 2s sleep between WhatsApp messages (rate limiting) | Code | src/lib/inngest/bulk-functions.ts:603 | CONFIRMED |
| 142 | lastSentAt update only for successfully sent certs | Code | src/lib/inngest/bulk-functions.ts:609-623 | CONFIRMED |
| 143 | Sent/failed count tracking per bulk operation | Code | src/lib/inngest/bulk-functions.ts:625 | CONFIRMED |

### 17. Failed Notifications UI

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 144 | Server-side fetch of failed notifications (limit=50) | Code | src/app/(app)/events/[eventId]/communications/failed/page.tsx:11-15 | CONFIRMED |
| 145 | Client-side channel filter (all/email/whatsapp) | Code | failed-notifications-client.tsx:53-55 | CONFIRMED |
| 146 | Retry button per failed notification | Code | failed-notifications-client.tsx:57-87 | CONFIRMED |
| 147 | Resend button per notification | Code | failed-notifications-client.tsx:89-118 | CONFIRMED |
| 148 | Status check on retry/resend result (remove only if not failed) | Code | failed-notifications-client.tsx:72, 103 | CONFIRMED |
| 149 | Toast notification (success/error) with dismiss | Code | failed-notifications-client.tsx:123-139 | CONFIRMED |
| 150 | Expandable detail view per notification | Code | failed-notifications-client.tsx:249-268 | CONFIRMED |
| 151 | Channel icon (Mail/MessageSquare) | Code | failed-notifications-client.tsx:175 | CONFIRMED |
| 152 | Error badge with error code | Code | failed-notifications-client.tsx:195-203 | CONFIRMED |
| 153 | Attempt count display | Code | failed-notifications-client.tsx:207-209 | CONFIRMED |
| 154 | Empty state message | Code | failed-notifications-client.tsx:163-167 | CONFIRMED |
| 155 | Count badge in filter buttons | Code | failed-notifications-client.tsx:146-160 | CONFIRMED |

### 18. Server Actions (Auth + Validation)

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 156 | Zod schema validation for retry input | Code | src/lib/actions/notifications.ts:9-13 | CONFIRMED |
| 157 | Zod schema validation for resend input | Code | src/lib/actions/notifications.ts:15-19 | CONFIRMED |
| 158 | Zod schema validation for list filters | Code | src/lib/actions/notifications.ts:21-27 | CONFIRMED |
| 159 | Read-only users can view failed notifications | Code | src/lib/actions/notifications.ts:31-42 | CONFIRMED |
| 160 | Write access required for retry | Code | src/lib/actions/notifications.ts:46-58 | CONFIRMED |
| 161 | Write access required for resend | Code | src/lib/actions/notifications.ts:62-74 | CONFIRMED |
| 162 | Path revalidation after retry/resend | Code | src/lib/actions/notifications.ts:56, 72 | CONFIRMED |

### 19. Webhook API Routes

| # | Feature | Source | Code Ref | Status |
|---|---------|--------|----------|--------|
| 163 | POST /api/webhooks/email — Resend status webhook | Code | src/app/api/webhooks/email/route.ts:13-37 | CONFIRMED |
| 164 | Svix signature verification on email webhook | Code | src/app/api/webhooks/email/route.ts:18-25 | CONFIRMED |
| 165 | POST /api/webhooks/whatsapp — Evolution API webhook | Code | src/app/api/webhooks/whatsapp/route.ts:13-30 | CONFIRMED |
| 166 | Bearer token verification on WhatsApp webhook | Code | src/app/api/webhooks/whatsapp/route.ts:15-19 | CONFIRMED |
| 167 | Always returns 200 to provider (errors logged, not surfaced) | Code | email/route.ts:37, whatsapp/route.ts:29 | CONFIRMED |
| 168 | Sentry capture on webhook processing errors | Code | email/route.ts:33, whatsapp/route.ts:26 | CONFIRMED |

---

## Discrepancies

### Code-Only (found in code, not visible at runtime)
_None identified. All features are backend-service level and confirmed through code + library cross-reference._

### Library Capabilities NOT Active

| Library | Capability | Why Not Active |
|---------|-----------|---------------|
| Resend | Batch email API (up to 100 emails per call) | Not used — bulk sends iterate with individual calls via Inngest steps |
| Resend | Domain verification management | Infrastructure concern, not used in app code |
| Resend | Audience/contact management | Not used — people management is handled by the people module |
| Evolution API | Message reactions | Not configured |
| Evolution API | Group messaging | Not configured |
| Evolution API | Interactive buttons/lists | Not configured |

---

## QA Test Targets

_Every CONFIRMED feature is a QA test target. Total testable features: 168_

### Send Orchestration (20 checkpoints)
- [ ] CP-1: Email send succeeds with valid input
- [ ] CP-2: WhatsApp send succeeds with valid input
- [ ] CP-3: Channel disabled via flag skips send and creates audit log
- [ ] CP-4: Template render failure creates failed log entry
- [ ] CP-5: Template render failure captures to Sentry
- [ ] CP-6: Log row created before idempotency check
- [ ] CP-7: Duplicate idempotency key returns 'sent' without provider call
- [ ] CP-8: Duplicate recorded with IDEMPOTENCY_DUPLICATE code
- [ ] CP-9: Circuit open rejects send with CIRCUIT_OPEN
- [ ] CP-10: Provider timeout recorded as PROVIDER_TIMEOUT
- [ ] CP-11: Provider exception recorded as PROVIDER_EXCEPTION
- [ ] CP-12: Provider failure captures to Sentry
- [ ] CP-13: Circuit breaker records failure on provider error
- [ ] CP-14: Circuit breaker records success on accepted response
- [ ] CP-15: Accepted response sets status=sent with sentAt timestamp
- [ ] CP-16: Rejected response sets status=failed with PROVIDER_REJECTED
- [ ] CP-17: All deps are injectable (testable with stubs)
- [ ] CP-18: Best-effort flag check (proceeds if Redis is down)
- [ ] CP-19: fromDisplayName from branding used in email sender
- [ ] CP-20: whatsappPrefix prepended to WhatsApp body

### Resend & Retry (8 checkpoints)
- [ ] CP-21: Resend creates new log with fresh idempotency key
- [ ] CP-22: Resend links to original via resendOfId
- [ ] CP-23: Retry only works on status=failed
- [ ] CP-24: Retry on non-failed status throws error
- [ ] CP-25: Concurrent retry blocked by markAsRetrying CAS
- [ ] CP-26: Retry uses stored rendered content
- [ ] CP-27: Resend/retry path checks circuit breaker
- [ ] CP-28: Original log not found throws error

### Email Provider (10 checkpoints)
- [ ] CP-29: Email sent via Resend SDK with correct from/to/subject/html
- [ ] CP-30: Custom fromDisplayName in from address
- [ ] CP-31: Default from address (GEM India) when no display name
- [ ] CP-32: Plaintext body sent alongside HTML
- [ ] CP-33: Attachments resolved via R2 signed URLs
- [ ] CP-34: Filename sanitization strips path traversal
- [ ] CP-35: Filename sanitization strips null bytes
- [ ] CP-36: Filename sanitization enforces 255 char limit
- [ ] CP-37: Invalid storageKey throws error
- [ ] CP-38: Email API timeout at 10s

### WhatsApp Provider (11 checkpoints)
- [ ] CP-39: Text message sent via Evolution API
- [ ] CP-40: Phone number leading + stripped
- [ ] CP-41: Media message sent when attachments present
- [ ] CP-42: Document media type for non-image content types
- [ ] CP-43: Image media type for image/ content types
- [ ] CP-44: Warning logged for multiple attachments (only first sent)
- [ ] CP-45: Filename sanitized for media messages
- [ ] CP-46: Invalid attachment throws error
- [ ] CP-47: WhatsApp API timeout at 15s
- [ ] CP-48: API key sent in headers
- [ ] CP-49: Provider message ID extracted from response

### Template System (19 checkpoints)
- [ ] CP-50: Event-specific template overrides global default
- [ ] CP-51: Falls back to global when no event-specific exists
- [ ] CP-52: Only active templates returned
- [ ] CP-53: {{variable}} interpolation works
- [ ] CP-54: Nested dot-notation {{a.b}} resolves correctly
- [ ] CP-55: __proto__ access blocked in variable resolution
- [ ] CP-56: Missing required variables throws with list
- [ ] CP-57: Branding vars injected under 'branding' namespace
- [ ] CP-58: Custom branding mode uses template's customBrandingJson
- [ ] CP-59: Default branding mode loads from event row
- [ ] CP-60: Invalid branding falls back to defaults (no crash)
- [ ] CP-61: Missing event row throws (not silent defaults)
- [ ] CP-62: CRLF stripped from email sender name
- [ ] CP-63: Logo/header URLs resolved via R2 signed URLs (1h expiry)
- [ ] CP-64: WhatsApp prefix prepended when set
- [ ] CP-65: Version auto-increments on content change
- [ ] CP-66: Create event override duplicates global template
- [ ] CP-67: Template listing includes event + global templates
- [ ] CP-68: Template archive sets status=archived

### System Templates (2 checkpoints)
- [ ] CP-69: All 24 system templates (12 keys x 2 channels) defined
- [ ] CP-70: Idempotent seeding (skip existing, insert new)

### Idempotency (4 checkpoints)
- [ ] CP-71: New key returns false (not duplicate)
- [ ] CP-72: Existing key returns true (duplicate)
- [ ] CP-73: Keys expire after 7 days
- [ ] CP-74: Key prefix 'notif:idem:' applied

### Circuit Breaker (9 checkpoints)
- [ ] CP-75: Closed state when failures < threshold
- [ ] CP-76: Open state when failures >= 5
- [ ] CP-77: Half-open after 60s cooldown
- [ ] CP-78: Single probe allowed in half-open (SET NX)
- [ ] CP-79: Success resets circuit (deletes all keys)
- [ ] CP-80: Failure increments atomic counter
- [ ] CP-81: Keys auto-expire after 5 minutes
- [ ] CP-82: CircuitOpenError thrown when circuit open
- [ ] CP-83: Status introspection returns correct state

### Webhook Ingestion (12 checkpoints)
- [ ] CP-84: Resend webhook parsed and ingested
- [ ] CP-85: Evolution webhook parsed and ingested
- [ ] CP-86: Resend Svix signature verified (HMAC-SHA256)
- [ ] CP-87: Invalid Resend signature rejected
- [ ] CP-88: Evolution Bearer token verified (timing-safe)
- [ ] CP-89: Invalid Evolution token rejected
- [ ] CP-90: Channel mismatch guard prevents cross-contamination
- [ ] CP-91: Delivery event always inserted (forensic trail)
- [ ] CP-92: DB-level CAS rejects status regression
- [ ] CP-93: Failed webhook processing pushes to DLQ
- [ ] CP-94: DLQ entries can be popped for reprocessing
- [ ] CP-95: DLQ size monitoring works

### Webhook Parsers (8 checkpoints)
- [ ] CP-96: Resend email.sent -> 'sent'
- [ ] CP-97: Resend email.delivered -> 'delivered'
- [ ] CP-98: Resend email.bounced -> 'failed'
- [ ] CP-99: Resend email.opened -> 'read'
- [ ] CP-100: Evolution status 2 (SERVER_ACK) -> 'sent'
- [ ] CP-101: Evolution status 3 (DELIVERY_ACK) -> 'delivered'
- [ ] CP-102: Evolution status 4 (READ) -> 'read'
- [ ] CP-103: Malformed payload returns null

### Log Queries (7 checkpoints)
- [ ] CP-104: Create log entry returns full row
- [ ] CP-105: Update log status sets provider data
- [ ] CP-106: markAsRetrying only works on status=failed (optimistic lock)
- [ ] CP-107: getLogById scoped by eventId
- [ ] CP-108: listFailedLogs returns only failed status
- [ ] CP-109: Channel filter applied to failed log listing
- [ ] CP-110: Pagination (limit/offset) works correctly

### Provider Timeout (6 checkpoints)
- [ ] CP-111: Timeout triggers AbortController abort
- [ ] CP-112: ProviderTimeoutError thrown with correct message
- [ ] CP-113: Timer cleared in finally block
- [ ] CP-114: Resend timeout = 10s
- [ ] CP-115: Evolution timeout = 15s
- [ ] CP-116: R2 signed URL timeout = 5s

### Bulk Operations (6 checkpoints)
- [ ] CP-117: Email certificates sent in batches of 20
- [ ] CP-118: 30s sleep between email batches
- [ ] CP-119: WhatsApp certificates sent one-at-a-time
- [ ] CP-120: 2s sleep between WhatsApp messages
- [ ] CP-121: lastSentAt updated only for successful sends
- [ ] CP-122: Sent/failed counts returned

### Server Actions & Auth (7 checkpoints)
- [ ] CP-123: Zod validates retry input
- [ ] CP-124: Zod validates resend input
- [ ] CP-125: Read-only users can view failed notifications
- [ ] CP-126: Write access required for retry
- [ ] CP-127: Write access required for resend
- [ ] CP-128: Path revalidated after retry
- [ ] CP-129: Path revalidated after resend

### Webhook Routes (6 checkpoints)
- [ ] CP-130: Email webhook verifies Svix signature before processing
- [ ] CP-131: Email webhook returns 200 even on processing error
- [ ] CP-132: WhatsApp webhook verifies Bearer token before processing
- [ ] CP-133: WhatsApp webhook returns 200 even on processing error
- [ ] CP-134: Invalid email signature returns 401
- [ ] CP-135: Invalid WhatsApp token returns 401

### Trigger Queries (5 checkpoints)
- [ ] CP-136: Create trigger with eventId scoping
- [ ] CP-137: Update trigger with event scope guard
- [ ] CP-138: List triggers with optional filters
- [ ] CP-139: Get active triggers joins template and validates scope
- [ ] CP-140: Delete trigger with event scope guard
