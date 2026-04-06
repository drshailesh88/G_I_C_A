# Infrastructure Requirements: GEM India Conference App
**Date:** 2026-04-06
**Source:** Infrastructure grilling session (ChatGPT deep planning) + Claude Code design sprint
**Status:** GRILLED — ready for infrastructure architect

## Users
- Current users: 0 (pre-launch)
- Expected 6 months: 50-200 (admin/ops staff across 2-3 pilot events)
- Expected 2 years: 500-2,000 (admin/ops/delegates across 10+ events/year)
- Location: India (90%+ users), occasional international faculty
- Peak concurrent: 50-100 admin/ops during live event setup; 500+ delegates accessing public pages during event
- Usage pattern: Peaks during conference planning (weeks before) and during live events (3-4 day spikes). Light usage between events. Conference check-in creates the highest burst — 500 people scanning QR codes within a 2-hour window.

## App Characteristics
- Response time expectation: Fast (1-2 seconds for admin CRUD). Instant for QR scanner (sub-second). Some waiting acceptable for bulk operations (certificate generation, mass emails).
- File uploads: Medium (ticket PDFs 50-500KB, booking confirmations, branding assets up to 2MB, CSV imports for people/faculty)
- AI usage: None for MVP. Possible future: AI-powered abstract review, smart scheduling conflict resolution.
- Emails/notifications: Heavy during events
  - Pre-event: bulk invitations (500+), registration confirmations
  - During event: revised program notifications, itinerary updates, check-in confirmations
  - Post-event: certificate delivery (500+), feedback requests
  - Channels: Email (Resend) + WhatsApp (Evolution API) simultaneously
  - Rate limits: WhatsApp ~1 msg/sec, Email 10-100/sec depending on tier
- Offline support needed: Partial — QR scanner PWA must work with poor venue WiFi. Queue scans locally, sync when connectivity returns. Admin dashboard requires internet.
- Scheduled tasks:
  - Pre-event backup: 24 hours before event start date, export emergency ZIP to storage
  - Certificate delivery: batch processing 500+ PDFs
  - Health check: every 60 seconds (external monitoring)
  - Notification retry: failed sends retried with exponential backoff

## Reliability
- Downtime tolerance: Significant during live conference (ops team can't work, check-in breaks). Minor between events (can wait a few hours).
- Update downtime: Prefer not during events. Acceptable during non-event periods.
- Data sensitivity: Important to irreplaceable
  - Delegate personal data (name, phone, email, medical specialty) — PII
  - Faculty assignments and program — months of planning work
  - Travel/accommodation records — operational dependency
  - Certificates — verifiable credentials
  - Client PDF spec §15 mentions: SSL, RBAC, audit log, backups (weekly rolling), PII minimization
- Monitoring need: Immediate during live events. Proactive between events.
  - Sentry for errors (within 30 seconds)
  - Openstatus for uptime (60-second checks)
  - Health check endpoint validating all provider connections

## Budget
- Monthly budget: Starter to Growth
  - MVP: $6/month (only Evolution API on DigitalOcean)
  - Production: ~$115/month (all services at paid tiers)
  - Everything else starts on free tiers and upgrades as needed
- Payment preference: Hybrid (free tiers as base + pay-per-use for spikes)
- Existing platform commitments:
  - Vercel (hosting — free tier, upgrade to Pro $20/mo before first event)
  - Cloudflare (R2 storage — free tier)
  - Neon (database — free tier, upgrade to Pro $19/mo for production)
  - Clerk (auth — free tier, scales with MAU)
  - Inngest (background jobs — free tier 25K events/mo)
  - Upstash (Redis — free tier 10K commands/day)

## Future Growth
- Mobile app planned: No — mobile-first responsive web (PWA for QR scanner only)
- Public API planned: Maybe — for future integrations with hospital management systems or LMS platforms
- Institutional sales: Yes — medical associations and conference organizing committees
  - Data residency requirements: India (no data leaving the country for medical conferences)
  - Security certifications needed: None yet, but SSL + audit log + RBAC cover basics
  - SSO: Not in scope for MVP. May need SAML for large hospital systems later.
- Environments needed: Production + staging
  - Production: what users see
  - Staging: Vercel preview deployments (automatic on PR)
  - Neon branching for database staging
- Deployment method: AI agent (Claude Code) + automated (git push → Vercel auto-deploy)

## Existing Stack (confirmed)
- Framework: Next.js (App Router)
- Database: Neon (serverless PostgreSQL) via Drizzle ORM
- Auth: Clerk (@clerk/nextjs) with 4 custom roles
- Current hosting: Vercel (decided, not yet deployed)
- File storage: Cloudflare R2 via @aws-sdk/client-s3
- Background jobs: Inngest (event-driven, runs inside Next.js)
- Cache/locks/flags: Upstash Redis
- Email: Resend + React Email
- WhatsApp: Evolution API (Docker on DigitalOcean $6/mo)
- Error monitoring: Sentry
- Uptime monitoring: Openstatus (free)
- PDF generation: pdfme (certificates), @react-pdf/renderer (agenda)
- QR: qrcode.react (generation) + @yudiel/react-qr-scanner (scanning)

## Constraints
- Platform lock-ins:
  - Vercel for hosting (Next.js native, `git push` deploy)
  - Clerk for auth (pre-built components, RBAC, too deep to swap)
  - Neon for database (Drizzle migrations, serverless driver)
  - Everything else is swappable (R2 → S3, Resend → SendGrid, Inngest → BullMQ)
- Current frustrations: None yet (greenfield project)
- Admired competitor infrastructure:
  - Sessionize: instant schedule grid updates, real-time collaboration
  - Lu.ma: beautiful fast event pages, one-click registration
  - Certifier: bulk PDF generation at scale (100K+ PDFs/month on <$10 infra)

## Outage Mitigation Plan
| Scenario | Impact | Mitigation |
|----------|--------|------------|
| Neon down | App fully down | Pre-event backup ZIP in R2 (printed fallback) |
| Clerk down | Can't login | Public pages don't need auth; sessions cached locally |
| R2 down | Files unavailable | Key info stored as text in DB too; emails contain text + PDF |
| Evolution API down | WhatsApp fails | notification_log with retry; email is always fallback |
| Inngest down | Background jobs stop | Jobs queue and resume; manual admin screen for retries |
| Vercel down | App unreachable | Rare (99.99% SLA); pre-event backup is the safety net |

## Open Questions
- [ ] Virus scanning for uploaded files — ClamAV or defer as tech debt?
- [ ] When to upgrade Vercel from Hobby ($0, 10s timeout) to Pro ($20/mo, 60s timeout)?
- [ ] Data residency: Neon regions — need to confirm India-region availability or acceptable latency from Singapore/Mumbai edge
- [ ] WhatsApp Business verification: Evolution API works for MVP, but institutional clients may require official WABA. Timeline for switch?
