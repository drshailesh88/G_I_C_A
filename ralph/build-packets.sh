#!/usr/bin/env bash
# Ralph packet build loop — packetized build pipeline using frozen packet specs.

set -euo pipefail
cd "$(dirname "$0")/.."

MAX_ITER="${1:-999}"
PACKETS_INDEX="ralph/packets/index.json"
PROGRESS="ralph/packet-progress.txt"
ITER_TIMEOUT=1800
SLEEP_BETWEEN=3
BUILD_MODEL="${RALPH_PACKET_BUILD_MODEL:-claude-sonnet-4-6}"
BUILD_EFFORT="${RALPH_PACKET_BUILD_EFFORT:-high}"

if [ ! -f "$PACKETS_INDEX" ]; then
  echo "ERROR: $PACKETS_INDEX not found." >&2
  exit 1
fi

if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(timeout "$ITER_TIMEOUT")
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(gtimeout "$ITER_TIMEOUT")
else
  echo "WARNING: no timeout command found. Iterations will run without a hard timeout." >&2
  TIMEOUT_CMD=()
fi

count_ready() {
  python3 -c "import json; d=json.load(open('$PACKETS_INDEX')); print(sum(1 for x in d['packets'] if x.get('status') == 'READY'))"
}

promote_unblocked_backlog() {
  python3 - <<PY
import json
from datetime import datetime, timezone

path = "$PACKETS_INDEX"
with open(path) as f:
    data = json.load(f)

packets = data["packets"]
status_by_id = {packet["packet_id"]: packet.get("status") for packet in packets}
promoted = []
now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

for packet in packets:
    if packet.get("status") != "BACKLOG":
        continue
    deps = packet.get("depends_on") or []
    if deps and not all(status_by_id.get(dep) in {"VERIFIED", "DONE"} for dep in deps):
        continue
    packet["status"] = "READY"
    packet["last_status_at"] = now
    promoted.append(packet["packet_id"])

if promoted:
    data["updated_at"] = now
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\\n")
    print("\\n".join(promoted))
PY
}

count_buildable() {
  python3 -c "import json; d=json.load(open('$PACKETS_INDEX')); print(sum(1 for x in d['packets'] if x.get('packet_file')))"
}

count_built() {
  python3 -c "import json; d=json.load(open('$PACKETS_INDEX')); print(sum(1 for x in d['packets'] if x.get('status') in {'NEEDS_REVIEW','QA_RUNNING','VERIFIED','DONE'}))"
}

next_ready_id() {
  python3 -c "
import json
d = json.load(open('$PACKETS_INDEX'))
ready = [p for p in d['packets'] if p.get('status') == 'READY']
ready.sort(key=lambda p: p.get('priority', 999999))
print(ready[0]['packet_id'] if ready else '')
"
}

get_packet_status() {
  local packet_id="$1"
  python3 - <<PY
import json
path = "$PACKETS_INDEX"
packet_id = "$packet_id"
with open(path) as f:
    data = json.load(f)
for packet in data["packets"]:
    if packet["packet_id"] == packet_id:
        print(packet.get("status", ""))
        break
PY
}

get_packet_field() {
  local packet_id="$1"
  local field="$2"
  python3 - <<PY
import json
path = "$PACKETS_INDEX"
packet_id = "$packet_id"
field = "$field"
with open(path) as f:
    data = json.load(f)
for packet in data["packets"]:
    if packet["packet_id"] == packet_id:
        value = packet.get(field)
        print("" if value is None else value)
        break
PY
}

