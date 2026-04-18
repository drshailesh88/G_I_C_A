#!/usr/bin/env bash
# Ralph QA loop — Codex (ChatGPT) as sole independent grader, dual-account failover.
#
# Builder ≠ grader principle: Claude Code built the features; Codex/GPT-5.4
# grades them. For each passes:true story in prd.json, Codex verifies the
# feature, probes edge cases, and fixes bugs in production code.
# Findings → ralph/qa-report.json. Progress → ralph/qa-progress.txt.
#
# Dual-account failover: tries CODEX_ACC1 first, falls back to CODEX_ACC2
# on quota exhaustion. Auto-recover: every iteration starts from acc1
# again, so when acc1's 5h window refills it picks up automatically.
#
# Env overrides:
#   CODEX_ACC1=<path>            primary codex account (default $HOME/.codex-acc1)
#   CODEX_ACC2=<path>            fallback codex account (default $HOME/.codex-acc2)
#   CODEX_SINGLE_ACCOUNT=1       disable fallback layer
#
# Usage: ./ralph/qa.sh [max_iterations=999]

set -euo pipefail
cd "$(dirname "$0")/.."

MAX_ITER="${1:-999}"
PRD=ralph/prd.json
QA_REPORT=ralph/qa-report.json
QA_PROGRESS=ralph/qa-progress.txt
ITER_TIMEOUT=1800
SLEEP_BETWEEN=3

CODEX_ACC1="${CODEX_ACC1:-$HOME/.codex-acc1}"
CODEX_ACC2="${CODEX_ACC2:-$HOME/.codex-acc2}"
CODEX_SINGLE_ACCOUNT="${CODEX_SINGLE_ACCOUNT:-0}"

# Quota / auth / transport detection
QUOTA_REGEX='HTTP 429|rate.limit.exceeded|rate_limit_exceeded|quota.exceeded|quota_exceeded|usage.limit.exceeded|insufficient_quota|retry.after.*seconds|RESOURCE_EXHAUSTED|hit your usage limit|try again at [0-9]|billing.*hard.*limit|exceeded.*current.*quota'
BOTH_EXHAUSTED_SLEEP=300   # 5 min

if [ ! -f "$PRD" ]; then
  echo "ERROR: $PRD not found." >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: codex CLI not found." >&2
  exit 1
fi

# Resolve timeout command (macOS ships without `timeout`).
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(timeout "$ITER_TIMEOUT")
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(gtimeout "$ITER_TIMEOUT")
else
  echo "WARNING: no timeout command found. Install 'brew install coreutils'." >&2
  TIMEOUT_CMD=()
fi

if [ ! -f "$QA_REPORT" ]; then
  echo "[]" > "$QA_REPORT"
fi
if [ ! -f "$QA_PROGRESS" ]; then
  cat > "$QA_PROGRESS" <<'EOF'
# Ralph QA Progress

## QA Patterns

## Iteration log

EOF
fi

count_built() {
  python3 -c "import json; d=json.load(open('$PRD')); print(sum(1 for x in d if x.get('passes', False)))"
}
count_qad() {
  python3 -c "import json; d=json.load(open('$QA_REPORT')); print(len({x['story_id'] for x in d if x.get('story_id')}))"
}
validate_account() {
  local dir="$1"
  [ -d "$dir" ] && [ -s "$dir/auth.json" ]
}

BUILT=$(count_built)
QAD=$(count_qad)

ACC1_OK=$(validate_account "$CODEX_ACC1" && echo yes || echo no)
ACC2_OK=$(validate_account "$CODEX_ACC2" && echo yes || echo no)

