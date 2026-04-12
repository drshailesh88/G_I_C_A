# QA Packet: EVT-WS-006

| Field | Value |
|-------|-------|
| PACKET_ID | EVT-WS-006 |
| MODULE | events |
| DATE | 2026-04-13 |
| STATUS | READY |
| AMENDED | 2026-04-13 — PM decisions applied, Option B frozen, NEEDS_HUMAN_DECISION items resolved |

## Checkpoint

| Field | Value |
|-------|-------|
| ID | EVT-WS-006 |
| Description | Event Workspace module navigation restricted by role — Ops sees only Travel/Accommodation/Transport via event context shell; Read-only sees all modules with write actions disabled |
| Route(s) | `/events/[id]` (M21) |
| Role | Ops (`org:ops`), Read-only (`org:read_only`) |
| Type | Role Enforcement / Negative Test |

## Spec (DRAFT — NOT FROZEN until Codex PM approves)

### Preconditions
- Dev server running on port 4000
- Two test accounts: one with Ops role, one with Read-only role
- At least one event exists in the database

### Steps — Ops Role
1. Authenticate as Ops user (`org:ops`)
2. Navigate to the event workspace/context shell for a known event
3. Observe which module links/cards are visible in the workspace

### Expected Result — Ops (PM decision: Option B frozen 2026-04-13)
- Ops MAY access the event workspace shell (active event context) — this is NOT Events CRUD
- Ops sees ONLY Travel, Accommodation, Transport module links in the workspace
- All other module links (Program, Registration, Communications, Certificates, QR, Reports, Branding, Settings, Events CRUD) MUST be hidden
- Events CRUD actions (edit event, delete event) MUST NOT be visible or accessible to Ops
- **Direct URL check (mandatory)**: Navigate directly to an unauthorized module route (e.g., `/events/[id]/program` or `/events/[id]/registration`). MUST redirect to an authorized page or show access denied. This must be tested, not just assumed from hidden links.
- **Server-side API/action check (mandatory)**: Attempt a server-action or API request for an unauthorized module (e.g., fetch program data, create registration) using Ops session. Server MUST reject with authorization failure (403 or equivalent). Hidden UI links alone are insufficient evidence for INV-008.
- No console errors

### Steps — Read-only Role
1. Authenticate as Read-only user (`org:read_only`)
2. Navigate to an event workspace (`/events/[id]`)
3. Observe which module links are visible
4. Click any module link (e.g., Program)
5. Verify write actions are disabled in the destination module

### Expected Result — Read-only
- Read-only sees the event workspace with ALL module navigation links visible (per AGENTS.md: "All visible")
- All write actions (Create, Edit, Delete buttons) within each module are DISABLED (not hidden)
- Clicking a module link navigates to that module's view in read-only mode
- **Server-side mutation bypass check (mandatory)**: Attempt a mutation (e.g., create/edit/delete) directly via API/server-action using Read-only session token (bypassing disabled UI buttons). Server MUST reject with authorization failure (403 or equivalent). Disabled UI alone is insufficient evidence for INV-008.
- No console errors

### Invariants Checked
- [x] INV-008: Role enforcement — Ops sees only permitted modules (hidden for no access), Read-only sees all with write disabled
- [x] INV-008: Server-side enforcement — direct URL to hidden module returns redirect/denied for Ops; mutations rejected for Read-only

### Forbidden Behavior
- Ops MUST NOT see module links for Program, Registration, Communications, Certificates, QR, Reports, Branding, or Settings
- Ops MUST NOT see Events CRUD actions (edit/delete event) in the workspace
- Ops MUST NOT be able to navigate to unauthorized modules via direct URL
- Read-only MUST NOT have enabled write/create/edit/delete buttons
- Read-only MUST NOT be able to submit mutations via API

## Oracle Sources
- `AGENTS.md` — Roles table: Ops = "Travel, Accommodation, Transport only"; Read-only = "All visible, all write actions disabled"
- `qa/oracle/role-matrix.json` — Full access_matrix per role; event_context section (EC-001 through EC-004); ui_rules
- `qa/oracle/product-rules.json` — INV-008: Role enforcement
- `qa/oracle/navigation-graph.json` — event_workspace_hub accessible modules
- PM decision 2026-04-13: Option B frozen — Ops may access event context shell with limited module links; Events CRUD hidden

## Evidence Required
- [ ] Screenshot as Ops: event workspace showing ONLY Travel, Accommodation, Transport links
- [ ] Screenshot as Ops: direct URL to unauthorized module (e.g., `/events/[id]/program`) showing redirect or denied
- [ ] **Server-side bypass evidence (Ops)**: Direct API/server-action request to unauthorized module with Ops session returns authorization failure (403 or equivalent)
- [ ] Screenshot as Read-only: event workspace with ALL module links visible
- [ ] Screenshot as Read-only: a module page (e.g., Program) with write buttons disabled
- [ ] **Server-side bypass evidence (Read-only)**: Direct mutation API/server-action attempt with Read-only session returns authorization failure (403 or equivalent)
- [ ] Console output for both roles (no unhandled errors)
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
| 2026-04-13 | Claude Code | Amendment: Option B frozen per PM decision, NEEDS_HUMAN_DECISION items resolved | — |
| 2026-04-13 | Claude Code | Amendment: Gemini 3.1 Pro critique — added mandatory server-side bypass checks for Ops (direct URL + API) and Read-only (mutation API) | — |
| 2026-04-13 | Codex PM | Frozen after Gemini 3.1 Pro re-critique returned FREEZE_READY | Re-critique command: `cat /tmp/gemini-recritique-prompt.md \| gemini -m gemini-3.1-pro-preview` |
