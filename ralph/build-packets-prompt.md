# Ralph Build Agent — Packet Pipeline

You are building from frozen packet specs, not from a raw PRD row.

## Context every iteration

Attached in-context:

- `ralph/build-packets-prompt.md`
- `CLAUDE.md`
- `ralph/packets/index.json`
- `ralph/packet-progress.txt`

## Workflow

1. Read `ralph/packet-progress.txt` first for reusable patterns.
2. Read `CLAUDE.md`.
3. Read `ralph/packets/index.json`.
4. Read `CURRENT_PACKET` from the iteration context.
5. Find that exact packet in `ralph/packets/index.json`. Its status should
   already be `BUILDING`.
6. Read that packet's `packet_file`. That file is the frozen spec.
7. Build exactly `CURRENT_PACKET`. Do not build a different packet even if
   other packets are still `READY`. Do not build adjacent features. Respect
   `Allowed Write Scope`, `Forbidden Write Scope`, and `Non-Goals`.

## Rules

- One packet per iteration.
- Do not use `ralph/prd.json` as the spec.
- Do not invent behavior outside the packet.
- If the packet is ambiguous, ABORT.
- If you need to touch files outside allowed scope, ABORT.
- Tests first where practical; never delete or weaken tests.
- Run:
  - `npm run test:run`
  - `npx tsc --noEmit`
  - `npm run lint --if-present`

## Commit

Use:

`RPKT: <packet-id> - <short title>`

## Required packet index update

When `CURRENT_PACKET` is built successfully, update only that packet entry in
`ralph/packets/index.json`:

- `status` -> `NEEDS_REVIEW`
- `build_commit` -> commit SHA
- `last_status_at` -> ISO timestamp

Do not modify any other packet entry.
Do not change another packet from `READY` to `BUILDING`, `NEEDS_REVIEW`, or
any other status.

## Required progress update

Append to `ralph/packet-progress.txt`:

`## <ISO timestamp> — <packet-id> — <short title>`

- Story ID
- Implemented summary
- Files changed
- Tests run
- Risks or follow-ups

## Promise tags

- `<promise>NEXT</promise>` when this packet is built and more READY packets remain
- `<promise>COMPLETE</promise>` when no READY packets remain
- `<promise>ABORT</promise>` if blocked
