#!/bin/bash
# Build Playbook — Convert Commands to Portable Agent Skills
# Then install to ANY agent: Claude Code, Codex, Cursor, Gemini CLI, etc.
#
# What this does:
#   1. Converts commands/*.md → portable-skills/*/SKILL.md (one-time)
#   2. Installs to any agent's skill directory via symlinks
#
# Usage:
#   ./make-portable.sh convert    # Convert commands to skills format
#   ./make-portable.sh install    # Interactive: pick which agents
#   ./make-portable.sh install --all  # Install to all known agents

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORTABLE_DIR="$SCRIPT_DIR/portable-skills"

# ============================================================
# Agent skill directory locations (add new agents here)
# ============================================================
declare -A AGENT_PATHS
AGENT_PATHS=(
  ["claude-code"]="$HOME/.claude/skills"
  ["codex"]="$HOME/.codex/skills"
  ["cursor"]="$HOME/.cursor/skills"
  ["gemini-cli"]="$HOME/.gemini/skills"
  ["copilot"]="$HOME/.github/skills"
  ["agents-standard"]="$HOME/.agents/skills"    # Universal fallback
  ["windsurf"]="$HOME/.windsurf/skills"
  ["amp"]="$HOME/.amp/skills"
  ["goose"]="$HOME/.goose/skills"
  ["letta"]="$HOME/.letta/skills"
)

# ============================================================
# COMMAND → SKILL DESCRIPTION MAP
# The description is the trigger. Write it for the model.
# ============================================================
get_description() {
  case "$1" in
    "data-grill")
      echo "Interview the founder about every data decision hiding in their product. Use when starting database design, before running db-architect. Ask business questions in plain English — no technical jargon. Produces .planning/data-requirements.md."
      ;;
    "ux-brief")
      echo "Interview the founder about every UX decision for the app. Use before writing any frontend code. Covers navigation, interactions, speed, accessibility, mobile behavior. Produces .planning/ux-brief.md."
      ;;
    "ui-brief")
      echo "Interview the founder about every visual design decision. Use after ux-brief, before frontend code. Covers fonts, colors, spacing, dark mode, component library. Produces .planning/ui-brief.md."
      ;;
    "infra-grill")
      echo "Interview the founder about infrastructure and deployment decisions. Use before setting up hosting, CI/CD, or choosing cloud services. Covers hosting, domains, email, storage, monitoring. Produces .planning/infra-requirements.md."
      ;;
    "capture-planning")
      echo "Capture and organize all planning artifacts from the current conversation into .planning/ directory. Use after any planning discussion to save decisions before they're lost to context limits."
      ;;
    "compete-research")
      echo "Research competitors and alternative products in the same space. Use at project start to understand the landscape. Produces .planning/competition-research.md with feature matrices and UX patterns to steal."
      ;;
    "sprint-build-perfect")
      echo "Build one requirement at a time from the roadmap. Use during implementation phase. Reads .planning/REQUIREMENTS.md, finds the next unchecked item, builds it, tests it, commits it. One requirement per invocation."
      ;;
    "sprint-build-perfect-v2")
      echo "Enhanced sprint builder with improved error recovery and multi-file awareness. Use during implementation phase. Same as sprint-build-perfect but handles complex multi-file changes better."
      ;;
    "anneal")
      echo "Stress-test the entire app by trying to break it. Use after a sprint or phase completion. Finds bugs, edge cases, missing validations, broken flows. Produces a list of issues to fix."
      ;;
    "anneal-check")
      echo "Quick verification pass after fixing issues found by anneal. Use after fixing bugs from an anneal run. Confirms fixes actually work and haven't introduced new issues."
      ;;
    "adversarial-claude-builds")
      echo "Claude Code builds while a second agent adversarially reviews. Use for GAN-style quality improvement. One agent builds, another tries to break it."
      ;;
    "adversarial-claude-builds-v2")
      echo "Enhanced adversarial build with improved review criteria and automated fix loops. Use for GAN-style quality improvement with better error detection."
      ;;
    "adversarial-codex-builds")
      echo "Codex builds while Claude adversarially reviews, or vice versa. Use for cross-model GAN-style quality improvement."
      ;;
    "adversarial-codex-builds-v2")
      echo "Enhanced cross-model adversarial build with improved review criteria. Use for cross-model GAN-style quality improvement with better error detection."
      ;;
    "verify-with-codex")
      echo "Send code to Codex for independent verification and review. Use after Claude Code builds something to get a second opinion from a different model."
      ;;
    "census-to-specs")
      echo "Convert a feature census into detailed specifications. Use after feature-census skill produces the inventory. Turns each feature into a testable spec with acceptance criteria."
      ;;
    "generate-feature-doc")
      echo "Generate documentation for a specific feature. Use when a feature is built and needs user-facing or developer documentation."
      ;;
    "harden")
      echo "Security and reliability hardening pass on existing code. Use before shipping to production. Adds input validation, error handling, rate limiting, and security headers."
      ;;
    "security-audit")
      echo "Deep security audit of the codebase. Use before any production deployment. Checks for OWASP Top 10, hardcoded secrets, SQL injection, XSS, CSRF, and auth bypass vulnerabilities."
      ;;
    "spec-runner")
      echo "Run specs against the codebase and report pass/fail status. Use after census-to-specs produces specs. Executes each spec and reports which ones pass, fail, or are not yet implemented."
      ;;
    "prd-to-gsd")
      echo "Convert a PRD document into a GSD (Get Stuff Done) structured plan with REQUIREMENTS.md, ROADMAP.md, and STATE.md. Use at project start after the PRD is written."
      ;;
    "where-am-i")
      echo "Show current project status: what phase you're in, what's done, what's next. Use at the start of any session to orient yourself. Reads .planning/STATE.md and REQUIREMENTS.md."
      ;;
    "commands")
      echo "List all available playbook commands with descriptions. Use when you need to see what commands are available."
      ;;
    "guide")
      echo "Show the build playbook workflow guide. Use when you need to understand the overall build process and phase order."
      ;;
    *)
      echo "Build playbook command: $1. Use when instructed to run this command."
      ;;
  esac
}

