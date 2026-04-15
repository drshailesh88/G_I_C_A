# Contract Acceptance Baseline — 2026-04-15

**Before Ralph builds.** Snapshot of how many contract tests pass against the
current codebase before any feature implementation targets the frozen oracles.

## Environment

- Dev server: `E2E_TEST_MODE=1 DATABASE_URL=<test Neon branch> PORT=4000 npm run dev`
- Playwright: `--project=phone`
- Auth: `E2E_CLERK_USER_USERNAME=e2e-super@gmail.com` (seeded super_admin)
- DB: Neon `test` branch (project `billowing-term-89872063`), schema-pushed

## Totals

| | Count |
|---|---|
| Tests run (phone project) | 49 |
| Passed | 3 |
| Failed | 46 |

## Passing

1. `e2e/auth/global-setup.ts` — global setup (infrastructure only)
2. Two project-level setup entries (scaffolding)

## Failing

| Pack | Count | Dominant cause |
|---|---|---|
| `cascade-idempotency` | 14/14 | Cascade handlers not wired end-to-end; no provider-mode shim (Phase 2c); no captured-events store for Inngest replay |
| `certificates` | 15/15 | `/api/events/[eventId]/certificates/*` routes not implemented; cert issuance/regen/revoke endpoints absent |
| `eventid-scoping` | 15/15 | `assertEventAccess` throws generic `Error` instead of 404/403; many tenancy-tested routes (sessions, delegates) don't exist yet; `/register/[eventId]` route absent |
| Existing e2e | 2/5 | `AC-001 Login page renders` red — likely related to switching dev server onto test DB mid-session |

## Notes on expected red

These failures are NOT bugs to fix via QA healing. Per PM (Shailesh):

> The 44 red contract tests aren't bugs to fix — they're features that don't
> exist yet. The QA pipeline's fixer can't create entire API routes and
> cascade handlers from scratch. That's what Ralph does.

Next step is Ralph building the missing surfaces (certificate routes,
cascade wiring, session/delegate endpoints, `/register/[eventId]`, 404/403
mapping in `assertEventAccess`). QA pipeline harden-pass follows.

## Fixtures status

- ✅ 5 Clerk test users + org memberships seeded
- ✅ 3 events (A published, B published, archived)
- ✅ 3 people (A-only, shared, B-only) with `event_people` links
- ✅ 2 certificate templates on Event A (delegate_attendance, cme_attendance)
- ✅ 22 `/api/test/*` probe + seed endpoints
- ⚠️ `E2E_OPS_A` deferred (Clerk free-tier 5-membership cap)
- ⚠️ Provider-mode shim deferred to Phase 2c (blocks ~12 cascade tests)
- ⚠️ Inngest captured-events store deferred to Phase 2c (blocks 1 replay test)
- ⚠️ `audit_log` table not in schema (blocks 2 audit tests)

## Stryker baseline

### Config expansion (committed `3acd0ff`)
Globs expanded from 3 travel files → full critical_75 + business_60 tier
coverage. Stryker now discovers **107 files / 10,337 mutants** (up from 3
files / 442 mutants).

### Baseline run: BLOCKED before mutation phase

Stryker's dry-run sanity check fails because **10 pre-existing vitest
failures** in:
- `src/lib/actions/certificate-issuance.mutation-kill.test.ts` (9 fails)
- `src/lib/actions/certificate.mutation-kill.test.ts` (1 fail)

Failure pattern: production code missing error-throw branches, retry
mechanism, and transaction-write ordering that the mutation-kill tests
assert. **These are real prod-code gaps, not test bugs.**

Vitest overall: **196 files, 4491 pass, 10 fail.**

### Handoff

Ralph must fix the cert-issuance + cert-activate production code (so those
10 tests pass) before a true full Stryker baseline can run. After Ralph's
first cert pass:
```bash
npx tsx qa/controller.ts baseline
```
will produce per-module scores across all 107 files.

### Confirmed modules with baselines (from prior 3-file config, still valid)
| File | Tier | Score | Floor |
|---|---|---|---|
| `src/lib/actions/travel.ts` | critical_75 | 99.48% | ✓ |
| `src/lib/cascade/handlers/travel-cascade.ts` | critical_75 | 97.03% | ✓ |
| `src/lib/validations/travel.ts` | critical_75 | 77.55% | ✓ |

Travel flow has strong mutation-kill signal. Everything else awaits Ralph.
