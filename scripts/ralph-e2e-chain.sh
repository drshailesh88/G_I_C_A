#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Ralph E2E Chain — Autonomous Module-by-Module Browser Testing
# ═══════════════════════════════════════════════════════════════
#
# Architecture:
#   Step 1: Codex writes journey expectations (never sees code)
#   Step 2: Claude tester drives real browser via Playwright MCP
#   Step 3: Evidence collected (screenshots, traces, a11y reports)
#   Step 4: If failures → Claude builder fixes → re-test
#   Step 5: When green → next module
#
# Usage:
#   bash scripts/ralph-e2e-chain.sh
#
# Environment:
#   APP_PORT         - Dev server port (default: 4000)
#   MAX_FIX_ROUNDS   - Max builder fix attempts per module (default: 3)
#   MODULES          - Space-separated module list (default: all)
#   NOTIFY_WEBHOOK   - Slack/Discord webhook (optional)
#   SKIP_CODEX_SPECS - Set "true" to skip Codex spec writing (use existing)
#
# Prerequisites:
#   - Dev server running on APP_PORT
#   - Playwright MCP available (npx @playwright/mcp)
#   - Codex CLI authenticated
#   - claude CLI installed
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ── Config ────────────────────────────────────────────────────
APP_PORT="${APP_PORT:-4000}"
MAX_FIX_ROUNDS="${MAX_FIX_ROUNDS:-3}"
NOTIFY_WEBHOOK="${NOTIFY_WEBHOOK:-}"
SKIP_CODEX_SPECS="${SKIP_CODEX_SPECS:-false}"
EVIDENCE_DIR="e2e/evidence"
JOURNEYS_DIR="e2e/journeys"
SPECS_DIR="e2e/codex-specs"
SCORES_FILE=".planning/ralph-e2e-scores.jsonl"
LOCK_DIR="${TMPDIR:-/tmp}/ralph-e2e-chain.lock"

# Default modules — all app modules
DEFAULT_MODULES="travel transport accommodation people certificates registration program branding"
MODULES="${MODULES:-$DEFAULT_MODULES}"

# ── Colors ────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${GREEN}[ralph-e2e]${NC} $1"; }
warn() { echo -e "${YELLOW}[ralph-e2e]${NC} $1"; }
fail() { echo -e "${RED}[ralph-e2e]${NC} $1"; }
step() { echo -e "${CYAN}[step]${NC} $1"; }

notify() {
  local msg="$1"
  echo -e "${BLUE}[notify]${NC} $msg"
  if [ -n "$NOTIFY_WEBHOOK" ]; then
    curl -s -X POST "$NOTIFY_WEBHOOK" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"[Ralph E2E] $msg\"}" > /dev/null 2>&1 || true
  fi
}

# ── Locking ───────────────────────────────────────────────────
cleanup() { rm -rf "$LOCK_DIR"; }

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  fail "Another Ralph E2E chain is running: $LOCK_DIR"
  exit 1
fi
trap cleanup EXIT INT TERM

# ── Preflight ─────────────────────────────────────────────────
log "═══════════════════════════════════════════════════"
log "  Ralph E2E Chain — Autonomous Browser Testing"
log "  Port: $APP_PORT | Modules: $MODULES"
log "═══════════════════════════════════════════════════"

# Check dev server
step "Checking dev server on port $APP_PORT..."
if ! curl -s -o /dev/null -w "" "http://localhost:$APP_PORT" 2>/dev/null; then
  # Try to wait for it
  log "Dev server not responding. Waiting up to 60s..."
  WAIT_COUNT=0
  while ! curl -s -o /dev/null "http://localhost:$APP_PORT" 2>/dev/null; do
    sleep 5
    WAIT_COUNT=$((WAIT_COUNT + 1))
    if [ "$WAIT_COUNT" -ge 12 ]; then
      fail "Dev server not running on port $APP_PORT. Start it first:"
      fail "  PORT=$APP_PORT npm run dev"
      exit 1
    fi
  done
fi
log "Dev server is running on port $APP_PORT ✅"

# Check Playwright
step "Checking Playwright..."
npx playwright --version >/dev/null 2>&1 || {
  fail "Playwright not installed. Run: npx playwright install chromium"
  exit 1
}
log "Playwright available ✅"

# Check Codex
if [ "$SKIP_CODEX_SPECS" != "true" ]; then
  step "Checking Codex CLI..."
  if ! command -v codex >/dev/null 2>&1; then
    warn "Codex CLI not found. Will skip Codex spec writing."
    SKIP_CODEX_SPECS="true"
  else
    log "Codex CLI available ✅"
  fi
fi

# Create directories
mkdir -p "$EVIDENCE_DIR" "$JOURNEYS_DIR" "$SPECS_DIR" .planning

