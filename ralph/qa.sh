#!/usr/bin/env bash
# Ralph QA loop — independent Codex evaluation of every feature Ralph built.
#
# Codex is a DIFFERENT model from Claude. For each passes:true story in
# prd.json, Codex verifies the feature, probes edge cases, and fixes bugs
# in production code. Findings → ralph/qa-report.json. Progress →
# ralph/qa-progress.txt.
#
# Dual-account quota failover:
#   Prefers CODEX_ACC1 (default: $HOME/.codex-acc1).
#   On quota/429/rate-limit errors, falls back to CODEX_ACC2
#   (default: $HOME/.codex-acc2) for that single iteration.
#   Next iteration tries acc1 first again — "swap back" happens
#   automatically when acc1's quota refills.
#   If both are exhausted, sleeps 5 min then retries acc1 once more.
#   If still both exhausted, ABORTs the loop.
#
# Override which dirs to use with env vars:
#   CODEX_ACC1=$HOME/.codex-acc1  (primary; use this one first)
#   CODEX_ACC2=$HOME/.codex-acc2  (fallback)
#   CODEX_SINGLE_ACCOUNT=1        (disable failover; use only CODEX_ACC1)
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

# Dual-account config
CODEX_ACC1="${CODEX_ACC1:-$HOME/.codex-acc1}"
CODEX_ACC2="${CODEX_ACC2:-$HOME/.codex-acc2}"
CODEX_SINGLE_ACCOUNT="${CODEX_SINGLE_ACCOUNT:-0}"
QUOTA_REGEX='429|rate.?limit|rate_limit|quota.?exceeded|quota_exceeded|usage.?limit|insufficient_quota|retry.?after'
BOTH_EXHAUSTED_SLEEP=300   # 5 min

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

# Verify account dirs exist and are authed (presence of auth.json)
validate_account() {
  local dir="$1"
  [ -d "$dir" ] && [ -s "$dir/auth.json" ]
}

BUILT=$(count_built)
QAD=$(count_qad)

ACC1_OK=$(validate_account "$CODEX_ACC1" && echo yes || echo no)
ACC2_OK=$(validate_account "$CODEX_ACC2" && echo yes || echo no)

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
echo "  acc1:       $CODEX_ACC1  (authed: $ACC1_OK)"
if [ "$CODEX_SINGLE_ACCOUNT" = "1" ]; then
  echo "  acc2:       (disabled — CODEX_SINGLE_ACCOUNT=1)"
else
  echo "  acc2:       $CODEX_ACC2  (authed: $ACC2_OK)"
fi
echo "───────────────────────────────────────────────────────────────"

if [ "$ACC1_OK" = "no" ]; then
  echo "ERROR: primary account dir $CODEX_ACC1 missing or not logged in." >&2
  echo "Run: CODEX_HOME=$CODEX_ACC1 codex login" >&2
  exit 1
fi

if [ "$BUILT" -eq 0 ]; then
  echo "No features built yet (passes:true count = 0). Nothing to QA. Exiting."
  exit 0
fi

# ── Quota-aware Codex invocation ───────────────────────────────────
# Tries acc1 first; on quota error, swaps to acc2 for this call.
# If both return quota errors, sleeps BOTH_EXHAUSTED_SLEEP seconds and
# retries acc1 once. If still quota'd, echoes a synthetic ABORT line.
#
# Echoes the resulting response text to stdout. Sets global var
# LAST_ACCOUNT_USED to "acc1" or "acc2" for logging.
run_codex_with_failover() {
  local prompt="$1"
  local output exitcode
  LAST_ACCOUNT_USED=""

  attempt_with_acc() {
    local acc_label="$1"
    local acc_dir="$2"
    echo "[codex] trying $acc_label ($acc_dir)..." >&2
    set +e
    output=$(CODEX_HOME="$acc_dir" "${TIMEOUT_CMD[@]}" codex exec --dangerously-bypass-approvals-and-sandbox "$prompt" 2>&1)
    exitcode=$?
    set -e
    if [ "$exitcode" -eq 0 ] && ! echo "$output" | grep -qiE "$QUOTA_REGEX"; then
      LAST_ACCOUNT_USED="$acc_label"
      printf '%s' "$output"
      return 0
    fi
    # Quota hit OR other failure — distinguish
    if echo "$output" | grep -qiE "$QUOTA_REGEX"; then
      return 2   # quota-specific
    fi
    # Non-quota failure — let caller handle (propagate output)
    LAST_ACCOUNT_USED="$acc_label"
    printf '%s' "$output"
    return "$exitcode"
  }

  # Try acc1
  attempt_with_acc "acc1" "$CODEX_ACC1"
  local rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -ne 2 ]; then
    # Non-quota error from acc1 — return as-is
    return "$rc"
  fi

  # acc1 quota hit. Try acc2 if available.
  if [ "$CODEX_SINGLE_ACCOUNT" = "1" ] || [ "$ACC2_OK" = "no" ]; then
    echo "[codex] acc1 quota exhausted and acc2 unavailable (single-account or not authed). Sleeping ${BOTH_EXHAUSTED_SLEEP}s then retrying acc1..." >&2
    sleep "$BOTH_EXHAUSTED_SLEEP"
    attempt_with_acc "acc1" "$CODEX_ACC1"
    rc=$?
    if [ "$rc" -eq 0 ]; then return 0; fi
    echo "<promise>ABORT</promise>"
    echo "Codex acc1 still quota-exhausted after 5-min wait; no fallback account available. Wait for rate-limit window to clear." >&2
    return 2
  fi

  echo "[codex] acc1 quota exhausted. Swapping to acc2..." >&2
  attempt_with_acc "acc2" "$CODEX_ACC2"
  rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -ne 2 ]; then
    # Non-quota error from acc2 — return as-is
    return "$rc"
  fi

  # Both exhausted. Sleep + retry acc1.
  echo "[codex] both acc1 and acc2 exhausted. Sleeping ${BOTH_EXHAUSTED_SLEEP}s before retrying acc1..." >&2
  sleep "$BOTH_EXHAUSTED_SLEEP"
  attempt_with_acc "acc1" "$CODEX_ACC1"
  rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -ne 2 ]; then
    return "$rc"
  fi

  # Still quota'd on acc1. One final try on acc2.
  echo "[codex] post-sleep acc1 still quota'd. Trying acc2 once more..." >&2
  attempt_with_acc "acc2" "$CODEX_ACC2"
  rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi

  # Give up this iteration.
  echo "<promise>ABORT</promise>"
  echo "Both Codex accounts exhausted after sleep + retry. Wait out the rate-limit window (~5h typical for ChatGPT Plus/Pro) and restart." >&2
  return 2
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
  result=$(run_codex_with_failover "$PROMPT")
  CODEX_EXIT=$?
  set -e

  echo "$result"
  if [ -n "${LAST_ACCOUNT_USED:-}" ]; then
    echo "[codex] iteration used: $LAST_ACCOUNT_USED"
  fi

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
