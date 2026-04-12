# Pilot Module Plan

> First module to run through the full QA loop as proof-of-concept.
> Created: 2026-04-13

---

## Selected Module: Events/Workspace

### Why Events/Workspace

1. **Hub role** — M21 Event Workspace connects to sessions, schedule, registrations, certificates, QR, templates, triggers
2. **eventId scoping** — Event CRUD is where eventId filtering starts; if broken here, everything downstream is compromised
3. **Role diversity** — All 4 roles interact with events differently
4. **CRUD coverage** — Create, read, update, delete events
5. **Moderate complexity** — Complex enough to test the loop, simple enough to not get stuck on external services
6. **No external service dependency** — Doesn't require WhatsApp, certificate PDF, or notification mocking
7. **Clear wireframes** — M02, M14, M21 are well-defined in PROJECT_HANDOFF.md

### Why NOT Registration First

Registration involves public forms, cascade triggers (registration.created), QR assignment, and confirmation emails. It would require notification mocking and more setup. Events/Workspace is a cleaner first test of the loop mechanics.

---

## Relevant Screens

| Screen ID | Name | Route |
|-----------|------|-------|
| M02 | Events List | `/dashboard/events` |
| M14 | Create Event | `/dashboard/events/new` |
| M21 | Event Workspace | `/dashboard/events/[eventId]` |

---

## Checkpoints (Draft — to be frozen by Codex)

### Events List (M02)

| ID | Checkpoint | Role | Type |
|----|-----------|------|------|
| EVT-LIST-001 | Events list loads with event cards | Super Admin | Happy path |
| EVT-LIST-002 | Empty state shown when no events exist | Super Admin | Empty state |
| EVT-LIST-003 | "+ New" button visible and functional | Super Admin | Navigation |
| EVT-LIST-004 | Ops cannot access Events list CRUD (create/edit/delete); whether Ops sees the dashboard shell/event-context selector is a PM decision to verify | Ops | Role |
| EVT-LIST-005 | Read-only user sees events, create button disabled | Read-only | Role |
| EVT-LIST-006 | No cross-event data leakage (only user's org events) | Super Admin | Invariant |

### Create Event (M14)

| ID | Checkpoint | Role | Type |
|----|-----------|------|------|
| EVT-CREATE-001 | Create event form loads with required fields | Super Admin | Happy path |
| EVT-CREATE-002 | Zod validation rejects missing required fields | Super Admin | Validation |
| EVT-CREATE-003 | Successful creation redirects to workspace (M21) | Super Admin | Happy path |
| EVT-CREATE-004 | Created event has correct eventId in database | Super Admin | Invariant |
| EVT-CREATE-005 | Event Coordinator can create events | Event Coordinator | Role |
| EVT-CREATE-006 | Ops is blocked from create event route (Ops has Travel/Accommodation/Transport only) | Ops | Role |
| EVT-CREATE-007 | Read-only cannot access create event route | Read-only | Role |

### Event Workspace (M21)

| ID | Checkpoint | Role | Type |
|----|-----------|------|------|
| EVT-WS-001 | Workspace loads with event details | Super Admin | Happy path |
| EVT-WS-002 | Navigation links present: Sessions, Schedule, Registrations, etc. | Super Admin | Navigation |
| EVT-WS-003 | Workspace shows only data for THIS event (eventId filtering) | Super Admin | Invariant |
| EVT-WS-004 | Ops role is blocked from Events workspace CRUD; Ops access to the dashboard shell event-context is a PM decision to verify (see NEEDS_HUMAN_DECISION) | Ops | Role |
| EVT-WS-005 | Read-only sees all links but write actions disabled | Read-only | Role |
| EVT-WS-006 | Invalid eventId in URL returns 404 or redirect | Super Admin | Error handling |
| EVT-WS-007 | Console has no runtime errors on workspace load | Super Admin | Quality |

---

## Evidence Required Per Checkpoint

Each checkpoint needs:
- Screenshot of the tested state
- Console output (must be error-free for quality checks)
- Network trace showing API calls with correct eventId
- Test command output (if unit/API test exists)

---

## Setup Requirements

Before running the pilot:
1. Dev server running on port 4000
2. At least one event exists in the database
3. Clerk users configured for each role (Super Admin, Event Coordinator, Ops, Read-only)
4. agent-browser verified working against localhost:4000

---

## Success Criteria for the Pilot

The pilot is successful if:
- [ ] The loop completes all checkpoints (PASS, FAIL, or STUCK)
- [ ] Evidence artifacts are captured for every checkpoint
- [ ] Linear issues reflect accurate state
- [ ] At least one FAIL -> fix -> re-verify cycle completes
- [ ] No agent cheating detected (fixer doesn't self-grade)
- [ ] The loop doesn't hang or infinite-loop

If the pilot fails due to loop mechanics (not app bugs), fix the loop before scaling.

---

## Estimated Packet Count

~20 checkpoints for the events/workspace pilot. At 2 max attempts per failed checkpoint, worst case is ~60 loop iterations if everything fails twice.

Realistic estimate: 25-35 iterations (some pass first try, some need one fix).
