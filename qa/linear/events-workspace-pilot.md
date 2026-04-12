# Linear Issue Export — Events/Workspace Pilot

> **Status**: READY — all 8 pilot packets frozen by Codex PM after Gemini 3.1 Pro re-critique returned FREEZE_READY.
> **Module**: Events/Workspace (M02, M14, M21)
> **Date**: 2026-04-13
> **Amended**: 2026-04-13 — PM decisions applied, Gemini critique amendments, freeze approved

---

## Issue 1: EVT-LIST-001 — Events list loads for Super Admin

**Title**: `[QA] EVT-LIST-001: Events list loads and displays events for authenticated Super Admin`

**Labels**: `module:events`, `risk:critical`, `type:happy-path`, `pilot`

**Description**:
```
Module: events
Route(s): /events (M02)
Spec file: qa/packets/events/EVT-LIST-001.md
Checkpoint: Events list page renders with event data, IST timestamps, no console errors
Role: Super Admin (org:super_admin)
Event state: At least one event exists

Expected evidence:
- Screenshot of events list
- Console output (clean)
- Network check (no 4xx/5xx)
- metadata.json

Attempt count: 0/2
Failures: —
Fix commits: —
Disposition: READY
```

---

## Issue 2: EVT-LIST-003 — Events list navigation to workspace

**Title**: `[QA] EVT-LIST-003: Clicking event navigates to Event Workspace (M21)`

**Labels**: `module:events`, `risk:critical`, `type:navigation`, `pilot`

**Description**:
```
Module: events
Route(s): /events (M02) -> /events/[id] (M21)
Spec file: qa/packets/events/EVT-LIST-003.md
Checkpoint: Click event card, navigate to M21, workspace loads correct event data
Role: Super Admin (org:super_admin)
Event state: At least one event exists

Expected evidence:
- Screenshot before click (events list)
- Screenshot after click (workspace)
- Console output (no errors during transition)
- Network trace (workspace API includes correct eventId)
- metadata.json

Attempt count: 0/2
Failures: —
Fix commits: —
Disposition: READY
```

---

## Issue 3: EVT-CREATE-001 — Create Event form loads

**Title**: `[QA] EVT-CREATE-001: Create Event form loads with all required fields`

**Labels**: `module:events`, `risk:critical`, `type:happy-path`, `pilot`

**Description**:
```
Module: events
Route(s): /events/new (M14)
Spec file: qa/packets/events/EVT-CREATE-001.md
Checkpoint: Create Event form renders with fields for name, start date, end date, venue name (required) + optional fields, cancel works
Role: Super Admin (org:super_admin)
Event state: N/A (creating new event)

Expected evidence:
- Screenshot of form with all fields visible
- Console output (clean)
- Network check (no failed API calls on load)
- metadata.json

Attempt count: 0/2
Failures: —
Fix commits: —
Disposition: READY
```

---

## Issue 4: EVT-CREATE-002 — Create Event Zod validation

**Title**: `[QA] EVT-CREATE-002: Create Event form validates with Zod — rejects empty, partial, and invalid date range`

**Labels**: `module:events`, `risk:critical`, `type:validation`, `invariant:INV-002`, `pilot`

**Description**:
```
Module: events
Route(s): /events/new (M14)
Spec file: qa/packets/events/EVT-CREATE-002.md
Checkpoint: Empty submission rejected for all 4 required fields (name, start date, end date, venue name), partial submission shows remaining field errors, end-date-before-start-date rejected server-side
Role: Super Admin (org:super_admin)
Event state: N/A

Expected evidence:
- Screenshot of validation errors (empty form — 4 field errors)
- Screenshot of partial validation errors
- Screenshot of end-date-before-start-date rejection
- Server-side bypass: direct API call with invalid payload returns 400/Zod errors
- XSS/SQLi: payloads rejected or inert
- Console output (no unhandled errors)
- Network check (no API call on invalid, AND 400 with Zod errors on bypass)
- metadata.json

Attempt count: 0/2
Failures: —
Fix commits: —
Disposition: READY

PM DECISIONS APPLIED:
- Required fields: event name, start date, end date, venue name
- End-before-start: rejected server-side before persistence
```

---

## Issue 5: EVT-CREATE-006 — Create Event role enforcement (Ops + Read-only)

**Title**: `[QA] EVT-CREATE-006: Ops cannot access event creation; Read-only sees disabled form`

**Labels**: `module:events`, `risk:critical`, `type:role-enforcement`, `invariant:INV-008`, `pilot`

**Description**:
```
Module: events
Route(s): /events (M02), /events/new (M14)
Spec file: qa/packets/events/EVT-CREATE-006.md
Checkpoint: Ops has no access to Events CRUD — Create button hidden, direct URL blocked. Read-only sees disabled Create button; direct URL shows disabled form with notice. Server-side blocks mutations from both.
Role: Ops (org:ops), Read-only (org:read_only)
Event state: At least one event exists

Expected evidence:
- Screenshot as Ops (Events CRUD inaccessible)
- Screenshot as Ops direct URL /events/new (redirect or denied)
- Screenshot as Read-only (disabled Create button)
- Screenshot as Read-only /events/new (disabled form with notice)
- Server-side bypass: direct API creation attempt as Ops returns 403
- Server-side bypass: direct API creation attempt as Read-only returns 403
- Disabled button inertness: click/keyboard produces no API call
- Console output per role
- metadata.json per role

Attempt count: 0/2
Failures: —
Fix commits: —
Disposition: READY

PM DECISIONS APPLIED:
- Ops: no Events CRUD access (AGENTS.md + PM 2026-04-13)
- Read-only: form rendered in disabled mode with notice; server blocks mutations
```

