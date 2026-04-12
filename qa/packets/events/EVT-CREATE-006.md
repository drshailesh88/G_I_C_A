# QA Packet: EVT-CREATE-006

| Field | Value |
|-------|-------|
| PACKET_ID | EVT-CREATE-006 |
| MODULE | events |
| DATE | 2026-04-13 |
| STATUS | READY |
| AMENDED | 2026-04-13 — PM decisions applied, NEEDS_HUMAN_DECISION items resolved |

## Checkpoint

| Field | Value |
|-------|-------|
| ID | EVT-CREATE-006 |
| Description | Create Event is restricted by role — Ops cannot access event creation; Read-only sees disabled form |
| Route(s) | `/events/new` or equivalent (M14), `/events` (M02) |
| Role | Ops (`org:ops`), Read-only (`org:read_only`) |
| Type | Role Enforcement / Negative Test |

## Frozen Spec

### Preconditions
- Dev server running on port 4000
- Two test accounts: one with Ops role, one with Read-only role
- At least one event exists in the database

### Steps — Ops Role
1. Authenticate as Ops user (`org:ops`)
2. Observe the dashboard navigation — look for Events tab
3. If Events tab is visible, navigate to `/events` and look for "Create Event" button
4. Regardless of navigation state, navigate directly to `/events/new`

### Expected Result — Ops
- Ops CANNOT access Events CRUD (PM decision 2026-04-13; AGENTS.md: "Travel, Accommodation, Transport only")
- Ops may use active event context shell only to reach Travel/Accommodation/Transport, but Events management UI (list, create, edit, delete) MUST NOT be accessible
- "Create Event" button MUST NOT be visible to Ops anywhere
- Direct navigation to `/events/new` MUST either redirect to an authorized page or show access denied
- No event creation form is rendered for Ops
- No console errors (access denial is handled gracefully)
- **Server-side bypass check (mandatory)**: Attempt event creation directly via API/server-action using Ops session token (bypassing UI). Server MUST reject with authorization failure (403 or equivalent). This is required even though UI hides the button — UI enforcement alone is insufficient evidence for INV-008.

### Steps — Read-only Role
1. Authenticate as Read-only user (`org:read_only`)
2. Navigate to `/events`
3. Observe the events list page and look for "Create Event" button/CTA
4. Navigate directly to `/events/new`

### Expected Result — Read-only
- Read-only SEES the events list (read access = true per AGENTS.md: "All visible")
- "Create Event" button MUST be disabled (not hidden) per AGENTS.md: "Disable (don't hide) write buttons for Read-only"
- Disabled "Create Event" button MUST be functionally inert — clicking it or submitting via keyboard (Enter/Space) MUST NOT trigger any API call or navigation to the create flow
- If Read-only navigates directly to `/events/new`, the form SHOULD render in read-only/disabled mode with a clear notice that creation is not permitted (PM decision 2026-04-13)
- The Submit/Create button MUST be disabled
- **Server-side bypass check (mandatory)**: Attempt event creation directly via API/server-action using Read-only session token (bypassing disabled UI). Server MUST reject with authorization failure (403 or equivalent). UI disabling alone is insufficient evidence for INV-008.
- No console errors

### Invariants Checked
- [x] INV-008: Role enforcement — Ops hidden (no Events CRUD access), Read-only disabled
- [x] INV-008: Server-side enforcement — API rejects mutations from unauthorized roles

### Forbidden Behavior
- Ops MUST NOT see or access event creation UI
- Ops MUST NOT be able to create events via API
- Read-only MUST NOT be able to submit the create form
- Read-only MUST NOT be able to create events via API
- No error boundary or crash on access denial — denial must be handled gracefully

## Oracle Sources
- `AGENTS.md` — Roles table: Ops = "Travel, Accommodation, Transport only"; Read-only = "All visible, all write actions disabled"
- `qa/oracle/role-matrix.json` — events.ops = all false; events.read_only.write = false; event_context section; ui_rules.read_only_create_forms
- `qa/oracle/product-rules.json` — INV-008: Role enforcement
- PM decision 2026-04-13: Ops event access resolved, Read-only create form behavior resolved

## Evidence Required
- [ ] Screenshot as Ops: dashboard navigation (Events tab hidden or inaccessible)
- [ ] Screenshot as Ops: direct URL `/events/new` response (redirect or access denied)
- [ ] Screenshot as Read-only: events list with disabled Create button
- [ ] Screenshot as Read-only: `/events/new` showing disabled form with notice
- [ ] Console output for both roles (no unhandled errors)
- [ ] **Server-side bypass evidence (Ops)**: Direct API/server-action event creation attempt with Ops session returns authorization failure (403 or equivalent)
- [ ] **Server-side bypass evidence (Read-only)**: Direct API/server-action event creation attempt with Read-only session returns authorization failure (403 or equivalent)
- [ ] **Disabled button inertness evidence**: Clicking or keyboard-submitting the disabled Read-only Create button produces no API call (network trace shows no request)
- [ ] `metadata.json` per role with route, role, action, expected, actual, disposition

## Disposition
- Result: _pending_
- Set by: _pending Codex PM review_
- Timestamp: —
- Reason: —

## Fix Attempts
_None yet_

## Linear Issue
- Issue ID: _to be created_
- Labels: `module:events`, `risk:critical`, `type:role-enforcement`, `invariant:INV-008`

## History
| Timestamp | Agent | Action | Disposition |
|-----------|-------|--------|-------------|
| 2026-04-13 | Claude Code | Created DRAFT packet | — |
| 2026-04-13 | Claude Code | Amendment: resolved NEEDS_HUMAN_DECISION items per PM decisions | — |
| 2026-04-13 | Claude Code | Amendment: Gemini 3.1 Pro critique — added server-side bypass checks for Ops and Read-only, disabled button inertness check | — |
| 2026-04-13 | Codex PM | Frozen after Gemini 3.1 Pro re-critique returned FREEZE_READY | Re-critique command: `cat /tmp/gemini-recritique-prompt.md \| gemini -m gemini-3.1-pro-preview` |
