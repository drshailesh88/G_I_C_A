#!/usr/bin/env bash
# Ralph QA loop — OpenCode / GLM-5.1 as sole independent grader.
#
# Builder ≠ grader principle: Claude built the code, a DIFFERENT model
# family (GLM-5.1 via z.ai coding plan, through the OpenCode CLI) grades
# it. For each passes:true story in prd.json, OpenCode verifies the
# feature, probes edge cases, and fixes bugs in production code.
# Findings → ralph/qa-report.json. Progress → ralph/qa-progress.txt.
#
# No fallback providers. If OpenCode fails, the loop aborts cleanly.
# This is intentional — we're proving GLM-5.1 can carry QA end to end.
#
# Env overrides:
#   OPENCODE_MODEL=<id>   override model (default zai-coding-plan/glm-5.1)
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

OPENCODE_MODEL="${OPENCODE_MODEL:-zai-coding-plan/glm-5.1}"

# Quota / auth / transport detection
QUOTA_REGEX='429|rate.?limit|rate_limit|quota.?exceeded|quota_exceeded|usage.?limit|insufficient_quota|retry.?after|RESOURCE_EXHAUSTED|hit your usage limit|try again at|unauthorized|invalid.?api.?key|401|402|403'

if [ ! -f "$PRD" ]; then
  echo "ERROR: $PRD not found. Cannot QA without a PRD." >&2
  exit 1
fi

if ! command -v opencode >/dev/null 2>&1; then
  echo "ERROR: opencode CLI not found. Install via 'npm i -g opencode-ai' or equivalent." >&2
  exit 1
fi

# Resolve timeout command (macOS ships without `timeout`).
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(timeout "$ITER_TIMEOUT")
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(gtimeout "$ITER_TIMEOUT")
else
  echo "WARNING: no timeout command found (install coreutils for gtimeout). Iterations will run without time limit — Ctrl-C if hung." >&2
  TIMEOUT_CMD=()
fi

if [ ! -f "$QA_REPORT" ]; then
  echo "[]" > "$QA_REPORT"
  echo "Initialized $QA_REPORT"
fi

if [ ! -f "$QA_PROGRESS" ]; then
  cat > "$QA_PROGRESS" <<'EOF'
# Ralph QA Progress

## QA Patterns

<!-- Cross-feature QA findings: common bug classes, edge cases worth re-checking. -->

## Iteration log

<!-- Dated entries per QA'd feature. -->
EOF
  echo "Initialized $QA_PROGRESS"
fi

count_built() {
  python3 -c "import json; d=json.load(open('$PRD')); print(sum(1 for x in d if x.get('passes', False)))"
}
count_qad() {
  python3 -c "import json; d=json.load(open('$QA_REPORT')); print(len({x['story_id'] for x in d if x.get('story_id')}))"
}

BUILT=$(count_built)
QAD=$(count_qad)

echo "───────────────────────────────────────────────────────────────"
echo "Ralph QA loop — OpenCode / GLM-5.1 sole grader"
echo "  prd:        $PRD  ($BUILT features built, $QAD already QA'd)"
echo "  report:     $QA_REPORT"
echo "  progress:   $QA_PROGRESS"
echo "  max iter:   $MAX_ITER"
if [ ${#TIMEOUT_CMD[@]} -gt 0 ]; then
  echo "  timeout:    ${ITER_TIMEOUT}s per iter (${TIMEOUT_CMD[0]})"
else
  echo "  timeout:    (none available — install coreutils)"
fi
echo "  grader:     opencode/$OPENCODE_MODEL"
echo "───────────────────────────────────────────────────────────────"

if [ "$BUILT" -eq 0 ]; then
  echo "No features built yet (passes:true count = 0). Nothing to QA. Exiting."
  exit 0
fi

# ── OpenCode invocation ────────────────────────────────────────────
# Returns:
#   0  success; output printed to stdout
#   1  quota / auth / transport failure
#   N  other non-zero exit; output printed to stdout
run_grader() {
  local prompt="$1"
  echo "[grader] trying opencode/$OPENCODE_MODEL..." >&2
  local output exitcode
  output=$("${TIMEOUT_CMD[@]}" opencode run --dangerously-skip-permissions --model "$OPENCODE_MODEL" "$prompt" 2>&1) || true
  exitcode=$?

  local output_tail
  output_tail=$(printf '%s\n' "$output" | tail -n 30)

  # Quota / auth / transport patterns in response tail
  if echo "$output_tail" | grep -qiE "$QUOTA_REGEX"; then
    echo "[grader] opencode/$OPENCODE_MODEL quota/auth pattern matched in response tail" >&2
    return 1
  fi
  # Success
  if [ "$exitcode" -eq 0 ] && [ -n "${output// }" ]; then
    printf '%s' "$output"
    return 0
  fi
  # Silent failure
  if [ "$exitcode" -ne 0 ] && [ -z "${output// }" ]; then
    echo "[grader] opencode/$OPENCODE_MODEL silent non-zero exit" >&2
    return 1
  fi
  # Non-quota failure — propagate output + exitcode
  printf '%s' "$output"
  return "$exitcode"
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
Append a structured entry to $QA_REPORT. Also flip qa_tested:true in $PRD for that story (per qa-prompt.md step 9b).
Update $QA_PROGRESS.
Output <promise>NEXT</promise> when done.
Output <promise>QA_COMPLETE</promise> only if every passes:true story has a qa-report entry.
Output <promise>ABORT</promise> if blocked (explain why above the tag)."

  set +e
  result=$(run_grader "$PROMPT")
  RC=$?
  set -e

  echo "$result"

  if [ "$RC" -eq 1 ]; then
    echo ""
    echo "[grader] opencode failed (quota/auth/transport). No fallback configured. Exiting." >&2
    exit 1
  fi

  # Only grep the LAST 40 lines for promise tags — prompt-echo substrings
  # elsewhere in the output would cause false matches.
  result_tail=$(printf '%s\n' "$result" | tail -n 40)
  quota_tail=$(printf '%s' "$result_tail" | grep -ciE "$QUOTA_REGEX")

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
    echo "Grader signaled ABORT — QA blocked. Stopping." >&2
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
