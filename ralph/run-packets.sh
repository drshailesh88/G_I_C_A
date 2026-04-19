#!/usr/bin/env bash
# Ralph packet pipeline master entrypoint — build packets -> QA packets.

set -euo pipefail
cd "$(dirname "$0")/.."

BUILD_ITERS="${1:-999}"
QA_ITERS="${2:-999}"
PACKETS_INDEX="ralph/packets/index.json"

BUILD_SKIP="${BUILD_SKIP:-0}"
QA_SKIP="${QA_SKIP:-0}"
MASTER_MAX="${RALPH_PACKET_MASTER_MAX:-999}"
WAVE_GATE_ON_COMPLETE="${RALPH_WAVE_GATE_ON_COMPLETE:-0}"

if [ ! -f "$PACKETS_INDEX" ]; then
  echo "ERROR: $PACKETS_INDEX not found." >&2
  exit 1
fi

TS=$(date -u +'%Y%m%dT%H%M%SZ')
LOG="ralph/ralph-packets-$TS.log"

count_total() {
  python3 -c "import json; d=json.load(open('$PACKETS_INDEX')); print(sum(1 for x in d['packets'] if x.get('packet_file')))"
}

count_ready() {
  python3 -c "import json; d=json.load(open('$PACKETS_INDEX')); print(sum(1 for x in d['packets'] if x.get('status') == 'READY'))"
}

count_verified() {
  python3 -c "import json; d=json.load(open('$PACKETS_INDEX')); print(sum(1 for x in d['packets'] if x.get('status') in {'VERIFIED','DONE'}))"
}

count_reviewable() {
  python3 -c "import json; d=json.load(open('$PACKETS_INDEX')); print(sum(1 for x in d['packets'] if x.get('status') == 'NEEDS_REVIEW'))"
}

count_promotable_backlog() {
  python3 - <<PY
import json

with open("$PACKETS_INDEX") as f:
    data = json.load(f)

status_by_id = {packet["packet_id"]: packet.get("status") for packet in data["packets"]}
count = 0
for packet in data["packets"]:
    if packet.get("status") != "BACKLOG":
        continue
    deps = packet.get("depends_on") or []
    if deps and not all(status_by_id.get(dep) in {"VERIFIED", "DONE"} for dep in deps):
        continue
    count += 1

print(count)
PY
}

TOTAL=$(count_total)
READY=$(count_ready)
VERIFIED=$(count_verified)
REVIEWABLE=$(count_reviewable)
PROMOTABLE=$(count_promotable_backlog)

echo "─ Ralph packet run ─"
echo "  log:         $LOG"
echo "  start:       $VERIFIED/$TOTAL verified, $READY ready to build"
echo "  max iter:    build=$BUILD_ITERS, qa=$QA_ITERS"
echo ""
: > "$LOG"
BUILD_EXIT=0
QA_EXIT=0

for cycle in $(seq 1 "$MASTER_MAX"); do
  READY=$(count_ready)
  REVIEWABLE=$(count_reviewable)
  PROMOTABLE=$(count_promotable_backlog)

  EFFECTIVE_READY=$READY
  EFFECTIVE_REVIEWABLE=$REVIEWABLE
  EFFECTIVE_PROMOTABLE=$PROMOTABLE
  if [ "$BUILD_SKIP" = "1" ]; then
    EFFECTIVE_READY=0
    EFFECTIVE_PROMOTABLE=0
  fi
  if [ "$QA_SKIP" = "1" ]; then
    EFFECTIVE_REVIEWABLE=0
  fi

  if [ "$EFFECTIVE_READY" -eq 0 ] && [ "$EFFECTIVE_REVIEWABLE" -eq 0 ] && [ "$EFFECTIVE_PROMOTABLE" -eq 0 ]; then
    break
  fi

  if [ "$BUILD_SKIP" = "1" ]; then
    echo ">>> Phase 1/2: Packet build — SKIPPED (BUILD_SKIP=1)"
    BUILD_EXIT=0
  else
    echo ">>> Phase 1/2: Packet build"
    echo ""
    set +e
    ./ralph/build-packets.sh "$BUILD_ITERS" 2>&1 | tee -a "$LOG"
    BUILD_EXIT=${PIPESTATUS[0]}
    set -e
  fi

  if [ "$QA_SKIP" = "1" ]; then
    echo ""
    echo ">>> Phase 2/2: Packet QA — SKIPPED (QA_SKIP=1)"
    QA_EXIT=0
  elif [ "$BUILD_EXIT" -eq 0 ]; then
    echo ""
    echo ">>> Phase 2/2: Packet QA"
    echo ""
    set +e
    ./ralph/qa-packets.sh "$QA_ITERS" 2>&1 | tee -a "$LOG"
    QA_EXIT=${PIPESTATUS[0]}
    set -e
  else
    REVIEWABLE=$(count_reviewable)
    if [ "$REVIEWABLE" -gt 0 ]; then
      echo ""
      echo "Packet build exited non-zero ($BUILD_EXIT), but $REVIEWABLE packet(s) are in NEEDS_REVIEW."
      echo ">>> Phase 2/2: Packet QA (recovery mode)"
      echo ""
      set +e
      ./ralph/qa-packets.sh "$QA_ITERS" 2>&1 | tee -a "$LOG"
      QA_EXIT=${PIPESTATUS[0]}
      set -e
    else
      echo ""
      echo "Packet build exited non-zero ($BUILD_EXIT). Skipping packet QA phase."
      QA_EXIT=255
    fi
  fi

  for CODE in "$BUILD_EXIT" "$QA_EXIT"; do
    if [ "$CODE" -ne 0 ] && [ "$CODE" -ne 255 ]; then
      break 2
    fi
  done
done

FINAL_READY=$(count_ready)
FINAL_VERIFIED=$(count_verified)

echo ""
echo "───────────────────────────────────────────────────────────────"
echo "Packet run summary: $FINAL_VERIFIED/$TOTAL verified, $FINAL_READY ready"
echo "  log:         $LOG"
echo "  build exit:  $BUILD_EXIT"
echo "  qa exit:     $QA_EXIT"
echo "───────────────────────────────────────────────────────────────"

for CODE in "$BUILD_EXIT" "$QA_EXIT"; do
  if [ "$CODE" -ne 0 ] && [ "$CODE" -ne 255 ]; then
    exit "$CODE"
  fi
done

if [ "$WAVE_GATE_ON_COMPLETE" = "1" ]; then
  echo ""
  echo ">>> Wave gate: running repo-wide checks once at run boundary"
  echo ""
  ./ralph/wave-gate.sh
fi

exit 0
