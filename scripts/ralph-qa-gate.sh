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
LINEAR_WORKSPACE="${LINEAR_WORKSPACE:-}"
NOTIFY_WEBHOOK="${NOTIFY_WEBHOOK:-}"
MAX_ISSUES="${MAX_ISSUES:-999}"
DRY_RUN="${DRY_RUN:-false}"
CLAUDE_TIMEOUT_SECONDS="${CLAUDE_TIMEOUT_SECONDS:-1800}"
CLAIM_ASSIGNEE="${CLAIM_ASSIGNEE:-self}"
FAILED_STATE="${FAILED_STATE:-backlog}"
LINEAR_QUERY_LIMIT="${LINEAR_QUERY_LIMIT:-50}"
SCORES_FILE=".planning/ralph-qa-scores.jsonl"
STATUS_FILE=".planning/ralph-qa-status.json"
LOCK_DIR="${TMPDIR:-/tmp}/ralph-qa-gate.lock"

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

# ── Linear wrapper ────────────────────────────────────────────
linear_cmd() {
  if [ -n "$LINEAR_WORKSPACE" ]; then
    command linear --workspace "$LINEAR_WORKSPACE" "$@"
  else
    command linear "$@"
  fi
}

# ── Locking / cleanup ────────────────────────────────────────
cleanup() {
  rm -rf "$LOCK_DIR"
}

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  fail "Another Ralph QA Gate run appears to be active: $LOCK_DIR"
  exit 1
fi

trap cleanup EXIT INT TERM

# ── Git preflight ────────────────────────────────────────────
if [ -n "$(git status --porcelain -- src/ 2>/dev/null)" ]; then
  warn "Working tree has uncommitted changes in src/. Stashing..."
  git stash push -m "ralph-qa-gate-preflight-$(date +%s)" -- src/ || true
fi

# ── Portable timeout ─────────────────────────────────────────
run_with_timeout() {
  local seconds="$1"
  shift

  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$seconds" "$@"
  else
    perl -e 'alarm shift; exec @ARGV' "$seconds" "$@"
  fi
}

# ── Helpers ──────────────────────────────────────────────────
file_mtime() {
  if stat -f %m "$1" >/dev/null 2>&1; then
    stat -f %m "$1"
  else
    stat -c %Y "$1"
  fi
}

add_issue_comment() {
  local issue_id="$1" body="$2"
  local stdout_file stderr_file
  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"

  if ! linear_cmd issue comment add "$issue_id" --body "$body" >"$stdout_file" 2>"$stderr_file"; then
    warn "Failed to add comment to $issue_id: $(tr '\n' ' ' < "$stderr_file" | xargs)"
    rm -f "$stdout_file" "$stderr_file"
    return 1
  fi

  if [ -s "$stderr_file" ]; then
    warn "Linear comment warnings for $issue_id: $(tr '\n' ' ' < "$stderr_file" | xargs)"
  fi

  rm -f "$stdout_file" "$stderr_file"
}

set_issue_state() {
  local issue_id="$1" state="$2"
  shift 2
  local stdout_file stderr_file
  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"

  if ! linear_cmd issue update "$issue_id" --state "$state" "$@" >"$stdout_file" 2>"$stderr_file"; then
    warn "Failed to set $issue_id to $state: $(tr '\n' ' ' < "$stderr_file" | xargs)"
    rm -f "$stdout_file" "$stderr_file"
    return 1
  fi

  if [ -s "$stderr_file" ]; then
    warn "Linear update warnings for $issue_id -> $state: $(tr '\n' ' ' < "$stderr_file" | xargs)"
  fi

  rm -f "$stdout_file" "$stderr_file"
}

move_issue_out_of_queue() {
  local issue_id="$1"
  if ! set_issue_state "$issue_id" "$FAILED_STATE"; then
    warn "Issue $issue_id remains in its previous Linear state because the fallback transition to $FAILED_STATE failed."
    return 1
  fi
}

block_issue_note() {
  local issue_id="$1"
  if move_issue_out_of_queue "$issue_id"; then
    printf 'Moved to %s so the gate loop can continue with other issues.' "$FAILED_STATE"
  else
    printf 'Failed to move it to %s, but this run will still skip it because it was already attempted.' "$FAILED_STATE"
  fi
}

