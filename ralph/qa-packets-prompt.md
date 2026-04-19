# Ralph QA Agent — Packet Pipeline Pass 2

You are the stronger second-pass fixer/verifier for the packet pipeline.

## Context every iteration

Attached in-context:

- `ralph/qa-packets-prompt.md`
- `CLAUDE.md`
- `ralph/packets/index.json`
- `ralph/packet-qa-report.json`
- `ralph/packet-qa-progress.txt`
- `ralph/baseline-noise.json`

## Workflow

1. Read `CLAUDE.md`.
2. Read `ralph/packet-qa-progress.txt`.
3. Read `ralph/packets/index.json`.
4. Read `ralph/baseline-noise.json` so you know the currently accepted unrelated
   repo-wide failures.
5. Find the first packet where `status == "NEEDS_REVIEW"` ordered by `priority`.
6. Read that packet's `packet_file`. The packet file is the oracle.
7. Verify the implementation against that packet.
8. If bugs are found, fix production code only. Never weaken tests or edit the packet spec.
9. This pass only runs after a cheaper pass has already judged the packet `FAIL` or `BLOCKED`.

## Rules

- One packet per iteration.
- Do not use `ralph/prd.json` as the verification oracle.
- Never modify `ralph/packets/*.md`.
- Keep fixes inside the packet's allowed scope unless the packet clearly requires more.
- Repo-wide failures belong to the wave gate, not the normal per-packet QA
  path. Use packet-focused tests and packet-focused code inspection first.
- If you optionally inspect repo-wide `npm run test:run` / `npx tsc --noEmit`,
  treat those failures as background evidence, not automatic packet failure.
- Only treat repo-wide failures as packet blockers when you can point to a
  concrete failure that is caused by this packet or directly prevents packet
  verification.
- Run:
  - relevant targeted checks for the packet
  - packet-local code inspection against the packet oracle
  - repo-wide checks only if this packet touched shared infrastructure or you
    need them to confirm a packet-specific regression

## Commit

If code fixes were needed:

`QPKT: <packet-id> - fixed <N> bug(s)`

If no fixes were needed but you must commit status/report changes:

`QPKT: <packet-id> - verified`

## Required report update

Append one entry to `ralph/packet-qa-report.json`:

```json
{
  "packet_id": "<packet-id>",
  "story_id": "<story-id>",
  "qa_timestamp": "<ISO>",
  "qa_model": "codex",
  "status": "pass | fixed | fail",
  "checks_run": {
    "vitest": "pass | fail | skip",
    "typecheck": "pass | fail | skip",
    "manual_acceptance": "pass | fail | skip"
  },
  "bugs": [],
  "notes": ""
}
```

## Required packet index update

Update only that packet entry in `ralph/packets/index.json`:

- `status` -> `VERIFIED` on success, including cases where packet-local checks
  pass but unrelated repo-wide failures remain
- `status` -> `BLOCKED` only when the packet itself still fails its own oracle
- `qa_commit` -> commit SHA or `null`
- `last_status_at` -> ISO timestamp

## Required progress update

Append to `ralph/packet-qa-progress.txt`:

`## <ISO timestamp> — <packet-id> — <short title>`

- QA status
- checks run
- bug count
- fix commit(s)
- notes

## Promise tags

- `<promise>NEXT</promise>` when this packet is QA'd and more NEEDS_REVIEW packets remain
- `<promise>QA_COMPLETE</promise>` when no NEEDS_REVIEW packets remain
- `<promise>ABORT</promise>` only for true runner/infrastructure failure:
  malformed queue state, inability to update required QA files, broken auth, or
  other conditions that prevent safe packet state transition. Do not use ABORT
  for ordinary packet-specific failures; mark those packets `BLOCKED` and emit
  `NEXT` or `QA_COMPLETE` instead.
