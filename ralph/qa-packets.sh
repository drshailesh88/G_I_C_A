#!/usr/bin/env bash
# Ralph packet QA loop — Codex independent evaluator for packetized builds.

set -euo pipefail
cd "$(dirname "$0")/.."

MAX_ITER="${1:-999}"
PACKETS_INDEX="ralph/packets/index.json"
QA_REPORT="ralph/packet-qa-report.json"
QA_PROGRESS="ralph/packet-qa-progress.txt"
BASELINE_NOISE="ralph/baseline-noise.json"
ITER_TIMEOUT=1800
SLEEP_BETWEEN=3
QA_PASS1_MODEL="${RALPH_PACKET_QA_PASS1_MODEL:-gpt-5.3-codex-spark}"
QA_PASS2_MODEL="${RALPH_PACKET_QA_PASS2_MODEL:-gpt-5.1-codex-max}"

CODEX_ACC1="${CODEX_ACC1:-$HOME/.codex-acc1}"
CODEX_ACC2="${CODEX_ACC2:-$HOME/.codex-acc2}"
CODEX_SINGLE_ACCOUNT="${CODEX_SINGLE_ACCOUNT:-0}"
QUOTA_REGEX='HTTP 429|rate.limit.exceeded|rate_limit_exceeded|quota.exceeded|quota_exceeded|usage.limit.exceeded|insufficient_quota|retry.after.*seconds|RESOURCE_EXHAUSTED|hit your usage limit|try again at [0-9]|billing.*hard.*limit|exceeded.*current.*quota'
MODEL_UNSUPPORTED_REGEX='invalid_request_error.*not supported when using Codex with a ChatGPT account|model.*not supported'
BOTH_EXHAUSTED_SLEEP=300

if [ ! -f "$PACKETS_INDEX" ]; then
  echo "ERROR: $PACKETS_INDEX not found." >&2
  exit 1
fi

if [ ! -f "$BASELINE_NOISE" ]; then
  echo "ERROR: $BASELINE_NOISE not found." >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: codex CLI not found." >&2
  exit 1
fi

if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(timeout "$ITER_TIMEOUT")
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(gtimeout "$ITER_TIMEOUT")
else
  echo "WARNING: no timeout command found." >&2
  TIMEOUT_CMD=()
fi

validate_account() {
  local dir="$1"
  [ -d "$dir" ] && [ -s "$dir/auth.json" ]
}

count_reviewable() {
  python3 -c "import json; d=json.load(open('$PACKETS_INDEX')); print(sum(1 for x in d['packets'] if x.get('status') == 'NEEDS_REVIEW'))"
}

count_verified() {
  python3 -c "import json; d=json.load(open('$PACKETS_INDEX')); print(sum(1 for x in d['packets'] if x.get('status') in {'VERIFIED','DONE'}))"
}

