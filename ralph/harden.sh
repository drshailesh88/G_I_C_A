#!/usr/bin/env bash
# Ralph harden loop — Claude Sonnet kills surviving mutants one module at a time.
#
# Different from qa.sh: this loop's job is to IMPROVE TEST QUALITY, not to find
# product bugs. For each module whose mutation score is below its tier floor,
# Claude reads the surviving-mutants report, adds tests that kill them, runs
# the project's check suite to verify, and commits. The agent does NOT modify
# source code unless a mutant reveals an actual bug (rare — see harden-prompt.md).
#
# Work source: .quality/state.json  (written by qa-controller baseline)
#   modules[].belowFloor → true means this module needs hardening
#   modules[].tier       → critical_75 | business_60 | ui_gates_only
#   modules[].baseline   → current mutation score
#   modules[].floor      → score this tier must hold
#
# Progress tracking:
#   ralph/harden-report.json   — structured per-module outcomes (plateau buffer)
#   ralph/harden-progress.txt  — running log for the agent to read next iter
#
# Env overrides:
#   HARDEN_MODEL=<id>    default claude-sonnet-4-6 (use claude-opus-4-6 to A/B)
#   MAX_PLATEAU=<n>      default 3 (identical-signature fails → BLOCKED)
#
# Usage: ./ralph/harden.sh [max_iterations=999]

set -euo pipefail
cd "$(dirname "$0")/.."

MAX_ITER="${1:-999}"
STATE=.quality/state.json
HARDEN_REPORT=ralph/harden-report.json
HARDEN_PROGRESS=ralph/harden-progress.txt
ITER_TIMEOUT=1800
SLEEP_BETWEEN=3

HARDEN_MODEL="${HARDEN_MODEL:-claude-sonnet-4-6}"
MAX_PLATEAU="${MAX_PLATEAU:-3}"

if [ ! -f "$STATE" ]; then
  echo "ERROR: $STATE not found. Run qa-controller baseline first (/playbook:qa-baseline)." >&2
  exit 1
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: claude CLI not found." >&2
  exit 1
fi

# Resolve timeout command (macOS ships without `timeout`).
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(timeout "$ITER_TIMEOUT")
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(gtimeout "$ITER_TIMEOUT")
else
  echo "WARNING: no timeout command found. Install 'brew install coreutils' for gtimeout." >&2
  TIMEOUT_CMD=()
fi

# Initialize harden-report.json if missing.
if [ ! -f "$HARDEN_REPORT" ]; then
  echo "[]" > "$HARDEN_REPORT"
fi

# Initialize harden-progress.txt with a structured header if missing.
if [ ! -f "$HARDEN_PROGRESS" ]; then
  cat > "$HARDEN_PROGRESS" <<'EOF'
# Ralph Harden Progress Log

## Hardening Patterns

<!-- Reusable test patterns discovered during hardening. Agent writes here. -->

## Iteration log

<!-- Dated entries per module, appended by harden agent. -->

EOF
fi

# Python helpers for JSON counting — fail loud if state.json is malformed.
# Schema: state.json has modules as a DICT keyed by path, each entry has
# {tier, mutation_baseline, has_exceeded_floor, ...}. Floor is encoded in
# the tier name (critical_75 → 75, business_60 → 60, ui_gates_only → skip).

parse_floor_py='
def parse_floor(tier):
    if not tier or "ui_gates_only" in tier:
        return None  # no mutation floor for UI-only modules
    # Tier format: "<name>_<floor>" e.g. "critical_75"
    parts = tier.rsplit("_", 1)
    if len(parts) == 2 and parts[1].isdigit():
        return int(parts[1])
    return None
'

