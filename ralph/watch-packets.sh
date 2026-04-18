#!/usr/bin/env bash
# Passive watcher for the packet pipeline. Separate from ralph/watch.sh.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f ralph/.env ]; then
  set -a
  . ralph/.env
  set +a
fi

PACKETS_INDEX="ralph/packets/index.json"
POLL_INTERVAL="${POLL_INTERVAL:-60}"
PACKET_SLACK_WEBHOOK="${PACKET_SLACK_WEBHOOK_URL:-}"
LINEAR_TEAM="${LINEAR_TEAM:-}"
LINEAR_MAP_FILE="ralph/.linear-packet-issues.txt"

if [ ! -f "$PACKETS_INDEX" ]; then
  echo "ERROR: $PACKETS_INDEX not found." >&2
  exit 1
fi

LINEAR_ENABLED=0
if command -v linear > /dev/null 2>&1; then
  if linear auth whoami > /dev/null 2>&1; then
    LINEAR_ENABLED=1
    if [ -z "$LINEAR_TEAM" ]; then
      LINEAR_TEAM=$(linear team list 2>/dev/null | awk 'NR==2 {print $1}')
    fi
    if [ -z "$LINEAR_TEAM" ]; then
      LINEAR_ENABLED=0
    fi
  fi
fi

declare -A ISSUE_MAP
declare -A LAST_STATUS

packet_rows() {
  python3 -c "
import json
d = json.load(open('$PACKETS_INDEX'))
packets = sorted(d['packets'], key=lambda p: p.get('priority', 999999))
for p in packets:
    print('|'.join([
        p.get('packet_id',''),
        p.get('story_id',''),
        p.get('title',''),
        p.get('status',''),
        p.get('bucket',''),
        p.get('module',''),
    ]))
"
}

packet_counts() {
  python3 -c "
import json
d = json.load(open('$PACKETS_INDEX'))
packets = d['packets']
print(sum(1 for p in packets if p.get('packet_file')))
print(sum(1 for p in packets if p.get('status') == 'READY'))
print(sum(1 for p in packets if p.get('status') == 'NEEDS_REVIEW'))
print(sum(1 for p in packets if p.get('status') in {'VERIFIED', 'DONE'}))
"
}

linear_state_for_status() {
  case "$1" in
    READY) echo "Backlog" ;;
    BUILDING) echo "In Progress" ;;
    NEEDS_REVIEW) echo "Needs Adversarial Review" ;;
    QA_RUNNING) echo "Running" ;;
    VERIFIED) echo "Verified" ;;
    DONE) echo "Done" ;;
    BLOCKED) echo "Blocked" ;;
    STUCK) echo "Stuck" ;;
    BACKLOG) echo "Backlog" ;;
    DEFERRED) echo "Backlog" ;;
    DESIGN_READY) echo "Backlog" ;;
    *) echo "Backlog" ;;
  esac
}

slack_post() {
  local msg="$1"
  if [ -n "$PACKET_SLACK_WEBHOOK" ]; then
    local json_msg
    json_msg=$(python3 -c "import json,sys; print(json.dumps({'text': sys.argv[1]}))" "$msg")
    curl -s -X POST "$PACKET_SLACK_WEBHOOK" \
      -H 'Content-type: application/json' \
      -d "$json_msg" > /dev/null 2>&1 || true
  fi
}

linear_create_issue() {
  local title="$1"
  if [ "$LINEAR_ENABLED" != "1" ]; then return; fi
  local out
  out=$(linear issue create --no-interactive \
    -t "$title" \
    -d "Ralph packet pipeline item" \
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

load_issue_map() {
  if [ -f "$LINEAR_MAP_FILE" ]; then
    while IFS=: read -r packet_id issue_id; do
      [ -n "${packet_id:-}" ] && ISSUE_MAP["$packet_id"]="$issue_id"
    done < "$LINEAR_MAP_FILE"
  fi
}

persist_issue_mapping() {
  : > "$LINEAR_MAP_FILE"
  for packet_id in "${!ISSUE_MAP[@]}"; do
    echo "$packet_id:${ISSUE_MAP[$packet_id]}" >> "$LINEAR_MAP_FILE"
  done
}

bootstrap_linear() {
  if [ "$LINEAR_ENABLED" != "1" ]; then return; fi
  load_issue_map
  while IFS='|' read -r packet_id story_id title status bucket module; do
    [ -z "$packet_id" ] && continue
    if [ -z "${ISSUE_MAP[$packet_id]:-}" ]; then
      local issue_id
      issue_id=$(linear_create_issue "[$packet_id] $title")
      if [ -n "$issue_id" ]; then
        ISSUE_MAP["$packet_id"]="$issue_id"
      fi
    fi
    if [ -n "${ISSUE_MAP[$packet_id]:-}" ]; then
      linear_update_status "${ISSUE_MAP[$packet_id]}" "$(linear_state_for_status "$status")"
    fi
    LAST_STATUS["$packet_id"]="$status"
  done < <(packet_rows)
  persist_issue_mapping
}

announce_transition() {
  local packet_id="$1"
  local story_id="$2"
  local title="$3"
  local old_status="$4"
  local new_status="$5"
  local issue_id="${ISSUE_MAP[$packet_id]:-}"
  local msg="📦 Packet $packet_id ($story_id) -> $new_status
$title"
  echo "$msg"
  slack_post "$msg"
  if [ -n "$issue_id" ]; then
    linear_update_status "$issue_id" "$(linear_state_for_status "$new_status")"
    linear_add_comment "$issue_id" "Packet status changed: \`$old_status\` -> \`$new_status\`"
  fi
}

echo "=== Ralph Packet Watcher ==="
echo "Packets: $PACKETS_INDEX"
echo "Slack:   $([ -n "$PACKET_SLACK_WEBHOOK" ] && echo 'configured' || echo 'not set')"
echo "Linear:  $([ "$LINEAR_ENABLED" = "1" ] && echo "configured (team: ${LINEAR_TEAM:-default})" || echo 'not set')"

bootstrap_linear

while true; do
  while IFS='|' read -r packet_id story_id title status bucket module; do
    [ -z "$packet_id" ] && continue
    old_status="${LAST_STATUS[$packet_id]:-}"
    if [ -z "$old_status" ]; then
      LAST_STATUS["$packet_id"]="$status"
    elif [ "$old_status" != "$status" ]; then
      announce_transition "$packet_id" "$story_id" "$title" "$old_status" "$status"
      LAST_STATUS["$packet_id"]="$status"
    fi
  done < <(packet_rows)

  readarray -t COUNTS < <(packet_counts)
  echo "status: total=${COUNTS[0]} ready=${COUNTS[1]} review=${COUNTS[2]} verified=${COUNTS[3]}"
  sleep "$POLL_INTERVAL"
done
