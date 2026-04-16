#!/usr/bin/env bash
# ralph/watch.sh — passive monitor for Ralph build + QA progress.
#
# Reads ralph/prd.json (Huntley's flat array) + git log. Posts to Slack,
# updates Linear issues. Does NOT modify any files Ralph touches — pure
# observer. Run in a separate terminal tab. Kill/restart freely.
#
# Usage (all env vars optional):
#   SLACK_WEBHOOK_URL="https://hooks.slack.com/..." \
#   LINEAR_TEAM="DRS" \   # optional — defaults to your default Linear team
#   ./ralph/watch.sh
#
# Linear: uses the `linear` CLI (brew install linear). Must be authed
# (`linear auth login`). If `linear` is missing or not authed, the
# watcher skips Linear silently.

set -euo pipefail
cd "$(dirname "$0")/.."

# Load local env (gitignored) so we don't depend on the invoking shell.
if [ -f ralph/.env ]; then
  set -a
  . ralph/.env
  set +a
fi

PRD_FILE="ralph/prd.json"
POLL_INTERVAL=60

SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"
LINEAR_TEAM="${LINEAR_TEAM:-}"

# Detect Linear CLI + auth. Set LINEAR_ENABLED=1 if usable.
LINEAR_ENABLED=0
if command -v linear > /dev/null 2>&1; then
  if linear auth whoami > /dev/null 2>&1; then
    LINEAR_ENABLED=1
    # Auto-detect team if not explicitly set (CLI has no default-team resolver).
    if [ -z "$LINEAR_TEAM" ]; then
      LINEAR_TEAM=$(linear team list 2>/dev/null | awk 'NR==2 {print $1}')
    fi
    if [ -z "$LINEAR_TEAM" ]; then
      echo "WARN: Linear authed but could not detect a team. Set LINEAR_TEAM=<KEY> to enable Linear." >&2
      LINEAR_ENABLED=0
    fi
  fi
fi

if [ ! -f "$PRD_FILE" ]; then
  echo "ERROR: $PRD_FILE not found. Run /playbook:prd-to-ralph first." >&2
  exit 1
fi

LAST_COMMIT=""
LAST_PASSES=0
LAST_QA=0
LINEAR_ISSUE_IDS=()

# ─── Helpers ──────────────────────────────────────────────────────────────────

# Story label = description (Huntley's field). Fall back to title if present.
story_label() {
  python3 -c "
import json, sys
d = json.load(open('$PRD_FILE'))
for s in d:
    if s.get('id') == sys.argv[1]:
        print(s.get('description') or s.get('title') or s.get('id', '?'))
        break
" "$1" 2>/dev/null || echo "$1"
}

count_passes() {
  python3 -c "import json; d=json.load(open('$PRD_FILE')); print(sum(1 for x in d if x.get('passes', False)))" 2>/dev/null || echo "0"
}

count_qa_done() {
  python3 -c "import json; d=json.load(open('$PRD_FILE')); print(sum(1 for x in d if x.get('qa_tested', False)))" 2>/dev/null || echo "0"
}

total_tasks() {
  python3 -c "import json; d=json.load(open('$PRD_FILE')); print(len(d))" 2>/dev/null || echo "0"
}

get_latest_commit() {
  git log -1 --format="%H|%s" 2>/dev/null || echo ""
}

get_story_statuses() {
  python3 -c "
import json
d = json.load(open('$PRD_FILE'))
for s in d:
    sid = s.get('id', '?')
    label = s.get('description') or s.get('title') or sid
    if s.get('qa_tested'): icon = '🟢'
    elif s.get('passes'):  icon = '✅'
    else:                   icon = '⬜'
    # Truncate label so Slack messages stay readable
    if len(label) > 70: label = label[:67] + '...'
    print(f'{icon} {sid}: {label}')
" 2>/dev/null
}

# Find the most recent story whose passes flipped to true (heuristic: last
# entry in priority order with passes=true).
latest_passed_id() {
  python3 -c "
import json
d = json.load(open('$PRD_FILE'))
passing = [s for s in d if s.get('passes')]
if passing:
    last = passing[-1]
    print(last.get('id', ''))
" 2>/dev/null
}

