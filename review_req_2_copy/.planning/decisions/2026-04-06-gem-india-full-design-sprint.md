# Planning Session: GEM India Conference App — Full Design Sprint
**Date:** 2026-04-05 to 2026-04-06 (2-day session)
**Source:** Claude Code (Opus 4.6, 1M context) + Codex Poloto adversarial reviews
**Status:** captured

## Context
Building a mobile-first conference management platform for Indian medical/academic conferences. Client provided a 5-page PDF spec with 19 sections covering 14 modules. The goal was to go from zero to code-ready: research → design decisions → wireframes → architecture spec → adversarial review → handoff document. Everything had to be grounded in UX research from real platforms — no invention.

## Key Decisions Made

### Tech Stack
1. **Next.js on Vercel** instead of PHP/Laravel — Client approved the stack change. Rejected: Laravel (contract's original spec), Django, Rails. Rationale: better DX, React ecosystem, serverless deployment.
2. **Clerk for auth** — Pre-built React components (SignIn, SignUp, UserButton, OrganizationSwitcher), `has()` permission helper, custom roles. Rejected: NextAuth (less pre-built UI), Auth0 (more complex).
3. **Drizzle ORM + Neon DB** — Type-safe, serverless Postgres. Rejected: Prisma (heavier), raw SQL.
4. **Cloudflare R2 for storage** — S3-compatible, zero egress fees. Rejected: AWS S3 (egress costs), Vercel Blob (vendor lock-in).
5. **Evolution API for WhatsApp** — Self-hosted Docker sidecar wrapping Baileys, zero per-message cost. Rejected: Official WABA via Gupshup/Twilio (paid per conversation) — deferred to when Evolution API proves insufficient. Rationale: MVP speed + cost.
6. **Inngest for background jobs** — Event-driven fan-out pattern fits the cascade system (travel.updated → multiple downstream reactions). Rejected: Trigger.dev (task-based, less natural for fan-out), BullMQ (needs Redis).
7. **pdfme for certificates** — WYSIWYG template designer + JSON storage + bulk PDF generator, MIT licensed. Rejected: pdf-lib (no visual editor), Certifier.io API (external dependency), Puppeteer/HTML-to-PDF (less control).
8. **Novu + React Email for notifications** — Multi-channel orchestration (email + WA + in-app) with Liquid templates and delivery logging. Rejected: Custom notification system (too much to build), SendGrid alone (no WA).
9. **react-spreadsheet-import for CSV import** — MIT, fuzzy header matching, stepper UI. Rejected: Custom CSV parser (no auto-mapping UX), PapaParse (no UI).
10. **sadmann7/shadcn-table for data tables** — TanStack Table + Drizzle + Neon, server-side pagination. Rejected: AG Grid (overkill), custom table (too slow to build).
11. **BemiHQ/bemi-io-drizzle for audit log** — Automatic PG WAL/CDC change tracking. Rejected: Manual trigger-based audit (fragile), application-level logging (misses direct DB changes).
12. **ixartz/SaaS-Boilerplate as scaffold** — Exact stack match: Next.js + Clerk + Drizzle + shadcn + multi-tenant. Rejected: create-next-app from scratch (slower), T3 stack (tRPC adds complexity).

### UX Decisions
13. **Mobile-first design (390px)** — 99.99% of users on mobile. Bottom tab bar with 5 tabs (HOME, EVENTS, PEOPLE, PROGRAM, MORE). Rejected: sidebar navigation (desktop-first), hamburger menu (hidden nav).
14. **Paytm-inspired color palette** — Deep blue primary (#00325B), teal accent (#00B9F5), clean white surfaces. Inter font (Notion-inspired). Rejected: dark theme (too clinical), Material Design defaults (generic).
15. **3-state red-flag cascade** — Red (unreviewed) → Yellow (reviewed) → Cleared (resolved). Badge shows WHAT changed + WHEN + "Mark as Reviewed" / "Resolve" buttons + "Show flagged only" filter. Rejected: simple boolean flag (no lifecycle), toast-only notifications (easy to miss).
16. **Mobile schedule: auto-switch by breakpoint** — Below 768px = card list grouped by time slot for attendees. Above 768px = grid. Admin always sees grid with horizontal scroll. No manual toggle. Rejected: manual toggle button (nobody finds it), grid-only (unusable on phone), list-only (admin needs spatial view).
17. **Event Workspace (M21) as central hub** — One screen with module cards routing to all event sub-screens. Rejected: deep nested navigation (gets lost), tab bar within tab bar (confusing), sidebar within mobile app (doesn't work).
18. **Sessionize-style schedule grid for admin** — Two-panel: session list + hall×time grid with drag-and-drop. Adapted from Chrome teardown of Sessionize. Rejected: calendar-only view (no spatial hall layout), list-only (can't see conflicts).

### Process Decisions
19. **No UX invention** — Every screen pattern must trace to a researched platform (HubSpot, Sessionize, Lu.ma, Certifier, Whova, Airtable, etc.). Custom compositions only where no platform does what the PDF requires (red-flag cascade, event field builder).
20. **Adversarial review by different LLM** — Codex (GPT) reviewed Claude's work. Found 10 critical issues, 9 important, 5 minor. All critical issues now addressed.
21. **Click Map verification by Codex** — 48 screens audited for dead ends (18 found, fixed), orphan screens (12 found, fixed via M21 hub), and flow completeness (5/7 → 6/7 complete).

## Open Questions

- [ ] Payment integration (Razorpay/UPI) — PDF is silent on payment in registration. Research recommends it for India. Mark as phase 2 or out of scope?
- [ ] Bulk/group registration — Indian conferences have institutional group signups. Not in PDF. Design if needed or defer?
- [ ] Offline QR scanning — PWA with Service Worker + IndexedDB. UX for offline badge, sync queue, and reconnect not yet designed. Design before QR module ships.
- [ ] Program revision journey is 90% complete — M52 "Preview Revised Emails" needs a modal designed before Scientific Program module ships.
- [ ] M30 "Fix" conflict button — needs to navigate to M23 with conflicting session pre-loaded. Design before schedule grid is interactive.

## Constraints & Requirements

- Mobile-first: 99.99% of users on mobile phones
- Indian context: Dr./Prof. name prefixes, phone-first contact (not email), unreliable venue WiFi
- 4 roles with strict access: Super Admin, Event Coordinator, Ops, Read-only
- Scale: 50-1000+ delegates per event, no user-count limits
- Per-event isolation: each event has its own program, comms, lists, reports while sharing master people DB
- Cascade system is mandatory: travel change must flag accommodation + update transport + notify delegate
- Client approved Next.js stack over PDF's PHP/Laravel spec
- Evolution API stays for MVP; official WABA deferred

## Next Steps

1. **Start coding Phase 1: Foundation** — Scaffold, Auth, Dashboard, Event CRUD
2. Before each phase, check `DEFERRED_TICKETS.md` for items to design first
3. Use `PROJECT_HANDOFF.md` as the "start here" doc in any new context
4. Use `FRONTEND_ARCHITECTURE.md` for route map, layouts, state, data model
5. Use `BACKEND_ARCHITECTURE_MAP.md` for npm packages per module

## Raw Notes

### Research Phase (Apr 5)
- 11 parallel research agents scraped 14 platforms: Whova, Sessionize, Lu.ma, HubSpot, Certifier, WATI, TravelPerk, AppCraft, Airtable, Stripo, React Email, Clerk, Retool, Cvent
- 3 Chrome interactive teardowns completed: Sessionize (schedule grid), Lu.ma (registration), Certifier (certificates)
- 4 open-source deep dives by other terminal workers: Indico (CERN), Pretalx, Frab, Fourwaves
- 2 deep research reports: open-source landscape + toolkit recommendations
- Result: FINAL_SYNTHESIS.md — 14 modules mapped to researched UX patterns

### Design Phase (Apr 5-6)
- Created design system in Pencil: Paytm colors, Inter font, 13 reusable components
- Built 16 initial screens → self-audited → found 34 needed → built to 34 → Codex found 9 more → built to 43 → click map found 5 more → built to 48
- Every screen verified via get_screenshot
- Every Codex critical finding addressed with a new screen

### Adversarial Review (Apr 6)
- Codex (GPT-5) independently reviewed all artifacts
- Found: stack contradicts contract (resolved — client approved), WhatsApp compliance (resolved — Evolution API stays for MVP), 8 missing screen types, broken navigation graph
- Second Codex pass: Click Map audit found 18 dead ends, 12 orphans, 5/7 broken journeys
- M21 Event Workspace hub fixed most navigation issues
- Final state: 48 screens, 13 remaining dead ends (all inline modals/drawers), 6/7 journeys complete

### Documentation Phase (Apr 6)
- PROJECT_HANDOFF.md — single "start here" document
- FRONTEND_ARCHITECTURE.md — routes, layouts, state ownership, data model
- BACKEND_ARCHITECTURE_MAP.md — module → library → npm package
- DESIGN_DECISIONS.md — locked tech + UX choices
- DEFERRED_TICKETS.md — 9 items to design before their module ships
- All committed and pushed to GitHub: drshailesh88/G_I_C_A
