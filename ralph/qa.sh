#!/usr/bin/env bash
# Ralph QA loop — independent grader (Codex + Gemini fallback chain).
#
# Builder ≠ grader principle: Claude built the code, a DIFFERENT model
# family grades it. For each passes:true story in prd.json, the grader
# verifies the feature, probes edge cases, and fixes bugs in production
# code. Findings → ralph/qa-report.json. Progress → ralph/qa-progress.txt.
#
# Provider fallback chain (5 layers, auto-recover every iteration):
#   1. Codex CODEX_ACC1        (default $HOME/.codex-acc1, GPT-5.4)
#   2. Codex CODEX_ACC2        (default $HOME/.codex-acc2, GPT-5.4)
#   3. Gemini gemini-3.1-pro-preview
#   4. Gemini gemini-3-pro-preview
#   5. On all-exhausted: sleep 5 min then retry from the top.
#   6. If still all exhausted: emit synthetic ABORT.
# Next iteration always starts from layer 1 — auto-recovery when upper
# layers' quota windows refill.
#
# Env overrides:
#   CODEX_ACC1=<path>            primary codex account dir
#   CODEX_ACC2=<path>            fallback codex account dir
#   CODEX_SINGLE_ACCOUNT=1       disable codex acc2 layer
#   QA_NO_GEMINI=1               disable both gemini layers
#   GEMINI_MODEL_1=<id>          override primary gemini model
#   GEMINI_MODEL_2=<id>          override fallback gemini model
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

# Provider config
CODEX_ACC1="${CODEX_ACC1:-$HOME/.codex-acc1}"
CODEX_ACC2="${CODEX_ACC2:-$HOME/.codex-acc2}"
CODEX_SINGLE_ACCOUNT="${CODEX_SINGLE_ACCOUNT:-0}"
QA_NO_GEMINI="${QA_NO_GEMINI:-0}"
GEMINI_MODEL_1="${GEMINI_MODEL_1:-gemini-3.1-pro-preview}"
GEMINI_MODEL_2="${GEMINI_MODEL_2:-gemini-3-pro-preview}"

# Quota detection — regex is OR'd across patterns seen in the wild
QUOTA_REGEX='429|rate.?limit|rate_limit|quota.?exceeded|quota_exceeded|usage.?limit|insufficient_quota|retry.?after|RESOURCE_EXHAUSTED|5h limit|weekly limit'
BOTH_EXHAUSTED_SLEEP=300   # 5 min

if [ ! -f "$PRD" ]; then
  echo "ERROR: $PRD not found. Cannot QA without a PRD." >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: codex CLI not found. Install Codex before running QA." >&2
  exit 1
fi

HAS_GEMINI=0
if command -v gemini >/dev/null 2>&1; then HAS_GEMINI=1; fi

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
# Ralph QA Progress

## QA Patterns

<!-- Cross-feature QA findings: common bug classes, edge cases worth re-checking. -->

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
validate_account() {
  local dir="$1"
  [ -d "$dir" ] && [ -s "$dir/auth.json" ]
}

BUILT=$(count_built)
QAD=$(count_qad)

ACC1_OK=$(validate_account "$CODEX_ACC1" && echo yes || echo no)
ACC2_OK=$(validate_account "$CODEX_ACC2" && echo yes || echo no)

