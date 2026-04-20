# QA Run Summary — run-2026-04-20T01-55-52-012

**Session:** 2026-04-20T01:55:52.113Z → 2026-04-20T01:56:56.789Z (1m 5s)
**Controller:** v0.1.0
**Triggered by:** qa run

## Verdict

**Status:** 🔴 RED (release gate failure)

- 0 feature(s) attempted
- 0 green
- 0 blocked
- 0 violation(s) detected
- 0 contract tamper event(s)
- Release gates: **RED** (primary gate(s) failed: vitest-all, playwright-full)

## Contract Integrity

- All contract hashes verified intact across all iterations ✅
- Release-time contract hash verification: passed ✅

## Baseline → Final

| Metric | Baseline | Final | Delta |
|---|---|---|---|
| Overall mutation score | 100.0% | 100.0% | 0 |

## Features

_No features attempted this run._

## Violations Detected

_None this run._

## Anti-cheat Warnings

_No warnings this run._

## Performance

- Full baseline Stryker: 6.8s
- Total fixer invocations: 0
- Release gate runner: 57.8s

## Next Actions

- Release gates RED: vitest-all, playwright-full, lighthouse-ci, npm-audit — block release until addressed
