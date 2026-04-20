#!/usr/bin/env bash
# Ralph manual audit loop — Codex manually audits the current repo risk slice by slice.
#
# This is a classic Ralph-style loop with context outside the terminal:
#   - state:   ralph/manual-audit-state.json
#   - report:  ralph/manual-audit-report.json
#   - log:     ralph/manual-audit-progress.txt
#
# Usage:
#   ./ralph/manual-audit.sh [max_iterations=999]
#
# Env overrides:
#   MANUAL_AUDIT_MODEL=<id>     default gpt-5.4
#   CODEX_ACC1=<path>           default $HOME/.codex-acc1
#   CODEX_ACC2=<path>           default $HOME/.codex-acc2
#   CODEX_SINGLE_ACCOUNT=1      disable acc2 fallback

set -euo pipefail
cd "$(dirname "$0")/.."

MAX_ITER="${1:-999}"
STATE="ralph/manual-audit-state.json"
REPORT="ralph/manual-audit-report.json"
PROGRESS="ralph/manual-audit-progress.txt"
PROMPT_FILE="ralph/manual-audit-prompt.md"
ITER_TIMEOUT=1800
SLEEP_BETWEEN=3

MANUAL_AUDIT_MODEL="${MANUAL_AUDIT_MODEL:-gpt-5.4}"
CODEX_ACC1="${CODEX_ACC1:-$HOME/.codex-acc1}"
CODEX_ACC2="${CODEX_ACC2:-$HOME/.codex-acc2}"
CODEX_SINGLE_ACCOUNT="${CODEX_SINGLE_ACCOUNT:-0}"
QUOTA_REGEX='HTTP 429|rate.limit.exceeded|rate_limit_exceeded|quota.exceeded|quota_exceeded|usage.limit.exceeded|insufficient_quota|retry.after.*seconds|RESOURCE_EXHAUSTED|hit your usage limit|try again at [0-9]|billing.*hard.*limit|exceeded.*current.*quota'
MODEL_UNSUPPORTED_REGEX='invalid_request_error.*not supported when using Codex with a ChatGPT account|model.*not supported'
BOTH_EXHAUSTED_SLEEP=300

for required in "$STATE" "$REPORT" "$PROGRESS" "$PROMPT_FILE"; do
  if [ ! -f "$required" ]; then
    echo "ERROR: $required not found." >&2
    exit 1
  fi
done

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

count_total() {
  python3 -c "import json; d=json.load(open('$STATE')); print(len(d.get('slices', [])))"
}

count_done() {
  python3 -c "import json; d=json.load(open('$STATE')); print(sum(1 for x in d.get('slices', []) if x.get('status') in {'AUDITED','BLOCKED'}))"
}

count_remaining() {
  python3 -c "import json; d=json.load(open('$STATE')); print(sum(1 for x in d.get('slices', []) if x.get('status') not in {'AUDITED','BLOCKED'}))"
}

next_slice() {
  python3 - <<PY
import json
with open("$STATE") as f:
    d = json.load(f)
slices = sorted(d.get("slices", []), key=lambda x: x.get("priority", 999999))
for preferred in ("IN_PROGRESS", "PENDING"):
    for item in slices:
        if item.get("status") != preferred:
            continue
        deps = item.get("depends_on", [])
        status_by_id = {s["slice_id"]: s.get("status") for s in slices}
        if all(status_by_id.get(dep) in {"AUDITED", "BLOCKED"} for dep in deps):
            print(item["slice_id"])
            raise SystemExit
print("")
PY
}

get_slice_status() {
  local slice_id="$1"
  python3 - <<PY
import json
with open("$STATE") as f:
    d = json.load(f)
for item in d.get("slices", []):
    if item["slice_id"] == "$slice_id":
        print(item.get("status", ""))
        break
PY
}

set_slice_status() {
  local slice_id="$1"
  local status="$2"
  python3 - <<PY
import json
from datetime import datetime, timezone
path = "$STATE"
slice_id = "$slice_id"
status = "$status"
with open(path) as f:
    data = json.load(f)
for item in data.get("slices", []):
    if item["slice_id"] == slice_id:
        item["status"] = status
        break
data["current_slice_id"] = slice_id
data["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\\n")
PY
}

