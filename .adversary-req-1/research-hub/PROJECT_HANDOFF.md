# GEM India — Project Handoff Document

> **Read this first in any new context window.**
> This is the single source of truth for the entire project state.
> Last updated: 2026-04-06

---

## What Is This Project?

A mobile-first web app for managing Indian medical/academic conferences end-to-end. Built with Next.js on Vercel. Client requirements in `/Users/shaileshsingh/Downloads/document_pdf.pdf`.

## Project Structure

```
/Users/shaileshsingh/G_I_C_A/
├── research-hub/
│   ├── PROJECT_HANDOFF.md          ← YOU ARE HERE
│   ├── DESIGN_DECISIONS.md         ← Locked tech + UX decisions
│   ├── BACKEND_ARCHITECTURE_MAP.md ← Module → library → npm package
│   ├── REPO_BUCKET_MAP.md          ← Direct-use vs pattern-only vs custom-build repo map
│   ├── DECISION_LEDGER.md          ← Locked / partially locked / missing by frontend, wiring, backend
│   ├── DB_DECISIONS.md             ← Owner-spec-aligned database decisions and phase gates
│   ├── COMPLETE_GAP_ANALYSIS.md    ← Every PDF requirement → solution
│   ├── USER_FLOWS.md               ← 15 Mermaid flow diagrams (partially stale)
│   ├── CLICK_MAP_AND_TRACEABILITY.md ← Codex button→screen audit
│   ├── ADVERSARIAL_REVIEW.md       ← Codex adversarial findings
│   ├── FINAL_SYNTHESIS.md          ← UX research synthesis (14 platforms)
│   ├── DEFERRED_TICKETS.md         ← Items to design before their module ships
│   ├── wireframes/                 ← 48 screens (PNGs + PDF)
│   ├── ux-teardowns/               ← 14 platform research sessions
│   ├── deep-research-*.md          ← Open-source library surveys
│   └── worker-*/                   ← Indico, Pretalx, Frab, Fourwaves deep dives
```

---

## 48 Wireframe Screens — Complete Inventory

### Screen ID → Filename → Purpose

| Screen ID | Filename | Screen Name | Entry Point |
|-----------|----------|-------------|-------------|
| **AUTH** | | | |
| M16 | `DkS7G.png` | Login | App launch |
| M17 | `a62TV.png` | Forgot Password | M16 "Forgot password?" |
| M63 | `JiBMN.png` | Check Email Sent | M17 "Send Reset Link" |
| M59 | `mQxoB.png` | Reset Password | Email link |
| **MAIN TABS** | | | |
| M01 | `f3KPo.png` | Dashboard Home | Login success / HOME tab |
| M02 | `fCOC4.png` | Events List | EVENTS tab |
| M03 | `G2rDe.png` | People List | PEOPLE tab |
| M04 | `oRvH5.png` | Scientific Program (Attendee) | PROGRAM tab |
| M08 | `w8SrX.png` | More Menu | MORE tab |
| **EVENT MANAGEMENT** | | | |
| M14 | `1isf8.png` | Create Event | M01 "Create Event" / M02 "+ New" |
| M21 | `ZjqBg.png` | **Event Workspace (HUB)** | M02 event card tap / M14 Save |
| M22 | `Gaavt.png` | Session Manager | M21 "Sessions" |
| M23 | `CpuHI.png` | Add/Edit Session Form | M22 "+ Add" / session card tap |
| M30 | `fooPM.png` | Admin Schedule Grid | M21 "Schedule Grid" |
| M51 | `ZpAv1.png` | Event Field Builder | M21 "Event Fields" |
| M52 | `VHcOm.png` | Version History / Program Changes | M21 "Changes" |
| **PEOPLE** | | | |
| M09 | `waUUL.png` | Person Detail | M03 person card tap |
| M32 | `TCWwB.png` | CSV Import (Column Mapping) | M03 "Import" / M01 "Import People" |
| M62 | `IitpV.png` | Import Success | M32 "Import 86 People" |
| M57 | `9GInC.png` | Merge Duplicates | M62 "Review 1 Possible Duplicate" |
| **REGISTRATION** | | | |
| M25 | `qpTp8.png` | Event Landing Page (Public) | Public URL |
| M07 | `3IR5p.png` | Registration Form | M25 "Register Now" |
| M28 | `P5jNY.png` | Registration Success | M07 "Register" |
| M29 | `JIykr.png` | Registration Admin List | M21 "Registrations" |
| M26 | `WVLsf.png` | Faculty Invitation | M21 "Invite Faculty" |
| M55 | `jlDVA.png` | Faculty Confirm (Public) | Invitation email link |
| M60 | `r9Yyd.png` | Faculty Confirmed Success | M55 "Accept & Confirm" |
| **COMMUNICATIONS** | | | |
| M13 | `1fB7u.png` | Communications (Templates + Log) | M08 "Email"/"WhatsApp" / M21 "Templates" |
| M39 | `FGhXX.png` | Template Editor | M13 template card tap |
| M53 | `LG8tQ.png` | Automation Triggers | M21 "Triggers" |
| **LOGISTICS** | | | |
| M35 | `RSElF.png` | Travel Records List | M08 "Travel" |
| M06 | `t7kqa.png` | Travel Info Form | M35 "+ Add" / record tap |
| M05 | `92NPy.png` | Accommodation + Red Flags | M08 "Accommodation" |
| M36 | `IMpCm.png` | Accommodation Form | M05 "+ Add" / record tap |
| M10 | `H25vw.png` | Transport & Arrival Planning | M08 "Transport" |
| M38 | `5FfEr.png` | Vehicle Assignment Kanban | M10 city card tap |
| **CERTIFICATES** | | | |
| M12 | `Y3HLt.png` | Certificate Generation | M08 "Certificates" / M21 "Certificates" |
| M56 | `nZ08H.png` | Certificate Template Editor | M12 template card tap |
| M61 | `rPVBY.png` | Certificate Progress + Done | M12 "Generate & Send" |
| **QR & ATTENDANCE** | | | |
| M11 | `wLTrF.png` | QR Scanner (PWA) | M08 "QR Scanner" / M21 "QR Check-in" |
| M44 | `9HWwn.png` | Scan Success | M11 valid scan |
| M45 | `SCufz.png` | Scan Duplicate | M11 duplicate scan |
| M46 | `WoR84.png` | Manual Check-in Search | M11 "Manual Check-in" |
| M58 | `YBvs4.png` | Attendance Report | M11 stat cards |
| **SETTINGS & REPORTS** | | | |
| M15 | `xFRfv.png` | Branding & Letterheads | M08 "Branding" |
| M19 | `sbLsV.png` | Team & Roles | M08 "Settings & Team" |
| M47 | `i8T1g.png` | Reports & Exports | M08 "Reports" / M01 "Reports" |
| M54 | `IWTdp.png` | More Menu (Ops Role Variant) | Login as Ops role |

