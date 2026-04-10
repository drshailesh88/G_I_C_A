# Test Governance — Anti-Cheating Rules

## Core Principle

> If a test's expected outcome was derived by reading the implementation,
> it is not an oracle. It is theater.

The agent that wrote the code MUST NOT be the authority on expected test outcomes.

## Test Layers

| Layer | Purpose | Who writes | Oracle source | Gate? |
|-------|---------|-----------|---------------|-------|
| **Vitest unit** | Business logic smoke | Agent (allowed) | Schema specs, state machine definition | PR gate |
| **fast-check property** | Edge case discovery | Agent scaffolds, properties from specs | Mathematical invariants, schema constraints | PR gate |
| **Stryker mutation** | Test quality audit | Automated | Mutation score threshold (break: 50%) | Nightly gate |
| **Playwright visible** | Developer smoke/debug | Agent (allowed) | Visible, non-authoritative | Not a gate |
| **Playwright private** | Acceptance & regression | Human-authored, hidden from agent | Human-written acceptance criteria | PR gate |
| **Visual regression** | Screenshot baselines | Automated snapshots | Pixel-level diff | PR gate |
| **Accessibility** | WCAG compliance | Automated (axe-core) | WCAG 2.1 AA standard | PR gate |

## Rules for AI Agents

### MUST

- Derive test expectations from specs, schemas, and domain rules — not from reading source code
- Use property-based testing (fast-check) for boundary conditions instead of hand-picked examples
- Run Stryker mutation testing to validate test quality before claiming coverage
- Mark tests as `[SMOKE]` if they were derived from implementation

### MUST NOT

- Read implementation code before writing test assertions
- Mock away the behavior being tested (mock boundaries, not the SUT)
- Write tests that only verify the current implementation produces the current output
- Claim "all tests pass" without mutation score evidence
- Access or modify the private acceptance suite

### SHOULD

- Write tests before implementation (TDD) when possible
- Generate random inputs with fast-check instead of hand-picked happy paths
- Test error paths, not just success paths
- Test state transitions exhaustively using model-based testing

## qa/generated/ Policy

Everything under `qa/generated/` is **non-authoritative**. It is an experiment bucket.

- NOT a quality gate
- NOT evidence of correctness
- May be promoted to visible smoke tests after human review
- May be reimplemented in the private suite

## Mutation Score Thresholds

```json
{
  "high": 80,    // Target: good test quality
  "low": 60,     // Warning: tests may be weak
  "break": 50    // CI fails: tests are insufficient
}
```

## Decision Flow for New Tests

```
Is this testing behavior or implementation?
├── Behavior → Write it, derive from spec
└── Implementation → STOP. Rethink the test.

Can the expected outcome be derived without reading the code?
├── Yes → Write it
└── No → It's tautological. Use property-based testing instead.

Would this test still fail if the code had a bug?
├── Yes → Good test
└── No → Tautological. Add to Stryker mutation targets.
```
