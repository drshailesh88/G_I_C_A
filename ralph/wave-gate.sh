#!/usr/bin/env bash
# Ralph wave gate — run slower repo-wide checks once per wave and refresh baseline noise.

set -euo pipefail
cd "$(dirname "$0")/.."

TS=$(date -u +'%Y%m%dT%H%M%SZ')
OUT="ralph/wave-gate-$TS.log"
BASELINE="ralph/baseline-noise.json"

echo "───────────────────────────────────────────────────────────────"
echo "Ralph wave gate"
echo "  log:         $OUT"
echo "  baseline:    $BASELINE"
echo "  checks:      npm run test:run ; npx tsc --noEmit"
echo "───────────────────────────────────────────────────────────────"
echo ""

TEST_RC=0
TSC_RC=0

{
  echo "## $(date -u +'%Y-%m-%dT%H:%M:%SZ') — wave gate"
  echo ""
  echo '$ npm run test:run'
} | tee "$OUT" >/dev/null

set +e
npm run test:run >>"$OUT" 2>&1
TEST_RC=$?
set -e

{
  echo ""
  echo '$ npx tsc --noEmit'
} >>"$OUT"

set +e
npx tsc --noEmit >>"$OUT" 2>&1
TSC_RC=$?
set -e

python3 - <<PY
import json
import re
from datetime import datetime, timezone

log_path = "$OUT"
baseline_path = "$BASELINE"
test_rc = $TEST_RC
tsc_rc = $TSC_RC

with open(log_path) as f:
    lines = [line.rstrip("\n") for line in f]

vitest = []
tsc = []

for line in lines:
    match = re.match(r"^\\s*FAIL\\s+(.+)$", line)
    if match:
        sig = match.group(1).strip()
        if sig not in vitest:
            vitest.append(sig)
    if "error TS" in line:
        sig = line.strip()
        if sig not in tsc:
            tsc.append(sig)

payload = {
    "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "source_log": log_path,
    "vitest_exit": test_rc,
    "tsc_exit": tsc_rc,
    "vitest_failures": vitest,
    "tsc_errors": tsc,
}

with open(baseline_path, "w") as f:
    json.dump(payload, f, indent=2)
    f.write("\\n")
PY

echo "Updated baseline noise snapshot: $BASELINE"
echo ""

if [ "$TEST_RC" -eq 0 ] && [ "$TSC_RC" -eq 0 ]; then
  echo "Wave gate complete."
  echo "Log: $OUT"
  exit 0
fi

echo "Wave gate found repo-wide failures."
echo "Log: $OUT"
exit 1