notify "Ralph E2E Chain starting — ${MODULES}"

# ── Score tracking ────────────────────────────────────────────
record_e2e() {
  local module="$1" pass="$2" fail_count="$3" total="$4" round="$5"
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"module\":\"$module\",\"pass\":$pass,\"fail\":$fail_count,\"total\":$total,\"round\":$round}" >> "$SCORES_FILE"
}

# ══════════════════════════════════════════════════════════════
# MAIN LOOP — Module by Module
# ══════════════════════════════════════════════════════════════

MODULES_DONE=0
MODULES_FAILED=0
MODULES_TOTAL=0

for MODULE in $MODULES; do
  MODULES_TOTAL=$((MODULES_TOTAL + 1))

  log ""
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "  MODULE: $MODULE ($MODULES_TOTAL of $(echo $MODULES | wc -w | tr -d ' '))"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  notify "Starting module: $MODULE"

  MODULE_EVIDENCE="$EVIDENCE_DIR/$MODULE"
  MODULE_JOURNEY="$JOURNEYS_DIR/$MODULE.spec.ts"
  MODULE_SPEC="$SPECS_DIR/$MODULE.md"
  mkdir -p "$MODULE_EVIDENCE"

  # ── STEP 1: Codex writes journey expectations ──────────────
  if [ "$SKIP_CODEX_SPECS" != "true" ] && [ ! -f "$MODULE_SPEC" ]; then
    step "1/4 — Codex writing journey expectations for $MODULE..."

    CODEX_PROMPT="You are a QA engineer. You have NEVER seen the source code for this app. You are testing a conference management platform (GEM India) built with Next.js.

The module is: $MODULE

Based ONLY on what a '$MODULE' module in a conference management platform SHOULD do, write a list of user journeys to test. Each journey should be:
- A sequence of user actions (navigate, click, fill, submit)
- What the user should SEE after each action
- What would indicate a BUG

Format as a numbered list of journeys. Each journey has:
- Title
- Steps (what to do)
- Expected results (what should be visible)
- Red flags (what would indicate a bug)

Write 5-10 journeys for this module. Focus on CRITICAL paths a real user would take.
DO NOT guess technical details like selectors or URLs — describe behavior in human terms."

    # Run Codex to write specs
    node "/Users/shaileshsingh/.claude/plugins/cache/openai-codex/codex/1.0.3/scripts/codex-companion.mjs" \
      task --fresh "$CODEX_PROMPT" 2>&1 | tee "$MODULE_SPEC" || {
        warn "Codex spec writing failed for $MODULE. Continuing with Claude-generated journeys."
      }

    log "Codex specs written → $MODULE_SPEC"
  else
    if [ -f "$MODULE_SPEC" ]; then
      log "Using existing Codex specs → $MODULE_SPEC"
    else
      log "Skipping Codex specs (SKIP_CODEX_SPECS=true)"
    fi
  fi

  # ── STEP 2: Claude tester drives real browser ──────────────
  step "2/4 — Claude tester driving browser for $MODULE..."

  # Build the tester prompt
  CODEX_SPEC_CONTENT=""
  if [ -f "$MODULE_SPEC" ]; then
    CODEX_SPEC_CONTENT="

## Journey Expectations (written by a separate model that has NOT seen the code)
$(cat "$MODULE_SPEC")
"
  fi

  TESTER_PROMPT="You are a QA TESTER. Your job is to test the '$MODULE' module of a Next.js conference management app running at http://localhost:$APP_PORT.

You have access to Playwright MCP tools. Use them to:
1. Navigate to the app in a real browser
2. Take screenshots at every major step
3. Click buttons, fill forms, interact with the UI
4. Verify what you see matches expected behavior
5. Run accessibility checks with axe-core if available

IMPORTANT RULES:
- You are NOT the builder. You are the independent tester.
- Report EXACTLY what you see — do not assume anything works
- Take a screenshot BEFORE and AFTER every major action
- If something fails or looks wrong, document it with a screenshot
- Save all screenshots to $MODULE_EVIDENCE/
- At the end, write a test report to $MODULE_EVIDENCE/report.md

The app uses Clerk for auth. The base URL is http://localhost:$APP_PORT.
Common routes: /events/[eventId]/$MODULE, /events/[eventId]/$MODULE/new

$CODEX_SPEC_CONTENT

Start by navigating to the app and exploring the $MODULE section.
Document everything you find — working features AND bugs."

  ROUND=0
  MODULE_PASSED=false

  while [ "$ROUND" -lt "$MAX_FIX_ROUNDS" ]; do
    ROUND=$((ROUND + 1))
    step "Testing round $ROUND/$MAX_FIX_ROUNDS for $MODULE..."

    # Run Claude tester with Playwright MCP
    REPORT_FILE="$MODULE_EVIDENCE/report-round-$ROUND.md"

    if claude -p "$TESTER_PROMPT

