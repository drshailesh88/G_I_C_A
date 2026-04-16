#!/usr/bin/env bash
# Ralph security loop — Codex systematically works through OWASP Top 10.
#
# Different from harden-adversarial.sh: adversarial is open-ended creativity.
# This loop is a SYSTEMATIC OWASP pass. For each category (A01-A10), Codex
# audits every feature against it, fixes findings in production code, and
# adds regression tests. Uses dual-account failover (same pattern as qa.sh).
#
# Work source: the 10 OWASP Top 10 categories (hard-coded checklist).
# Progress:
#   ralph/security-report.json    — per-category findings + fixes
#   ralph/security-progress.txt   — running log
#
# Env overrides:
#   CODEX_ACC1=<path>  (default $HOME/.codex-acc1)
#   CODEX_ACC2=<path>  (default $HOME/.codex-acc2)
#   CODEX_SINGLE_ACCOUNT=1
#   OWASP_CATEGORIES=<comma-list>  override default A01..A10 to run subset
#   MAX_PLATEAU=<n>    default 3
#
# Usage: ./ralph/harden-security.sh [max_iterations=20]
#   NOTE: default is low (20) because iterations are expensive (Codex High
#   reasoning effort + full audit pass per category).

set -euo pipefail
cd "$(dirname "$0")/.."

MAX_ITER="${1:-20}"
PRD=ralph/prd.json
SEC_REPORT=ralph/security-report.json
SEC_PROGRESS=ralph/security-progress.txt
ITER_TIMEOUT=1800
SLEEP_BETWEEN=3

CODEX_ACC1="${CODEX_ACC1:-$HOME/.codex-acc1}"
CODEX_ACC2="${CODEX_ACC2:-$HOME/.codex-acc2}"
CODEX_SINGLE_ACCOUNT="${CODEX_SINGLE_ACCOUNT:-0}"
MAX_PLATEAU="${MAX_PLATEAU:-3}"
OWASP_CATEGORIES="${OWASP_CATEGORIES:-A01,A02,A03,A04,A05,A06,A07,A08,A09,A10}"

QUOTA_REGEX='429|rate.?limit|rate_limit|quota.?exceeded|quota_exceeded|usage.?limit|insufficient_quota|retry.?after|RESOURCE_EXHAUSTED|hit your usage limit|try again at|unauthorized|invalid.?api.?key|401|402|403'
BOTH_EXHAUSTED_SLEEP=300

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

[ -f "$SEC_REPORT" ] || echo "[]" > "$SEC_REPORT"
if [ ! -f "$SEC_PROGRESS" ]; then
  cat > "$SEC_PROGRESS" <<'EOF'
# Ralph Security Progress Log

## Security Patterns

<!-- Recurring vulnerability types + fixes. Agent writes here. -->

## Iteration log

<!-- Dated entries per OWASP category audited. -->

EOF
fi

validate_account() {
  local dir="$1"
  [ -d "$dir" ] && [ -s "$dir/auth.json" ]
}
ACC1_OK=$(validate_account "$CODEX_ACC1" && echo yes || echo no)
ACC2_OK=$(validate_account "$CODEX_ACC2" && echo yes || echo no)