next_pending_id() {
  python3 -c "
import json
d = json.load(open('$PRD_FILE'))
pending = [s for s in d if not s.get('passes', False)]
if pending:
    print(pending[0].get('id', ''))
" 2>/dev/null
}

# ─── Harden-phase state readers ───────────────────────────────────────────────

# Count modules still below their tier floor. Reads .quality/state.json (schema:
# modules is a dict keyed by path; each entry has tier + has_exceeded_floor).
# ui_gates_only modules have no mutation floor and are excluded.
count_below_floor() {
  python3 -c "
import json
def has_floor(tier):
    if not tier or 'ui_gates_only' in tier: return False
    parts = tier.rsplit('_', 1)
    return len(parts) == 2 and parts[1].isdigit()
try:
    s = json.load(open('.quality/state.json'))
    mods = s.get('modules', {})
    tracked = [(p, m) for p, m in mods.items() if has_floor(m.get('tier'))]
    below = sum(1 for _, m in tracked if not m.get('has_exceeded_floor', False))
    print(f'{below}/{len(tracked)}')
except Exception:
    print('?/?')
" 2>/dev/null
}

# Extract module path from a HARDEN: commit subject.
# Format: "HARDEN: <module-path> — <rest>" or "HARDEN: <module-path> iter N — ..."
extract_harden_module() {
  echo "$1" | sed -E 's/^HARDEN:[[:space:]]+([^ —]+).*/\1/' | head -1
}

# Count adversarial-report entries (one per feature red-teamed).
count_red_done() {
  python3 -c "
try:
    import json
    r = json.load(open('ralph/adversarial-report.json'))
    print(len({e['story_id'] for e in r if e.get('story_id')}))
except Exception:
    print(0)
" 2>/dev/null
}

# Count drift-report entries marked GREEN (contracts now passing).
count_drift_green() {
  python3 -c "
try:
    import json
    r = json.load(open('ralph/drift-report.json'))
    print(sum(1 for e in r if e.get('status') == 'GREEN'))
except Exception:
    print(0)
" 2>/dev/null
}

# Count security-report categories in GREEN status (0..10).
count_sec_green() {
  python3 -c "
try:
    import json
    r = json.load(open('ralph/security-report.json'))
    print(sum(1 for e in r if e.get('status') == 'GREEN'))
except Exception:
    print(0)
" 2>/dev/null
}

# ─── Slack ────────────────────────────────────────────────────────────────────

slack_post() {
  local msg="$1"
  if [ -n "$SLACK_WEBHOOK" ]; then
    # Escape message for JSON (basic: " and \n).
    local json_msg=$(python3 -c "import json,sys; print(json.dumps({'text': sys.argv[1]}))" "$msg")
    curl -s -X POST "$SLACK_WEBHOOK" \
      -H 'Content-type: application/json' \
      -d "$json_msg" > /dev/null 2>&1 || true
  fi
}

# ─── Linear (via `linear` CLI) ────────────────────────────────────────────────

# Create an issue, echo back its identifier (e.g. "DRS-42") or empty string.
linear_create_issue() {
  local title="$1"
  local story_id="$2"
  if [ "$LINEAR_ENABLED" != "1" ]; then return; fi
  local out
  out=$(linear issue create --no-interactive \
    -t "$title" \
    -d "Ralph build task: $story_id" \
    --team "$LINEAR_TEAM" 2>&1) || { echo ""; return 0; }
  echo "$out" | grep -oE '[A-Z]+-[0-9]+' | head -1 || echo ""
}

linear_update_status() {
  local issue_id="$1"
  local state_name="$2"
  if [ "$LINEAR_ENABLED" != "1" ] || [ -z "$issue_id" ]; then return; fi
  linear issue update "$issue_id" -s "$state_name" > /dev/null 2>&1 || true
}

linear_add_comment() {
  local issue_id="$1"
  local body="$2"
  if [ "$LINEAR_ENABLED" != "1" ] || [ -z "$issue_id" ]; then return; fi
  linear issue comment add "$issue_id" -b "$body" > /dev/null 2>&1 || true
}

LINEAR_MAP_FILE="ralph/.linear-issues.txt"

