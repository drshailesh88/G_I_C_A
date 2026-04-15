#!/usr/bin/env bash
# Ralph QA loop — independent Codex evaluation of every feature Ralph built.
#
# Codex is a DIFFERENT model from Claude. For each passes:true story in
# prd.json, Codex verifies the feature, probes edge cases, and fixes bugs
# in production code. Findings → ralph/qa-report.json. Progress →
# ralph/qa-progress.txt.
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

if [ ! -f "$PRD" ]; then
  echo "ERROR: $PRD not found. Cannot QA without a PRD." >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: codex CLI not found. Install Codex before running QA." >&2
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
# Ralph QA Progress — GEM India

## QA Patterns

<!-- Cross-feature QA findings: common bug classes, edge cases worth re-checking. Codex writes here. -->

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
echo "───────────────────────────────────────────────────────────────"

if [ "$BUILT" -eq 0 ]; then
  echo "No features built yet (passes:true count = 0). Nothing to QA. Exiting."
  exit 0
fi

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

  # Huntley-style single-string prompt argument — no intermediate heredoc.
  set +e
  result=$("${TIMEOUT_CMD[@]}" codex exec --dangerously-bypass-approvals-and-sandbox \
"You are a DIFFERENT agent from the builder. Do not trust passes:true just because the builder said so.
Read ralph/qa-prompt.md for your full instructions. Also read CLAUDE.md, $PRD, $QA_REPORT, and $QA_PROGRESS.

ITERATION: $i of $MAX_ITER
PROGRESS: $QAD of $BUILT built features already QA'd
Previous QA commits:
$RECENT_QA_COMMITS

Pick the FIRST story in $PRD where passes:true AND no entry in $QA_REPORT has a matching story_id.
Verify it independently per ralph/qa-prompt.md: automated checks, manual acceptance, edge cases.
Fix any bugs you find in PRODUCTION code only — never tests, never locked files.
Append a structured entry to $QA_REPORT. Update $QA_PROGRESS.
Output <promise>NEXT</promise> when done.
Output <promise>QA_COMPLETE</promise> only if every passes:true story has a qa-report entry.
Output <promise>ABORT</promise> if blocked (explain why above the tag).")
  CODEX_EXIT=$?
  set -e

  echo "$result"

  if echo "$result" | grep -q '<promise>QA_COMPLETE</promise>'; then
    echo ""
    echo "Codex signaled QA_COMPLETE."
    break
  elif echo "$result" | grep -q '<promise>ABORT</promise>'; then
    echo ""
    echo "Codex signaled ABORT — QA blocked. Stopping." >&2
    exit 2
  elif echo "$result" | grep -q '<promise>NEXT</promise>'; then
    :
  else
    echo ""
    echo "No promise tag (exit=$CODEX_EXIT). Restarting iteration."
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
