#!/usr/bin/env bash
# Ralph build loop — adapted from Huntley's pattern 
#
# Usage:   ./ralph/build.sh [max_iterations=999]
# Stops:   on <promise>COMPLETE</promise>, max_iterations, or Ctrl-C.

set -euo pipefail
cd "$(dirname "$0")/.."

MAX_ITER="${1:-999}"
PRD=ralph/prd.json
PROGRESS=ralph/progress.txt
ITER_TIMEOUT=1800   # 30-minute hard wall-clock per iteration (gtimeout/timeout)
SLEEP_BETWEEN=3

if [ ! -f "$PRD" ]; then
  echo "ERROR: $PRD not found. Run /playbook:prd-to-ralph first." >&2
  exit 1
fi

# Resolve timeout command (macOS ships without `timeout`; coreutils supplies `gtimeout`).
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(timeout "$ITER_TIMEOUT")
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(gtimeout "$ITER_TIMEOUT")
else
  echo "WARNING: no timeout command found (install coreutils for gtimeout). Iterations will run without time limit — Ctrl-C if hung." >&2
  TIMEOUT_CMD=()
fi

count_passes() {
  python3 -c "import json; d=json.load(open('$PRD')); print(sum(1 for x in d if x.get('passes', False)))"
}
count_total() {
  python3 -c "import json; d=json.load(open('$PRD')); print(len(d))"
}

TOTAL=$(count_total)
START_PASSES=$(count_passes)

echo "───────────────────────────────────────────────────────────────"
echo "Ralph build loop"
echo "  prd:        $PRD  ($TOTAL stories, $START_PASSES already passing)"
echo "  max iter:   $MAX_ITER"
if [ ${#TIMEOUT_CMD[@]} -gt 0 ]; then
  echo "  timeout:    ${ITER_TIMEOUT}s per iter (${TIMEOUT_CMD[0]})"
else
  echo "  timeout:    (none available)"
fi
echo "───────────────────────────────────────────────────────────────"

for i in $(seq 1 "$MAX_ITER"); do
  PASSES=$(count_passes)
  REMAINING=$((TOTAL - PASSES))
  echo ""
  echo "═══ iter $i/$MAX_ITER — $PASSES/$TOTAL passing ($REMAINING remaining) ══"
  echo ""

  if [ "$PASSES" -ge "$TOTAL" ]; then
    echo "All $TOTAL stories complete. Ralph done."
    break
  fi

  RECENT_COMMITS=$(git log --grep='^RALPH:' -n 10 --format='%H%n%ad%n%B---' --date=short 2>/dev/null || echo '(no RALPH commits yet)')

  # Huntley-style single-string prompt argument — no intermediate heredoc.
  set +e
  result=$("${TIMEOUT_CMD[@]}" claude -p --dangerously-skip-permissions --model claude-opus-4-6 \
"@ralph/build-prompt.md @CLAUDE.md @$PRD @$PROGRESS

ITERATION: $i of $MAX_ITER
PROGRESS: $PASSES/$TOTAL features passed
Previous RALPH commits:
$RECENT_COMMITS

Build exactly ONE feature (the first passes:false entry), then commit and stop.
Output <promise>NEXT</promise> when done.
Output <promise>COMPLETE</promise> only if ALL features pass.
Output <promise>ABORT</promise> if you cannot proceed (explain why above the tag).")
  CLAUDE_EXIT=$?
  set -e

  # Full output — visible and captured.
  echo "$result"

  if echo "$result" | grep -q '<promise>COMPLETE</promise>'; then
    echo ""
    echo "Ralph signaled COMPLETE."
    break
  elif echo "$result" | grep -q '<promise>ABORT</promise>'; then
    echo ""
    echo "Ralph signaled ABORT — a story is blocked. Stopping." >&2
    exit 2
  elif echo "$result" | grep -q '<promise>NEXT</promise>'; then
    :
  else
    echo ""
    echo "No promise tag found (exit=$CLAUDE_EXIT). Restarting iteration."
  fi

  sleep "$SLEEP_BETWEEN"
done

FINAL_PASSES=$(count_passes)
DELTA=$((FINAL_PASSES - START_PASSES))
echo ""
echo "───────────────────────────────────────────────────────────────"
echo "Ralph summary: $FINAL_PASSES/$TOTAL passing  (+$DELTA this run)"
echo "───────────────────────────────────────────────────────────────"