count_packetized() {
  python3 -c "import json; d=json.load(open('$PACKETS_INDEX')); print(sum(1 for x in d['packets'] if x.get('packet_file')))"
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

next_review_packet() {
  python3 -c "
import json
d = json.load(open('$PACKETS_INDEX'))
pending = [p for p in d['packets'] if p.get('status') == 'NEEDS_REVIEW']
pending.sort(key=lambda p: p.get('priority', 999999))
print(pending[0]['packet_id'] if pending else '')
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

append_pass1_report() {
  local packet_id="$1"
  local story_id="$2"
  local notes="$3"
  python3 - <<PY
import json
from datetime import datetime, timezone

path = "$QA_REPORT"
packet_id = "$packet_id"
story_id = "$story_id"
notes = """$notes""".strip()
with open(path) as f:
    data = json.load(f)
data.append({
    "packet_id": packet_id,
    "story_id": story_id,
    "qa_timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "qa_model": "$QA_PASS1_MODEL",
    "status": "pass",
    "checks_run": {
        "vitest": "skip",
        "typecheck": "skip",
        "manual_acceptance": "pass"
    },
    "bugs": [],
    "notes": notes
})
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\\n")
PY
}

append_pass1_progress() {
  local packet_id="$1"
  local title="$2"
  local notes="$3"
  python3 - <<PY
from datetime import datetime, timezone

path = "$QA_PROGRESS"
packet_id = "$packet_id"
title = "$title"
notes = """$notes""".strip()
ts = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
with open(path, "a") as f:
    f.write(f"\\n## {ts} — {packet_id} — {title}\\n")
    f.write("- Status: pass (mini evaluator only)\\n")
    f.write(f"- Model: $QA_PASS1_MODEL\\n")
    f.write("- Bugs: 0\\n")
    f.write("- Fix commits: none\\n")
    f.write(f"- Notes: {notes[:600] if notes else 'pass1 evaluator approved packet'}\\n")
PY
}

extract_classification() {
  local text="$1"
  printf '%s\n' "$text" | grep -o '<classification>[^<]*</classification>' | tail -1 | sed 's#<classification>##; s#</classification>##'
}

try_codex() {
  local prompt="$1" label="$2" dir="$3" model="$4"
  if [ ! -s "$dir/auth.json" ]; then
    return 1
  fi
  local output exitcode output_tail
  set +e
  if [ -z "$model" ] || [ "$model" = "default" ]; then
    output=$(CODEX_HOME="$dir" "${TIMEOUT_CMD[@]}" codex exec --dangerously-bypass-approvals-and-sandbox "$prompt" 2>&1)
  else
    output=$(CODEX_HOME="$dir" "${TIMEOUT_CMD[@]}" codex exec --dangerously-bypass-approvals-and-sandbox -m "$model" "$prompt" 2>&1)
  fi
  exitcode=$?
  set -e
  output_tail=$(printf '%s\n' "$output" | tail -n 30)
  if echo "$output_tail" | grep -qiE "$QUOTA_REGEX"; then
    return 1
  fi
  if echo "$output_tail" | grep -qiE "$MODEL_UNSUPPORTED_REGEX"; then
    LAST_PROVIDER="codex/$label"
    printf '%s' "$output"
    return 64
  fi
  if [ "$exitcode" -eq 0 ] && [ -n "${output// }" ]; then
    LAST_PROVIDER="codex/$label"
    printf '%s' "$output"
    return 0
  fi
  if [ "$exitcode" -eq 2 ] && [ -z "${output// }" ]; then
    return 1
  fi
  LAST_PROVIDER="codex/$label"
  printf '%s' "$output"
  return "$exitcode"
}

run_grader_with_failover() {
  local prompt="$1" model="$2"
  LAST_PROVIDER=""
  local rc

  rc=0; try_codex "$prompt" "acc1" "$CODEX_ACC1" "$model" || rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -eq 64 ]; then return 64; fi
  if [ "$rc" -ne 1 ]; then return "$rc"; fi

  if [ "$CODEX_SINGLE_ACCOUNT" = "1" ]; then
    sleep "$BOTH_EXHAUSTED_SLEEP"
    rc=0; try_codex "$prompt" "acc1" "$CODEX_ACC1" "$model" || rc=$?
    if [ "$rc" -eq 0 ]; then return 0; fi
    if [ "$rc" -eq 64 ]; then return 64; fi
    echo "<promise>ABORT</promise>"
    return 2
  fi

  rc=0; try_codex "$prompt" "acc2" "$CODEX_ACC2" "$model" || rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -eq 64 ]; then return 64; fi
  if [ "$rc" -ne 1 ]; then return "$rc"; fi

  sleep "$BOTH_EXHAUSTED_SLEEP"
  rc=0; try_codex "$prompt" "acc1" "$CODEX_ACC1" "$model" || rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -eq 64 ]; then return 64; fi
  rc=0; try_codex "$prompt" "acc2" "$CODEX_ACC2" "$model" || rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -eq 64 ]; then return 64; fi

  echo "<promise>ABORT</promise>"
  return 2
}

