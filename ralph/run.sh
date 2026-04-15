#!/usr/bin/env bash
# Ralph master entrypoint — kicks off the build loop with logging + summary.
#
# Usage: ./ralph/run.sh [max_iterations=999]

set -euo pipefail
cd "$(dirname "$0")/.."

MAX_ITER="${1:-999}"
PRD=ralph/prd.json
PROGRESS=ralph/progress.txt

if [ ! -f "$PRD" ]; then
  echo "ERROR: $PRD not found. Run /playbook:prd-to-ralph first." >&2
  exit 1
fi

# Initialize progress.txt if missing, seeded with the Codebase Patterns header.
if [ ! -f "$PROGRESS" ]; then
  cat > "$PROGRESS" <<'EOF'
# Ralph Progress Log — GEM India

## Codebase Patterns

<!-- Reusable patterns discovered during builds. Ralph writes here. -->

## Iteration log

<!-- Dated entries per completed story, appended by build agent. -->
EOF
  echo "Initialized $PROGRESS"
fi

TS=$(date -u +'%Y%m%dT%H%M%SZ')
LOG="ralph/ralph-$TS.log"
START_EPOCH=$(date +%s)

count_passes() {
  python3 -c "import json; d=json.load(open('$PRD')); print(sum(1 for x in d if x.get('passes', False)))"
}
count_total() {
  python3 -c "import json; d=json.load(open('$PRD')); print(len(d))"
}

START_PASSES=$(count_passes)
TOTAL=$(count_total)

echo "Starting Ralph run: log → $LOG  (start: $START_PASSES/$TOTAL, max iter: $MAX_ITER)"
echo "Tailing in real time. Ctrl-C to stop."
echo ""

# Run build.sh under tee so we log + watch simultaneously. Preserve exit code.
set +e
./ralph/build.sh "$MAX_ITER" 2>&1 | tee "$LOG"
BUILD_EXIT=${PIPESTATUS[0]}
set -e

END_EPOCH=$(date +%s)
DURATION=$((END_EPOCH - START_EPOCH))
HOURS=$((DURATION / 3600))
MINUTES=$(((DURATION % 3600) / 60))

END_PASSES=$(count_passes)
DELTA=$((END_PASSES - START_PASSES))

SUMMARY="Ralph complete: $END_PASSES/$TOTAL features done (+$DELTA this run) in ${HOURS}h ${MINUTES}m"

echo ""
echo "───────────────────────────────────────────────────────────────"
echo "$SUMMARY"
echo "  log:      $LOG"
echo "  progress: $PROGRESS"
echo "  exit:     $BUILD_EXIT"
echo "───────────────────────────────────────────────────────────────"

# macOS notification (silent no-op on other platforms)
if command -v osascript >/dev/null 2>&1; then
  osascript -e "display notification \"$SUMMARY\" with title \"Ralph\"" || true
fi

# Open progress.txt so the user can read what was built (macOS only; best-effort)
if command -v open >/dev/null 2>&1; then
  open "$PROGRESS" || true
fi

exit "$BUILD_EXIT"
