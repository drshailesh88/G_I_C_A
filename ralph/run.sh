#!/usr/bin/env bash
# Ralph master entrypoint — chains build → QA → harden (+ future loops).
#
# Phase sequence (all independently runnable — see individual scripts):
#   1. Build         (build.sh — Claude Opus builds features TDD-first)
#   2. Verify        (qa.sh — Codex independently evaluates, fixes bugs)
#   3. Harden        (harden.sh — Claude Sonnet kills surviving mutants)
#
#   Future phases chained here as they're built:
#   4. Completeness  (harden-completeness.sh — catch features builder skipped)
#   5. Adversarial   (harden-adversarial.sh — red-team attacks)
#   6. Drift         (harden-drift.sh — runtime vs frozen contracts)
#   7. Security      (harden-security.sh — OWASP findings loop)
#
# After phases complete, emits a summary notification and opens progress files.
# Run individual phases directly while debugging; use this script once the
# pipeline is stable for overnight runs.
#
# Usage: ./ralph/run.sh [build_iters=999] [qa_iters=999] [harden_iters=999]
# Skip phases: BUILD_SKIP=1 QA_SKIP=1 HARDEN_SKIP=1 ./ralph/run.sh

set -euo pipefail
cd "$(dirname "$0")/.."

BUILD_ITERS="${1:-999}"
QA_ITERS="${2:-999}"
HARDEN_ITERS="${3:-999}"
PRD=ralph/prd.json
PROGRESS=ralph/progress.txt
QA_PROGRESS=ralph/qa-progress.txt
HARDEN_PROGRESS=ralph/harden-progress.txt

BUILD_SKIP="${BUILD_SKIP:-0}"
QA_SKIP="${QA_SKIP:-0}"
HARDEN_SKIP="${HARDEN_SKIP:-0}"

if [ ! -f "$PRD" ]; then
  echo "ERROR: $PRD not found. Run /playbook:prd-to-ralph first." >&2
  exit 1
fi

# Initialize progress.txt if missing (seeded with Codebase Patterns header).
if [ ! -f "$PROGRESS" ]; then
  cat > "$PROGRESS" <<'PROG_EOF'
# Ralph Progress Log

## Codebase Patterns

<!-- Reusable patterns discovered during builds. Ralph writes here. -->

## Iteration log

<!-- Dated entries per completed story, appended by build agent. -->
PROG_EOF
  echo "Initialized $PROGRESS"
fi

TS=$(date -u +'%Y%m%dT%H%M%SZ')
LOG="ralph/ralph-$TS.log"
START_EPOCH=$(date +%s)

count_passes() {
  python3 -c "import json; d=json.load(open('$PRD')); print(sum(1 for x in d if x.get('passes', False)))"
}
count_qa() {
  python3 -c "import json; d=json.load(open('$PRD')); print(sum(1 for x in d if x.get('qa_tested', False)))"
}
count_total() {
  python3 -c "import json; d=json.load(open('$PRD')); print(len(d))"
}

START_PASSES=$(count_passes)
START_QA=$(count_qa)
TOTAL=$(count_total)

echo "─ Ralph full run ─"
echo "  log:         $LOG"
echo "  start:       $START_PASSES/$TOTAL built, $START_QA/$TOTAL QA'd"
echo "  max iter:    build=$BUILD_ITERS, qa=$QA_ITERS, harden=$HARDEN_ITERS"
echo "  skip:        build=$BUILD_SKIP, qa=$QA_SKIP, harden=$HARDEN_SKIP"
echo ""

# Phase 1: Build (Claude Opus)
if [ "$BUILD_SKIP" = "1" ]; then
  echo ">>> Phase 1/3: Build — SKIPPED (BUILD_SKIP=1)"
  BUILD_EXIT=0
else
  echo ">>> Phase 1/3: Build (Claude Opus 4.6)"
  echo ""
  set +e
  ./ralph/build.sh "$BUILD_ITERS" 2>&1 | tee "$LOG"
  BUILD_EXIT=${PIPESTATUS[0]}
  set -e
fi

# Phase 2: QA (Codex) — only if build completed cleanly
if [ "$QA_SKIP" = "1" ]; then
  echo ""
  echo ">>> Phase 2/3: QA — SKIPPED (QA_SKIP=1)"
  QA_EXIT=0