ACC1_OK=$(validate_account "$CODEX_ACC1" && echo yes || echo no)
if [ "$ACC1_OK" = "no" ]; then
  echo "ERROR: primary account $CODEX_ACC1 missing or not logged in." >&2
  exit 1
fi

TOTAL=$(count_packetized)
START_VERIFIED=$(count_verified)

echo "───────────────────────────────────────────────────────────────"
echo "Ralph packet QA loop"
echo "  packets:    $PACKETS_INDEX  ($TOTAL packetized features, $START_VERIFIED verified)"
echo "  report:     $QA_REPORT"
echo "  pass1:      ${QA_PASS1_MODEL:-default}"
echo "  pass2:      ${QA_PASS2_MODEL:-default}"
echo "───────────────────────────────────────────────────────────────"

for i in $(seq 1 "$MAX_ITER"); do
  REVIEWABLE=$(count_reviewable)
  VERIFIED=$(count_verified)
  echo ""
  echo "═══ packet QA iter $i/$MAX_ITER — $VERIFIED/$TOTAL verified ($REVIEWABLE pending review) ══"
  echo ""

  if [ "$REVIEWABLE" -eq 0 ]; then
    echo "No NEEDS_REVIEW packets remain. Packet QA loop complete."
    break
  fi

  CURRENT_PACKET=$(next_review_packet)
  if [ -z "$CURRENT_PACKET" ]; then
    echo "Review packet lookup failed." >&2
    exit 2
  fi

  set_packet_status "$CURRENT_PACKET" "QA_RUNNING"

  STORY_ID=$(get_packet_field "$CURRENT_PACKET" "story_id")
  TITLE=$(get_packet_field "$CURRENT_PACKET" "title")

  PASS1_PROMPT="Read @ralph/qa-packets-pass1-prompt.md @CLAUDE.md @$PACKETS_INDEX @$BASELINE_NOISE

ITERATION: $i of $MAX_ITER
CURRENT_PACKET: $CURRENT_PACKET

Evaluate exactly ONE packet in QA_RUNNING.
Do not fix code.
Do not write files.
Output only PASS, FAIL, or BLOCKED via promise tag."

  set +e
  pass1_result=$(run_grader_with_failover "$PASS1_PROMPT" "$QA_PASS1_MODEL")
  PASS1_RC=$?
  set -e

  echo "$pass1_result"
  if [ -n "${LAST_PROVIDER:-}" ]; then
    echo "[grader] pass1 used: $LAST_PROVIDER"
  fi

  pass1_tail=$(printf '%s\n' "$pass1_result" | tail -n 40)
  pass1_classification=$(extract_classification "$pass1_result")
  quota_tail=$(printf '%s' "$pass1_tail" | grep -ciE "$QUOTA_REGEX" || true)
  unsupported_tail=$(printf '%s' "$pass1_tail" | grep -ciE "$MODEL_UNSUPPORTED_REGEX" || true)

  if [ "$PASS1_RC" -eq 64 ] || [ "$unsupported_tail" -gt 0 ]; then
    echo ""
    echo "Packet QA pass1 model '$QA_PASS1_MODEL' is not supported by this Codex account. Resetting $CURRENT_PACKET to NEEDS_REVIEW and aborting QA." >&2
    set_packet_status "$CURRENT_PACKET" "NEEDS_REVIEW"
    exit 2
  fi

  if [ "$pass1_classification" = "RUNNER_ABORT" ]; then
    echo ""
    echo "Packet QA pass1 reported RUNNER_ABORT. Resetting $CURRENT_PACKET to NEEDS_REVIEW and aborting QA." >&2
    set_packet_status "$CURRENT_PACKET" "NEEDS_REVIEW"
    exit 2
  fi

  if echo "$pass1_tail" | grep -q '<promise>PASS</promise>' && [ "$quota_tail" -eq 0 ]; then
    append_pass1_report "$CURRENT_PACKET" "$STORY_ID" "$pass1_result"
    append_pass1_progress "$CURRENT_PACKET" "$TITLE" "$pass1_result"
    set_packet_status "$CURRENT_PACKET" "VERIFIED"
    git add "$PACKETS_INDEX" "$QA_REPORT" "$QA_PROGRESS"
    git commit -m "QPKT: $CURRENT_PACKET - verified by pass1

