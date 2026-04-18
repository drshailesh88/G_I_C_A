# Ralph Completeness Agent — GEM India Conference Management Platform

<!--
Runs under COMPLETENESS_MODEL (default claude-opus-4-6; override with env var).
Job: audit the FULL product PRD (across ALL 6 phases) and detect features the
whole system is missing, appending them to ralph/prd.json.

DO NOT CONFUSE ralph/prd.json WITH THE PRODUCT PRD. ralph/prd.json is a
working queue for one phase at a time. The authoritative OUGHT for this
audit is `.planning/prd.md` spanning all 6 phases — NOT ralph/prd.json.
-->

You are a COMPLETENESS AUDITOR for GEM India — a Next.js 16 conference
management platform (Clerk + Drizzle + Neon + shadcn/ui + Inngest).

## Critical scope declaration — read this twice

**The authoritative OUGHT is `.planning/prd.md`, covering all six build phases:**

- Phase 1: Foundation
- Phase 2: Core Data
- Phase 3: Operations (travel, accommodation, transport)
- Phase 4: Communications (email + WhatsApp)
- Phase 5: Certificates & QR
- Phase 6: Polish

**The authoritative IS is the actual running codebase** — `src/app/**`,
`src/lib/**`, `src/components/**` — as observed through the `feature-census`
skill's 3-layer extraction.

**`ralph/prd.json` is NEITHER of these.** It is a *working queue* for one
phase at a time. Currently it contains 42 Phase-5 hardening tickets only
(cert-code-*, cert-api-*, etc.). It does NOT represent the full product.

Your job is to diff OUGHT against IS across ALL 6 phases, then APPEND any
missing-from-IS features into `ralph/prd.json` as new story entries.

## Your job is NOT

- ❌ to check whether prd.json's 42 hardening entries are complete (a
  prior Opus run did exactly this and incorrectly emitted COMPLETE; that
  reasoning is explicitly forbidden here)
- ❌ to conclude "OUGHT ⊆ IS for hardening scope" — there is no such scope
  for this loop
- ❌ to narrow to a single phase because that's what prd.json currently
  reflects
- ❌ to skip research-hub/ or the 48 wireframes because "deferred items
  are out of scope" — deferred items ARE in scope (see DEFERRED_TICKETS
  handling below)

Your job IS:

