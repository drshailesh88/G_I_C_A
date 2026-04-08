# GEM India — Locked Design Decisions

> Approved: 2026-04-06
> These are FINAL. No more discussion needed on these items.

---

## Tech Decisions

### WhatsApp: Evolution API (self-hosted)
- Deploy as Docker sidecar microservice
- Wraps Baileys (MIT) into REST API with webhook callbacks
- RabbitMQ/SQS queuing for reliable delivery
- Zero per-message cost (uses WhatsApp Web protocol)
- Supports both free Baileys path and official Cloud API fallback

### Background Jobs: Inngest (event-driven)
- Event emission pattern: `conference/travel.updated` → multiple functions react
- Step function model with per-step retries and automatic recovery
- SDK is Apache 2.0 (self-host server via Docker if needed)
- Fits the cascade pattern naturally: emit one event, fan out to accommodation + transport + notification

### Platform Scaffold: ixartz/SaaS-Boilerplate
- Next.js + Clerk + Drizzle + shadcn/ui + multi-tenant
- Kiranism/next-shadcn-dashboard-starter for admin shell
- sadmann7/shadcn-table for all data tables
- Neon DB (serverless Postgres)
- R2 for file storage (tickets, certificates, brand assets)
- Vercel for hosting

---

## UX Decision 1: Dashboard Home Layout

Event selector dropdown at top → metric cards row (total delegates, mails sent, WA sent, check-ins) → quick action cards (Create Event, Import People, View Reports).

Combines Whova's dashboard structure with Retool's admin panel pattern.

---

## UX Decision 2: Red-Flag Cascade System

### Badge Design
- **Red pill/badge** on the row in accommodation/transport tables
- Badge shows **WHAT changed** (e.g., "Flight changed: DEL→BOM, Jan 15→Jan 17")
- Badge shows **WHEN it changed** (e.g., "2h ago" or "Apr 6, 14:30")
- Tooltip on hover expands the full change detail

### Flag States (3-state lifecycle)
| State | Color | Meaning |
|-------|-------|---------|
| **Unreviewed** | 🔴 Red | Change detected, nobody has looked at it yet |
| **Reviewed** | 🟡 Yellow | Someone saw it but hasn't resolved the downstream impact |
| **Resolved** | ✅ Cleared | Downstream records updated, flag dismissed |

### Interactions
- **"Mark as Reviewed"** button on the flag → transitions red → yellow
- **"Mark as Resolved"** button → clears the flag entirely
- Both actions log who reviewed/resolved and when (audit trail)

### Table-Level Controls
- **Filter toggle at top of accommodation/transport tables:** "Show flagged only"
- When active: shows only records with red or yellow flags
- Default: OFF (show all records, flags visible inline)

### Inngest Implementation
```
travel.updated event emitted
  → Inngest function 1: Update transport batch assignment
  → Inngest function 2: Create red flag on accommodation record
      - flag_type: "travel_change"
      - flag_detail: "Flight changed: DEL→BOM, departure Jan 15→Jan 17"
      - flag_created_at: timestamp
      - flag_status: "unreviewed"
  → Inngest function 3: Send WhatsApp/Email to delegate
      - "Your travel change may affect your hotel booking"
```

---

## UX Decision 3: Scientific Program — Mobile vs Desktop

### Attendee View (public schedule page)

**Below 768px (phone) — Card List:**
- Cards grouped by time slot
- Sticky date/hall filter bar at top (horizontal scroll pills)
- Each card shows:
  - Time (e.g., "10:00 – 10:30")
  - Topic/session title
  - Speaker name
  - Role badge pill (Speaker / Chair / Panelist / Moderator)
  - Hall name
- Tap card → expands inline to show full abstract
- Auto-switch via Tailwind breakpoint `md:` — no manual toggle

**Above 768px (iPad/desktop) — Grid:**
- Sessionize-style two-panel: rooms as columns, time slots as rows
- Color-coded by track/session type
- Click session → side panel or modal with full details

### Admin/Coordinator View (dashboard schedule builder)

**Always grid, regardless of screen size.**
- On mobile: horizontal scroll enabled
- Admin needs the full spatial picture (who is where, when, in which hall)
- No card list simplification for admin — they need the grid to spot conflicts and gaps
- Touch-friendly: larger tap targets for drag handles on mobile

### Tailwind Implementation
```
// Attendee schedule page
<div className="block md:hidden">  {/* Card list */}
  <ScheduleCardList />
</div>
<div className="hidden md:block">  {/* Grid */}
  <ScheduleGrid />
</div>

// Admin schedule page — always grid
<div className="overflow-x-auto">
  <ScheduleGrid adminMode={true} />
</div>
```

---

## Summary of All Locked Decisions

| Decision | Choice | Source Pattern |
|----------|--------|---------------|
| WhatsApp integration | Evolution API (Docker, self-hosted) | Deep research report |
| Background jobs | Inngest (event-driven fan-out) | Deep research report |
| Dashboard home | Event selector → metrics → quick actions | Whova + Retool |
| Red-flag cascade | 3-state (red/yellow/cleared) + "Show flagged" filter + what/when detail | AppCraft orange-box adapted |
| Mobile schedule (attendee) | Auto-switch: card list <768px, grid ≥768px | Fourwaves dual-view + Indico mobile |
| Mobile schedule (admin) | Always grid with horizontal scroll | Sessionize (admin needs full picture) |
| Certificate editor | pdfme (WYSIWYG + JSON + bulk gen) | Deep research report |
| Notification engine | Novu (multi-channel) + React Email (templates) | Deep research report |
| CSV import | react-spreadsheet-import (fuzzy auto-mapping) | Deep research report |
| Data tables | sadmann7/shadcn-table (TanStack + Drizzle) | Deep research report |
| Admin shell | Kiranism/next-shadcn-dashboard-starter | Deep research report |
| Audit log | BemiHQ/bemi-io-drizzle (PG WAL/CDC) | Deep research report |