Packet verified by $QA_PASS1_MODEL without requiring production fixes." >/dev/null 2>&1 || true
  elif echo "$pass1_tail" | grep -q '<promise>FAIL</promise>' && [ "$quota_tail" -eq 0 ]; then
    echo "[grader] pass1 verdict FAIL — escalating to $QA_PASS2_MODEL"
    PASS2_PROMPT="Read @ralph/qa-packets-prompt.md @CLAUDE.md @$PACKETS_INDEX @$QA_REPORT @$QA_PROGRESS @$BASELINE_NOISE

ITERATION: $i of $MAX_ITER
CURRENT_PACKET: $CURRENT_PACKET
PASS1_SUMMARY:
$pass1_result

QA exactly ONE packet in QA_RUNNING, update the packet index and QA files, commit if needed, then stop.
Output <promise>NEXT</promise> when done.
Output <promise>QA_COMPLETE</promise> only if no NEEDS_REVIEW packets remain.
Output <promise>ABORT</promise> if blocked."
    set +e
    result=$(run_grader_with_failover "$PASS2_PROMPT" "$QA_PASS2_MODEL")
    RC=$?
    set -e
    echo "$result"
    if [ -n "${LAST_PROVIDER:-}" ]; then
      echo "[grader] pass2 used: $LAST_PROVIDER"
    fi
    result_tail=$(printf '%s\n' "$result" | tail -n 40)
    quota_tail=$(printf '%s' "$result_tail" | grep -ciE "$QUOTA_REGEX" || true)
    if echo "$result_tail" | grep -q '<promise>QA_COMPLETE</promise>' && [ "$quota_tail" -eq 0 ]; then
      echo ""
      echo "Packet QA agent signaled QA_COMPLETE."
      break
    elif echo "$result_tail" | grep -q '<promise>ABORT</promise>' && [ "$quota_tail" -eq 0 ]; then
      PACKET_STATUS=$(get_packet_status "$CURRENT_PACKET")
      if [ "$PACKET_STATUS" = "QA_RUNNING" ]; then
        echo ""
        echo "Packet QA pass2 signaled ABORT before updating packet state. Resetting $CURRENT_PACKET to NEEDS_REVIEW." >&2
        set_packet_status "$CURRENT_PACKET" "NEEDS_REVIEW"
        exit 2
      else
        echo ""
        echo "Packet QA pass2 emitted ABORT after setting $CURRENT_PACKET to $PACKET_STATUS. Treating packet as handled and continuing."
      fi
    elif echo "$result_tail" | grep -q '<promise>NEXT</promise>' && [ "$quota_tail" -eq 0 ]; then
      PACKET_STATUS=$(get_packet_status "$CURRENT_PACKET")
      if [ "$PACKET_STATUS" = "QA_RUNNING" ]; then
        echo "Pass2 returned NEXT but packet status is still QA_RUNNING. Resetting to NEEDS_REVIEW." >&2
        set_packet_status "$CURRENT_PACKET" "NEEDS_REVIEW"
        exit 2
      fi
    else
      PACKET_STATUS=$(get_packet_status "$CURRENT_PACKET")
      if [ "$PACKET_STATUS" = "QA_RUNNING" ]; then
        echo ""
        echo "No promise tag found from pass2 (exit=$RC). Resetting $CURRENT_PACKET to NEEDS_REVIEW."
        set_packet_status "$CURRENT_PACKET" "NEEDS_REVIEW"
      else
        echo ""
        echo "No promise tag found from pass2 (exit=$RC), but $CURRENT_PACKET is now $PACKET_STATUS. Treating packet as handled and continuing."
      fi
    fi
  elif echo "$pass1_tail" | grep -q '<promise>BLOCKED</promise>' && [ "$quota_tail" -eq 0 ]; then
    echo "[grader] pass1 verdict BLOCKED — escalating to $QA_PASS2_MODEL"
    PASS2_PROMPT="Read @ralph/qa-packets-prompt.md @CLAUDE.md @$PACKETS_INDEX @$QA_REPORT @$QA_PROGRESS @$BASELINE_NOISE