# ============================================================
# CONVERT: commands/*.md → portable-skills/*/SKILL.md
# ============================================================
do_convert() {
  echo "=== Converting commands to portable Agent Skills format ==="

  mkdir -p "$PORTABLE_DIR"

  converted=0
  for cmd_file in "$SCRIPT_DIR/commands/"*.md; do
    cmd_name=$(basename "$cmd_file" .md)
    skill_dir="$PORTABLE_DIR/$cmd_name"
    skill_file="$skill_dir/SKILL.md"

    mkdir -p "$skill_dir"

    description=$(get_description "$cmd_name")

    # Write YAML frontmatter + original content
    {
      echo "---"
      echo "name: $cmd_name"
      echo "description: \"$description\""
      echo "---"
      echo ""
      cat "$cmd_file"
    } > "$skill_file"

    converted=$((converted + 1))
    echo "  ✓ $cmd_name"
  done

  # Also copy existing skills (already in correct format)
  for skill_src in "$SCRIPT_DIR/skills/"*/; do
    skill_name=$(basename "$skill_src")
    if [ -f "$skill_src/SKILL.md" ]; then
      cp -r "$skill_src" "$PORTABLE_DIR/$skill_name"
      echo "  ✓ $skill_name (already portable)"
    fi
  done

  # Copy standalone skill files
  if [ -f "$SCRIPT_DIR/skills/founders-design-rules.md" ]; then
    mkdir -p "$PORTABLE_DIR/founders-design-rules"
    {
      echo "---"
      echo "name: founders-design-rules"
      echo "description: \"Design rules and principles from the founder. Use as reference when making any UI/UX decisions. Background knowledge, not a command.\""
      echo "user-invocable: false"
      echo "---"
      echo ""
      cat "$SCRIPT_DIR/skills/founders-design-rules.md"
    } > "$PORTABLE_DIR/founders-design-rules/SKILL.md"
    echo "  ✓ founders-design-rules (converted)"
  fi

  # Copy vendor skills
  if [ -d "$SCRIPT_DIR/vendor/mattpocock-skills" ]; then
    for vendor_skill in "$SCRIPT_DIR/vendor/mattpocock-skills/"*/; do
      vendor_name=$(basename "$vendor_skill")
      if [ -f "$vendor_skill/SKILL.md" ]; then
        cp -r "$vendor_skill" "$PORTABLE_DIR/$vendor_name"
        echo "  ✓ $vendor_name (vendor)"
      fi
    done
  fi

  total=$(ls -d "$PORTABLE_DIR/"*/ 2>/dev/null | wc -l)
  echo ""
  echo "=== Converted $converted commands + copied existing skills ==="
  echo "=== Total portable skills: $total ==="
  echo "=== Location: $PORTABLE_DIR/ ==="
  echo ""
  echo "Next: run './make-portable.sh install' to install to your agents"
}

