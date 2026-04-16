#!/usr/bin/env bash
# Ralph drift loop — catch runtime behavior diverging from frozen contracts.
#
# For each contract in .quality/contracts/<feature>/, the acceptance test suite
# encodes the runtime behavior the contract promises. This loop runs those
# acceptance tests against the current code. Any failure means the app's
# behavior has drifted from the contract — either a regression introduced by
# later changes, or a real change that should have updated the contract.
#
# The agent fixes source code to match the contract (never the other way —
# contracts are locked; they override code).
#
# Work source: .quality/contracts/*/acceptance.spec.ts  (locked tests)
#
# Progress tracking:
#   ralph/drift-report.json      — per-contract drift findings
#   ralph/drift-progress.txt     — running log
#
# Env overrides:
#   DRIFT_MODEL=<id>             default claude-sonnet-4-6
#   ACCEPTANCE_CMD=<cmd>         default: npx playwright test --grep @contract
#   MAX_PLATEAU=<n>              default 3
#
# Usage: ./ralph/harden-drift.sh [max_iterations=999]

set -euo pipefail
cd "$(dirname "$0")/.."

MAX_ITER="${1:-999}"
DRIFT_REPORT=ralph/drift-report.json
DRIFT_PROGRESS=ralph/drift-progress.txt
ITER_TIMEOUT=1800
SLEEP_BETWEEN=3

DRIFT_MODEL="${DRIFT_MODEL:-claude-sonnet-4-6}"
ACCEPTANCE_CMD="${ACCEPTANCE_CMD:-npx playwright test --grep @contract --reporter=json}"
MAX_PLATEAU="${MAX_PLATEAU:-3}"

if [ ! -d .quality/contracts ]; then
  echo "ERROR: .quality/contracts/ not found. Run /playbook:install-qa-harness + /playbook:contract-pack first." >&2
  exit 1
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: claude CLI not found." >&2
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

[ -f "$DRIFT_REPORT" ] || echo "[]" > "$DRIFT_REPORT"
if [ ! -f "$DRIFT_PROGRESS" ]; then
  cat > "$DRIFT_PROGRESS" <<'EOF'
# Ralph Drift Progress Log

## Drift Patterns

<!-- Recurring drift types + their fixes. Agent writes here. -->

## Iteration log

<!-- Dated entries per contract fixed. -->

EOF
fi

# Run all contract acceptance tests. Parse JSON output to find failing contracts.
# Returns TSV: contract_name<TAB>reason  (one per failing contract)
find_drift() {
  local results_file
  results_file=$(mktemp)
  set +e
  # Capture both stdout (JSON) and exit code. Playwright exits non-zero on any failure.
  $ACCEPTANCE_CMD > "$results_file" 2>&1
  local test_exit=$?
  set -e

  if [ "$test_exit" -eq 0 ]; then
    # All acceptance tests pass = no drift.
    rm -f "$results_file"
    return 0
  fi

  # Parse failing tests. Playwright JSON reporter writes to the file.
  # Expected location for most setups: test-results/results.json or inline.
  python3 - "$results_file" <<'PY'
import json, sys, re, pathlib
raw = pathlib.Path(sys.argv[1]).read_text()
# Accept either pure JSON or JSON embedded in stdout.
try:
    data = json.loads(raw)
except Exception:
    # Try extracting a JSON object from mixed output.
    m = re.search(r'\{[^{}]*"suites"[^{}]*\}', raw, re.DOTALL)
    if not m:
        # Fall back: emit a single "unknown failure" row so the loop still runs.
        print("UNKNOWN_CONTRACT\tcould not parse acceptance test output")
        sys.exit(0)
    data = json.loads(m.group(0))

def walk(node, path):
    for suite in node.get('suites', []) or []:
        walk(suite, path + [suite.get('title','?')])
    for spec in node.get('specs', []) or []:
        for test in spec.get('tests', []) or []:
            status = test.get('status') or 'unknown'
            if status not in ('passed', 'skipped'):
                # Extract the contract path from the title or spec file.
                # Convention: acceptance.spec.ts lives in .quality/contracts/<name>/
                spec_file = spec.get('file') or ''
                m = re.search(r'\.quality/contracts/([^/]+)/', spec_file)
                contract = m.group(1) if m else (spec.get('title') or '?')
                reason = ''
                for r in test.get('results', []) or []:
                    e = r.get('error', {})
                    msg = e.get('message') or ''
                    if msg:
                        reason = msg.splitlines()[0][:200]
                        break
                print(f"{contract}\t{reason}")

walk(data, [])
PY
  rm -f "$results_file"
  return 1
}