count_below_floor() {
  python3 -c "
import json
$parse_floor_py
s = json.load(open('$STATE'))
mods = s.get('modules', {})
n = 0
for path, m in mods.items():
    floor = parse_floor(m.get('tier'))
    if floor is None:
        continue  # skip ui_gates_only — no mutation floor
    if not m.get('has_exceeded_floor', False):
        n += 1
print(n)
"
}
count_modules() {
  python3 -c "
import json
$parse_floor_py
s = json.load(open('$STATE'))
# Count only modules with a mutation floor (skip ui_gates_only).
print(sum(1 for _, m in s.get('modules', {}).items() if parse_floor(m.get('tier')) is not None))
"
}
first_below_floor() {
  # Returns module path + tier + baseline + floor as TSV, or empty.
  python3 -c "
import json
$parse_floor_py
s = json.load(open('$STATE'))
r = json.load(open('$HARDEN_REPORT'))
blocked = {e['module'] for e in r if e.get('status') == 'BLOCKED'}
for path, m in s.get('modules', {}).items():
    floor = parse_floor(m.get('tier'))
    if floor is None:
        continue
    if m.get('has_exceeded_floor', False):
        continue
    if path in blocked:
        continue
    score = m.get('mutation_baseline', '?')
    print(f\"{path}\t{m.get('tier','?')}\t{score}\t{floor}\")
    break
"
}

TOTAL_MODULES=$(count_modules)
BELOW_START=$(count_below_floor)

echo "───────────────────────────────────────────────────────────────"
echo "Ralph harden loop — Claude Sonnet kills surviving mutants"
echo "  state:      $STATE  ($TOTAL_MODULES modules, $BELOW_START below floor)"
echo "  report:     $HARDEN_REPORT"
echo "  progress:   $HARDEN_PROGRESS"
echo "  model:      $HARDEN_MODEL"
echo "  max iter:   $MAX_ITER"
echo "  plateau:    $MAX_PLATEAU identical fails → BLOCKED"
if [ ${#TIMEOUT_CMD[@]} -gt 0 ]; then
  echo "  timeout:    ${ITER_TIMEOUT}s per iter (${TIMEOUT_CMD[0]})"
else
  echo "  timeout:    (none available)"
fi
echo "───────────────────────────────────────────────────────────────"

if [ "$BELOW_START" -eq 0 ]; then
  echo "No modules below floor. Harden already complete."
  exit 0
fi

for i in $(seq 1 "$MAX_ITER"); do
  BELOW=$(count_below_floor)
  BLOCKED_N=$(python3 -c "import json; print(sum(1 for e in json.load(open('$HARDEN_REPORT')) if e.get('status') == 'BLOCKED'))")
  HARDENED=$((TOTAL_MODULES - BELOW))
  echo ""
  echo "═══ harden iter $i/$MAX_ITER — $HARDENED/$TOTAL_MODULES at floor ($BELOW below, $BLOCKED_N blocked) ══"
  echo ""

  if [ "$BELOW" -eq "$BLOCKED_N" ]; then
    # Every remaining below-floor module is blocked. Nothing actionable.
    if [ "$BELOW" -eq 0 ]; then
      echo "All modules at floor. Harden done."
    else
      echo "Remaining $BELOW modules all BLOCKED (plateaued). Human review needed."
    fi
    break
  fi

  TARGET=$(first_below_floor)
  if [ -z "$TARGET" ]; then
    echo "No non-blocked module below floor. Done."
    break
  fi

  MODULE=$(echo "$TARGET" | cut -f1)
  TIER=$(echo "$TARGET" | cut -f2)
  BASELINE=$(echo "$TARGET" | cut -f3)
  FLOOR=$(echo "$TARGET" | cut -f4)

  echo "[harden] target: $MODULE  (tier=$TIER, score=$BASELINE%, floor=$FLOOR%)"

  RECENT_COMMITS=$(git log --grep='^HARDEN:' -n 10 --format='%H%n%ad%n%B---' --date=short 2>/dev/null || echo '(no HARDEN commits yet)')

  PROMPT="@ralph/harden-prompt.md @CLAUDE.md @$STATE @$HARDEN_REPORT @$HARDEN_PROGRESS

ITERATION: $i of $MAX_ITER
TARGET MODULE: $MODULE
TIER: $TIER  (floor = $FLOOR%)
CURRENT SCORE: $BASELINE%
PROGRESS: $HARDENED/$TOTAL_MODULES at floor
Previous HARDEN commits:
$RECENT_COMMITS

Your job: add tests that kill surviving mutants in $MODULE until the mutation
score hits the floor for its tier. Read ralph/harden-prompt.md for the full
protocol. Do NOT modify source code unless a mutant reveals a real bug.
Do NOT modify any locked files (.quality/**, vitest/playwright/stryker config, etc.).
Commit with 'HARDEN: $MODULE — <what changed>' prefix.

Output <promise>NEXT</promise> when this module hits floor or you made progress.
Output <promise>HARDEN_COMPLETE</promise> only if every module is at or above floor.
Output <promise>ABORT</promise> if blocked (explain above the tag)."

  # Capture a failure signature to detect plateau.
  SIG_BEFORE=$(python3 -c "
import json
r = json.load(open('$HARDEN_REPORT'))
prev = [e for e in r if e.get('module') == '$MODULE']
print(prev[-1].get('signature', '') if prev else '')
")

  set +e
  result=$("${TIMEOUT_CMD[@]}" claude -p --dangerously-skip-permissions --model "$HARDEN_MODEL" "$PROMPT")
  CLAUDE_EXIT=$?
  set -e

  echo "$result"

  # Grep only the last 40 lines for promise tags — avoid prompt-echo false matches.
  result_tail=$(printf '%s\n' "$result" | tail -n 40)

  if echo "$result_tail" | grep -q '<promise>HARDEN_COMPLETE</promise>'; then
    # Verify: re-read state.json. Agent may have lied / been confused.
    NEW_BELOW=$(count_below_floor)
    if [ "$NEW_BELOW" -eq 0 ]; then
      echo ""
      echo "Harden signaled COMPLETE (verified: 0 modules below floor)."
      break
    else
      echo ""
      echo "Harden emitted COMPLETE but $NEW_BELOW modules still below floor — ignoring false signal."
    fi
  elif echo "$result_tail" | grep -q '<promise>ABORT</promise>'; then
    echo ""
    echo "Harden signaled ABORT on $MODULE. Stopping." >&2
    exit 2
  elif echo "$result_tail" | grep -q '<promise>NEXT</promise>'; then
    : # normal — continue
  else
    echo ""
    echo "No promise tag found (exit=$CLAUDE_EXIT). Restarting iteration."
    sleep "$SLEEP_BETWEEN"
    continue
  fi

  # Post-iteration: re-invoke the controller's gates to measure the new floor status.
  # The controller writes state.json with updated module.belowFloor.
  echo "[harden] running qa-controller baseline --module $MODULE to refresh score..."
  set +e
  npx qa-controller baseline --module "$MODULE" > /tmp/harden-gate-$i.log 2>&1
  GATE_EXIT=$?
  set -e
  tail -n 20 /tmp/harden-gate-$i.log

  # Compute post-iteration signature (failure shape if still below floor).
  SIG_AFTER=$(python3 -c "
import json
s = json.load(open('$STATE'))
mods = s.get('modules', {})
m = mods.get('$MODULE')
if not m or m.get('has_exceeded_floor', False):
    print('')  # At floor now — no signature.
else:
    print(f\"score={m.get('mutation_baseline','?')}\")
")

  # Update harden-report.json: append this iteration's outcome + plateau buffer.
  python3 - "$MODULE" "$SIG_AFTER" "$MAX_PLATEAU" <<'PY'
import json, sys, datetime
module, sig_after, max_plateau = sys.argv[1], sys.argv[2], int(sys.argv[3])
path = 'ralph/harden-report.json'
r = json.load(open(path))
entry = next((e for e in r if e.get('module') == module), None)
if not entry:
    entry = {'module': module, 'attempts': 0, 'plateau_buffer': [], 'status': 'IN_PROGRESS'}
    r.append(entry)
entry['attempts'] = entry.get('attempts', 0) + 1
entry['last_iter_at'] = datetime.datetime.utcnow().isoformat() + 'Z'
entry['signature'] = sig_after
if sig_after == '':
    entry['status'] = 'GREEN'
    entry['plateau_buffer'] = []
else:
    buf = entry.get('plateau_buffer', [])
    buf.append(sig_after)
    buf = buf[-max_plateau:]
    entry['plateau_buffer'] = buf
    if len(buf) >= max_plateau and len(set(buf)) == 1:
        entry['status'] = 'BLOCKED'
        print(f"[harden] PLATEAU detected for {module} — marking BLOCKED", file=sys.stderr)
    else:
        entry['status'] = 'IN_PROGRESS'
json.dump(r, open(path, 'w'), indent=2)
PY

  # Auto-commit any uncommitted changes as a safety net (HARDEN prefix).
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git add -A
    git commit -m "HARDEN: $MODULE iter $i — auto-snapshot (score→$SIG_AFTER)" || true
  fi

  sleep "$SLEEP_BETWEEN"
done

# Final summary
FINAL_BELOW=$(count_below_floor)
FINAL_HARDENED=$((TOTAL_MODULES - FINAL_BELOW))
FINAL_BLOCKED=$(python3 -c "import json; print(sum(1 for e in json.load(open('$HARDEN_REPORT')) if e.get('status') == 'BLOCKED'))")

echo ""
echo "───────────────────────────────────────────────────────────────"
echo "Harden summary: $FINAL_HARDENED/$TOTAL_MODULES at floor  ($FINAL_BELOW below, $FINAL_BLOCKED blocked)"
if [ "$FINAL_BLOCKED" -gt 0 ]; then
  echo ""
  echo "Blocked modules (need human review):"
  python3 -c "
import json
for e in json.load(open('$HARDEN_REPORT')):
    if e.get('status') == 'BLOCKED':
        print(f\"  {e['module']}  (attempts={e.get('attempts',0)}, last_sig={e.get('signature','?')})\")
"
fi
echo "───────────────────────────────────────────────────────────────"