bootstrap_linear() {
  if [ "$LINEAR_ENABLED" != "1" ]; then return; fi
  # Restore existing map so we don't create duplicates on restart.
  if [ -f "$LINEAR_MAP_FILE" ]; then
    while IFS= read -r line; do
      [ -n "$line" ] && LINEAR_ISSUE_IDS+=("$line")
    done < "$LINEAR_MAP_FILE"
    echo "Loaded ${#LINEAR_ISSUE_IDS[@]} existing Linear issues from $LINEAR_MAP_FILE"
  fi
  echo "Creating Linear issues for new stories..."
  local stories
  stories=$(python3 -c "
import json
d = json.load(open('$PRD_FILE'))
for s in d:
    sid = s.get('id', '')
    label = s.get('description') or s.get('title') or sid
    if len(label) > 100: label = label[:97] + '...'
    print(f'{sid}\t{label}')
" 2>/dev/null)

  while IFS=$'\t' read -r sid title; do
    if [ -n "$sid" ]; then
      # Skip if we already have an issue for this story.
      if [ -n "$(get_linear_issue_id "$sid")" ]; then continue; fi
      issue_id=$(linear_create_issue "[$sid] $title" "$sid")
      if [ -n "$issue_id" ]; then
        LINEAR_ISSUE_IDS+=("$sid:$issue_id")
        echo "$sid:$issue_id" >> "$LINEAR_MAP_FILE"
        echo "  Created: $sid → $issue_id"
      else
        echo "  FAILED to create Linear issue for $sid"
      fi
    fi
  done <<< "$stories"
}

get_linear_issue_id() {
  local story_id="$1"
  for entry in "${LINEAR_ISSUE_IDS[@]:-}"; do
    if [[ "$entry" == "$story_id:"* ]]; then
      echo "${entry#*:}"
      return
    fi
  done
}

# ─── Main loop ────────────────────────────────────────────────────────────────

echo "=== Ralph Watcher ==="
echo "Polling every ${POLL_INTERVAL}s against $PRD_FILE + git log"
echo "Slack:  $([ -n "$SLACK_WEBHOOK" ] && echo 'configured' || echo 'not set')"
echo "Linear: $([ "$LINEAR_ENABLED" = "1" ] && echo "configured (team: ${LINEAR_TEAM:-default})" || echo 'not set')"
echo "Monitoring: RALPH: | QA: | HARDEN: | COMPLETENESS: | RED: | DRIFT: | SEC:"
echo "Exit:   $([ "${WATCH_EXIT_ON_QA_COMPLETE:-0}" = "1" ] && echo 'auto-exit when qa_tested complete (legacy)' || echo 'continuous (Ctrl-C to stop)')"
echo ""

LAST_COMMIT=$(get_latest_commit)
LAST_PASSES=$(count_passes)
LAST_QA=$(count_qa_done)
TOTAL=$(total_tasks)

slack_post "🚀 *Ralph build started*
Features: $LAST_PASSES/$TOTAL built, $LAST_QA/$TOTAL QA'd

$(get_story_statuses)"

bootstrap_linear

while true; do
  sleep "$POLL_INTERVAL"

  CURRENT_COMMIT=$(get_latest_commit)
  CURRENT_PASSES=$(count_passes)
  CURRENT_QA=$(count_qa_done)

  if [ "$CURRENT_COMMIT" != "$LAST_COMMIT" ]; then
    COMMIT_MSG="${CURRENT_COMMIT#*|}"

    # Route by commit prefix. Build/QA retain their PRD-counter-based semantics
    # (proven). New loops are dispatched by prefix match on the commit subject.
    if [[ "$COMMIT_MSG" == RALPH:* ]] && [ "$CURRENT_PASSES" -gt "$LAST_PASSES" ]; then
      STORY_ID=$(latest_passed_id)
      LABEL=$(story_label "$STORY_ID")

      slack_post "✅ *Built:* $STORY_ID — $LABEL
Progress: $CURRENT_PASSES/$TOTAL built, $CURRENT_QA/$TOTAL QA'd
Commit: \`$COMMIT_MSG\`"

      ISSUE_ID=$(get_linear_issue_id "$STORY_ID")
      if [ -n "$ISSUE_ID" ]; then
        linear_update_status "$ISSUE_ID" "In Review"
        linear_add_comment "$ISSUE_ID" "✅ Built by Ralph build agent.

Commit: $COMMIT_MSG"
      fi

      NEXT_ID=$(next_pending_id)
      if [ -n "$NEXT_ID" ]; then
        NEXT_ISSUE=$(get_linear_issue_id "$NEXT_ID")
        if [ -n "$NEXT_ISSUE" ]; then
          linear_update_status "$NEXT_ISSUE" "In Progress"
        fi
      fi

    elif [[ "$COMMIT_MSG" == QA:* ]] && [ "$CURRENT_QA" -gt "$LAST_QA" ]; then
      QA_ID=$(python3 -c "
import json
d = json.load(open('$PRD_FILE'))
qa_done = [s for s in d if s.get('qa_tested')]
if qa_done:
    last = qa_done[-1]
    print(last.get('id', ''))
" 2>/dev/null)
      LABEL=$(story_label "$QA_ID")

      slack_post "🟢 *QA'd:* $QA_ID — $LABEL
Progress: $CURRENT_PASSES/$TOTAL built, $CURRENT_QA/$TOTAL QA'd
Commit: \`$COMMIT_MSG\`"

      ISSUE_ID=$(get_linear_issue_id "$QA_ID")
      if [ -n "$ISSUE_ID" ]; then
        linear_update_status "$ISSUE_ID" "Done"
        linear_add_comment "$ISSUE_ID" "🟢 QA'd by Codex independent evaluator.

Commit: $COMMIT_MSG"
      fi

    elif [[ "$COMMIT_MSG" == HARDEN:* ]]; then
      MODULE=$(extract_harden_module "$COMMIT_MSG")
      BELOW_RATIO=$(count_below_floor)
      slack_post "🛡️ *Hardened:* \`$MODULE\`
Modules at floor: $BELOW_RATIO (fewer below = better)
Commit: \`$COMMIT_MSG\`"

    elif [[ "$COMMIT_MSG" == COMPLETENESS:* ]]; then
      NEW_TOTAL=$(total_tasks)
      slack_post "📋 *Completeness:* missing features appended
PRD now has $NEW_TOTAL entries ($CURRENT_PASSES built, $CURRENT_QA QA'd)
Commit: \`$COMMIT_MSG\`"

    elif [[ "$COMMIT_MSG" == RED:* ]]; then
      RED_DONE=$(count_red_done)
      slack_post "🎯 *Red-team:* feature attacked
Features red-teamed so far: $RED_DONE
Commit: \`$COMMIT_MSG\`"

    elif [[ "$COMMIT_MSG" == DRIFT:* ]]; then
      DRIFT_DONE=$(count_drift_green)
      slack_post "🔀 *Drift fixed:* contract now matches runtime
Contracts cleared so far: $DRIFT_DONE
Commit: \`$COMMIT_MSG\`"

    elif [[ "$COMMIT_MSG" == SEC:* ]]; then
      SEC_DONE=$(count_sec_green)
      slack_post "🔒 *Security:* OWASP category audited
Categories GREEN so far: $SEC_DONE/10
Commit: \`$COMMIT_MSG\`"

    else
      slack_post "🔧 *Commit:* \`$COMMIT_MSG\`
Progress: $CURRENT_PASSES/$TOTAL built, $CURRENT_QA/$TOTAL QA'd"
    fi

    # Build+QA 100%? Announce once — but only exit if user opts in.
    if [ "$CURRENT_QA" -ge "$TOTAL" ] && [ "$TOTAL" -gt 0 ] && [ "$LAST_QA" -lt "$TOTAL" ]; then
      slack_post "🎉 *Build + QA COMPLETE!*
All $TOTAL features built AND QA'd.
Harden phases (if running) will continue — watcher remains active.

$(get_story_statuses)"

      for entry in "${LINEAR_ISSUE_IDS[@]:-}"; do
        issue_id="${entry#*:}"
        linear_update_status "$issue_id" "Done" 2>/dev/null || true
      done

      if [ "${WATCH_EXIT_ON_QA_COMPLETE:-0}" = "1" ]; then
        echo "All features built + QA'd; WATCH_EXIT_ON_QA_COMPLETE=1 set. Watcher exiting."
        exit 0
      fi
    fi

    LAST_COMMIT="$CURRENT_COMMIT"
    LAST_PASSES="$CURRENT_PASSES"
    LAST_QA="$CURRENT_QA"
  fi
done