count_contracts() {
  find .quality/contracts -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' '
}

TOTAL_CONTRACTS=$(count_contracts)

echo "───────────────────────────────────────────────────────────────"
echo "Ralph drift loop — Claude Sonnet fixes contract drift"
echo "  contracts:      $TOTAL_CONTRACTS"
echo "  report:         $DRIFT_REPORT"
echo "  progress:       $DRIFT_PROGRESS"
echo "  model:          $DRIFT_MODEL"
echo "  acceptance:     $ACCEPTANCE_CMD"
echo "  max iter:       $MAX_ITER"
if [ ${#TIMEOUT_CMD[@]} -gt 0 ]; then
  echo "  timeout:        ${ITER_TIMEOUT}s per iter (${TIMEOUT_CMD[0]})"
else
  echo "  timeout:        (none available)"
fi
echo "───────────────────────────────────────────────────────────────"

PLATEAU_BUF=()

for i in $(seq 1 "$MAX_ITER"); do
  echo ""
  echo "═══ drift iter $i/$MAX_ITER — running acceptance suite ══"
  echo ""

  set +e
  DRIFT_FINDINGS=$(find_drift)
  FIND_EXIT=$?
  set -e

  if [ "$FIND_EXIT" -eq 0 ] || [ -z "$DRIFT_FINDINGS" ]; then
    echo "All contract acceptance tests pass. No drift."
    break
  fi

  # Pick the first failing contract (skip BLOCKED ones).
  FIRST_LINE=$(echo "$DRIFT_FINDINGS" | python3 -c "
import json, sys
report = json.load(open('$DRIFT_REPORT'))
blocked = {e['contract'] for e in report if e.get('status') == 'BLOCKED'}
for line in sys.stdin:
    line = line.rstrip('\n')
    if not line:
        continue
    contract = line.split('\t', 1)[0]
    if contract not in blocked:
        print(line)
        break
")
  if [ -z "$FIRST_LINE" ]; then
    echo "All remaining drift is in BLOCKED contracts. Human review needed."
    break
  fi

  CONTRACT=$(echo "$FIRST_LINE" | cut -f1)
  REASON=$(echo "$FIRST_LINE" | cut -f2)

  echo "[drift] target contract: $CONTRACT"
  echo "[drift] failure reason:  $REASON"
  echo ""

  RECENT_COMMITS=$(git log --grep='^DRIFT:' -n 10 --format='%H%n%ad%n%B---' --date=short 2>/dev/null || echo '(no DRIFT commits yet)')

  PROMPT="@ralph/harden-drift-prompt.md @CLAUDE.md @$DRIFT_REPORT @$DRIFT_PROGRESS

ITERATION: $i of $MAX_ITER
TARGET CONTRACT: $CONTRACT
ACCEPTANCE TEST FAILURE: $REASON
Previous DRIFT commits:
$RECENT_COMMITS

Your job: inspect the failing acceptance test in .quality/contracts/$CONTRACT/,
identify the source-code drift that broke it, and FIX the source to match the
contract. Never weaken or modify the contract. Run the contract's acceptance
tests after fixing. Commit with 'DRIFT: $CONTRACT — <what changed>' prefix.

Output <promise>NEXT</promise> when this contract passes or you made progress.
Output <promise>DRIFT_COMPLETE</promise> only if every contract acceptance test passes.
Output <promise>ABORT</promise> if blocked (explain above the tag)."

  set +e
  result=$("${TIMEOUT_CMD[@]}" claude -p --dangerously-skip-permissions --model "$DRIFT_MODEL" "$PROMPT")
  CLAUDE_EXIT=$?
  set -e

  echo "$result"

  result_tail=$(printf '%s\n' "$result" | tail -n 40)

  if echo "$result_tail" | grep -q '<promise>DRIFT_COMPLETE</promise>'; then
    # Verify by re-running acceptance.
    set +e
    find_drift > /dev/null
    RE_EXIT=$?
    set -e
    if [ "$RE_EXIT" -eq 0 ]; then
      echo ""
      echo "Drift signaled COMPLETE (verified: all acceptance tests pass)."
      break
    else
      echo ""
      echo "Drift emitted COMPLETE but acceptance still failing — ignoring false signal."
    fi
  elif echo "$result_tail" | grep -q '<promise>ABORT</promise>'; then
    echo ""
    echo "Drift signaled ABORT on $CONTRACT. Stopping." >&2
    exit 2
  elif echo "$result_tail" | grep -q '<promise>NEXT</promise>'; then
    : # continue
  else
    echo ""
    echo "No promise tag found (exit=$CLAUDE_EXIT). Restarting iteration."
    sleep "$SLEEP_BETWEEN"
    continue
  fi

  # Compute signature for plateau: contract + first-line of failure.
  SIG="$CONTRACT|$REASON"
  PLATEAU_BUF+=("$SIG")
  if [ "${#PLATEAU_BUF[@]}" -gt "$MAX_PLATEAU" ]; then
    PLATEAU_BUF=("${PLATEAU_BUF[@]: -$MAX_PLATEAU}")
  fi

  # Update drift-report.json with plateau tracking.
  python3 - "$CONTRACT" "$REASON" "$MAX_PLATEAU" "${PLATEAU_BUF[@]}" <<'PY'
import json, sys, datetime
contract, reason, max_plateau = sys.argv[1], sys.argv[2], int(sys.argv[3])
buf = sys.argv[4:]
path = 'ralph/drift-report.json'
r = json.load(open(path))
entry = next((e for e in r if e.get('contract') == contract), None)
if not entry:
    entry = {'contract': contract, 'attempts': 0, 'status': 'IN_PROGRESS'}
    r.append(entry)
entry['attempts'] = entry.get('attempts', 0) + 1
entry['last_iter_at'] = datetime.datetime.utcnow().isoformat() + 'Z'
entry['last_reason'] = reason
# Plateau: the last MAX_PLATEAU signatures are identical AND all reference this contract.
tail = buf[-max_plateau:] if len(buf) >= max_plateau else []
if tail and len(set(tail)) == 1 and tail[0].startswith(contract + '|'):
    entry['status'] = 'BLOCKED'
    print(f"[drift] PLATEAU — marking {contract} BLOCKED", file=sys.stderr)
json.dump(r, open(path, 'w'), indent=2)
PY

  sleep "$SLEEP_BETWEEN"
done

FINAL_BLOCKED=$(python3 -c "import json; print(sum(1 for e in json.load(open('$DRIFT_REPORT')) if e.get('status') == 'BLOCKED'))")

echo ""
echo "───────────────────────────────────────────────────────────────"
echo "Drift summary:"
echo "  contracts:        $TOTAL_CONTRACTS"
echo "  blocked:          $FINAL_BLOCKED"
if [ "$FINAL_BLOCKED" -gt 0 ]; then
  echo ""
  echo "Blocked contracts (need human review):"
  python3 -c "
import json
for e in json.load(open('$DRIFT_REPORT')):
    if e.get('status') == 'BLOCKED':
        print(f\"  {e['contract']}  (attempts={e.get('attempts',0)}, last_reason={e.get('last_reason','?')})\")
"
fi
echo "───────────────────────────────────────────────────────────────"
