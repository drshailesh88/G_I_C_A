# Planning Session: Infrastructure, Resilience & Final Stack Decision
**Date:** 2026-04-06
**Source:** ChatGPT deep planning session (captured from discussion_gem.md)
**Status:** captured

## Context
After UX/wireframes were complete, the discussion shifted to production readiness: how the app survives a live 500-person medical conference. Explored 4 stack options (Cloudflare Workers, Hono, Railway, Vercel) and settled on the simplest path with the highest completion probability. Also identified 7 critical failure scenarios and their mitigations.

## Key Decisions Made

### Final Stack: Next.js on Vercel (everything in one place)
1. **Next.js on Vercel as both frontend AND backend** — API routes = serverless functions, no separate backend needed. Rejected: Hono on Cloudflare Workers (simpler deployment but less ecosystem support), Railway (good but Vercel has native Next.js support), split architecture Pages+Workers (unnecessary CORS and dual deployment complexity). Rationale: `git push` deploys everything, zero config, maximum Claude Code familiarity.

2. **Cloudflare R2 for storage (not Vercel Blob)** — Zero egress fees. 500 delegates downloading certificates costs nothing. Connected via `@aws-sdk/client-s3` from Vercel serverless functions. Rejected: Vercel Blob ($0.30/GB egress), AWS S3 ($0.09/GB egress).

