#!/usr/bin/env bash
# Ralph master entrypoint — chains the build loop (Claude) then the QA loop
# (Codex), with logging + summary + macOS notification.
#
# Usage:
#   ./ralph/run.sh                  # default: 999 build iters, 999 qa iters
#   ./ralph/run.sh 999              # 999 build iters, 999 qa iters
#   ./ralph/run.sh 999 0            # build only, no QA
#   ./ralph/run.sh 0   999          # QA only, skip build
#   ./ralph/run.sh 50  50           # 50 each

set -euo pipefail
cd "$(dirname "$0")/.."

MAX_BUILD_ITER="${1:-999}"
MAX_QA_ITER="${2:-999}"
PRD=ralph/prd.json
PROGRESS=ralph/progress.txt
QA_REPORT=ralph/qa-report.json
QA_PROGRESS=ralph/qa-progress.txt

if [ ! -f "$PRD" ]; then
  echo "ERROR: $PRD not found. Run /playbook:prd-to-ralph first." >&2
  exit 1
fi

# Initialize progress.txt if missing, seeded with Codebase Patterns header.
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
BUILD_LOG="ralph/ralph-build-$TS.log"
QA_LOG="ralph/ralph-qa-$TS.log"
START_EPOCH=$(date +%s)

count_passes() {
  python3 -c "import json; d=json.load(open('$PRD')); print(sum(1 for x in d if x.get('passes', False)))"
}
count_total() {
  python3 -c "import json; d=json.load(open('$PRD')); print(len(d))"
}
count_qad() {
  if [ ! -f "$QA_REPORT" ]; then echo 0; return; fi
  python3 -c "import json; d=json.load(open('$QA_REPORT')); print(len({x['story_id'] for x in d if x.get('story_id')}))"
}

TOTAL=$(count_total)
START_PASSES=$(count_passes)
START_QAD=$(count_qad)

echo "═══════════════════════════════════════════════════════════════"
echo "Ralph run — GEM India"
echo "  start:         $START_PASSES/$TOTAL built · $START_QAD/$TOTAL QA'd"
echo "  build iters:   $MAX_BUILD_ITER"
echo "  qa iters:      $MAX_QA_ITER"
echo "  build log:     $BUILD_LOG"
echo "  qa log:        $QA_LOG"
echo "═══════════════════════════════════════════════════════════════"

# ── Build phase ────────────────────────────────────────────────────
BUILD_EXIT=0
if [ "$MAX_BUILD_ITER" -gt 0 ]; then
  echo ""
  echo ">>> BUILD phase (Claude)"
  echo ""
  set +e
  ./ralph/build.sh "$MAX_BUILD_ITER" 2>&1 | tee "$BUILD_LOG"
  BUILD_EXIT=${PIPESTATUS[0]}
  set -e
  if [ "$BUILD_EXIT" -ne 0 ]; then
    echo ""
    echo "BUILD phase exited non-zero ($BUILD_EXIT). Skipping QA phase." >&2
    MAX_QA_ITER=0
  fi
else
  echo ""
  echo ">>> BUILD phase skipped (max_build_iter=0)"
fi

MID_PASSES=$(count_passes)

# ── QA phase ───────────────────────────────────────────────────────
QA_EXIT=0
if [ "$MAX_QA_ITER" -gt 0 ]; then
  echo ""
  echo ">>> QA phase (Codex — independent evaluator)"
  echo ""
  set +e
  ./ralph/qa.sh "$MAX_QA_ITER" 2>&1 | tee "$QA_LOG"
  QA_EXIT=${PIPESTATUS[0]}
  set -e
else
  echo ""
  echo ">>> QA phase skipped (max_qa_iter=0)"
fi

# ── Summary ────────────────────────────────────────────────────────
END_EPOCH=$(date +%s)
DURATION=$((END_EPOCH - START_EPOCH))
HOURS=$((DURATION / 3600))
MINUTES=$(((DURATION % 3600) / 60))

END_PASSES=$(count_passes)
END_QAD=$(count_qad)
BUILT_DELTA=$((END_PASSES - START_PASSES))
QAD_DELTA=$((END_QAD - START_QAD))

SUMMARY="Ralph done: $END_PASSES/$TOTAL built (+$BUILT_DELTA), $END_QAD/$TOTAL QA'd (+$QAD_DELTA) in ${HOURS}h ${MINUTES}m"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "$SUMMARY"
echo "  build exit:    $BUILD_EXIT"
echo "  qa exit:       $QA_EXIT"
echo "  build log:     $BUILD_LOG"
echo "  qa log:        $QA_LOG"
echo "  progress:      $PROGRESS"
echo "  qa-progress:   $QA_PROGRESS"
echo "  qa-report:     $QA_REPORT"
echo "═══════════════════════════════════════════════════════════════"

# macOS notification
if command -v osascript >/dev/null 2>&1; then
  osascript -e "display notification \"$SUMMARY\" with title \"Ralph\"" || true
fi

# Open progress + qa-progress so results are visible (macOS only; best-effort)
if command -v open >/dev/null 2>&1; then
  open "$PROGRESS" || true
  [ -f "$QA_PROGRESS" ] && open "$QA_PROGRESS" || true
fi

# Exit non-zero if either phase failed.
if [ "$BUILD_EXIT" -ne 0 ]; then exit "$BUILD_EXIT"; fi
if [ "$QA_EXIT" -ne 0 ]; then exit "$QA_EXIT"; fi
exit 0
