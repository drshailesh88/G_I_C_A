#!/usr/bin/env bash
# Ralph adversarial loop — Codex red-teams features that already passed QA.
#
# Different from qa.sh: qa.sh verifies features against their specs. This loop
# goes further — it actively tries to BREAK the app: injection, auth bypass,
# race conditions, resource exhaustion, stale-state bugs, unexpected input
# shapes. For each qa_tested:true feature, Codex attacks it adversarially,
# finds bugs, fixes them in production code, and adds regression tests.
#
# Work source: ralph/prd.json  (features where passes:true AND qa_tested:true
#   AND no matching adversarial-report entry)
#
# Progress tracking:
#   ralph/adversarial-report.json   — per-feature findings (attacks tried + bugs)
#   ralph/adversarial-progress.txt  — running log
#
# Dual-account failover: same pattern as qa.sh. Tries CODEX_ACC1 first,
# falls back to CODEX_ACC2 on quota exhaustion.
#
# Env overrides:
#   CODEX_ACC1=<path>            primary codex account (default $HOME/.codex-acc1)
#   CODEX_ACC2=<path>            fallback codex account (default $HOME/.codex-acc2)
#   CODEX_SINGLE_ACCOUNT=1       disable fallback layer
#   MAX_PLATEAU=<n>              default 3
#
# Usage: ./ralph/harden-adversarial.sh [max_iterations=999]

set -euo pipefail
cd "$(dirname "$0")/.."

MAX_ITER="${1:-999}"
PRD=ralph/prd.json
ADV_REPORT=ralph/adversarial-report.json
ADV_PROGRESS=ralph/adversarial-progress.txt
ITER_TIMEOUT=1800
SLEEP_BETWEEN=3

CODEX_ACC1="${CODEX_ACC1:-$HOME/.codex-acc1}"
CODEX_ACC2="${CODEX_ACC2:-$HOME/.codex-acc2}"
CODEX_SINGLE_ACCOUNT="${CODEX_SINGLE_ACCOUNT:-0}"
MAX_PLATEAU="${MAX_PLATEAU:-3}"

QUOTA_REGEX='429|rate.?limit|rate_limit|quota.?exceeded|quota_exceeded|usage.?limit|insufficient_quota|retry.?after|RESOURCE_EXHAUSTED|hit your usage limit|try again at|unauthorized|invalid.?api.?key|401|402|403'
BOTH_EXHAUSTED_SLEEP=300

if [ ! -f "$PRD" ]; then
  echo "ERROR: $PRD not found." >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: codex CLI not found." >&2
  exit 1
fi

if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(timeout "$ITER_TIMEOUT")
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(gtimeout "$ITER_TIMEOUT")
else
  echo "WARNING: no timeout command found." >&2
  TIMEOUT_CMD=()
fi

[ -f "$ADV_REPORT" ] || echo "[]" > "$ADV_REPORT"
if [ ! -f "$ADV_PROGRESS" ]; then
  cat > "$ADV_PROGRESS" <<'EOF'
# Ralph Adversarial Progress Log

## Attack Patterns

<!-- Recurring attack vectors + their fixes. Agent writes here. -->

## Iteration log

<!-- Dated entries per feature attacked. -->

EOF
fi

count_qad() {
  python3 -c "import json; d=json.load(open('$PRD')); print(sum(1 for x in d if x.get('qa_tested', False)))"
}
count_adv() {
  python3 -c "import json; d=json.load(open('$ADV_REPORT')); print(len({x['story_id'] for x in d if x.get('story_id')}))"
}
validate_account() {
  local dir="$1"
  [ -d "$dir" ] && [ -s "$dir/auth.json" ]
}

QAD=$(count_qad)
ADVD=$(count_adv)
ACC1_OK=$(validate_account "$CODEX_ACC1" && echo yes || echo no)
ACC2_OK=$(validate_account "$CODEX_ACC2" && echo yes || echo no)