fetch_next_issue() {
  local stdout_file stderr_file parsed
  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"

  if ! linear_cmd issue query \
    --team "$LINEAR_TEAM" \
    --label qa-gate \
    --state unstarted \
    --sort priority \
    --limit "$LINEAR_QUERY_LIMIT" \
    --json \
    --no-pager >"$stdout_file" 2>"$stderr_file"; then
    fail "Failed to query Linear issues: $(tr '\n' ' ' < "$stderr_file" | xargs)"
    rm -f "$stdout_file" "$stderr_file"
    return 1
  fi

  if [ -s "$stderr_file" ]; then
    warn "Linear query warnings: $(tr '\n' ' ' < "$stderr_file" | xargs)"
  fi

  parsed="$(node - "$stdout_file" "$@" <<'NODE'
const fs = require("fs");
const raw = fs.readFileSync(process.argv[2], "utf8").trim();
const attempted = new Set(process.argv.slice(3));

if (!raw) {
  process.exit(0);
}

const data = JSON.parse(raw);

function findIssues(value) {
  if (Array.isArray(value)) {
    if (value.every((item) => item && typeof item === "object" && ("title" in item || "identifier" in item || "state" in item))) {
      return value;
    }
    for (const item of value) {
      const found = findIssues(item);
      if (found) return found;
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) {
      const found = findIssues(nested);
      if (found) return found;
    }
  }

  return null;
}

const issues = findIssues(data) || [];
const issue = issues.find((candidate) => {
  const identifier = candidate?.identifier || candidate?.id || "";
  return identifier && !attempted.has(identifier);
});

if (!issue) {
  process.exit(0);
}

const identifier = issue.identifier || issue.id || "";
const title = issue.title || "";

if (!identifier || !title) {
  process.exit(1);
}

process.stdout.write(`${identifier}|${title}`);
NODE
)"

  local parse_exit=$?
  rm -f "$stdout_file" "$stderr_file"

  if [ "$parse_exit" -ne 0 ]; then
    fail "Failed to parse Linear issue query JSON"
    return 1
  fi

  printf '%s' "$parsed"
}

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
declare -A ATTEMPTED_ISSUES=()

