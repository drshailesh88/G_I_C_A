# Deferred Tickets — Design Before Module Ships

> These are NOT forgotten. They are explicitly tracked items that need
> wireframe design before their parent module enters development.
> Do NOT improvise these during coding — design them first.

| # | Item | What's Needed | Current Wireframe Coverage | Parent Module | Design Before Phase |
|---|------|--------------|----------------------------|---------------|-------------------|
| D1 | Preview Revised Emails | Modal overlay on M52 showing sample revised email with diff highlights | M52 now has a `Preview Revised Emails` CTA, but no preview state | Scientific Program | Phase 2 |
| D2 | Conflict Fix action | M30 `Fix` → navigates to M23 with conflicting session pre-loaded, conflict highlighted | M30 now has conflict banner + `Fix` CTA, but no destination state | Scientific Program | Phase 2 |
| D3 | Add Person form | Slide-up bottom sheet from M03 `+ Add` — Name, Designation, Specialty, City, Mobile, Email, Role tags | M03 has the `+ Add` CTA, but no add-person screen/sheet | People | Phase 2 |
| D4 | Invite Member modal | Bottom sheet on M19 — Email field + Role dropdown + Send button | M19 now has `Invite` CTA, but no invite modal/sheet | Team & Roles | Phase 6 |
| D5 | Speaker Profile view | Expandable card or separate detail view from M25 speaker cards — Name, Bio, Photo, Sessions list | M25 now shows speaker cards, but no speaker profile view | Registration / Public Pages | Phase 2 |
| D6 | View All Issued Certificates | List screen from M61 `View All` link — search by name/reg#, resend/revoke per row | M61 now has `View All Issued Certificates` link, but no list screen | Certificates | Phase 5 |
| D7 | Terms & Privacy page | Simple text page linked from M07 `Terms & Privacy Policy` | Registration form flow exists; dedicated policy page still absent | Registration | Phase 2 |
| D8 | Notification drawer | Slide-down or bottom sheet from M01 bell icon — list of recent notifications | M01 now shows bell icon, but no drawer/sheet | Dashboard | Phase 6 |
| D9 | Profile/account sheet | From M01 avatar — name, email, role, sign out | M01 now shows avatar entrypoint, but no profile sheet | Dashboard | Phase 6 |

## How to Handle These

1. When you start building a Phase, check this list
2. If any deferred items belong to that Phase, design the wireframe FIRST
3. Then build
4. Mark as DONE here when designed and built

---

## Pre-Production Hardening — Communications Engine (Phase 4)

> Found by Codex adversarial review (2026-04-08). These are infrastructure/security
> items that require external service configuration or architectural changes.
> Must be resolved BEFORE any production deployment. Fix during Phase 6 hardening
> unless noted otherwise.

| # | Severity | Issue | What Breaks in Production | Fix Phase |
|---|----------|-------|--------------------------|-----------|
| H1 | HIGH | Webhook endpoints (`/api/webhooks/email`, `/api/webhooks/whatsapp`) have no signature verification | Anyone can forge delivery/read/failed states by POSTing to the endpoints. Resend supports webhook signing; Evolution API supports HMAC. | Phase 6 (`/harden`) |
| H2 | HIGH | Webhook ingest swallows all errors, routes always return 200, no dead-letter queue | Transient DB outage permanently loses delivery state — provider won't retry since it got 200 | Phase 6 — needs Inngest or Redis-based DLQ |
| H3 | HIGH | Forward-only status progression uses stale read (no DB-level CAS) | Concurrent `delivered` + `read` webhooks can regress status. Need `UPDATE ... WHERE status_order < $new` | Phase 6 — DB-level compare-and-set |
| H4 | HIGH | `providerMessageId` not unique-constrained in `notification_log` | Colliding or reused provider IDs can update wrong notification row | Phase 6 — DB migration to add unique index |
| H5 | HIGH | Email adapter doesn't pass attachments to Resend; WhatsApp adapter ignores `mediaAttachments` | QR codes, itineraries, certificates silently omitted from sends | Phase 5 (certificates) — implement R2 signed URL attachment flow |
| H6 | HIGH | Provider calls run inline with no timeout, queue, or circuit breaker | 1000+ sends or provider degradation blocks request path, cascading into user-facing saturation | Phase 6 — Inngest background jobs or at minimum `AbortController` timeouts |
| H7 | MEDIUM | `handleDomainEvent` in `automation.ts` only logs dispatch plan, doesn't actually send | Modules wired to automation triggers appear to work but send nothing | Wire to `sendNotification()` when integrating cascade handlers with real NotificationService |