IFS=',' read -ra OWASP_LIST <<< "$OWASP_CATEGORIES"
TOTAL_CATEGORIES=${#OWASP_LIST[@]}

count_audited() {
  python3 -c "
import json
r = json.load(open('$SEC_REPORT'))
done = {e['category'] for e in r if e.get('status') in ('GREEN', 'BLOCKED')}
print(len(done))
"
}
next_category() {
  python3 -c "
import json
r = json.load(open('$SEC_REPORT'))
done = {e['category'] for e in r if e.get('status') in ('GREEN', 'BLOCKED')}
for c in '$OWASP_CATEGORIES'.split(','):
    if c and c not in done:
        print(c)
        break
"
}

echo "───────────────────────────────────────────────────────────────"
echo "Ralph security loop — Codex systematic OWASP Top 10 audit"
echo "  categories:   $TOTAL_CATEGORIES ($OWASP_CATEGORIES)"
echo "  report:       $SEC_REPORT"
echo "  progress:     $SEC_PROGRESS"
echo "  max iter:     $MAX_ITER"
if [ ${#TIMEOUT_CMD[@]} -gt 0 ]; then
  echo "  timeout:      ${ITER_TIMEOUT}s per iter (${TIMEOUT_CMD[0]})"
else
  echo "  timeout:      (none available)"
fi
echo "  acc1:         $CODEX_ACC1  (authed: $ACC1_OK)"
if [ "$CODEX_SINGLE_ACCOUNT" = "1" ]; then
  echo "  acc2:         (disabled)"
else
  echo "  acc2:         $CODEX_ACC2  (authed: $ACC2_OK)"
fi
echo "───────────────────────────────────────────────────────────────"

if [ "$ACC1_OK" = "no" ]; then
  echo "ERROR: primary account $CODEX_ACC1 missing or not logged in." >&2
  exit 1
fi

# try_codex + run_sec_with_failover — same pattern as qa.sh / harden-adversarial.sh.
try_codex() {
  local prompt="$1" label="$2" dir="$3"
  if [ ! -s "$dir/auth.json" ]; then
    echo "[sec] skipping codex/$label (not authed: $dir)" >&2
    return 1
  fi
  echo "[sec] trying codex/$label..." >&2
  local output exitcode
  output=$(CODEX_HOME="$dir" "${TIMEOUT_CMD[@]}" codex exec --dangerously-bypass-approvals-and-sandbox "$prompt" 2>&1) || true
  exitcode=$?
  local tail
  tail=$(printf '%s\n' "$output" | tail -n 30)
  if echo "$tail" | grep -qiE "$QUOTA_REGEX"; then
    echo "[sec] codex/$label quota pattern matched" >&2
    return 1
  fi
  if [ "$exitcode" -eq 0 ] && [ -n "${output// }" ]; then
    LAST_PROVIDER="codex/$label"; printf '%s' "$output"; return 0
  fi
  if [ "$exitcode" -eq 2 ] && [ -z "${output// }" ]; then
    echo "[sec] codex/$label silent exit 2 — treating as quota" >&2
    return 1
  fi
  LAST_PROVIDER="codex/$label"; printf '%s' "$output"; return "$exitcode"
}

run_sec_with_failover() {
  local prompt="$1"
  LAST_PROVIDER=""
  local rc

  rc=0; try_codex "$prompt" "acc1" "$CODEX_ACC1" || rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -ne 1 ]; then return "$rc"; fi

  if [ "$CODEX_SINGLE_ACCOUNT" = "1" ]; then
    echo "[sec] acc1 exhausted, acc2 disabled. Sleeping ${BOTH_EXHAUSTED_SLEEP}s then retry..." >&2
    sleep "$BOTH_EXHAUSTED_SLEEP"
    rc=0; try_codex "$prompt" "acc1" "$CODEX_ACC1" || rc=$?
    if [ "$rc" -eq 0 ]; then return 0; fi
    echo "<promise>ABORT</promise>"; return 2
  fi

  rc=0; try_codex "$prompt" "acc2" "$CODEX_ACC2" || rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -ne 1 ]; then return "$rc"; fi

  echo "[sec] both accounts exhausted. Sleeping ${BOTH_EXHAUSTED_SLEEP}s..." >&2
  sleep "$BOTH_EXHAUSTED_SLEEP"
  rc=0; try_codex "$prompt" "acc1" "$CODEX_ACC1" || rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  rc=0; try_codex "$prompt" "acc2" "$CODEX_ACC2" || rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi

  echo "<promise>ABORT</promise>"; return 2
}

for i in $(seq 1 "$MAX_ITER"); do
  AUDITED=$(count_audited)
  REMAINING=$((TOTAL_CATEGORIES - AUDITED))
  echo ""
  echo "═══ sec iter $i/$MAX_ITER — $AUDITED/$TOTAL_CATEGORIES categories done ($REMAINING remaining) ══"
  echo ""

  if [ "$AUDITED" -ge "$TOTAL_CATEGORIES" ]; then
    echo "All OWASP categories audited. Security done."
    break
  fi

  CATEGORY=$(next_category)
  if [ -z "$CATEGORY" ]; then
    echo "No pending category. Done."
    break
  fi

  echo "[sec] auditing category: $CATEGORY"

  RECENT_COMMITS=$(git log --grep='^SEC:' -n 10 --format='%H%n%ad%n%B---' --date=short 2>/dev/null || echo '(no SEC commits yet)')

  PROMPT="You are a SYSTEMATIC SECURITY AUDITOR for this app. Read
@ralph/harden-security-prompt.md for your full protocol. Also read @CLAUDE.md,
@$PRD, @$SEC_REPORT, and @$SEC_PROGRESS.

ITERATION: $i of $MAX_ITER
TARGET CATEGORY: $CATEGORY  (from OWASP Top 10 2021)
PROGRESS: $AUDITED/$TOTAL_CATEGORIES categories done
Previous SEC commits:
$RECENT_COMMITS

Your job: audit the app for ALL instances of $CATEGORY vulnerabilities.
For each finding, fix the source code, add regression test, commit with
'SEC: $CATEGORY — <summary>' prefix. Mark the category GREEN in
$SEC_REPORT once no more findings remain for it.

Output <promise>NEXT</promise> when this category is clean or you made progress.
Output <promise>SEC_COMPLETE</promise> only if every category is GREEN.
Output <promise>ABORT</promise> if blocked (explain why)."

  set +e
  result=$(run_sec_with_failover "$PROMPT")
  RC=$?
  set -e

  echo "$result"
  if [ -n "${LAST_PROVIDER:-}" ]; then
    echo "[sec] iteration used: $LAST_PROVIDER"
  fi

  result_tail=$(printf '%s\n' "$result" | tail -n 40)
  quota_tail=$(printf '%s' "$result_tail" | grep -ciE "$QUOTA_REGEX" || true)

  if echo "$result_tail" | grep -q '<promise>SEC_COMPLETE</promise>' && [ "$quota_tail" -eq 0 ]; then
    NEW_AUDITED=$(count_audited)
    if [ "$NEW_AUDITED" -ge "$TOTAL_CATEGORIES" ]; then
      echo ""
      echo "Security signaled COMPLETE (verified: all categories GREEN/BLOCKED)."
      break
    else
      echo ""
      echo "Security emitted COMPLETE but only $NEW_AUDITED/$TOTAL_CATEGORIES audited — ignoring."
    fi
  elif echo "$result_tail" | grep -q '<promise>ABORT</promise>' && [ "$quota_tail" -eq 0 ]; then
    echo ""
    echo "Security signaled ABORT on $CATEGORY. Stopping." >&2
    exit 2
  elif echo "$result_tail" | grep -q '<promise>NEXT</promise>' && [ "$quota_tail" -eq 0 ]; then
    :
  else
    echo ""
    echo "No usable promise tag (exit=$RC, quota_signals=$quota_tail). Restarting iteration."
  fi

  sleep "$SLEEP_BETWEEN"
done

python3 - <<PY
import json
r = json.load(open('$SEC_REPORT'))
by_status = {}
total_findings = 0
fixed = 0
for e in r:
    s = e.get('status', '?')
    by_status[s] = by_status.get(s, 0) + 1
    for f in e.get('findings', []):
        total_findings += 1
        if f.get('fix_commit'):
            fixed += 1
print('')
print('───────────────────────────────────────────────────────────────')
print(f"Security summary: {len(r)}/$TOTAL_CATEGORIES categories touched")
print(f'  by status:    {by_status}')
print(f'  findings:     {total_findings}')
print(f'  fixed:        {fixed}')
print('───────────────────────────────────────────────────────────────')
PY