---

## Navigation Graph (How Screens Connect)

### Bottom Tab Bar (persistent on main screens)
```
HOME (M01) ←→ EVENTS (M02) ←→ PEOPLE (M03) ←→ PROGRAM (M04) ←→ MORE (M08)
```

### M21 Event Workspace is the HUB
```
M02 Events List
  └→ tap event card → M21 Event Workspace
      ├→ Sessions → M22 → M23 (add/edit)
      ├→ Schedule Grid → M30
      ├→ Event Fields → M51
      ├→ Changes → M52
      ├→ Registrations → M29
      ├→ Invite Faculty → M26 → (email) → M55 → M60
      ├→ Templates → M13 → M39 (edit)
      ├→ Triggers → M53
      ├→ Certificates → M12 → M56 (edit) → M61 (done)
      └→ QR Check-in → M11 → M44/M45/M46 → M58
```

### M14 Create Event → M21
```
M01 "Create Event" → M14 → Save → M21 Event Workspace
M02 "+ New" → M14 → Save → M21 Event Workspace
```

### M08 More Menu routes
```
M08 More Menu
  ├→ Travel → M35 → M06 (form)
  ├→ Accommodation → M05 → M36 (form)
  ├→ Transport → M10 → M38 (kanban)
  ├→ Email/WhatsApp → M13 → M39
  ├→ Certificates → M12 → M56 → M61
  ├→ QR Scanner → M11
  ├→ Reports → M47
  ├→ Branding → M15
  └→ Settings & Team → M19
```

### Auth Flow
```
M16 Login → M01 Dashboard
M16 "Forgot?" → M17 → "Send" → M63 Check Email → (email) → M59 Reset → M16
M16 "Google" → OAuth → M01
```

### Public Flows (no auth)
```
Public URL → M25 Event Landing → "Register" → M07 → M28 Success
Email invite → M55 Faculty Confirm → "Accept" → M60 Confirmed
Email reset → M59 Reset Password → M16 Login
```

### Cascade System (cross-module)
```
Travel record changed (M06 save)
  → Inngest: conference/travel.updated
    → Function 1: Red flag on M05 Accommodation (flag_status: unreviewed)
    → Function 2: Recalculate M10 Transport batches
    → Function 3: Send change notification to delegate (Email + WA)
```

---

## Tech Stack (Locked)