3. **Upstash Redis added to stack** — Serverless Redis for: distributed locks (prevent double certificate sends), rate limiting (WhatsApp 1msg/sec), idempotency cache (prevent duplicate notifications), session cache (reduce Clerk API calls), feature flags. Cost: free tier 10K commands/day, $2/month production. Rejected: Cloudflare KV (needs Worker bindings, can't use from Vercel).

4. **Sentry added for error monitoring** — Non-negotiable for a commercial product. Know within 30 seconds when something breaks during a live conference. Free tier: 5K errors/month. Integration: `npx @sentry/wizard@latest -i nextjs`.

5. **Feature flags via Upstash Redis** — Simple key-value toggles: `flag:whatsapp_enabled`, `flag:email_provider`, `flag:certificate_selfserve_enabled`. Emergency brake for mid-conference degradation. Admin page with toggle switches.

6. **Pre-event backup ritual** — Scheduled Inngest function runs 24 hours before event start. Exports complete event data to R2 as ZIP: agenda PDF, attendee list, rooming list, transport plan, faculty responsibilities. "Break glass in emergency" insurance.

7. **Health check endpoint + status page** — `/api/health` checks Neon, Clerk, R2, Evolution API connectivity. Openstatus (free, open source) monitors every 60 seconds. Alert on failure.

### Stack Options Explored & Rejected
8. **Cloudflare Workers via OpenNext** — Explored fully. Mumbai edge PoP, native R2/KV/Queues bindings, $5/month. Rejected because: OpenNext adapter less battle-tested, edge runtime 128MB memory limit, debugging Workers-specific issues costs build time. The cost savings ($11/mo vs $115/mo) don't justify the risk for a first project.

9. **Hono on Cloudflare Workers** — Explored as simpler Cloudflare alternative. Built for Workers, no adapter needed, `wrangler deploy`. Rejected because: loses Next.js ecosystem, shadcn/ui needs SPA wrapper, less Claude Code familiarity. Good option for v2 migration.

10. **Railway for everything** — Explored as Docker-based full Node.js runtime. No execution limits, no memory constraints. Rejected in favor of Vercel because: Vercel has native Next.js integration, auto-deploy on push, built-in Mumbai CDN.

11. **Split architecture (Cloudflare Pages + Railway backend)** — Explored. Rejected because: CORS config, two deployments, auth token passing, debugging across platforms. Unnecessary complexity.

### Resilience Patterns
12. **Notification log with retry capability** — `notification_log` table tracks every send: status (queued/sending/sent/delivered/failed/retrying), provider, attempts, last_error. Admin screen filters by `status = 'failed'` with Retry button. "Retry all failed for this event" for bulk replay. This is the #1 infrastructure piece to build before any notification sending.

13. **Idempotent operations everywhere** — Every retryable operation checks idempotency key in Redis: `notification:{userId}:{eventId}:{type}:{triggerId}`. 24-hour TTL. Prevents "Dr. Sharma got 4 identical emails" from button double-clicks or job retries.

14. **Inngest step-based retries** — Each step in a function retries independently. Step 3 fails → retry step 3 without re-running steps 1-2. Per-module retry policies: Email 3x/30s, WhatsApp 2x/60s (rate limits), PDF 1x then flag for manual review.

15. **Two-step file operations** — Never generate and send in same operation. Step 1: generate PDF → upload to R2 → save URL to DB. Step 2: send notification with stored URL. If step 2 fails, PDF still exists and can be resent.

16. **Bulk sends via Inngest batching** — Admin clicks "Send to 500" → API route emits one Inngest event → function processes in batches of 20 with `step.sleep('30s')` between → each send is a separate step → progress tracked in DB (`sent_count`/`total_count`) → admin sees progress bar. WhatsApp: 1 msg/sec with `step.sleep('2s')`. Email: batches of 10 per second.

17. **Optimistic locking for concurrent editing** — `updated_at` timestamp on every record. Check before saving. Reject if changed since form load. Prevents silent data loss when two coordinators edit schedule simultaneously.

### Outage Handling
18. **Neon outage** → app down. Defense: pre-event backup ZIP in R2, "Export emergency kit" button. Conference runs from paper.

19. **Clerk outage** → can't login, but sessions may survive (local cache). Defense: public pages (landing, registration, certificate portal) don't require auth. Only admin routes need Clerk.

20. **R2 outage** → PDFs/attachments unavailable. Defense: critical info stored as text in DB too. Notification emails contain key info as text AND PDF attachment. If link dies, text survives.

21. **Evolution API outage** → WhatsApp fails. Defense: notification_log with retry. Always send email AND WhatsApp for critical notifications. Email is fallback channel. Feature flag to disable WhatsApp gracefully.

22. **Meta-pattern: dual storage for everything** — Itinerary in DB + sent email. Certificate in R2 + regenerable from template. Schedule in DB + pre-exported PDF. No single point of failure for information a doctor needs during a live conference.

### Edge Cases Identified
23. **Phone number normalization** — Indian numbers in 4 formats. Normalize to E.164 (`+919876543210`) on input using `libphonenumber-js`. Without this, 20% of WhatsApp sends fail.

24. **Name encoding** — Hindi/regional names (Dr. श्रीनिवास मूर्ति) must work in PDF generation. pdfme handles UTF-8 natively. Test early.

25. **Timezone handling** — Store UTC in Neon, display IST by default. Use `date-fns-tz`, not moment.

26. **Duplicate registration** — Idempotency on email per event. Return existing registration instead of creating duplicate.

27. **File upload size** — Ticket PDFs can be 5-10MB. Set body parser to 20MB. R2 handles fine.

28. **Session expiry during long forms** — Set Clerk session to 24 hours for admin roles. Autosave drafts to localStorage every 60 seconds.

29. **"Ops Mode" concept** — Cache critical data in Upstash Redis (agenda JSON, attendee list, transport plan). Ops screens read Redis first, fall back to Neon. Check-in scanner works even if DB is slow.

## Open Questions

- [ ] Virus scanning for file uploads — ClamAV or skip for MVP? Track as tech debt.
- [ ] Vercel Pro plan timing — start on Hobby (10s timeout), upgrade to Pro ($20/mo, 60s timeout) before first event. When?
- [ ] Migration path to Cloudflare Workers — if Vercel costs grow, when and how to migrate? Code stays same, only deployment layer changes.

## Constraints & Requirements

- Deployment by Claude Code only — no manual deploys
- Claude AI as project manager directing Claude Code
- Context7 available for latest docs during deployment
- Must survive a live 500-person Indian medical conference
- Under $115/month production cost
- $6/month MVP cost (Evolution API on DigitalOcean only mandatory paid service)

## Infrastructure Rules (for Claude AI PM to enforce)

```
- Every notification send must check an idempotency key in Redis before sending
- Every mutation to travel/accommodation/transport must write to the audit log
- Every background job must be idempotent (safe to retry without side effects)
- Every API route that accepts user input must validate with Zod schemas
- Every database query must filter by event_id (per-event isolation)
- Every error must be captured by Sentry with user context
- Feature flags must gate WhatsApp, email, and certificate generation independently
- Pre-event backup must run automatically 24 hours before event start
- Phone numbers must be normalized to E.164 on input
- All timestamps stored in UTC, displayed in IST
```

## Updated Monthly Cost

| Service | Free Tier | Production |
|---------|-----------|------------|
| Vercel (Hobby→Pro) | $0 | $20/mo |
| Neon | $0 | $19/mo |
| Clerk | $0 | $25/mo |
| Cloudflare R2 | $0 | ~$1/mo |
| Inngest | $0 | $25/mo |
| Upstash Redis | $0 | $2/mo |
| Resend | $0 | $20/mo |
| Sentry | $0 | $0 |
| Evolution API (DO) | — | $6/mo |
| **Total** | **$6/mo** | **~$115/mo** |

## Updated Project Directory Structure

```
gem-india/
├── src/
│   ├── app/              ← Next.js pages + layouts
│   ├── components/       ← shadcn/ui components
│   ├── server/
│   │   ├── db/           ← Drizzle schema + queries
│   │   ├── actions/      ← Server actions (form submissions)
│   │   ├── services/     ← Business logic (notification, cascade)
│   │   └── inngest/      ← Background job definitions
│   ├── lib/
│   │   ├── r2.ts         ← R2 client (S3 SDK configured)
│   │   ├── redis.ts      ← Upstash client
│   │   ├── whatsapp.ts   ← Evolution API client
│   │   ├── email.ts      ← Resend client
│   │   └── flags.ts      ← Feature flag reader
│   └── emails/           ← React Email templates
├── drizzle/              ← Migrations
├── public/
├── .env.local
├── drizzle.config.ts
├── next.config.ts
├── package.json
└── vercel.json
```

## Next Steps

1. Update `BACKEND_ARCHITECTURE_MAP.md` with Upstash Redis, Sentry, feature flags, and Ops Mode
2. Update `FRONTEND_ARCHITECTURE.md` with notification_log table, health check endpoint, and retry admin screen
3. Add infrastructure rules to CLAUDE.md for enforcement during build
4. Start Phase 1: Foundation (scaffold, auth, dashboard, event CRUD)

## Raw Notes

See full discussion at: `/Users/shaileshsingh/Documents/One Vault/discussion_gem.md`
Complete text preserved there including all stack comparison tables, architecture diagrams, code examples, and cost breakdowns.