set_packet_status() {
  local packet_id="$1"
  local status="$2"
  python3 - <<PY
import json
from datetime import datetime, timezone

path = "$PACKETS_INDEX"
packet_id = "$packet_id"
status = "$status"
with open(path) as f:
    data = json.load(f)
for packet in data["packets"]:
    if packet["packet_id"] == packet_id:
        packet["status"] = status
        packet["last_status_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        data["current_packet_id"] = packet_id
        break
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\\n")
PY
}

TOTAL=$(count_buildable)
START_BUILT=$(count_built)

echo "───────────────────────────────────────────────────────────────"
echo "Ralph packet build loop"
echo "  packets:    $PACKETS_INDEX  ($TOTAL packetized features, $START_BUILT built/reviewed)"
echo "  max iter:   $MAX_ITER"
echo "  model:      $BUILD_MODEL (effort=$BUILD_EFFORT)"
echo "───────────────────────────────────────────────────────────────"

for i in $(seq 1 "$MAX_ITER"); do
  PROMOTED=$(promote_unblocked_backlog)
  if [ -n "$PROMOTED" ]; then
    echo "Auto-promoted from BACKLOG to READY:"
    printf '%s\n' "$PROMOTED"
    echo ""
  fi

  READY=$(count_ready)
  BUILT=$(count_built)
  echo ""
  echo "═══ packet build iter $i/$MAX_ITER — $BUILT/$TOTAL built/reviewed ($READY ready) ══"
  echo ""

  if [ "$READY" -eq 0 ]; then
    echo "No READY packets remain. Packet build loop complete."
    break
  fi

  CURRENT_PACKET=$(next_ready_id)
  if [ -z "$CURRENT_PACKET" ]; then
    echo "READY packet lookup failed." >&2
    exit 2
  fi

  BUILD_COMMIT=$(get_packet_field "$CURRENT_PACKET" "build_commit")
  FAST_RETRY=no
  if [ -n "$BUILD_COMMIT" ] && [ "$BUILD_COMMIT" != "null" ]; then
    FAST_RETRY=yes
  fi

  set_packet_status "$CURRENT_PACKET" "BUILDING"

  set +e
  result=$("${TIMEOUT_CMD[@]}" claude -p --dangerously-skip-permissions --model "$BUILD_MODEL" --effort "$BUILD_EFFORT" \
"@ralph/build-packets-prompt.md @CLAUDE.md @$PACKETS_INDEX @$PROGRESS

ITERATION: $i of $MAX_ITER
CURRENT_PACKET: $CURRENT_PACKET
FAST_RETRY: $FAST_RETRY

Build exactly ONE READY packet, update the packet index and progress log, commit, then stop.
Output <promise>NEXT</promise> when done.
Output <promise>COMPLETE</promise> only if no READY packets remain.
Output <promise>ABORT</promise> if you cannot proceed.")
  CLAUDE_EXIT=$?
  set -e

  echo "$result"

  if echo "$result" | grep -q '<promise>COMPLETE</promise>'; then
    echo ""
    echo "Packet build agent signaled COMPLETE."
    break
  elif echo "$result" | grep -q '<promise>ABORT</promise>'; then
    echo ""
    echo "Packet build agent signaled ABORT. Resetting $CURRENT_PACKET to READY." >&2
    set_packet_status "$CURRENT_PACKET" "READY"
    exit 2
  elif echo "$result" | grep -q '<promise>NEXT</promise>'; then
    PACKET_STATUS=$(get_packet_status "$CURRENT_PACKET")
    if [ "$PACKET_STATUS" = "BUILDING" ]; then
      echo "Agent returned NEXT but packet status is still BUILDING. Resetting to READY." >&2
      set_packet_status "$CURRENT_PACKET" "READY"
      exit 2
    fi
  else
    echo ""
    echo "No promise tag found (exit=$CLAUDE_EXIT). Resetting $CURRENT_PACKET to READY."
    set_packet_status "$CURRENT_PACKET" "READY"
  fi

  sleep "$SLEEP_BETWEEN"
done

FINAL_BUILT=$(count_built)
DELTA=$((FINAL_BUILT - START_BUILT))
echo ""
echo "───────────────────────────────────────────────────────────────"
echo "Packet build summary: $FINAL_BUILT/$TOTAL built/reviewed (+$DELTA this run)"
echo "───────────────────────────────────────────────────────────────"
