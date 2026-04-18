# Packet Pipeline

This is the packet-driven fork of the proven Ralph loop.

It exists because:

- the old `ralph/build.sh` and `ralph/qa.sh` are proven runners
- but raw `ralph/prd.json` rows are too coarse for the remaining missing-feature work
- packet files let the loop resume from files, not chat memory

## New Scripts

- `./ralph/build-packets.sh`
- `./ralph/qa-packets.sh`
- `./ralph/run-packets.sh`
- `./ralph/watch-packets.sh`

## What Stays Untouched

- `./ralph/build.sh`
- `./ralph/qa.sh`
- `./ralph/run.sh`
- `./ralph/watch.sh`

The old and new pipelines can coexist.

## Tracking Files

- Queue: `ralph/packets/index.json`
- Frozen specs: `ralph/packets/*.md`
- Build progress: `ralph/packet-progress.txt`
- QA progress: `ralph/packet-qa-progress.txt`
- QA report: `ralph/packet-qa-report.json`
- Linear issue map: `ralph/.linear-packet-issues.txt`

## Suggested Usage

Start watcher in one terminal:

```bash
./ralph/watch-packets.sh
```

Run packet build + QA in another:

```bash
./ralph/run-packets.sh
```

## Codex Account Aliases

The repo now treats `codex3` as a durable account alias:

- `codex3` -> `~/.codex-acc3`
- wrapper: `./ralph/codex3.sh`

Log that account in once:

```bash
CODEX_HOME="$HOME/.codex-acc3" codex login
```

After that, you can use the wrapper directly:

```bash
./ralph/codex3.sh exec -m gpt-5.1-codex "Reply with PASS"
```

To force the packet QA loop onto `codex3`, map it into the primary QA slot:

```bash
CODEX_ACC1="$HOME/.codex-acc3" \
CODEX_SINGLE_ACCOUNT=1 \
BUILD_SKIP=1 ./ralph/run-packets.sh
```

## Default Models

Unless overridden by environment variables:

- build: `claude-sonnet-4-6`
- build effort: `high`
- QA pass 1: `default` (Codex account default model)
- QA pass 2: `default` (Codex account default model)

Supported overrides:

```bash
RALPH_PACKET_BUILD_MODEL=claude-sonnet-4-6
RALPH_PACKET_BUILD_EFFORT=high
RALPH_PACKET_QA_PASS1_MODEL=default
RALPH_PACKET_QA_PASS2_MODEL=default
```

If your Codex login is a ChatGPT-backed account, leaving QA on `default` is the
safest option because explicit `-m` model IDs may be rejected even when Codex
itself is usable on that account.

If you are logged into Codex with a ChatGPT account rather than an API-key
organization, prefer `gpt-5.1-codex` unless you have explicitly verified that a
newer model is available on that account.

Or run phases individually:

```bash
./ralph/build-packets.sh
./ralph/qa-packets.sh
```

## Slack Isolation

The packet watcher uses `PACKET_SLACK_WEBHOOK_URL`, not `SLACK_WEBHOOK_URL`.

That avoids interfering with the current Ralph watcher unless you explicitly
point both watchers at the same destination.

## Current Scope

The first five packet files are frozen and ready. The remaining Bucket A/B/C
items are tracked in the index and can be packet-frozen incrementally without
losing queue state.

## Active Promotion Policy

Wireframed Bucket C items do not automatically become runnable. They are only
promoted into the active execution lane when:

1. wireframe exports are linked in `ralph/packets/index.json`
2. design decisions are frozen in `.planning/wireframes/bucket-c-design-decisions.md`
3. no schema approval or upstream dependency is still blocking the packet

Promoted Bucket C packets are given active priorities immediately after the
current frozen Bucket A wave so `build-packets.sh` can consume them without any
manual reordering in chat.