echo "───────────────────────────────────────────────────────────────"
echo "Ralph adversarial loop — Codex red-team attacker"
echo "  prd:        $PRD  ($QAD features QA'd, $ADVD already attacked)"
echo "  report:     $ADV_REPORT"
echo "  progress:   $ADV_PROGRESS"
echo "  max iter:   $MAX_ITER"
echo "  plateau:    $MAX_PLATEAU"
if [ ${#TIMEOUT_CMD[@]} -gt 0 ]; then
  echo "  timeout:    ${ITER_TIMEOUT}s per iter (${TIMEOUT_CMD[0]})"
else
  echo "  timeout:    (none available)"
fi
echo "  acc1:       $CODEX_ACC1  (authed: $ACC1_OK)"
if [ "$CODEX_SINGLE_ACCOUNT" = "1" ]; then
  echo "  acc2:       (disabled)"
else
  echo "  acc2:       $CODEX_ACC2  (authed: $ACC2_OK)"
fi
echo "───────────────────────────────────────────────────────────────"

if [ "$ACC1_OK" = "no" ]; then
  echo "ERROR: primary account $CODEX_ACC1 missing or not logged in." >&2
  echo "Run: CODEX_HOME=$CODEX_ACC1 codex login" >&2
  exit 1
fi

if [ "$QAD" -eq 0 ]; then
  echo "No features QA'd yet. Nothing to attack. Run ralph/qa.sh first."
  exit 0
fi

# try_codex + run_grader_with_failover — same logic as qa.sh.
try_codex() {
  local prompt="$1" label="$2" dir="$3"
  if [ ! -s "$dir/auth.json" ]; then
    echo "[red-team] skipping codex/$label (not authed: $dir)" >&2
    return 1
  fi
  echo "[red-team] trying codex/$label ($dir)..." >&2
  local output exitcode
  output=$(CODEX_HOME="$dir" "${TIMEOUT_CMD[@]}" codex exec --dangerously-bypass-approvals-and-sandbox "$prompt" 2>&1) || true
  exitcode=$?

  local output_tail
  output_tail=$(printf '%s\n' "$output" | tail -n 30)

  if echo "$output_tail" | grep -qiE "$QUOTA_REGEX"; then
    echo "[red-team] codex/$label quota pattern matched" >&2
    return 1
  fi
  if [ "$exitcode" -eq 0 ] && [ -n "${output// }" ]; then
    LAST_PROVIDER="codex/$label"
    printf '%s' "$output"
    return 0
  fi
  if [ "$exitcode" -eq 2 ] && [ -z "${output// }" ]; then
    echo "[red-team] codex/$label silent exit 2 — treating as quota" >&2
    return 1
  fi
  LAST_PROVIDER="codex/$label"
  printf '%s' "$output"
  return "$exitcode"
}

run_red_with_failover() {
  local prompt="$1"
  LAST_PROVIDER=""
  local rc

  rc=0; try_codex "$prompt" "acc1" "$CODEX_ACC1" || rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -ne 1 ]; then return "$rc"; fi

  if [ "$CODEX_SINGLE_ACCOUNT" = "1" ]; then
    echo "[red-team] acc1 exhausted, acc2 disabled. Sleeping ${BOTH_EXHAUSTED_SLEEP}s then retry..." >&2
    sleep "$BOTH_EXHAUSTED_SLEEP"
    rc=0; try_codex "$prompt" "acc1" "$CODEX_ACC1" || rc=$?
    if [ "$rc" -eq 0 ]; then return 0; fi
    echo "<promise>ABORT</promise>"
    return 2
  fi

  rc=0; try_codex "$prompt" "acc2" "$CODEX_ACC2" || rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -ne 1 ]; then return "$rc"; fi

  echo "[red-team] both accounts exhausted. Sleeping ${BOTH_EXHAUSTED_SLEEP}s..." >&2
  sleep "$BOTH_EXHAUSTED_SLEEP"
  rc=0; try_codex "$prompt" "acc1" "$CODEX_ACC1" || rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  rc=0; try_codex "$prompt" "acc2" "$CODEX_ACC2" || rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi

  echo "<promise>ABORT</promise>"
  return 2
}