echo "───────────────────────────────────────────────────────────────"
echo "Ralph QA loop — Codex independent evaluator"
echo "  prd:        $PRD  ($BUILT features built, $QAD already QA'd)"
echo "  report:     $QA_REPORT"
echo "  progress:   $QA_PROGRESS"
echo "  max iter:   $MAX_ITER"
if [ ${#TIMEOUT_CMD[@]} -gt 0 ]; then
  echo "  timeout:    ${ITER_TIMEOUT}s per iter (${TIMEOUT_CMD[0]})"
else
  echo "  timeout:    (none available)"
fi
echo "  acc1:       $CODEX_ACC1  (authed: $ACC1_OK)"
if [ "$CODEX_SINGLE_ACCOUNT" = "1" ]; then
  echo "  acc2:       (disabled — CODEX_SINGLE_ACCOUNT=1)"
else
  echo "  acc2:       $CODEX_ACC2  (authed: $ACC2_OK)"
fi
echo "───────────────────────────────────────────────────────────────"

if [ "$ACC1_OK" = "no" ]; then
  echo "ERROR: primary account $CODEX_ACC1 missing or not logged in." >&2
  echo "Run: CODEX_HOME=$CODEX_ACC1 codex login" >&2
  exit 1
fi

if [ "$BUILT" -eq 0 ]; then
  echo "No features built yet. Nothing to QA. Exiting."
  exit 0
fi

# Try a single codex account. Returns:
#   0 success (output printed to stdout, LAST_PROVIDER set)
#   1 quota/auth failure (try next layer)
#   N other non-zero exit (output printed, caller decides)
try_codex() {
  local prompt="$1" label="$2" dir="$3"
  if [ ! -s "$dir/auth.json" ]; then
    echo "[grader] skipping codex/$label (not authed: $dir)" >&2
    return 1
  fi
  echo "[grader] trying codex/$label ($dir)..." >&2
  local output exitcode
  output=$(CODEX_HOME="$dir" "${TIMEOUT_CMD[@]}" codex exec --dangerously-bypass-approvals-and-sandbox "$prompt" 2>&1) || true
  exitcode=$?

  local output_tail
  output_tail=$(printf '%s\n' "$output" | tail -n 30)

  # Codex CLI exits 0 even when returning a rate-limit error message.
  # Check response tail for quota markers BEFORE trusting exit code.
  if echo "$output_tail" | grep -qiE "$QUOTA_REGEX"; then
    echo "[grader] codex/$label quota pattern matched in response tail" >&2
    return 1
  fi
  # Success
  if [ "$exitcode" -eq 0 ] && [ -n "${output// }" ]; then
    LAST_PROVIDER="codex/$label"
    printf '%s' "$output"
    return 0
  fi
  # Silent rate-limit path
  if [ "$exitcode" -eq 2 ] && [ -z "${output// }" ]; then
    echo "[grader] codex/$label silent exit 2 — treating as quota" >&2
    return 1
  fi
  # Non-quota failure
  LAST_PROVIDER="codex/$label"
  printf '%s' "$output"
  return "$exitcode"
}

# Main failover chain. Uses `|| rc=$?` to prevent set -e from aborting the
# chain on a non-zero return from a layer.
run_grader_with_failover() {
  local prompt="$1"
  LAST_PROVIDER=""
  local rc

  rc=0; try_codex "$prompt" "acc1" "$CODEX_ACC1" || rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -ne 1 ]; then return "$rc"; fi

  if [ "$CODEX_SINGLE_ACCOUNT" = "1" ]; then
    echo "[grader] acc1 exhausted and acc2 disabled. Sleeping ${BOTH_EXHAUSTED_SLEEP}s then retrying acc1..." >&2
    sleep "$BOTH_EXHAUSTED_SLEEP"
    rc=0; try_codex "$prompt" "acc1" "$CODEX_ACC1" || rc=$?
    if [ "$rc" -eq 0 ]; then return 0; fi
    echo "<promise>ABORT</promise>"
    echo "codex/acc1 still quota-exhausted after 5-min wait. Wait for rate-limit window to clear." >&2
    return 2
  fi

  rc=0; try_codex "$prompt" "acc2" "$CODEX_ACC2" || rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -ne 1 ]; then return "$rc"; fi

  echo "[grader] both codex accounts exhausted. Sleeping ${BOTH_EXHAUSTED_SLEEP}s before retry..." >&2
  sleep "$BOTH_EXHAUSTED_SLEEP"
  rc=0; try_codex "$prompt" "acc1" "$CODEX_ACC1" || rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  rc=0; try_codex "$prompt" "acc2" "$CODEX_ACC2" || rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi

  echo "<promise>ABORT</promise>"
  echo "Both Codex accounts exhausted after sleep+retry. Wait for rate-limit windows to reset (~5h for ChatGPT Plus)." >&2
  return 2
}