extract_promise() {
  local text="$1"
  printf '%s\n' "$text" | tail -n 80 | grep -o '<promise>[^<]*</promise>' | tail -1 | sed 's#<promise>##; s#</promise>##' || true
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

run_auditor_with_failover() {
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

TOTAL=$(count_total)
START_DONE=$(count_done)

echo "───────────────────────────────────────────────────────────────"
echo "Ralph manual audit loop — Codex risk-based auditor"
echo "  state:      $STATE  ($TOTAL slices, $START_DONE already handled)"
echo "  report:     $REPORT"
echo "  progress:   $PROGRESS"
echo "  model:      $MANUAL_AUDIT_MODEL"
echo "  max iter:   $MAX_ITER"
echo "───────────────────────────────────────────────────────────────"

for i in $(seq 1 "$MAX_ITER"); do
  DONE=$(count_done)
  REMAINING=$(count_remaining)
  echo ""
  echo "═══ manual audit iter $i/$MAX_ITER — $DONE/$TOTAL handled ($REMAINING remaining) ══"
  echo ""

  if [ "$REMAINING" -eq 0 ]; then
    echo "All audit slices handled. Manual audit complete."
    break
  fi

  CURRENT_SLICE=$(next_slice)
  if [ -z "$CURRENT_SLICE" ]; then
    echo "No runnable audit slice found." >&2
    exit 2
  fi

  set_slice_status "$CURRENT_SLICE" "IN_PROGRESS"

  PROMPT="Read @$PROMPT_FILE @CLAUDE.md @$STATE @$REPORT @$PROGRESS @ralph/packets/index.json @ralph/packet-qa-progress.txt @ralph/packet-qa-report.json @research-hub/BACKEND_ARCHITECTURE_MAP.md @research-hub/DESIGN_DECISIONS.md @research-hub/PROJECT_HANDOFF.md @research-hub/DEFERRED_TICKETS.md

ITERATION: $i of $MAX_ITER
CURRENT_SLICE: $CURRENT_SLICE

Audit exactly ONE slice whose status is IN_PROGRESS.
Update the state, report, and progress files before finishing.
Commit logical fixes as needed.
Output <promise>NEXT</promise> when this slice is fully handled.
Output <promise>AUDIT_COMPLETE</promise> only if every slice is handled.
Output <promise>ABORT</promise> if blocked."

  set +e
  result=$(run_auditor_with_failover "$PROMPT" "$MANUAL_AUDIT_MODEL")
  RC=$?
  set -e

  echo "$result"
  if [ -n "${LAST_PROVIDER:-}" ]; then
    echo "[auditor] iteration used: $LAST_PROVIDER"
  fi

  result_tail=$(printf '%s\n' "$result" | tail -n 40)
  promise=$(extract_promise "$result")
  unsupported_tail=$(printf '%s' "$result_tail" | grep -ciE "$MODEL_UNSUPPORTED_REGEX" || true)

  if [ "$RC" -eq 64 ] || [ "$unsupported_tail" -gt 0 ]; then
    echo ""
    echo "Manual audit model '$MANUAL_AUDIT_MODEL' is not supported by this Codex account. Resetting $CURRENT_SLICE to PENDING and aborting." >&2
    set_slice_status "$CURRENT_SLICE" "PENDING"
    exit 2
  fi

  case "$promise" in
    AUDIT_COMPLETE)
      if [ "$(count_remaining)" -eq 0 ]; then
        echo ""
        echo "Auditor signaled AUDIT_COMPLETE."
        break
      fi
      echo ""
      echo "Auditor emitted AUDIT_COMPLETE but slices remain. Continuing."
      ;;
    NEXT)
      SLICE_STATUS=$(get_slice_status "$CURRENT_SLICE")
      if [ "$SLICE_STATUS" = "IN_PROGRESS" ]; then
        echo "Slice returned NEXT but is still IN_PROGRESS. Resetting to PENDING." >&2
        set_slice_status "$CURRENT_SLICE" "PENDING"
        exit 2
      fi
      ;;
    ABORT)
      SLICE_STATUS=$(get_slice_status "$CURRENT_SLICE")
      if [ "$SLICE_STATUS" = "IN_PROGRESS" ]; then
        echo ""
        echo "Auditor aborted before updating slice state. Resetting $CURRENT_SLICE to PENDING." >&2
        set_slice_status "$CURRENT_SLICE" "PENDING"
      fi
      exit 2
      ;;
    *)
      SLICE_STATUS=$(get_slice_status "$CURRENT_SLICE")
      if [ "$SLICE_STATUS" = "IN_PROGRESS" ]; then
        echo ""
        echo "No usable promise tag found (exit=$RC). Resetting $CURRENT_SLICE to PENDING."
        set_slice_status "$CURRENT_SLICE" "PENDING"
      fi
      exit 2
      ;;
  esac

  sleep "$SLEEP_BETWEEN"
done

FINAL_DONE=$(count_done)
DELTA=$((FINAL_DONE - START_DONE))
echo ""
echo "───────────────────────────────────────────────────────────────"
echo "Manual audit summary: $FINAL_DONE/$TOTAL handled (+$DELTA this run)"
echo "───────────────────────────────────────────────────────────────"
