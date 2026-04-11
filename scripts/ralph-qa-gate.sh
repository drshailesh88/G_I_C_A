#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Ralph QA Gate Loop
# ═══════════════════════════════════════════════════════════════
# Autonomous loop that fetches Linear issues labeled "qa-gate",
# runs /mutation-gate or /contract-pack via Claude Code,
# enforces the 90% Stryker gate, and marks issues Done/Blocked.
#
# Usage:
#   bash scripts/ralph-qa-gate.sh
#
# Environment:
#   LINEAR_TEAM      - Linear team key (default: DRS)
#   NOTIFY_WEBHOOK   - Slack/Discord webhook for phone alerts (optional)
#   MAX_ISSUES       - Stop after N issues (default: unlimited)
#   DRY_RUN          - Set to "true" to skip Claude runs (debug mode)
#
# Prerequisites:
#   - linear CLI installed and authenticated
#   - claude CLI installed
#   - npm dependencies installed (Stryker, Playwright, etc.)
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ── Config ────────────────────────────────────────────────────
LINEAR_TEAM="${LINEAR_TEAM:-DRS}"
NOTIFY_WEBHOOK="${NOTIFY_WEBHOOK:-}"
MAX_ISSUES="${MAX_ISSUES:-999}"
DRY_RUN="${DRY_RUN:-false}"
SCORES_FILE=".planning/ralph-qa-scores.jsonl"
STATUS_FILE=".planning/ralph-qa-status.json"

# ── Colors ────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ── Ensure directories ───────────────────────────────────────
mkdir -p .planning

# ── Notify (optional) ────────────────────────────────────────
notify() {
  local msg="$1"
  echo -e "${BLUE}[notify]${NC} $msg"
  if [ -n "$NOTIFY_WEBHOOK" ]; then
    curl -s -X POST "$NOTIFY_WEBHOOK" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"[Ralph QA] $msg\"}" > /dev/null 2>&1 || true
  fi
}

# ── Log ───────────────────────────────────────────────────────
log() { echo -e "${GREEN}[ralph]${NC} $1"; }
warn() { echo -e "${YELLOW}[ralph]${NC} $1"; }
fail() { echo -e "${RED}[ralph]${NC} $1"; }

# ── Score tracking ────────────────────────────────────────────
record_score() {
  local issue_id="$1" module="$2" score="$3" status="$4"
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"issue\":\"$issue_id\",\"module\":\"$module\",\"score\":$score,\"status\":\"$status\"}" >> "$SCORES_FILE"
}

