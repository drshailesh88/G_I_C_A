#!/bin/bash
# Layer 2 enforcement (blueprint Part 4) — installed by
# /playbook:install-qa-harness.
#
# Claude Code's permissions.deny blocks the Edit/Write tools but NOT Bash
# commands that write via sed/tee/redirect/etc. This PreToolUse hook inspects
# every Bash invocation and blocks it if the command string touches a locked
# path via a write operator.
#
# Exit codes:
#   0  → allow the Bash call
#   2  → BLOCK (PreToolUse hooks that exit 2 refuse the tool call in Claude
#        Code)
#
# Run by Claude Code; not intended to be invoked directly by users.

set -u

TOOL_INPUT="${1:-}"

LOCKED_PATTERNS='\.quality/|vitest\.config|playwright\.config|stryker\.conf|tsconfig\.json|eslint\.config\.mjs|\.eslintrc\.cjs|tests/contracts/|tests/e2e/|e2e/.*\.spec|/__snapshots__/|-snapshots/|\.claude/settings|\.claude/hooks/'
WRITE_OPERATORS='(>|>>|tee |sed -i|chmod|mv |cp |dd |rm )'

if echo "$TOOL_INPUT" | grep -E "$WRITE_OPERATORS" | grep -E "$LOCKED_PATTERNS" >/dev/null 2>&1; then
  echo "QA controller block-locked-paths.sh: BLOCKED" >&2
  matched=$(echo "$TOOL_INPUT" | grep -oE "$LOCKED_PATTERNS" | head -1)
  echo "Bash command would modify a locked path. Matched: $matched" >&2
  echo "If the QA controller initiated this, set QA_CONTROLLER_COMMIT=1 in the" >&2
  echo "environment. Otherwise run through /playbook:qa-run." >&2
  exit 2
fi

exit 0
