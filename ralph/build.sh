#!/usr/bin/env bash
# Ralph build loop — adapted from Huntley's pattern for GEM India.
#
# Each iteration invokes Claude Code headless with the PRD + progress + last
# 10 RALPH commits. Claude picks the first passes:false story, implements it
# TDD-first, commits with RALPH: prefix, flips passes:true, appends to
# progress.txt, and signals <promise>NEXT</promise> (or COMPLETE when done).
#
# Usage:   ./ralph/build.sh [max_iterations=999]
# Stops:   on <promise>COMPLETE</promise>, max_iterations, or Ctrl-C.

set -euo pipefail
cd "$(dirname "$0")/.."

MAX_ITER="${1:-999}"
PRD=ralph/prd.json
PROGRESS=ralph/progress.txt
BUILD_PROMPT=ralph/build-prompt.md
ITER_TIMEOUT=1200   # 20 min per iteration
SLEEP_BETWEEN=3

if [ ! -f "$PRD" ]; then
  echo "ERROR: $PRD not found. Run /playbook:prd-to-ralph first." >&2
  exit 1
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
echo "Ralph build loop — GEM India"
echo "  prd:        $PRD  ($TOTAL stories, $START_PASSES already passing)"
echo "  max iter:   $MAX_ITER"
echo "  timeout:    ${ITER_TIMEOUT}s per iter"
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

  # Last 10 RALPH-prefixed git commits, inline.
  RECENT_COMMITS=$(git log --grep='^RALPH:' -n 10 --format='%H%n%ad%n%B---' --date=short 2>/dev/null || echo '(no RALPH commits yet)')

  # Compose the iteration prompt. File-refs use @path syntax so Claude Code
  # loads them as context; inline RECENT_COMMITS is appended.
  PROMPT=$(cat <<EOF
@$BUILD_PROMPT
@CLAUDE.md
@$PRD
@$PROGRESS

## Recent RALPH commits (last 10)

\`\`\`
$RECENT_COMMITS
\`\`\`

## Iteration

This is Ralph iteration $i. $PASSES of $TOTAL stories already pass.
Pick the FIRST entry in $PRD where passes:false. Follow $BUILD_PROMPT.
EOF
)

  # Run Claude Code headless. --print = non-interactive. Timeout guards against
  # stuck sessions. Exit code non-zero is tolerated; we look at the promise tag
  # in the output.
  set +e
  OUTPUT=$(timeout "$ITER_TIMEOUT" claude \
    --dangerously-skip-permissions \
    --print \
    --model claude-opus-4-6 \
    "$PROMPT" 2>&1)
  CLAUDE_EXIT=$?
  set -e

  # Log iteration tail for visibility
  echo "$OUTPUT" | tail -20

  # Promise-based control flow.
  if echo "$OUTPUT" | grep -q '<promise>COMPLETE</promise>'; then
    echo ""
    echo "Ralph signaled COMPLETE."
    break
  elif echo "$OUTPUT" | grep -q '<promise>ABORT</promise>'; then
    echo ""
    echo "Ralph signaled ABORT — a story is blocked. Stopping." >&2
    exit 2
  elif echo "$OUTPUT" | grep -q '<promise>NEXT</promise>'; then
    : # one story done, continue
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