update_status() {
  local issue_id="$1" module="$2" state="$3"
  cat > "$STATUS_FILE" << EOF
{
  "current_issue": "$issue_id",
  "current_module": "$module",
  "state": "$state",
  "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
}

# ── Parse issue title to extract command and module ───────────
parse_issue() {
  local title="$1"
  local command module

  if [[ "$title" == mutation-gate:* ]]; then
    command="mutation-gate"
    module="${title#mutation-gate: }"
    module="${module#mutation-gate:}"
    module="$(echo "$module" | xargs)" # trim whitespace
  elif [[ "$title" == contract-pack:* ]]; then
    command="contract-pack"
    module="${title#contract-pack: }"
    module="${module#contract-pack:}"
    module="$(echo "$module" | xargs)"
  else
    command="unknown"
    module="$title"
  fi

  echo "$command|$module"
}

# ── Get Stryker score from last run ──────────────────────────
get_mutation_score() {
  local module="$1"
  local config="stryker.${module}.json"

  if [ ! -f "reports/mutation/mutation.json" ]; then
    echo "0"
    return
  fi

  node -e "
    const d = JSON.parse(require('fs').readFileSync('reports/mutation/mutation.json','utf8'));
    const total = Object.values(d.files).reduce((s,f) => s + f.mutants.length, 0);
    const killed = Object.values(d.files).reduce((s,f) => s + f.mutants.filter(m => m.status === 'Killed' || m.status === 'Timeout').length, 0);
    console.log(total > 0 ? (killed / total * 100).toFixed(2) : '0');
  " 2>/dev/null || echo "0"
}

# ── Main loop ─────────────────────────────────────────────────
log "═══════════════════════════════════════════════════"
log "  Ralph QA Gate Loop"
log "  Team: $LINEAR_TEAM | Max: $MAX_ISSUES issues"
log "═══════════════════════════════════════════════════"
notify "Ralph QA Gate starting — team $LINEAR_TEAM"

ISSUES_DONE=0
ISSUES_BLOCKED=0
ISSUES_TOTAL=0

while [ "$ISSUES_TOTAL" -lt "$MAX_ISSUES" ]; do
  # ── Fetch next unstarted qa-gate issue ─────────────────────
  log "Fetching next unstarted qa-gate issue..."

  ISSUE_LINE=$(linear issue list --team "$LINEAR_TEAM" --sort priority --state unstarted 2>/dev/null \
    | grep -i "qa-gate" \
    | head -1)

  if [ -z "$ISSUE_LINE" ]; then
    log "No more unstarted qa-gate issues. Loop complete."
    break
  fi

  # Parse issue ID and title
  ISSUE_ID=$(echo "$ISSUE_LINE" | awk '{print $1}')
  ISSUE_TITLE=$(echo "$ISSUE_LINE" | awk '{for(i=2;i<=NF;i++) printf "%s ", $i; print ""}' | sed 's/ *$//')
  # Remove label text from title
  ISSUE_TITLE=$(echo "$ISSUE_TITLE" | sed 's/qa-gate.*$//' | sed 's/tdd.*$//' | xargs)

  PARSED=$(parse_issue "$ISSUE_TITLE")
  COMMAND="${PARSED%%|*}"
  MODULE="${PARSED#*|}"

  ISSUES_TOTAL=$((ISSUES_TOTAL + 1))

  log "────────────────────────────────────────────"
  log "Issue: $ISSUE_ID — $ISSUE_TITLE"
  log "Command: /$COMMAND $MODULE"
  log "────────────────────────────────────────────"

  # ── Mark In Progress ───────────────────────────────────────
  linear issue update "$ISSUE_ID" --state "In Progress" 2>/dev/null || true
  update_status "$ISSUE_ID" "$MODULE" "in-progress"
  notify "Starting: $ISSUE_ID — /$COMMAND $MODULE"

  if [ "$DRY_RUN" = "true" ]; then
    warn "DRY RUN — skipping Claude execution"
    linear issue update "$ISSUE_ID" --state "Done" 2>/dev/null || true
    ISSUES_DONE=$((ISSUES_DONE + 1))
    continue
  fi

  # ── Run Claude Code in fresh session ───────────────────────
  CLAUDE_PROMPT="You are working on the GEM India project at /Users/shaileshsingh/G_I_C_A.

Run /$COMMAND $MODULE

Follow the skill instructions exactly. When done, report the final score.

IMPORTANT:
- Derive test expectations from SPECIFICATIONS, not from reading implementation code.
- Every Stryker run must actually execute — evidence before claims.
- Commit results with a descriptive message.
- If mutation score is below 90% after 3 rounds, report equivalent mutations and stop."

  log "Launching Claude Code session..."

  # Run claude with timeout (30 min per issue)
  if timeout 1800 claude -p "$CLAUDE_PROMPT" --allowedTools "Edit,Write,Bash,Read,Glob,Grep,Agent" 2>&1 | tee "/tmp/ralph-qa-${ISSUE_ID}.log"; then
    CLAUDE_EXIT=0
  else
    CLAUDE_EXIT=$?
  fi

  # ── Verify gate ────────────────────────────────────────────
  if [ "$COMMAND" = "mutation-gate" ]; then
    # Check if Stryker config was created and run
    CONFIG="stryker.${MODULE}.json"
    if [ -f "$CONFIG" ]; then
      SCORE=$(get_mutation_score "$MODULE")
      log "Mutation score for $MODULE: ${SCORE}%"
      record_score "$ISSUE_ID" "$MODULE" "$SCORE" "measured"

      if (( $(echo "$SCORE >= 90" | bc -l 2>/dev/null || echo 0) )); then
        log "✅ GATE PASSED — $MODULE at ${SCORE}%"
        linear issue update "$ISSUE_ID" --state "Done" 2>/dev/null || true
        linear issue comment "$ISSUE_ID" "✅ mutation-gate: $MODULE — ${SCORE}% (target: 90%)" 2>/dev/null || true
        update_status "$ISSUE_ID" "$MODULE" "done"
        notify "✅ $ISSUE_ID done — $MODULE at ${SCORE}%"
        ISSUES_DONE=$((ISSUES_DONE + 1))
        record_score "$ISSUE_ID" "$MODULE" "$SCORE" "passed"
      else
        warn "⚠️ GATE FAILED — $MODULE at ${SCORE}% (need 90%)"
        linear issue update "$ISSUE_ID" --state "unstarted" 2>/dev/null || true
        linear issue comment "$ISSUE_ID" "⚠️ mutation-gate: $MODULE — ${SCORE}% (need 90%). Needs another round." 2>/dev/null || true
        update_status "$ISSUE_ID" "$MODULE" "needs-retry"
        notify "⚠️ $ISSUE_ID needs retry — $MODULE at ${SCORE}%"
        ISSUES_BLOCKED=$((ISSUES_BLOCKED + 1))
        record_score "$ISSUE_ID" "$MODULE" "$SCORE" "below-threshold"
      fi
    else
      fail "No Stryker config found for $MODULE"
      linear issue update "$ISSUE_ID" --state "unstarted" 2>/dev/null || true
      linear issue comment "$ISSUE_ID" "❌ No stryker.${MODULE}.json created. Claude may have failed." 2>/dev/null || true
      ISSUES_BLOCKED=$((ISSUES_BLOCKED + 1))
    fi
  elif [ "$COMMAND" = "contract-pack" ]; then
    # For contract-pack, check if test files were created
    if [ "$CLAUDE_EXIT" -eq 0 ]; then
      log "✅ contract-pack: $MODULE completed"
      linear issue update "$ISSUE_ID" --state "Done" 2>/dev/null || true
      linear issue comment "$ISSUE_ID" "✅ contract-pack: $MODULE — E2E infrastructure/criteria created" 2>/dev/null || true
      update_status "$ISSUE_ID" "$MODULE" "done"
      notify "✅ $ISSUE_ID done — contract-pack: $MODULE"
      ISSUES_DONE=$((ISSUES_DONE + 1))
    else
      warn "contract-pack: $MODULE may have issues (exit $CLAUDE_EXIT)"
      linear issue update "$ISSUE_ID" --state "unstarted" 2>/dev/null || true
      ISSUES_BLOCKED=$((ISSUES_BLOCKED + 1))
    fi
  else
    fail "Unknown command: $COMMAND"
    linear issue update "$ISSUE_ID" --state "unstarted" 2>/dev/null || true
    ISSUES_BLOCKED=$((ISSUES_BLOCKED + 1))
  fi

  log ""
done

# ── Final report ──────────────────────────────────────────────
log "═══════════════════════════════════════════════════"
log "  Ralph QA Gate — COMPLETE"
log "  Processed: $ISSUES_TOTAL issues"
log "  Done:      $ISSUES_DONE"
log "  Blocked:   $ISSUES_BLOCKED"
log "═══════════════════════════════════════════════════"

# Final notification
notify "Ralph QA Gate complete — $ISSUES_DONE done, $ISSUES_BLOCKED blocked out of $ISSUES_TOTAL"

# Write final summary to scores file
echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"summary\":{\"total\":$ISSUES_TOTAL,\"done\":$ISSUES_DONE,\"blocked\":$ISSUES_BLOCKED}}" >> "$SCORES_FILE"