| Layer | Choice | Package |
|-------|--------|---------|
| Framework | Next.js 16 | `next` |
| Hosting | Vercel | `git push` → auto-deploy |
| Auth | Clerk | `@clerk/nextjs` |
| Database | Neon (serverless PG) | `@neondatabase/serverless` |
| ORM | Drizzle | `drizzle-orm` |
| UI | shadcn/ui + Tailwind | `tailwindcss` |
| Data Tables | sadmann7/shadcn-table | `tablecn` |
| WhatsApp | Evolution API | Docker sidecar (DigitalOcean $6/mo) |
| Background Jobs | Inngest | `inngest` |
| Email | Resend + React Email | `resend`, `react-email` |
| Certificates | pdfme | `@pdfme/ui`, `@pdfme/generator` |
| CSV Import | react-spreadsheet-import | `react-spreadsheet-import` |
| QR Scanner | yudiel/react-qr-scanner | `@yudiel/react-qr-scanner` |
| QR Generate | qrcode.react | `qrcode.react` |
| File Storage | Cloudflare R2 | `@aws-sdk/client-s3` |
| **Cache + Locks** | **Upstash Redis** | `@upstash/redis`, `@upstash/ratelimit` |
| **Error Monitoring** | **Sentry** | `@sentry/nextjs` |
| **Feature Flags** | **Upstash Redis** | `@upstash/redis` |
| **Phone Normalization** | **libphonenumber-js** | `libphonenumber-js` |
| **Timezone** | **date-fns-tz** | `date-fns-tz` |
| Audit Log | Bemi | `@bemi-db/drizzle` |
| **Health Monitoring** | **Openstatus** | External (free) |

Full details: `research-hub/BACKEND_ARCHITECTURE_MAP.md`

---

## Design Tokens (Paytm-inspired)

| Token | Value | Usage |
|-------|-------|-------|
| `--primary` | `#00325B` | Deep blue — buttons, sidebar, headers |
| `--accent` | `#00B9F5` | Teal — active states, links, highlights |
| `--background` | `#F8FAFCFF` | Light gray page background |
| `--card` | `#FFFFFF` | Card/surface background |
| `--foreground` | `#0F172A` | Primary text |
| `--muted-foreground` | `#64748B` | Secondary text |
| `--flag-red` / `--flag-red-text` | `#FEE2E2` / `#DC2626` | Unreviewed change flag |
| `--flag-yellow` / `--flag-yellow-text` | `#FEF3C7` / `#D97706` | Reviewed flag |
| `--flag-green` / `--flag-green-text` | `#D1FAE5` / `#059669` | Success / resolved |
| Font | Inter | All UI text |
| Font (mono) | Geist Mono | Code, IDs, variables |

---

## 4 Roles

| Role | Key | Sees | Can't See |
|------|-----|------|-----------|
| Super Admin | `org:super_admin` | Everything | — |
| Event Coordinator | `org:event_coordinator` | Events, Program, Registration, Comms, Certs | Settings, limited user admin |
| Ops | `org:ops` | Travel, Accommodation, Transport only | Comms, Certs, Branding, Settings |
| Read-only | `org:read_only` | Everything visible, write actions disabled/grayed | — |

---

## Build Order (recommended)

### Phase 1: Foundation
1. Scaffold (ixartz/SaaS-Boilerplate fork)
2. Auth (Clerk — M16, M17, M63, M59)
3. Dashboard shell (M01 + bottom tab bar)
4. Event CRUD (M02, M14, M21 workspace)

### Phase 2: Core Data
5. People (M03, M09, M32 import, M62 success, M57 merge)
6. Registration (M25 landing, M07 form, M28 success, M29 admin)
7. Scientific Program (M22 sessions, M23 form, M30 grid, M04 attendee view)

### Phase 3: Operations
8. Travel (M35, M06)
9. Accommodation (M05 with flags, M36)
10. Transport (M10, M38 kanban)
11. Cascade system (Inngest events + red flags)

### Phase 4: Communications
12. Templates (M13, M39 editor)
13. Triggers (M53)
14. WhatsApp integration (Evolution API)

### Phase 5: Certificates & QR
15. Certificates (M12, M56 editor, M61 progress)
16. QR Scanner PWA (M11, M44, M45, M46, M58)

### Phase 6: Polish
17. Branding (M15)
18. Team & Roles (M19, M54 Ops variant)
19. Reports (M47)
20. Faculty invitation flow (M26, M55, M60)
21. Version history (M52)
22. Event Fields builder (M51)

---

## Deferred Items (design before their module ships)

| Item | What's Needed | Design Before |
|------|--------------|---------------|
| Preview Revised Emails | Modal on M52 showing sample email | Phase 2 Sci Program |
| Conflict Fix action | M30 "Fix" → navigate to conflicting session edit | Phase 2 Sci Program |
| Add Person form | Slide-up sheet from M03 | Phase 2 People |
| Invite Member modal | Bottom sheet on M19 | Phase 6 Team |
| Speaker Profile | Expand/detail on M25 | Phase 2 Registration |
| View All Issued Certificates | List view from M61 | Phase 5 Certificates |

---

## Key Documents to Read

1. **This file** — start here
2. `DESIGN_DECISIONS.md` — what's locked and why
3. `BACKEND_ARCHITECTURE_MAP.md` — every npm package per module
4. `ADVERSARIAL_REVIEW.md` — Codex findings (most now resolved)
5. `CLICK_MAP_AND_TRACEABILITY.md` — button-to-screen audit
6. `wireframes/GEM-India-Final-48-Screens-v4.pdf` — all screens in one PDF
