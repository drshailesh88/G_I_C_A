#!/usr/bin/env bash
# Ralph QA loop — independent Codex evaluation of every feature Ralph built.
#
# Codex is a DIFFERENT model from Claude. That's the point: the builder cannot
# be the grader. For each story where prd.json has passes:true, Codex verifies
# the feature independently — runs the test suites, manually exercises
# acceptance criteria, probes edge cases, and fixes any bugs it finds in the
# PRODUCTION code (never the tests). Findings are recorded in
# ralph/qa-report.json; progress tracked in ralph/qa-progress.txt.
#
# Usage: ./ralph/qa.sh [max_iterations=999]

set -euo pipefail
cd "$(dirname "$0")/.."

MAX_ITER="${1:-999}"
PRD=ralph/prd.json
QA_PROMPT=ralph/qa-prompt.md
QA_REPORT=ralph/qa-report.json
QA_PROGRESS=ralph/qa-progress.txt
ITER_TIMEOUT=1800   # 30 min per iteration — QA involves more reads than writes
SLEEP_BETWEEN=3

if [ ! -f "$PRD" ]; then
  echo "ERROR: $PRD not found. Cannot QA without a PRD." >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: codex CLI not found. Install Codex before running QA." >&2
  exit 1
fi

# Initialize qa-report.json if missing (empty array; Codex appends entries)
if [ ! -f "$QA_REPORT" ]; then
  echo "[]" > "$QA_REPORT"
  echo "Initialized $QA_REPORT"
fi

# Initialize qa-progress.txt if missing
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
echo "  timeout:    ${ITER_TIMEOUT}s per iter"
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

  # Last 10 QA: commits inline for trajectory context
  RECENT_QA_COMMITS=$(git log --grep='^QA:' -n 10 --format='%H%n%ad%n%B---' --date=short 2>/dev/null || echo '(no QA commits yet)')

  PROMPT=$(cat <<EOF
You are the QA evaluator for the Ralph build. You are a DIFFERENT agent from
the builder — do not trust passes:true just because the builder said so.
Verify every feature independently.

Read these files in the repo:
  - ralph/qa-prompt.md (your full instructions)
  - CLAUDE.md (project rules)
  - ralph/prd.json (the build PRD — passes:true entries are candidates for QA)
  - ralph/qa-report.json (your prior findings — do NOT re-QA entries already present)
  - ralph/qa-progress.txt (cross-iteration patterns)

## Recent QA commits (last 10)

\`\`\`
$RECENT_QA_COMMITS
\`\`\`

## Iteration

QA iteration $i. $QAD of $BUILT built features already QA'd.
Pick the first story in prd.json where passes:true AND no entry in
qa-report.json has story_id equal to that story's id.
Follow ralph/qa-prompt.md. Emit a promise tag at the end.
EOF
)

  set +e
  OUTPUT=$(timeout "$ITER_TIMEOUT" codex exec \
    --dangerously-bypass-approvals-and-sandbox \
    "$PROMPT" 2>&1)
  CODEX_EXIT=$?
  set -e

  echo "$OUTPUT" | tail -20

  if echo "$OUTPUT" | grep -q '<promise>QA_COMPLETE</promise>'; then
    echo ""
    echo "Codex signaled QA_COMPLETE."
    break
  elif echo "$OUTPUT" | grep -q '<promise>ABORT</promise>'; then
    echo ""
    echo "Codex signaled ABORT — QA blocked. Stopping." >&2
    exit 2
  elif echo "$OUTPUT" | grep -q '<promise>NEXT</promise>'; then
    :
  else
    echo ""
    echo "No promise tag (exit=$CODEX_EXIT). Restarting iteration."
  fi

  sleep "$SLEEP_BETWEEN"
done

FINAL_QAD=$(count_qad)
BUILT=$(count_built)

# Summarize bug counts from qa-report.json
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
print(f'QA summary: {$FINAL_QAD}/{$BUILT} features QA\\'d')
print(f'  bugs found:   {total_bugs}')
print(f'  bugs fixed:   {fixed}')
print(f'  status tally: {by_status}')
print('───────────────────────────────────────────────────────────────')
PY