# ============================================================
# INSTALL: symlink portable-skills → agent skill directories
# ============================================================
do_install() {
  if [ ! -d "$PORTABLE_DIR" ]; then
    echo "No portable-skills/ found. Run './make-portable.sh convert' first."
    exit 1
  fi

  install_all="${1:-}"

  if [ "$install_all" = "--all" ]; then
    agents=("claude-code" "codex" "cursor" "agents-standard")
  else
    echo "Available agents:"
    echo "  1) claude-code    (~/.claude/skills/)"
    echo "  2) codex          (~/.codex/skills/)"
    echo "  3) cursor         (~/.cursor/skills/)"
    echo "  4) gemini-cli     (~/.gemini/skills/)"
    echo "  5) copilot        (~/.github/skills/)"
    echo "  6) agents-standard (~/.agents/skills/ — universal)"
    echo "  7) all of the above"
    echo ""
    read -p "Which agents? (comma-separated numbers, e.g. 1,2): " choices

    agents=()
    IFS=',' read -ra nums <<< "$choices"
    for num in "${nums[@]}"; do
      num=$(echo "$num" | tr -d ' ')
      case "$num" in
        1) agents+=("claude-code") ;;
        2) agents+=("codex") ;;
        3) agents+=("cursor") ;;
        4) agents+=("gemini-cli") ;;
        5) agents+=("copilot") ;;
        6) agents+=("agents-standard") ;;
        7) agents=("claude-code" "codex" "cursor" "gemini-cli" "copilot" "agents-standard") ;;
      esac
    done
  fi

  for agent in "${agents[@]}"; do
    agent_dir="${AGENT_PATHS[$agent]}"
    mkdir -p "$agent_dir"

    echo ""
    echo "=== Installing to $agent ($agent_dir) ==="

    for skill_dir in "$PORTABLE_DIR/"*/; do
      skill_name=$(basename "$skill_dir")
      ln -sfn "$skill_dir" "$agent_dir/$skill_name"
      echo "  ✓ $skill_name"
    done
  done

  echo ""
  echo "=== Done ==="
  echo ""
  echo "All skills are symlinked from portable-skills/."
  echo "One source of truth. Edit portable-skills/ → all agents see the change."
  echo ""
  echo "To update later:  cd $(basename "$SCRIPT_DIR") && git pull"
  echo "To add an agent:  edit AGENT_PATHS in this script, run install again"
}

# ============================================================
# MAIN
# ============================================================
case "${1:-help}" in
  convert)
    do_convert
    ;;
  install)
    do_install "${2:-}"
    ;;
  help|*)
    echo "Build Playbook — Portable Skills Manager"
    echo ""
    echo "Usage:"
    echo "  ./make-portable.sh convert        Convert commands → portable skills"
    echo "  ./make-portable.sh install         Install to agents (interactive)"
    echo "  ./make-portable.sh install --all   Install to all known agents"
    echo ""
    echo "Your commands work today on:"
    echo "  Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot,"
    echo "  Windsurf, Amp, Goose, Letta, JetBrains Junie, and 20+ more."
    echo ""
    echo "The Agent Skills open standard (agentskills.io) means:"
    echo "  → One format. Every agent. No vendor lock-in."
    ;;
esac
