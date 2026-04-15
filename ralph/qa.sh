#!/usr/bin/env bash
# Ralph QA loop — Gemini 3 pro preview as sole independent grader.
#
# Builder ≠ grader principle: Claude built the code, Google Gemini 3
# grades it independently. For each passes:true story in prd.json,
# Gemini verifies, probes edge cases, fixes bugs in production code.
# Findings → ralph/qa-report.json. Progress → ralph/qa-progress.txt.
#
# No fallback providers. If Gemini fails, the loop aborts cleanly.
#
# Env overrides:
#   GEMINI_MODEL=<id>    override model (default gemini-3-pro-preview)
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

GEMINI_MODEL="${GEMINI_MODEL:-gemini-3-pro-preview}"

# Quota / auth / transport detection (only applied to FAILED calls — gemini's
# internal retries sometimes print 429/TLS noise even on successful runs)
QUOTA_REGEX='429|rate.?limit|rate_limit|quota.?exceeded|quota_exceeded|usage.?limit|insufficient_quota|retry.?after|RESOURCE_EXHAUSTED|hit your usage limit|try again at|unauthorized|invalid.?api.?key|401|402|403|ERR_SSL_|TLS.?ALERT|UNAVAILABLE|overloaded'

if [ ! -f "$PRD" ]; then
  echo "ERROR: $PRD not found." >&2
  exit 1
fi

if ! command -v gemini >/dev/null 2>&1; then
  echo "ERROR: gemini CLI not found. Install via 'npm i -g @google/gemini-cli'." >&2
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

BUILT=$(count_built)
QAD=$(count_qad)

echo "───────────────────────────────────────────────────────────────"
echo "Ralph QA loop — Gemini sole grader"
echo "  prd:        $PRD  ($BUILT features built, $QAD already QA'd)"
echo "  report:     $QA_REPORT"
echo "  progress:   $QA_PROGRESS"
echo "  max iter:   $MAX_ITER"
if [ ${#TIMEOUT_CMD[@]} -gt 0 ]; then
  echo "  timeout:    ${ITER_TIMEOUT}s per iter (${TIMEOUT_CMD[0]})"
else
  echo "  timeout:    (none available)"
fi
echo "  grader:     gemini/$GEMINI_MODEL"
echo "───────────────────────────────────────────────────────────────"

if [ "$BUILT" -eq 0 ]; then
  echo "No features built yet. Nothing to QA. Exiting."
  exit 0
fi

run_grader() {
  local prompt="$1"
  echo "[grader] trying gemini/$GEMINI_MODEL..." >&2
  local output exitcode
  output=$("${TIMEOUT_CMD[@]}" gemini -m "$GEMINI_MODEL" --yolo -p "$prompt" 2>&1) || true
  exitcode=$?

  local output_tail
  output_tail=$(printf '%s\n' "$output" | tail -n 30)

  # Success first: Gemini internal retries emit 429 noise even on success
  if [ "$exitcode" -eq 0 ] && [ -n "${output// }" ]; then
    # Check tail for quota markers that actually indicate failure
    if echo "$output_tail" | grep -qiE "$QUOTA_REGEX"; then
      echo "[grader] gemini/$GEMINI_MODEL quota/transport pattern in tail of exit-0 response — treating as failure" >&2
      return 1
    fi
    printf '%s' "$output"
    return 0
  fi
  if [ "$exitcode" -ne 0 ] && [ -z "${output// }" ]; then
    echo "[grader] gemini/$GEMINI_MODEL silent non-zero exit — treating as quota" >&2
    return 1
  fi
  if [ "$exitcode" -ne 0 ] && echo "$output_tail" | grep -qiE "$QUOTA_REGEX"; then
    echo "[grader] gemini/$GEMINI_MODEL quota/transport failure" >&2
    return 1
  fi
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
Append a structured entry to $QA_REPORT with qa_model set to \"gemini-3-pro-preview\".
Also flip qa_tested:true in $PRD for that story (per qa-prompt.md step 9b).
Update $QA_PROGRESS.
Commit your changes with a 'QA: <story-id> — ...' prefix before finishing.
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
    echo "[grader] gemini failed (quota/auth/transport). No fallback configured. Exiting." >&2
    exit 1
  fi

  # Grep only the last 40 lines for promise tags to avoid prompt-echo false matches.
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