This is testing round $ROUND. Save your report to $REPORT_FILE" \
      --allowedTools "Edit,Write,Bash,Read,Glob,Grep,mcp__playwright__*,mcp__computer-use__*" \
      2>&1 | tee "$MODULE_EVIDENCE/tester-log-round-$ROUND.txt"; then
      TESTER_EXIT=0
    else
      TESTER_EXIT=$?
    fi

    # ── STEP 3: Check evidence ─────────────────────────────────
    step "3/4 — Checking evidence for $MODULE round $ROUND..."

    SCREENSHOTS=$(find "$MODULE_EVIDENCE" -name "*.png" -newer "$LOCK_DIR" 2>/dev/null | wc -l | tr -d ' ')
    HAS_REPORT=false
    [ -f "$REPORT_FILE" ] && HAS_REPORT=true

    log "Evidence: $SCREENSHOTS screenshots, report: $HAS_REPORT"

    # Parse report for failures
    FAILURES=0
    PASSES=0
    if [ -f "$REPORT_FILE" ]; then
      FAILURES=$(grep -ci "fail\|bug\|broken\|error\|not working\|missing\|crash" "$REPORT_FILE" 2>/dev/null || echo 0)
      PASSES=$(grep -ci "pass\|working\|success\|correct\|visible\|rendered" "$REPORT_FILE" 2>/dev/null || echo 0)
    fi

    TOTAL=$((FAILURES + PASSES))
    [ "$TOTAL" -eq 0 ] && TOTAL=1  # avoid div by zero

    record_e2e "$MODULE" "$PASSES" "$FAILURES" "$TOTAL" "$ROUND"

    if [ "$FAILURES" -eq 0 ] && [ "$PASSES" -gt 0 ]; then
      log "✅ $MODULE — all journeys passed (round $ROUND)"
      MODULE_PASSED=true
      break
    fi

    if [ "$FAILURES" -gt 0 ] && [ "$ROUND" -lt "$MAX_FIX_ROUNDS" ]; then
      # ── STEP 4: Claude builder fixes ──────────────────────────
      step "4/4 — Claude builder fixing $FAILURES issues in $MODULE..."

      FIX_PROMPT="You are the BUILDER for the '$MODULE' module of the GEM India app.

A QA tester found these issues (see report below). Fix the code so the issues are resolved.

## Tester Report
$(cat "$REPORT_FILE")

## Evidence
Screenshots are in $MODULE_EVIDENCE/

Fix the issues in the source code. After fixing, commit with a descriptive message.
Do NOT modify any test files — only fix application code."

      claude -p "$FIX_PROMPT" \
        --allowedTools "Edit,Write,Bash,Read,Glob,Grep,Agent" \
        2>&1 | tee "$MODULE_EVIDENCE/builder-fix-round-$ROUND.txt" || true

      log "Builder fixes applied. Re-testing..."
      notify "$MODULE: round $ROUND found $FAILURES issues, builder fixing..."
    else
      warn "$MODULE: $FAILURES issues remain after $ROUND rounds"
      break
    fi
  done

  if [ "$MODULE_PASSED" = true ]; then
    MODULES_DONE=$((MODULES_DONE + 1))
    notify "✅ $MODULE — E2E testing passed (round $ROUND, $SCREENSHOTS screenshots)"
  else
    MODULES_FAILED=$((MODULES_FAILED + 1))
    notify "⚠️ $MODULE — $FAILURES issues remain after $MAX_FIX_ROUNDS rounds"
  fi

  # Commit evidence
  git add "$MODULE_EVIDENCE/" 2>/dev/null || true
  git add "$JOURNEYS_DIR/" "$SPECS_DIR/" 2>/dev/null || true
  git commit -m "test(e2e): $MODULE — round $ROUND, $SCREENSHOTS screenshots, $FAILURES issues" 2>/dev/null || true

done

# ── Final Report ──────────────────────────────────────────────
log ""
log "═══════════════════════════════════════════════════"
log "  Ralph E2E Chain — COMPLETE"
log "  Modules: $MODULES_TOTAL"
log "  Passed:  $MODULES_DONE"
log "  Failed:  $MODULES_FAILED"
log "═══════════════════════════════════════════════════"

notify "Ralph E2E Chain complete — $MODULES_DONE passed, $MODULES_FAILED failed out of $MODULES_TOTAL"

# Write summary
cat > "$EVIDENCE_DIR/summary.json" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "modules_total": $MODULES_TOTAL,
  "modules_passed": $MODULES_DONE,
  "modules_failed": $MODULES_FAILED,
  "modules": "$(echo $MODULES | tr ' ' ',')"
}
EOF