for i in $(seq 1 "$MAX_ITER"); do
  BUILT=$(count_built)
  QAD=$(count_qad)
  REMAINING=$((BUILT - QAD))
  echo ""
  echo "═══ QA iter $i/$MAX_ITER — $QAD/$BUILT QA'd ($REMAINING remaining) ══"
  echo ""

  if [ "$QAD" -ge "$BUILT" ]; then
    echo "All built features QA'd. Ralph QA done."
    break
  fi

  RECENT_QA_COMMITS=$(git log --grep='^QA:' -n 10 --format='%H%n%ad%n%B---' --date=short 2>/dev/null || echo '(no QA commits yet)')

  PROMPT="You are a DIFFERENT agent from the builder. Do not trust passes:true just because the builder said so.
Read ralph/qa-prompt.md for your full instructions. Also read CLAUDE.md, $PRD, $QA_REPORT, and $QA_PROGRESS.

ITERATION: $i of $MAX_ITER
PROGRESS: $QAD of $BUILT built features already QA'd
Previous QA commits:
$RECENT_QA_COMMITS

Pick the FIRST story in $PRD where passes:true AND no entry in $QA_REPORT has a matching story_id.
Verify it independently per ralph/qa-prompt.md: automated checks, manual acceptance, edge cases.
Fix any bugs you find in PRODUCTION code only — never tests, never locked files.
Append a structured entry to $QA_REPORT with qa_model set to \"codex\".
Also flip qa_tested:true in $PRD for that story (per qa-prompt.md step 9b).
Update $QA_PROGRESS.
Commit your changes with a 'QA: <story-id> — ...' prefix before finishing.
Output <promise>NEXT</promise> when done.
Output <promise>QA_COMPLETE</promise> only if every passes:true story has a qa-report entry.
Output <promise>ABORT</promise> if blocked (explain why above the tag)."

  set +e
  result=$(run_grader_with_failover "$PROMPT")
  RC=$?
  set -e

  echo "$result"
  if [ -n "${LAST_PROVIDER:-}" ]; then
    echo "[grader] iteration used: $LAST_PROVIDER"
  fi

  # Grep only the last 40 lines for promise tags to avoid prompt-echo false matches
  result_tail=$(printf '%s\n' "$result" | tail -n 40)
  quota_tail=$(printf '%s' "$result_tail" | grep -ciE "$QUOTA_REGEX" || true)

  if echo "$result_tail" | grep -q '<promise>QA_COMPLETE</promise>' && [ "$quota_tail" -eq 0 ]; then
    unqad=$(python3 -c "import json; d=json.load(open('$PRD')); r=json.load(open('$QA_REPORT')); done={e['story_id'] for e in r if e.get('story_id')}; print(sum(1 for x in d if x.get('passes') and x.get('id') not in done))")
    if [ "$unqad" -eq 0 ]; then
      echo ""
      echo "Grader signaled QA_COMPLETE (verified: 0 stories un-QA'd)."
      break
    else
      echo ""
      echo "Grader emitted QA_COMPLETE but $unqad stories still un-QA'd — ignoring false signal."
    fi
  elif echo "$result_tail" | grep -q '<promise>ABORT</promise>' && [ "$quota_tail" -eq 0 ]; then
    echo ""
    echo "Grader signaled ABORT. Stopping." >&2
    exit 2
  elif echo "$result_tail" | grep -q '<promise>NEXT</promise>' && [ "$quota_tail" -eq 0 ]; then
    :
  else
    echo ""
    echo "No usable promise tag (exit=$RC, quota_signals=$quota_tail). Restarting iteration."
  fi

  sleep "$SLEEP_BETWEEN"
done

FINAL_QAD=$(count_qad)
BUILT=$(count_built)

python3 - <<PY
import json
d = json.load(open('$QA_REPORT'))
total_bugs = sum(len(x.get('bugs', [])) for x in d)
fixed = sum(1 for x in d for b in x.get('bugs', []) if b.get('fix_commit'))
by_status = {}
for x in d:
    by_status[x.get('status','?')] = by_status.get(x.get('status','?'), 0) + 1
print('')
print('───────────────────────────────────────────────────────────────')
print(f"QA summary: {$FINAL_QAD}/{$BUILT} features QA'd")
print(f'  bugs found:   {total_bugs}')
print(f'  bugs fixed:   {fixed}')
print(f'  status tally: {by_status}')
print('───────────────────────────────────────────────────────────────')
PY