ITERATION: $i of $MAX_ITER
CURRENT_PACKET: $CURRENT_PACKET
PASS1_SUMMARY:
$pass1_result

QA exactly ONE packet in QA_RUNNING, update the packet index and QA files, commit if needed, then stop.
Output <promise>NEXT</promise> when done.
Output <promise>QA_COMPLETE</promise> only if no NEEDS_REVIEW packets remain.
Output <promise>ABORT</promise> if blocked."
    set +e
    result=$(run_grader_with_failover "$PASS2_PROMPT" "$QA_PASS2_MODEL")
    RC=$?
    set -e
    echo "$result"
    if [ -n "${LAST_PROVIDER:-}" ]; then
      echo "[grader] pass2 used: $LAST_PROVIDER"
    fi
    result_tail=$(printf '%s\n' "$result" | tail -n 40)
    quota_tail=$(printf '%s' "$result_tail" | grep -ciE "$QUOTA_REGEX" || true)
    if echo "$result_tail" | grep -q '<promise>QA_COMPLETE</promise>' && [ "$quota_tail" -eq 0 ]; then
      echo ""
      echo "Packet QA agent signaled QA_COMPLETE."
      break
    elif echo "$result_tail" | grep -q '<promise>ABORT</promise>' && [ "$quota_tail" -eq 0 ]; then
      PACKET_STATUS=$(get_packet_status "$CURRENT_PACKET")
      if [ "$PACKET_STATUS" = "QA_RUNNING" ]; then
        echo ""
        echo "Packet QA pass2 signaled ABORT before updating packet state. Resetting $CURRENT_PACKET to NEEDS_REVIEW." >&2
        set_packet_status "$CURRENT_PACKET" "NEEDS_REVIEW"
        exit 2
      else
        echo ""
        echo "Packet QA pass2 emitted ABORT after setting $CURRENT_PACKET to $PACKET_STATUS. Treating packet as handled and continuing."
      fi
    elif echo "$result_tail" | grep -q '<promise>NEXT</promise>' && [ "$quota_tail" -eq 0 ]; then
      PACKET_STATUS=$(get_packet_status "$CURRENT_PACKET")
      if [ "$PACKET_STATUS" = "QA_RUNNING" ]; then
        echo "Pass2 returned NEXT but packet status is still QA_RUNNING. Resetting to NEEDS_REVIEW." >&2
        set_packet_status "$CURRENT_PACKET" "NEEDS_REVIEW"
        exit 2
      fi
    else
      PACKET_STATUS=$(get_packet_status "$CURRENT_PACKET")
      if [ "$PACKET_STATUS" = "QA_RUNNING" ]; then
        echo ""
        echo "No promise tag found from pass2 (exit=$RC). Resetting $CURRENT_PACKET to NEEDS_REVIEW."
        set_packet_status "$CURRENT_PACKET" "NEEDS_REVIEW"
      else
        echo ""
        echo "No promise tag found from pass2 (exit=$RC), but $CURRENT_PACKET is now $PACKET_STATUS. Treating packet as handled and continuing."
      fi
    fi
  else
    echo ""
    echo "No valid promise tag found from pass1 (exit=$PASS1_RC). Resetting $CURRENT_PACKET to NEEDS_REVIEW."
    set_packet_status "$CURRENT_PACKET" "NEEDS_REVIEW"
  fi

  sleep "$SLEEP_BETWEEN"
done

FINAL_VERIFIED=$(count_verified)
DELTA=$((FINAL_VERIFIED - START_VERIFIED))
echo ""
echo "───────────────────────────────────────────────────────────────"
echo "Packet QA summary: $FINAL_VERIFIED/$TOTAL verified (+$DELTA this run)"
echo "───────────────────────────────────────────────────────────────"