- ✅ Read `.planning/prd.md` end-to-end (28KB — it's not that big)
- ✅ Read `.planning/REQUIREMENTS.md` (the GSD-format acceptance criteria)
- ✅ Read `research-hub/PROJECT_HANDOFF.md` (48 wireframes + navigation
  graph — each M## module is a feature or group of features)
- ✅ Read `research-hub/CLICK_MAP_AND_TRACEABILITY.md` (every click path;
  a click path without a matching prd.json story = missing feature)
- ✅ Read `research-hub/BACKEND_ARCHITECTURE_MAP.md` (module ↔ library
  map — every listed module should have at least one story or already
  be in the running code)
- ✅ Read `research-hub/DEFERRED_TICKETS.md` (treat as SCOPED-IN; see below)
- ✅ Read `research-hub/COMPLETE_GAP_ANALYSIS.md` (prior manual analysis —
  cross-check each flagged gap is now either in prd.json or in src/)
- ✅ Invoke the `feature-census` skill to produce a fresh IS list for
  every major module (events, people, program, sessions, travel,
  accommodation, transport, communications, certificates, QR, attendance,
  reports, branding, settings)
- ✅ Diff OUGHT vs IS per phase — even if some phases have 0 gaps, you
  MUST produce a per-phase line in the report
- ✅ Append every genuine gap to `ralph/prd.json` as a full story entry

## Handling DEFERRED_TICKETS.md

`research-hub/DEFERRED_TICKETS.md` has two sections:

1. **Design items (D1-D9)** — UI components with CTAs that exist but no
   target state/sheet/modal. These ARE in scope. If D3 ("Add Person form
   slide-up sheet") is not in prd.json and is not in src/, append it as
   a new story with `"blocked_on_spec": true` and describe what the
   wireframe work needs.

2. **Hardening items (H1-H7)** — production hardening from Codex review.
   H1-H4 are marked FIXED (verify they truly exist in src/, otherwise
   append as missing). H5-H7 are OPEN — append each as a story unless
   already in prd.json.

"Deferred" in this file means "tracked, needs design-first, build after
design". It does NOT mean "out of scope for the product". Your job is to
surface them as missing features so they enter the build queue (with
`blocked_on_spec: true` where appropriate).

## Workflow

### 1. Orient

1. Read the `## Completeness Patterns` section of
   `ralph/completeness-progress.txt`. Prior iteration notes (if any).
2. Read `CLAUDE.md` for non-negotiable project rules.
3. Skim the last 5 COMPLETENESS commits (may be none).

### 2. Extract OUGHT — the full product PRD (all 6 phases)

Read every file in the "Your job IS" list above. For each phase, build a
running list of promised features with:
- Feature name
- Source file + anchor (e.g. `.planning/prd.md §Phase 3 — Travel`)
- Wireframe reference if any (e.g. `research-hub/PROJECT_HANDOFF.md M35`)

### 3. Extract IS — the running codebase

Invoke `feature-census` for every major module listed in the
BACKEND_ARCHITECTURE_MAP. The skill produces:
- Layer 1: code extraction (handlers, state, API routes, UI elements)
- Layer 2: library enrichment
- Layer 3: runtime crawl (Playwright accessibility tree)

Output lives at `feature-census/<module>/CENSUS.md`. If a prior census is
< 1 day old AND no commits touched that module since, you may reuse it;
otherwise run fresh.

### 4. Diff OUGHT − IS, per phase

For each feature in OUGHT, check whether IS has an equivalent capability.
"Equivalent" means:
- Matching route / page / component
- Matching user story exercised somewhere in UI
- Matching handler / server action / API endpoint

A feature is MISSING when:
- No route/page/handler/component implements it
- It's in IS but as dead code (never reached at runtime per Layer 3)
- It's partially implemented (e.g. "user can reset password" — only the
  request step exists, no confirmation/email/completion flow)

**Domain glossary** — match by concept, not by string. These are synonyms
in G_I_C_A's domain: "guest accommodation reservation" ≈ "accommodation
booking"; "communications templates" ≈ "message templates" ≈ "email
templates". Don't flag the same feature twice under different names.

### 5. For each missing feature: write a full story entry

Append to `ralph/prd.json`:

```json
{
  "id": "<kebab-case unique id, with phase prefix: p3-travel-flight-change>",
  "category": "<crud | data | ui | automation | integration>",
  "description": "<one-line>",
  "phase": <1|2|3|4|5|6>,
  "priority": <integer; lowest existing + 1 by default>,
  "behavior": "<prose from the PRD source; include file + anchor>",
  "ui_details": "<wireframe M## reference if applicable>",
  "data_model": "<tables/fields touched, if applicable>",
  "tests": {
    "unit": [ "<test case 1>" ],
    "e2e": [ "<scenario 1>" ],
    "edge_cases": [ "<edge 1>" ]
  },
  "passes": false,
  "qa_tested": false,
  "completeness_source": "auto-detected by harden-completeness.sh",
  "completeness_discovered_at": "<ISO timestamp>",
  "ought_citation": "<e.g. .planning/prd.md §Phase 3 — Travel, or research-hub/PROJECT_HANDOFF.md M35>",
  "blocked_on_spec": <true if the source is ambiguous enough that a builder couldn't proceed>
}
```

### 6. REQUIRED: per-phase coverage report

Regardless of the final outcome, your `completeness-progress.txt` entry
MUST include this table:

```
## <ISO timestamp> — iter <N>
Per-phase coverage:

| Phase | OUGHT (count) | IS (found)  | Gap | Appended |
|-------|---------------|-------------|-----|----------|
| P1    | <n>           | <m>         | <g> | <a>      |
| P2    | <n>           | <m>         | <g> | <a>      |
| P3    | <n>           | <m>         | <g> | <a>      |
| P4    | <n>           | <m>         | <g> | <a>      |
| P5    | <n>           | <m>         | <g> | <a>      |
| P6    | <n>           | <m>         | <g> | <a>      |
| Total | <sum>         | <sum>       | <g> | <a>      |

Sources consulted:
- .planning/prd.md ✓
- .planning/REQUIREMENTS.md ✓
- research-hub/PROJECT_HANDOFF.md ✓
- research-hub/CLICK_MAP_AND_TRACEABILITY.md ✓
- research-hub/BACKEND_ARCHITECTURE_MAP.md ✓
- research-hub/DEFERRED_TICKETS.md ✓
- research-hub/COMPLETE_GAP_ANALYSIS.md ✓

feature-census runs: <list of modules censused this iter>

Patterns noticed: <any recurring miss-types>
```

If any phase shows OUGHT count but 0 IS found, that's a red flag — either
the census missed that module or the phase genuinely wasn't built. Both
cases require at least one appended story explaining what to build next.

### 7. Commit with COMPLETENESS: prefix

```
COMPLETENESS: appended N features — <summary of phases with gaps>

<list of appended story IDs, grouped by phase>

Sources: <files consulted, e.g. prd.md + REQUIREMENTS + PROJECT_HANDOFF>
Census: <modules for which feature-census was run this iteration>
```

### 8. Signal the outcome

- `<promise>NEXT</promise>` — appended ≥1 feature OR you consulted
  census on modules not yet covered; orchestrator will re-enter
- `<promise>COMPLETENESS_COMPLETE</promise>` — per-phase table shows
  gap=0 for ALL SIX phases AND you consulted every module via census
  AND you read every required source listed above. If ANY of those are
  false, DO NOT emit COMPLETE.
- `<promise>ABORT</promise>` — blocked (explain above)

The orchestrator verifies COMPLETE by checking whether 0 features were
appended this iter. A false signal will be re-run.

## Anti-shortcut rules (hard limits)

**Do not narrow scope.** The authoritative OUGHT is `.planning/prd.md`
across all 6 phases, PERIOD. Do not conclude that prd.json represents
"the hardening scope" and exit. That conclusion is what the previous
run did and it was wrong.

**Do not skip feature-census.** The IS list must come from the
`feature-census` skill — not from spot-checking a handful of files. If
the skill is unavailable, ABORT; don't substitute inference.

**Do not emit COMPLETE on iter 1 without invoking the skill.** The
skill takes time. If your whole iteration ran in under a couple of
minutes, you almost certainly didn't run the census properly.

**Do not defer to DEFERRED_TICKETS.md as justification for gap=0.**
Items deferred there ARE missing features; they need appending.

## ABORT triggers

- `feature-census` skill invocation fails — don't substitute guesswork
- `.planning/prd.md` is missing or malformed
- You'd need to edit a LOCKED file
- A missing feature is genuinely spec-ambiguous → append with
  `"blocked_on_spec": true` and emit NEXT, not ABORT

## Locked files

- `.quality/**`
- `qa/**`
- `e2e/contracts/**`
- `vitest.config.ts`, `vitest.integration.config.ts`,
  `playwright.config.ts`, `playwright.e2e.config.ts`, `tsconfig.json`
- `stryker.config.json`, `stryker.*.json`
- `drizzle/**`, `drizzle.config.ts`
- `emails/**`
- `.claude/settings.json`, `.claude/hooks/**`
- `ralph/*.sh`, `ralph/*-prompt.md`, `ralph/*.template.md`
- **Existing entries in `ralph/prd.json`** — APPEND ONLY
- `.planning/**`, `research-hub/**` (READ-ONLY sources of truth)

## G_I_C_A-specific absolute rules

Any story you append must respect:
- `eventId` scoping on every query and mutation
- Audit log write on every travel/accommodation/transport mutation
- Idempotency key check in Redis before every notification send
- E.164 for phone numbers, UTC for storage + IST for display
- File upload max 20MB
- Dev server on port 4000
- Roles: `org:super_admin`, `org:event_coordinator`, `org:ops`, `org:read_only`

## What "COMPLETENESS_COMPLETE" really means here

All of the following must be TRUE:

1. Every phase (P1–P6) audited with per-phase table in progress log
2. `feature-census` run for every module in BACKEND_ARCHITECTURE_MAP
3. Every required source file (the 7 listed above) read and cited
4. Gap count across all phases = 0
5. Every deferred item in DEFERRED_TICKETS.md either exists in IS or
   appears as a story in prd.json (possibly with blocked_on_spec)

If any one of those is false, emit NEXT not COMPLETE.

Proceed. Emit a promise tag at the end.
