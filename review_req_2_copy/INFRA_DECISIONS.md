# Infrastructure Decisions: GEM India Conference App
**Date:** 2026-04-06
**Source:** .planning/infra-requirements.md
**Monthly estimated cost:** $6 (MVP) → $115 (production)

## Architecture Overview

```
[Indian User] → [Vercel Edge Network (Mumbai PoP)]
                         │
                         ▼
                  [Next.js on Vercel]
                  (App + API Routes + Inngest endpoint)
                         │
         ┌───────────────┼───────────────┬──────────────┐
         │               │               │              │
         ▼               ▼               ▼              ▼
    [Neon DB]      [Cloudflare R2]   [Inngest]    [Upstash Redis]
    (PostgreSQL)   (File Storage)    (Background   (Cache, Locks,
                                      Jobs)        Rate Limits,
                                                   Feature Flags)
         │
    ┌────┼────┐
    │         │
    ▼         ▼
[Resend]  [Evolution API]        [Sentry]      [Openstatus]
(Email)   (WhatsApp,             (Errors)      (Uptime)
           DigitalOcean)
```

## Platform Choices

### App Hosting: Vercel
**Why:** Your app is Next.js. Vercel built Next.js. Every feature works perfectly — server components, API routes, middleware, image optimization, preview deployments. Deployment is `git push`. Mumbai edge network means Indian users get fast responses. Free tier covers development, Pro ($20/mo) covers production.
**Cost:** $0/month during development. $20/month in production (Pro plan for 60-second function timeout).
**Alternative considered:** Cloudflare Workers (cheaper at $5/mo, but OpenNext adapter adds debugging pain), Railway (full Node.js but no edge network), Hono on Workers (loses Next.js ecosystem).
**Migration path:** Next.js can self-host on any Node.js platform (Railway, Fly.io, Docker). No code changes needed — only deployment config changes.

### Database: Neon (serverless PostgreSQL)
**Why:** Serverless means you pay nothing when nobody's using the app (between conferences). Auto-scales during events. The serverless driver works from Vercel's edge functions. Database branching gives you free staging environments. Drizzle ORM has first-class Neon support.
**Cost:** $0/month on free tier (0.5GB, 190 compute hours). $19/month on Pro when you need more storage or uptime for production events.
**Alternative considered:** Supabase (includes auth+storage but you already chose Clerk+R2), PlanetScale (MySQL, not PostgreSQL), self-hosted PostgreSQL on Railway (needs always-on server).
**Migration path:** Standard PostgreSQL. Export with pg_dump, import to any PostgreSQL host. Drizzle migrations are platform-agnostic.

### File Storage: Cloudflare R2
**Why:** Zero egress fees. When 500 delegates download their certificate PDFs, you pay $0 for bandwidth. On AWS S3 that would cost ~$4.50, on Vercel Blob ~$15. R2 is S3-compatible — same code, same SDK, zero bandwidth bills.
**Cost:** $0/month on free tier (10GB storage, 10M reads). ~$1/month in production. Even at scale, egress is always free.
**Alternative considered:** Vercel Blob ($0.30/GB egress — expensive for certificate downloads), AWS S3 ($0.09/GB egress).
**Migration path:** S3-compatible. Switch the endpoint URL in your config to point to any S3-compatible storage. Zero code changes.

### CDN: Vercel Edge Network (included)
**Why:** Comes free with Vercel. Has a Mumbai Point of Presence for Indian users. Serves static assets and cached pages from the nearest edge location. No separate CDN needed.