while [ "$ISSUES_TOTAL" -lt "$MAX_ISSUES" ]; do
  # ── Fetch next unstarted qa-gate issue ─────────────────────
  log "Fetching next unstarted qa-gate issue..."

  ISSUE_LINE="$(fetch_next_issue "${!ATTEMPTED_ISSUES[@]}")" || exit 1

  if [ -z "$ISSUE_LINE" ]; then
    log "No more eligible unstarted qa-gate issues. Loop complete."
    break
  fi

  # Parse issue ID and title
  ISSUE_ID="${ISSUE_LINE%%|*}"
  ISSUE_TITLE="${ISSUE_LINE#*|}"
  ATTEMPTED_ISSUES["$ISSUE_ID"]=1

  PARSED=$(parse_issue "$ISSUE_TITLE")
  COMMAND="${PARSED%%|*}"
  MODULE="${PARSED#*|}"

  ISSUES_TOTAL=$((ISSUES_TOTAL + 1))

  log "────────────────────────────────────────────"
  log "Issue: $ISSUE_ID — $ISSUE_TITLE"
  log "Command: /$COMMAND $MODULE"
  log "────────────────────────────────────────────"

  # ── Mark In Progress ───────────────────────────────────────
  if [ "$CLAIM_ASSIGNEE" = "self" ]; then
    if ! set_issue_state "$ISSUE_ID" started --assignee self; then
      fail "Skipping $ISSUE_ID because Linear could not move it to started."
      update_status "$ISSUE_ID" "$MODULE" "linear-start-failed"
      ISSUES_BLOCKED=$((ISSUES_BLOCKED + 1))
      log ""
      continue
    fi
  else
    if ! set_issue_state "$ISSUE_ID" started; then
      fail "Skipping $ISSUE_ID because Linear could not move it to started."
      update_status "$ISSUE_ID" "$MODULE" "linear-start-failed"
      ISSUES_BLOCKED=$((ISSUES_BLOCKED + 1))
      log ""
      continue
    fi
  fi
  update_status "$ISSUE_ID" "$MODULE" "in-progress"
  notify "Starting: $ISSUE_ID — /$COMMAND $MODULE"

  if [ "$DRY_RUN" = "true" ]; then
    warn "DRY RUN — skipping Claude execution"
    if ! set_issue_state "$ISSUE_ID" completed; then
      warn "Unable to mark $ISSUE_ID completed during dry run."
    fi
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
  ISSUE_RUN_STARTED_AT="$(date +%s)"
  LOG_FILE="/tmp/ralph-qa-${ISSUE_ID}.log"
  rm -f "$LOG_FILE"

  # Run claude with timeout
  if run_with_timeout "$CLAUDE_TIMEOUT_SECONDS" \
    claude -p "$CLAUDE_PROMPT" --allowedTools "Edit,Write,Bash,Read,Glob,Grep,Agent" 2>&1 | tee "$LOG_FILE"; then
    CLAUDE_EXIT=0
  else
    CLAUDE_EXIT=$?
  fi

  CLAUDE_TIMED_OUT="false"
  if [ "$CLAUDE_EXIT" -eq 124 ] || [ "$CLAUDE_EXIT" -eq 142 ]; then
    CLAUDE_TIMED_OUT="true"
    warn "Claude session timed out after ${CLAUDE_TIMEOUT_SECONDS}s"
  fi

  # ── Verify gate ────────────────────────────────────────────
  if [ "$COMMAND" = "mutation-gate" ]; then
    # Check that Stryker produced a fresh report for this issue run.
    REPORT="reports/mutation/mutation.json"
    if [ -f "$REPORT" ] && [ "$(file_mtime "$REPORT")" -ge "$ISSUE_RUN_STARTED_AT" ]; then
      SCORE=$(get_mutation_score "$MODULE")
      log "Mutation score for $MODULE: ${SCORE}%"
      record_score "$ISSUE_ID" "$MODULE" "$SCORE" "measured"

      if (( $(echo "$SCORE >= 90" | bc -l 2>/dev/null || echo 0) )); then
        log "✅ GATE PASSED — $MODULE at ${SCORE}%"
        if ! set_issue_state "$ISSUE_ID" completed; then
          warn "Unable to mark $ISSUE_ID completed after a passing mutation gate."
        fi
        add_issue_comment "$ISSUE_ID" "✅ mutation-gate: $MODULE — ${SCORE}% (target: 90%)" || true
        update_status "$ISSUE_ID" "$MODULE" "done"
        notify "✅ $ISSUE_ID done — $MODULE at ${SCORE}%"
        ISSUES_DONE=$((ISSUES_DONE + 1))
        record_score "$ISSUE_ID" "$MODULE" "$SCORE" "passed"
      else
        warn "⚠️ GATE FAILED — $MODULE at ${SCORE}% (need 90%)"
        FAILURE_NOTE="$(block_issue_note "$ISSUE_ID")"
        add_issue_comment "$ISSUE_ID" "⚠️ mutation-gate: $MODULE — ${SCORE}% (need 90%). $FAILURE_NOTE" || true
        update_status "$ISSUE_ID" "$MODULE" "blocked"
        notify "⚠️ $ISSUE_ID blocked — $MODULE at ${SCORE}%"
        ISSUES_BLOCKED=$((ISSUES_BLOCKED + 1))
        record_score "$ISSUE_ID" "$MODULE" "$SCORE" "below-threshold"
      fi
    else
      fail "No fresh Stryker report found for $MODULE"
      FAILURE_NOTE="$(block_issue_note "$ISSUE_ID")"
      if [ "$CLAUDE_TIMED_OUT" = "true" ]; then
        add_issue_comment "$ISSUE_ID" "❌ mutation-gate: $MODULE timed out after ${CLAUDE_TIMEOUT_SECONDS}s before producing a fresh Stryker report. $FAILURE_NOTE" || true
      else
        add_issue_comment "$ISSUE_ID" "❌ mutation-gate: $MODULE did not produce a fresh reports/mutation/mutation.json file. Claude may have failed. $FAILURE_NOTE" || true
      fi
      update_status "$ISSUE_ID" "$MODULE" "blocked"
      ISSUES_BLOCKED=$((ISSUES_BLOCKED + 1))
    fi
  elif [ "$COMMAND" = "contract-pack" ]; then
    # For contract-pack, check if test files were created
    if [ "$CLAUDE_EXIT" -eq 0 ]; then
      log "✅ contract-pack: $MODULE completed"
      if ! set_issue_state "$ISSUE_ID" completed; then
        warn "Unable to mark $ISSUE_ID completed after contract-pack succeeded."
      fi
      add_issue_comment "$ISSUE_ID" "✅ contract-pack: $MODULE — E2E infrastructure/criteria created" || true
      update_status "$ISSUE_ID" "$MODULE" "done"
      notify "✅ $ISSUE_ID done — contract-pack: $MODULE"
      ISSUES_DONE=$((ISSUES_DONE + 1))
    else
      warn "contract-pack: $MODULE may have issues (exit $CLAUDE_EXIT)"
      FAILURE_NOTE="$(block_issue_note "$ISSUE_ID")"
      if [ "$CLAUDE_TIMED_OUT" = "true" ]; then
        add_issue_comment "$ISSUE_ID" "❌ contract-pack: $MODULE timed out after ${CLAUDE_TIMEOUT_SECONDS}s. $FAILURE_NOTE" || true
      fi
      update_status "$ISSUE_ID" "$MODULE" "blocked"
      ISSUES_BLOCKED=$((ISSUES_BLOCKED + 1))
    fi
  else
    fail "Unknown command: $COMMAND"
    FAILURE_NOTE="$(block_issue_note "$ISSUE_ID")"
    add_issue_comment "$ISSUE_ID" "❌ Unsupported qa-gate command in title: $ISSUE_TITLE. $FAILURE_NOTE" || true
    update_status "$ISSUE_ID" "$MODULE" "blocked"
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
