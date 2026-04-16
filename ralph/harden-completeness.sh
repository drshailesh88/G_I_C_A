#!/usr/bin/env bash
# Ralph completeness loop — catch features the builder silently skipped.
#
# Compares the PRD's OUGHT list (ralph/prd.json) to the running app's IS list
# (feature-census output) and appends any missing features back into prd.json
# with passes:false. Then invokes build.sh + qa.sh to build and verify them.
# Loops until OUGHT == IS.
#
# Why this loop exists: the builder (Ralph or GSD) sometimes skips features
# it thinks are "obvious" or out of scope. Initial QA runs surfaced 42 such
# missing features manually — this loop automates that discovery overnight.
#
# Work source: the LLM invokes the feature-census skill to extract IS, reads
#   ralph/prd.json for OUGHT, computes the diff, and appends missing entries.
#
# Progress tracking:
#   ralph/completeness-report.json  — per-iteration diff results + attempts
#   ralph/completeness-progress.txt — running log for the agent
#
# Env overrides:
#   COMPLETENESS_MODEL=<id>         default claude-opus-4-6 (creative task)
#   MAX_PLATEAU=<n>                 default 3
#   SKIP_REBUILD=1                  don't auto-invoke build.sh/qa.sh after append
#
# Usage: ./ralph/harden-completeness.sh [max_iterations=20]
#   NOTE: default iteration count is LOW (20) because each iteration invokes
#   Claude Opus AND potentially triggers a full build+qa cycle. Raise only
#   when you know the completeness pass converges quickly.

set -euo pipefail
cd "$(dirname "$0")/.."

MAX_ITER="${1:-20}"
PRD=ralph/prd.json
COMPLETENESS_REPORT=ralph/completeness-report.json
COMPLETENESS_PROGRESS=ralph/completeness-progress.txt
ITER_TIMEOUT=1800
SLEEP_BETWEEN=5

COMPLETENESS_MODEL="${COMPLETENESS_MODEL:-claude-opus-4-6}"
MAX_PLATEAU="${MAX_PLATEAU:-3}"
SKIP_REBUILD="${SKIP_REBUILD:-0}"

if [ ! -f "$PRD" ]; then
  echo "ERROR: $PRD not found. Run /playbook:prd-to-ralph first." >&2
  exit 1
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: claude CLI not found." >&2
  exit 1
fi

# Resolve timeout command.
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(timeout "$ITER_TIMEOUT")
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(gtimeout "$ITER_TIMEOUT")
else
  echo "WARNING: no timeout command found. Install 'brew install coreutils'." >&2
  TIMEOUT_CMD=()
fi

if [ ! -f "$COMPLETENESS_REPORT" ]; then
  echo "[]" > "$COMPLETENESS_REPORT"
fi

if [ ! -f "$COMPLETENESS_PROGRESS" ]; then
  cat > "$COMPLETENESS_PROGRESS" <<'EOF'
# Ralph Completeness Progress Log

## Completeness Patterns

<!-- Patterns noticed when diffing OUGHT vs IS. Agent writes here. -->

## Iteration log

<!-- Dated entries per diff cycle, appended by completeness agent. -->

EOF
fi

count_prd_entries() {
  python3 -c "import json; print(len(json.load(open('$PRD'))))"
}
count_prd_built() {
  python3 -c "import json; print(sum(1 for x in json.load(open('$PRD')) if x.get('passes', False)))"
}

TOTAL_START=$(count_prd_entries)
BUILT_START=$(count_prd_built)