---

## Issue 6: EVT-WS-001 — Event Workspace loads with module navigation

**Title**: `[QA] EVT-WS-001: Event Workspace loads with event data and module navigation`

**Labels**: `module:events`, `risk:critical`, `type:happy-path`, `pilot`

**Description**:
```
Module: events
Route(s): /events/[id] (M21)
Spec file: qa/packets/events/EVT-WS-001.md
Checkpoint: Workspace renders event name, module nav links, timestamps in IST
Role: Super Admin (org:super_admin)
Event state: At least one event exists, selected from M02

Expected evidence:
- Screenshot of full workspace
- Console output (clean)
- Network check (API calls include eventId)
- metadata.json

Attempt count: 0/2
Failures: —
Fix commits: —
Disposition: READY
```

---

## Issue 7: EVT-WS-003 — Event Workspace eventId isolation

**Title**: `[QA] EVT-WS-003: Switching events shows correct event data, no cross-event leakage`

**Labels**: `module:events`, `risk:critical`, `type:invariant`, `invariant:INV-001`, `pilot`

**Description**:
```
Module: events
Route(s): /events/[id] (M21)
Spec file: qa/packets/events/EVT-WS-003.md
Checkpoint: Navigate Event A workspace, switch to Event B, verify data isolation, back-navigate and verify again
Role: Super Admin (org:super_admin)
Event state: At least TWO events with distinguishable data

Expected evidence:
- Screenshot of Event A workspace
- Screenshot of Event B workspace
- Screenshot after back-navigation to Event A
- Network trace showing correct eventId per workspace
- Console output (no errors)
- metadata.json

Attempt count: 0/2
Failures: —
Fix commits: —
Disposition: READY
```

---

## Issue 8: EVT-WS-006 — Event Workspace role enforcement (Ops + Read-only)

**Title**: `[QA] EVT-WS-006: Ops sees only Travel/Accommodation/Transport in workspace; Read-only all modules disabled`

**Labels**: `module:events`, `risk:critical`, `type:role-enforcement`, `invariant:INV-008`, `pilot`

**Description**:
```
Module: events
Route(s): /events/[id] (M21)
Spec file: qa/packets/events/EVT-WS-006.md
Checkpoint: Ops accesses event context shell with only Travel/Accommodation/Transport visible (Option B, PM frozen). Events CRUD hidden. Read-only sees all modules, write disabled.
Role: Ops (org:ops), Read-only (org:read_only)
Event state: At least one event exists

Expected evidence:
- Screenshot as Ops (workspace with only 3 module links)
- Screenshot as Ops direct URL to hidden module (redirect/denied)
- Server-side bypass: direct API request to unauthorized module as Ops returns 403
- Screenshot as Read-only (all modules, write disabled)
- Screenshot as Read-only module page (disabled write buttons)
- Server-side bypass: direct mutation API attempt as Read-only returns 403
- Console output per role
- metadata.json per role

Attempt count: 0/2
Failures: —
Fix commits: —
Disposition: READY

PM DECISIONS APPLIED:
- Option B frozen: Ops accesses event context shell, sees only Travel/Accommodation/Transport
- Events CRUD (edit/delete event) hidden from Ops
- Read-only: all visible, write disabled
```

---

## Pilot Summary

| Packet ID | Type | Role(s) | Status | PM Decisions Applied |
|-----------|------|---------|--------|---------------------|
| EVT-LIST-001 | Happy Path | Super Admin | READY | Gemini critique: 5s threshold |
| EVT-LIST-003 | Navigation | Super Admin | READY | Gemini critique: 5s timeout |
| EVT-CREATE-001 | Happy Path | Super Admin | READY | — |
| EVT-CREATE-002 | Validation | Super Admin | READY | Required fields + date validation + server-side bypass + XSS/SQLi |
| EVT-CREATE-006 | Role Enforcement | Ops, Read-only | READY | Ops access + Read-only form behavior + server-side bypass |
| EVT-WS-001 | Happy Path | Super Admin | READY | — |
| EVT-WS-003 | Invariant (eventId) | Super Admin | READY | Gemini critique: precise eventId wording |
| EVT-WS-006 | Role Enforcement | Ops, Read-only | READY | Option B frozen + Read-only behavior + server-side bypass |

**Freeze gate**: Gemini 3.1 Pro re-critique returned **FREEZE_READY** on 2026-04-13.
**Re-critique command**: `cat /tmp/gemini-recritique-prompt.md | gemini -m gemini-3.1-pro-preview`
**Model**: gemini-3.1-pro-preview. **Fallback used**: false.

**Phase 0B file count**: 23 files (8 oracle + 1 loop state + 8 pilot packets + 3 DRAFT-FUTURE packets + 1 linear export + 2 prompts)
**Resolved PM decisions**: 4 (Ops event access, Read-only create forms, required fields, date validation)
**Remaining NEEDS_HUMAN_DECISION (not blocking pilot freeze)**: notification duplicate response, phone default-region (in oracle files, outside events scope)
**Remaining NEEDS_HUMAN_DECISION (in role-matrix, outside pilot scope)**: Event Coordinator access to People/QR/Reports/Branding/Settings, Ops access to Reports
**Next step**: Evaluator (Gemini) runs frozen specs against live app; fixer (Claude Code) addresses failures.