elif [ "$BUILD_EXIT" -eq 0 ]; then
  echo ""
  echo ">>> Phase 2/3: QA (Codex as independent evaluator)"
  echo ""
  set +e
  ./ralph/qa.sh "$QA_ITERS" 2>&1 | tee -a "$LOG"
  QA_EXIT=${PIPESTATUS[0]}
  set -e
else
  echo ""
  echo "Build exited non-zero ($BUILD_EXIT). Skipping QA phase."
  QA_EXIT=255
fi

# Phase 3: Harden (Claude Sonnet) — only if QA completed cleanly
if [ "$HARDEN_SKIP" = "1" ]; then
  echo ""
  echo ">>> Phase 3/3: Harden — SKIPPED (HARDEN_SKIP=1)"
  HARDEN_EXIT=0
elif [ "$QA_EXIT" -eq 0 ]; then
  echo ""
  echo ">>> Phase 3/3: Harden (Claude Sonnet 4.6 — test quality)"
  echo ""
  if [ -x ./ralph/harden.sh ]; then
    set +e
    ./ralph/harden.sh "$HARDEN_ITERS" 2>&1 | tee -a "$LOG"
    HARDEN_EXIT=${PIPESTATUS[0]}
    set -e
  else
    echo "ralph/harden.sh not installed or not executable. Skipping."
    echo "Install via /playbook:install-qa-harness."
    HARDEN_EXIT=0
  fi
else
  echo ""
  echo "QA exited non-zero ($QA_EXIT). Skipping harden phase."
  HARDEN_EXIT=255
fi

END_EPOCH=$(date +%s)
DURATION=$((END_EPOCH - START_EPOCH))
HOURS=$((DURATION / 3600))
MINUTES=$(((DURATION % 3600) / 60))

END_PASSES=$(count_passes)
END_QA=$(count_qa)
DELTA_BUILT=$((END_PASSES - START_PASSES))
DELTA_QA=$((END_QA - START_QA))

# Harden status — read .quality/state.json if it exists.
HARDEN_STATUS=""
if [ -f .quality/state.json ]; then
  HARDEN_STATUS=$(python3 -c "
import json
try:
    s = json.load(open('.quality/state.json'))
    mods = s.get('modules', [])
    below = sum(1 for m in mods if m.get('belowFloor', False))
    total = len(mods)
    print(f'{total-below}/{total} at floor')
except Exception:
    print('(state.json unreadable)')
" 2>/dev/null || echo '')
fi

SUMMARY="Ralph done: built $END_PASSES/$TOTAL (+$DELTA_BUILT), QA'd $END_QA/$TOTAL (+$DELTA_QA)"
if [ -n "$HARDEN_STATUS" ]; then
  SUMMARY="$SUMMARY, hardened $HARDEN_STATUS"
fi
SUMMARY="$SUMMARY in ${HOURS}h${MINUTES}m"

echo ""
echo "───────────────────────────────────────────────────────────────"
echo "$SUMMARY"
echo "  log:         $LOG"
echo "  build exit:  $BUILD_EXIT"
echo "  qa exit:     $QA_EXIT"
echo "  harden exit: $HARDEN_EXIT"
echo ""
if [ "$HARDEN_EXIT" -ne 0 ] && [ "$HARDEN_EXIT" -ne 255 ]; then
  echo "Harden plateaued or aborted. Inspect ralph/harden-report.json and"
  echo "consider /playbook:qa-unblock <feature> before the next run."
fi
echo "Release gate: /playbook:qa-run  (runs release gates, produces summary.md)"
echo "───────────────────────────────────────────────────────────────"

# macOS notification (silent no-op on other platforms)
if command -v osascript >/dev/null 2>&1; then
  osascript -e "display notification \"$SUMMARY\" with title \"Ralph\"" || true
fi

# Open progress.txt so the user can read what was built (macOS only; best-effort)
if command -v open >/dev/null 2>&1; then
  open "$PROGRESS" || true
fi

# Exit with the first non-zero non-skip code; skipping (255) is not an error.
for CODE in "$BUILD_EXIT" "$QA_EXIT" "$HARDEN_EXIT"; do
  if [ "$CODE" -ne 0 ] && [ "$CODE" -ne 255 ]; then
    exit "$CODE"
  fi
done
exit 0
