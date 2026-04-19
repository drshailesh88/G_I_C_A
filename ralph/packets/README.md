# Ralph Packet Pipeline

This directory is the durable control plane for the packet-based Ralph loop.

The existing `ralph/build.sh`, `ralph/qa.sh`, and `ralph/run.sh` remain
unchanged. The packet pipeline uses sibling scripts:

- `ralph/build-packets.sh`
- `ralph/qa-packets.sh`
- `ralph/run-packets.sh`
- `ralph/wave-gate.sh`
- `ralph/watch-packets.sh`

## Source Of Truth

`index.json` is the authoritative queue. Chat is not the source of truth.

Every packet entry tracks:

- packet id
- original story id
- bucket
- module
- priority
- status
- packet file path
- spec status
- wireframe readiness
- Linear issue id
- build/QA commit refs

## Status Model

- `READY`: frozen and eligible for build
- `BUILDING`: currently being built by the packet build loop
- `NEEDS_REVIEW`: built, waiting for independent QA
- `QA_RUNNING`: under packet QA evaluation
- `VERIFIED`: independently verified
- `DONE`: optional PM terminal state after verified
- `BLOCKED`: cannot proceed without intervention
- `STUCK`: exhausted attempts
- `BACKLOG`: identified but not yet packet-frozen
- `DEFERRED`: intentionally postponed
- `DESIGN_READY`: wireframe exists, packet not yet frozen

`build-packets.sh` only consumes `READY`.

`qa-packets.sh` only consumes `NEEDS_REVIEW`.

## File Discipline

- Packet markdown files are the frozen per-feature oracle.
- Builders and QA agents must not rewrite packet scope.
- Progress is recorded in:
  - `ralph/packet-progress.txt`
  - `ralph/packet-qa-progress.txt`
  - `ralph/packet-qa-report.json`
  - `ralph/baseline-noise.json`

`wave-gate.sh` is the slower repo-wide boundary check. Packet iterations stay
focused on packet truth; the wave gate refreshes the known unrelated baseline
noise once per wave.

## Linear / Watching

`watch-packets.sh` uses a separate Linear map file:

- `ralph/.linear-packet-issues.txt`

It does not touch `ralph/.linear-issues.txt` used by the current Ralph loop.

It uses `PACKET_SLACK_WEBHOOK_URL` rather than `SLACK_WEBHOOK_URL`, so packet
watching can be enabled or disabled independently of the existing Slack flow.

## Codex Account Convention

This repo uses file-backed Codex account slots:

- `codex1` -> `~/.codex-acc1`
- `codex2` -> `~/.codex-acc2`
- `codex3` -> `~/.codex-acc3`

Repo-local wrapper:

```bash
./ralph/codex3.sh
```

So if you want `content.shailesh@gmail.com` to be the durable `codex3`
identity, log that account into `~/.codex-acc3` once and keep using the same
slot across sessions and agents.

## Current Queue

The active execution lane is:

1. `PKT-A-001` — per-event user assignment
2. `PKT-A-002` — event edit/settings
3. `PKT-A-003` — registration settings UI
4. `PKT-A-004` — faculty accept creates registration
5. `PKT-A-005` — registration cancel cascade
6. `PKT-C-001` — terms/privacy page
7. `PKT-C-004` — conflict fix CTA destination state
8. `PKT-C-005` — notification drawer
9. `PKT-C-006` — ops resend logistics notification

These four Bucket C packets were promoted into the active lane because they now
have frozen wireframes and no remaining product-design ambiguity.

Held out of the active lane:

- `PKT-C-002` — blocked pending explicit schema approval
- `PKT-C-003` — blocked on `PKT-A-010` / M52 version history

The remaining Bucket A/B items are still tracked in `index.json` and can be
packet-frozen or promoted later without losing queue state.