echo "───────────────────────────────────────────────────────────────"
echo "Ralph completeness loop — catch missing features (OUGHT vs IS)"
echo "  prd:             $PRD  ($TOTAL_START entries, $BUILT_START built)"
echo "  report:          $COMPLETENESS_REPORT"
echo "  progress:        $COMPLETENESS_PROGRESS"
echo "  model:           $COMPLETENESS_MODEL"
echo "  max iter:        $MAX_ITER"
echo "  skip rebuild:    $SKIP_REBUILD"
if [ ${#TIMEOUT_CMD[@]} -gt 0 ]; then
  echo "  timeout:         ${ITER_TIMEOUT}s per iter (${TIMEOUT_CMD[0]})"
else
  echo "  timeout:         (none available)"
fi
echo "───────────────────────────────────────────────────────────────"

PLATEAU_BUF=()

for i in $(seq 1 "$MAX_ITER"); do
  CURRENT_TOTAL=$(count_prd_entries)
  CURRENT_BUILT=$(count_prd_built)
  echo ""
  echo "═══ completeness iter $i/$MAX_ITER — prd: $CURRENT_TOTAL entries ($CURRENT_BUILT built) ══"
  echo ""

  RECENT_COMMITS=$(git log --grep='^COMPLETENESS:' -n 10 --format='%H%n%ad%n%B---' --date=short 2>/dev/null || echo '(no COMPLETENESS commits yet)')

  PROMPT="@ralph/harden-completeness-prompt.md @CLAUDE.md @$PRD @$COMPLETENESS_REPORT @$COMPLETENESS_PROGRESS

ITERATION: $i of $MAX_ITER
PRD ENTRIES: $CURRENT_TOTAL  (BUILT: $CURRENT_BUILT)
Previous COMPLETENESS commits:
$RECENT_COMMITS

Your job: detect features PROMISED by the PRD but MISSING from the running app.
1. Invoke the feature-census skill to extract the IS list (what's actually built).
2. Compare against $PRD (the OUGHT list).
3. For each missing feature: write a full story entry (id, category, description,
   behavior, ui_details, data_model, tests) and APPEND to $PRD with passes:false.
4. Commit with 'COMPLETENESS: appended N features — <summary>' prefix.
5. Append to $COMPLETENESS_REPORT and $COMPLETENESS_PROGRESS per the prompt.

Output <promise>NEXT</promise> if you appended at least one missing feature (rebuild needed).
Output <promise>COMPLETENESS_COMPLETE</promise> if IS already contains every OUGHT feature.
Output <promise>ABORT</promise> if blocked (explain above the tag)."

  set +e
  result=$("${TIMEOUT_CMD[@]}" claude -p --dangerously-skip-permissions --model "$COMPLETENESS_MODEL" "$PROMPT")
  CLAUDE_EXIT=$?
  set -e

  echo "$result"

  result_tail=$(printf '%s\n' "$result" | tail -n 40)
  NEW_TOTAL=$(count_prd_entries)
  APPENDED=$((NEW_TOTAL - CURRENT_TOTAL))

  # Plateau signature: "appended-0" means no change; repeated → plateau.
  SIG="appended-$APPENDED"
  PLATEAU_BUF+=("$SIG")
  if [ "${#PLATEAU_BUF[@]}" -gt "$MAX_PLATEAU" ]; then
    PLATEAU_BUF=("${PLATEAU_BUF[@]: -$MAX_PLATEAU}")
  fi

  if echo "$result_tail" | grep -q '<promise>COMPLETENESS_COMPLETE</promise>'; then
    # Verify: nothing was appended this iteration (agent's claim matches reality).
    if [ "$APPENDED" -eq 0 ]; then
      echo ""
      echo "Completeness signaled COMPLETE (verified: 0 features appended, OUGHT == IS)."
      break
    else
      echo ""
      echo "Completeness emitted COMPLETE but $APPENDED features were appended — ignoring false signal."
    fi
  elif echo "$result_tail" | grep -q '<promise>ABORT</promise>'; then
    echo ""
    echo "Completeness signaled ABORT. Stopping." >&2
    exit 2
  elif echo "$result_tail" | grep -q '<promise>NEXT</promise>'; then
    : # normal — continue
  else
    echo ""
    echo "No promise tag found (exit=$CLAUDE_EXIT). Restarting iteration."
    sleep "$SLEEP_BETWEEN"
    continue
  fi

  # Plateau check: if last MAX_PLATEAU signatures are all "appended-0", stop.
  if [ "${#PLATEAU_BUF[@]}" -ge "$MAX_PLATEAU" ]; then
    UNIQUE=$(printf '%s\n' "${PLATEAU_BUF[@]}" | sort -u | wc -l)
    if [ "$UNIQUE" -eq 1 ] && [ "$SIG" = "appended-0" ]; then
      echo ""
      echo "Plateau detected ($MAX_PLATEAU iterations with 0 appends). Completeness done."
      break
    fi
  fi

  # If features were appended, trigger build + qa to fill them in.
  if [ "$APPENDED" -gt 0 ] && [ "$SKIP_REBUILD" != "1" ]; then
    echo ""
    echo "[completeness] $APPENDED new features appended. Triggering rebuild..."
    echo ""

    # Only build as many iterations as there are new features (with a small buffer).
    BUILD_BUDGET=$((APPENDED * 2 + 2))

    if [ -x ./ralph/build.sh ]; then
      set +e
      ./ralph/build.sh "$BUILD_BUDGET" || echo "[completeness] build.sh non-zero — continuing"
      set -e
    fi

    if [ -x ./ralph/qa.sh ]; then
      set +e
      ./ralph/qa.sh "$BUILD_BUDGET" || echo "[completeness] qa.sh non-zero — continuing"
      set -e
    fi
  fi

  sleep "$SLEEP_BETWEEN"
done

FINAL_TOTAL=$(count_prd_entries)
FINAL_BUILT=$(count_prd_built)
DELTA_TOTAL=$((FINAL_TOTAL - TOTAL_START))
DELTA_BUILT=$((FINAL_BUILT - BUILT_START))

echo ""
echo "───────────────────────────────────────────────────────────────"
echo "Completeness summary:"
echo "  entries:  $TOTAL_START → $FINAL_TOTAL  (+$DELTA_TOTAL appended)"
echo "  built:    $BUILT_START → $FINAL_BUILT  (+$DELTA_BUILT new builds)"
echo "───────────────────────────────────────────────────────────────"