for i in $(seq 1 "$MAX_ITER"); do
  QAD=$(count_qad)
  ADVD=$(count_adv)
  REMAINING=$((QAD - ADVD))
  echo ""
  echo "═══ red-team iter $i/$MAX_ITER — $ADVD/$QAD attacked ($REMAINING remaining) ══"
  echo ""

  if [ "$ADVD" -ge "$QAD" ]; then
    echo "All QA'd features have been red-teamed. Adversarial done."
    break
  fi

  RECENT_COMMITS=$(git log --grep='^RED:' -n 10 --format='%H%n%ad%n%B---' --date=short 2>/dev/null || echo '(no RED commits yet)')

  PROMPT="You are a RED-TEAM attacker for this app. Your goal is to BREAK it.
Read @ralph/harden-adversarial-prompt.md for your full protocol. Also read
@CLAUDE.md, @$PRD, @$ADV_REPORT, and @$ADV_PROGRESS.

ITERATION: $i of $MAX_ITER
PROGRESS: $ADVD of $QAD QA'd features already red-teamed
Previous RED commits:
$RECENT_COMMITS

Pick the FIRST story in $PRD where passes:true AND qa_tested:true AND no
entry in $ADV_REPORT has a matching story_id. Attack it adversarially:
injection, auth bypass, race conditions, resource exhaustion, stale state,
malformed input. Fix any bugs found in PRODUCTION code only. Add regression
tests. Append a structured entry to $ADV_REPORT. Update $ADV_PROGRESS.
Commit with 'RED: <story-id> — <summary>' prefix.

Output <promise>NEXT</promise> when done.
Output <promise>RED_COMPLETE</promise> only if every qa_tested:true story has an adversarial-report entry.
Output <promise>ABORT</promise> if blocked (explain why above the tag)."

  set +e
  result=$(run_red_with_failover "$PROMPT")
  RC=$?
  set -e

  echo "$result"
  if [ -n "${LAST_PROVIDER:-}" ]; then
    echo "[red-team] iteration used: $LAST_PROVIDER"
  fi

  result_tail=$(printf '%s\n' "$result" | tail -n 40)
  quota_tail=$(printf '%s' "$result_tail" | grep -ciE "$QUOTA_REGEX" || true)

  if echo "$result_tail" | grep -q '<promise>RED_COMPLETE</promise>' && [ "$quota_tail" -eq 0 ]; then
    un_attacked=$(python3 -c "
import json
d = json.load(open('$PRD'))
r = json.load(open('$ADV_REPORT'))
done = {e['story_id'] for e in r if e.get('story_id')}
print(sum(1 for x in d if x.get('passes') and x.get('qa_tested') and x.get('id') not in done))
")
    if [ "$un_attacked" -eq 0 ]; then
      echo ""
      echo "Red-team signaled RED_COMPLETE (verified: 0 stories un-attacked)."
      break
    else
      echo ""
      echo "Red-team emitted RED_COMPLETE but $un_attacked stories un-attacked — ignoring false signal."
    fi
  elif echo "$result_tail" | grep -q '<promise>ABORT</promise>' && [ "$quota_tail" -eq 0 ]; then
    echo ""
    echo "Red-team signaled ABORT. Stopping." >&2
    exit 2
  elif echo "$result_tail" | grep -q '<promise>NEXT</promise>' && [ "$quota_tail" -eq 0 ]; then
    :
  else
    echo ""
    echo "No usable promise tag (exit=$RC, quota_signals=$quota_tail). Restarting iteration."
  fi

  sleep "$SLEEP_BETWEEN"
done

FINAL_ADVD=$(count_adv)
QAD=$(count_qad)

python3 - <<PY
import json
d = json.load(open('$ADV_REPORT'))
total_bugs = sum(len(x.get('bugs_found', [])) for x in d)
fixed = sum(1 for x in d for b in x.get('bugs_found', []) if b.get('fix_commit'))
by_severity = {}
for x in d:
    for b in x.get('bugs_found', []):
        sev = b.get('severity', '?')
        by_severity[sev] = by_severity.get(sev, 0) + 1
print('')
print('───────────────────────────────────────────────────────────────')
print(f"Red-team summary: {$FINAL_ADVD}/{$QAD} features attacked")
print(f'  bugs found:   {total_bugs}')
print(f'  bugs fixed:   {fixed}')
print(f'  by severity:  {by_severity}')
print('───────────────────────────────────────────────────────────────')
PY