### Auth: Clerk
**Why:** Pre-built React components (SignIn, SignUp, UserButton, OrganizationSwitcher) mean zero auth code to write. Custom roles and permissions (`has()` helper) handle your 4-role RBAC system. Vercel has a native Clerk integration — one click to connect.
**Cost:** $0/month on free tier (10K monthly active users). $25/month when you scale past that.
**Alternative considered:** NextAuth (more DIY, no pre-built components), Supabase Auth (would pull in Supabase ecosystem you don't need).
**Migration path:** Clerk-specific components would need replacement. Data export available. This is the most locked-in choice — worth it because auth is the hardest thing to build yourself.

### Email: Resend + React Email
**Why:** Resend has a native Vercel integration. React Email lets you write email templates as React components — same language as your app. Delivery rates are excellent. API is simple.
**Cost:** $0/month on free tier (100 emails/day — enough for development). $20/month for 5,000 emails/month in production.
**Alternative considered:** SendGrid (more complex API), Postmark (slightly better deliverability but more expensive), AWS SES (cheapest but hardest to set up).
**Migration path:** Swap `resend.emails.send()` for any other provider's API. React Email templates work with any SMTP provider.

### WhatsApp: Evolution API on DigitalOcean
**Why:** Self-hosted WhatsApp automation using Baileys (WhatsApp Web protocol). Zero per-message cost. REST API that your Next.js API routes call directly. Runs as a Docker container on a $6/month DigitalOcean droplet.
**Cost:** $6/month (DigitalOcean droplet). $0 per message.
**Alternative considered:** Official WhatsApp Business API via Twilio/Gupshup (paid per conversation, $0.01-0.05 each — expensive for 500+ sends). Deferred to when institutional clients require it.
**Migration path:** Switch API calls from Evolution API endpoints to official WABA SDK. Template message format is similar. The notification_log table handles the transition.

### Background Jobs: Inngest
**Why:** Runs inside your Next.js app — no separate server, no Redis, no queue infrastructure. Define a function, emit an event, Inngest runs it with automatic retries. Perfect for the cascade system (travel change → flag accommodation → update transport → notify delegate). Each step retries independently.
**Cost:** $0/month on free tier (25K events/month). $25/month at scale.
**Alternative considered:** BullMQ + Redis (needs separate Redis server), Cloudflare Queues (needs Workers), raw setTimeout/setInterval (no retry, no observability).
**Migration path:** Inngest functions are standard async TypeScript. Replace `inngest.send()` with BullMQ queue push. Logic stays the same.

### Cache / Locks / Feature Flags: Upstash Redis
**Why:** Serverless Redis accessed via HTTP — works from Vercel with no persistent connections. Handles five critical patterns: rate limiting (WhatsApp 1 msg/sec), distributed locks (prevent double sends), idempotency cache (no duplicate notifications), feature flags (emergency toggles), and Ops Mode cache (fast reads during live events).
**Cost:** $0/month on free tier (10K commands/day). $2/month in production.
**Alternative considered:** Cloudflare KV (needs Worker bindings, can't use from Vercel), Vercel KV (Upstash under the hood but more expensive).
**Migration path:** Standard Redis commands via HTTP. Switch to any Redis provider by changing connection URL.

### Error Monitoring: Sentry
**Why:** Know within 30 seconds when something breaks during a live conference. Captures React errors, API failures, slow queries. Shows which user hit the error and what they were doing. Free tier is generous.
**Cost:** $0/month (5K errors/month free tier — more than enough).
**Alternative considered:** LogRocket (more expensive), Datadog (enterprise pricing), console.log (not a monitoring strategy).
**Migration path:** Remove `@sentry/nextjs` package. Errors stop being tracked. Add any other provider's SDK.

### Uptime Monitoring: Openstatus
**Why:** Free, open-source uptime monitoring. Checks your `/api/health` endpoint every 60 seconds. Sends alerts on failure. Provides a public status page (status.gemindia.com) so ops teams can check system health during events.
**Cost:** $0/month.
**Alternative considered:** Better Uptime ($20/month), Pingdom ($15/month).

### Scheduled Tasks: Inngest + Vercel Cron
**Why:** Inngest handles complex scheduled jobs (pre-event backup, certificate batch generation). Vercel Cron (free on Pro plan) handles simple recurring tasks (health check triggers, daily digest).
**Cost:** Included in Inngest and Vercel pricing.

### CI/CD: GitHub + Vercel Auto-Deploy
**Why:** Push to GitHub → Vercel auto-deploys. Every PR gets a preview deployment (free staging). Claude Code runs `git push` and the app is live. No CI/CD pipeline to configure.
**Cost:** $0 (GitHub free for private repos, Vercel auto-deploy included).

## Cost Breakdown

| Service | Free Tier Limit | MVP Cost | Production Cost | 2-Year Projected |
|---------|----------------|----------|-----------------|-----------------|
| Vercel | 100GB bandwidth | $0 | $20/mo | $20/mo |
| Neon | 0.5GB, 190 compute hrs | $0 | $19/mo | $19/mo |
| Clerk | 10K MAU | $0 | $0-25/mo | $25/mo |
| Cloudflare R2 | 10GB storage | $0 | ~$1/mo | ~$2/mo |
| Inngest | 25K events/mo | $0 | $0-25/mo | $25/mo |
| Upstash Redis | 10K commands/day | $0 | $2/mo | $2/mo |
| Resend | 100 emails/day | $0 | $20/mo | $20/mo |
| Sentry | 5K errors/mo | $0 | $0 | $0 |
| Openstatus | Unlimited | $0 | $0 | $0 |
| Evolution API (DO) | N/A | $6/mo | $6/mo | $6/mo |
| **Total** | | **$6/mo** | **~$68-118/mo** | **~$119/mo** |

## Deployment Pipeline

```
Claude Code pushes code to GitHub
        │
        ▼
Vercel detects push:
  • PR branch → Preview deployment (free staging URL)
  • main branch → Production deployment (auto)
        │
        ▼
Vercel builds Next.js:
  1. Install dependencies
  2. Run build (type check included)
  3. Deploy to edge network
        │
        ▼
  Live in ~60 seconds at gem-india.vercel.app
```

No GitHub Actions needed for MVP. Vercel handles everything. Add CI pipeline later when team grows.

## Environment Variables

| Variable | Where to Set | What It's For |
|----------|-------------|--------------|
| `DATABASE_URL` | Vercel Dashboard → Environment Variables | Neon PostgreSQL connection |
| `CLERK_SECRET_KEY` | Vercel Dashboard | Clerk auth backend |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Vercel Dashboard | Clerk auth frontend |
| `R2_ACCESS_KEY_ID` | Vercel Dashboard | Cloudflare R2 access |
| `R2_SECRET_ACCESS_KEY` | Vercel Dashboard | Cloudflare R2 secret |
| `R2_BUCKET_NAME` | Vercel Dashboard | R2 bucket name |
| `R2_ENDPOINT` | Vercel Dashboard | R2 S3-compatible endpoint |
| `INNGEST_EVENT_KEY` | Vercel Dashboard | Inngest event sending |
| `INNGEST_SIGNING_KEY` | Vercel Dashboard | Inngest webhook verification |
| `UPSTASH_REDIS_REST_URL` | Vercel Dashboard | Upstash Redis connection |
| `UPSTASH_REDIS_REST_TOKEN` | Vercel Dashboard | Upstash Redis auth |
| `RESEND_API_KEY` | Vercel Dashboard | Email sending |
| `EVOLUTION_API_URL` | Vercel Dashboard | WhatsApp API endpoint |
| `EVOLUTION_API_KEY` | Vercel Dashboard | WhatsApp API auth |
| `SENTRY_DSN` | Vercel Dashboard | Error monitoring |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel Dashboard | Client-side error monitoring |

**NEVER put these in code. ALWAYS use Vercel environment variables.**

Create `.env.example` in the repo as a template (no real values):
```
DATABASE_URL=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ENDPOINT=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
RESEND_API_KEY=
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

## Scaling Plan

### When you hit 200 active users (first real event):
- Upgrade Vercel from Hobby to Pro ($20/mo) — need 60-second function timeout for bulk operations
- Upgrade Neon to Pro ($19/mo) — need reliable uptime during live event
- Start Resend paid plan ($20/mo) — will exceed 100 emails/day during conference

### When you hit 1,000+ users across multiple events:
- Inngest may exceed free tier (25K events/mo) — upgrade to $25/mo
- Clerk may exceed 10K MAU — upgrade to $25/mo
- Consider Vercel Enterprise for 300-second timeouts if bulk operations grow

### Emergency scaling (unexpected traffic spike):
- Vercel auto-scales — no action needed for web traffic
- Neon auto-scales compute — no action needed for database
- Inngest queues jobs — they process at their own pace, no spike risk
- Only bottleneck: Evolution API on single droplet — upgrade DigitalOcean to $12/mo droplet if WhatsApp volume increases

## Disaster Recovery

- **Database backups:** Neon has automatic point-in-time recovery (PITR). Free tier: 7-day history. Pro: 30-day history. Restore to any second within that window.
- **Code:** GitHub is the backup. All code versioned. Every commit recoverable.
- **File uploads:** R2 stores files with 11 nines durability. Cross-region replication available on paid plan.
- **Pre-event emergency backup:** Inngest function auto-generates ZIP to R2 24 hours before event start. Contains all critical data as CSVs + PDFs.
- **Recovery time:** Vercel redeploy: ~60 seconds. Neon restore: ~5 minutes. Full recovery from total failure: ~30 minutes.

## Security Checklist

- [x] All secrets in Vercel environment variables, not code
- [x] HTTPS everywhere (automatic with Vercel)
- [x] Security headers set (vercel.json configuration below)
- [x] Database not publicly accessible (Neon serverless driver, no exposed port)
- [x] File uploads validated (type + size in API routes via Zod)
- [x] Rate limiting on API routes (Upstash Redis rate limiter)
- [x] Dependency audit (npm audit in pre-commit or CI)
- [x] RBAC on every API route (Clerk `has()` check)
- [x] Audit log on critical mutations (Bemi + PG triggers)
- [x] Phone numbers normalized to E.164 on input
- [x] Timestamps in UTC, displayed in IST
- [x] Optimistic locking on concurrent-edit-prone tables
- [x] Idempotency keys on all notification sends
- [x] Feature flags for emergency service degradation

## Vercel Region

Set Vercel function region to `bom1` (Mumbai) for lowest latency to Indian users:

```json
// vercel.json
{
  "regions": ["bom1"]
}
```