echo "───────────────────────────────────────────────────────────────"
echo "Ralph QA loop — multi-provider grader with fallback chain"
echo "  prd:        $PRD  ($BUILT features built, $QAD already QA'd)"
echo "  report:     $QA_REPORT"
echo "  progress:   $QA_PROGRESS"
echo "  max iter:   $MAX_ITER"
if [ ${#TIMEOUT_CMD[@]} -gt 0 ]; then
  echo "  timeout:    ${ITER_TIMEOUT}s per iter (${TIMEOUT_CMD[0]})"
else
  echo "  timeout:    (none available — install coreutils)"
fi
echo ""
echo "  Fallback chain:"
echo "    1. codex/acc1    $CODEX_ACC1  (authed: $ACC1_OK)"
if [ "$CODEX_SINGLE_ACCOUNT" = "1" ]; then
  echo "    2. codex/acc2    (disabled — CODEX_SINGLE_ACCOUNT=1)"
else
  echo "    2. codex/acc2    $CODEX_ACC2  (authed: $ACC2_OK)"
fi
if [ "$QA_NO_GEMINI" = "1" ]; then
  echo "    3. gemini/*      (disabled — QA_NO_GEMINI=1)"
elif [ "$HAS_GEMINI" -eq 0 ]; then
  echo "    3. gemini/*      (gemini CLI not found — install via 'npm i -g @google/gemini-cli')"
else
  echo "    3. gemini/$GEMINI_MODEL_1"
  echo "    4. gemini/$GEMINI_MODEL_2"
fi
echo "───────────────────────────────────────────────────────────────"

if [ "$ACC1_OK" = "no" ] && { [ "$CODEX_SINGLE_ACCOUNT" = "1" ] || [ "$ACC2_OK" = "no" ]; } && { [ "$QA_NO_GEMINI" = "1" ] || [ "$HAS_GEMINI" -eq 0 ]; }; then
  echo "ERROR: no working grader provider. Fix at least one." >&2
  exit 1
fi

if [ "$BUILT" -eq 0 ]; then
  echo "No features built yet (passes:true count = 0). Nothing to QA. Exiting."
  exit 0
fi

# ── Provider attempt functions ─────────────────────────────────────
# Each returns:
#   0  success; output printed to stdout; LAST_PROVIDER set
#   1  quota exhausted (try next layer)
#   N  non-quota failure (exit code N); output printed to stdout
# Silent "exit=2 + empty output" from codex is treated as a quota
# signal (OpenAI's rate-limit display path in headless mode).

try_codex() {
  local prompt="$1" label="$2" dir="$3"
  if [ ! -s "$dir/auth.json" ]; then
    echo "[grader] skipping codex/$label (not authed: $dir)" >&2
    return 1
  fi
  echo "[grader] trying codex/$label ($dir)..." >&2
  local output exitcode
  set +e
  output=$(CODEX_HOME="$dir" "${TIMEOUT_CMD[@]}" codex exec --dangerously-bypass-approvals-and-sandbox "$prompt" 2>&1)
  exitcode=$?
  set -e

  # Success: exit 0 AND non-empty output. Any quota-looking strings inside
  # the output are probably just transient retry noise that Codex already
  # handled internally.
  if [ "$exitcode" -eq 0 ] && [ -n "${output// }" ]; then
    LAST_PROVIDER="codex/$label"
    printf '%s' "$output"
    return 0
  fi
  # Silent quota signal: exit=2 + empty output (OpenAI rate-limit path)
  if [ "$exitcode" -eq 2 ] && [ -z "${output// }" ]; then
    echo "[grader] codex/$label silent exit 2 — treating as quota" >&2
    return 1
  fi
  # Explicit quota keywords in a FAILED output
  if [ "$exitcode" -ne 0 ] && echo "$output" | grep -qiE "$QUOTA_REGEX"; then
    echo "[grader] codex/$label quota pattern matched on failure" >&2
    return 1
  fi
  # Non-quota failure — propagate
  LAST_PROVIDER="codex/$label"
  printf '%s' "$output"
  return "$exitcode"
}

try_gemini() {
  local prompt="$1" model="$2"
  if [ "$HAS_GEMINI" -eq 0 ] || [ "$QA_NO_GEMINI" = "1" ]; then return 1; fi
  echo "[grader] trying gemini/$model..." >&2
  local output exitcode
  set +e
  output=$("${TIMEOUT_CMD[@]}" gemini -m "$model" --yolo -p "$prompt" 2>&1)
  exitcode=$?
  set -e

  # Success first: Gemini often prints transient 429/TLS noise to stderr even
  # on successful calls because the CLI retries internally. Trust the exit
  # code + output presence.
  if [ "$exitcode" -eq 0 ] && [ -n "${output// }" ]; then
    LAST_PROVIDER="gemini/$model"
    printf '%s' "$output"
    return 0
  fi
  # Silent failure signals quota
  if [ "$exitcode" -ne 0 ] && [ -z "${output// }" ]; then
    echo "[grader] gemini/$model silent non-zero exit — treating as quota" >&2
    return 1
  fi
  # Failed WITH output containing quota/transport markers
  if [ "$exitcode" -ne 0 ] && echo "$output" | grep -qiE "$QUOTA_REGEX|ERR_SSL_|TLS.?ALERT|UNAVAILABLE|overloaded"; then
    echo "[grader] gemini/$model quota/transport pattern matched on failure" >&2
    return 1
  fi
  # Non-quota failure — propagate
  LAST_PROVIDER="gemini/$model"
  printf '%s' "$output"
  return "$exitcode"
}

# ── Main failover chain ────────────────────────────────────────────
run_grader_with_failover() {
  local prompt="$1"
  LAST_PROVIDER=""
  local rc

  # Layer 1: codex acc1
  try_codex "$prompt" "acc1" "$CODEX_ACC1"
  rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -ne 1 ]; then return "$rc"; fi

  # Layer 2: codex acc2 (if enabled)
  if [ "$CODEX_SINGLE_ACCOUNT" != "1" ]; then
    try_codex "$prompt" "acc2" "$CODEX_ACC2"
    rc=$?
    if [ "$rc" -eq 0 ]; then return 0; fi
    if [ "$rc" -ne 1 ]; then return "$rc"; fi
  fi

  # Layer 3: gemini primary
  try_gemini "$prompt" "$GEMINI_MODEL_1"
  rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -ne 1 ]; then return "$rc"; fi

  # Layer 4: gemini fallback
  try_gemini "$prompt" "$GEMINI_MODEL_2"
  rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -ne 1 ]; then return "$rc"; fi

  # All four layers exhausted. Sleep, try acc1 once more, then give up.
  echo "[grader] ALL layers exhausted. Sleeping ${BOTH_EXHAUSTED_SLEEP}s before retrying acc1 once..." >&2
  sleep "$BOTH_EXHAUSTED_SLEEP"
  try_codex "$prompt" "acc1" "$CODEX_ACC1"
  rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi

  echo "<promise>ABORT</promise>"
  echo "All grader providers exhausted (codex/acc1, codex/acc2, gemini/$GEMINI_MODEL_1, gemini/$GEMINI_MODEL_2) after 5-min wait. Rate-limit windows need time to reset." >&2
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
  result=$(run_grader_with_failover "$PROMPT")
  RC=$?
  set -e

  echo "$result"
  if [ -n "${LAST_PROVIDER:-}" ]; then
    echo "[grader] iteration used: $LAST_PROVIDER"
  fi

  if echo "$result" | grep -q '<promise>QA_COMPLETE</promise>'; then
    echo ""
    echo "Grader signaled QA_COMPLETE."
    break
  elif echo "$result" | grep -q '<promise>ABORT</promise>'; then
    echo ""
    echo "Grader signaled ABORT — QA blocked. Stopping." >&2
    exit 2
  elif echo "$result" | grep -q '<promise>NEXT</promise>'; then
    :
  else
    echo ""
    echo "No promise tag (exit=$RC). Restarting iteration."
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
