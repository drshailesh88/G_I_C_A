#!/bin/bash
# GEM India — Global Skills Installation
# Run once on your machine. Skills persist across all projects.
# ================================================================

set -e

echo "=== Step 1: Clone Matt Pocock's skills (permanent local copy) ==="
mkdir -p ~/dev
if [ -d ~/dev/mattpocock-skills ]; then
  echo "Already cloned. Pulling latest..."
  cd ~/dev/mattpocock-skills && git pull
else
  git clone https://github.com/mattpocock/skills.git ~/dev/mattpocock-skills
fi

echo ""
echo "=== Step 2: Create global skill directories ==="
mkdir -p ~/.claude/skills
mkdir -p ~/.codex/skills

echo ""
echo "=== Step 3: Symlink skills to Claude Code ==="
CLAUDE_SKILLS=(tdd improve-codebase-architecture git-guardrails-claude-code setup-pre-commit)
for skill in "${CLAUDE_SKILLS[@]}"; do
  if [ -d ~/dev/mattpocock-skills/"$skill" ]; then
    ln -sfn ~/dev/mattpocock-skills/"$skill" ~/.claude/skills/"$skill"
    echo "  ✓ Claude Code: $skill"
  else
    echo "  ✗ Not found: $skill (check repo structure)"
  fi
done

echo ""
echo "=== Step 4: Symlink skills to Codex ==="
for skill in "${CLAUDE_SKILLS[@]}"; do
  if [ -d ~/dev/mattpocock-skills/"$skill" ]; then
    ln -sfn ~/dev/mattpocock-skills/"$skill" ~/.codex/skills/"$skill"
    echo "  ✓ Codex: $skill"
  else
    echo "  ✗ Not found: $skill (check repo structure)"
  fi
done

echo ""
echo "=== Step 5: Install Anthropic code-simplifier plugin (Claude Code only) ==="
echo "Run this inside a Claude Code session:"
echo "  claude plugin install code-simplifier"

echo ""
echo "=== Verification ==="
echo "Claude Code skills:"
ls -1 ~/.claude/skills/ 2>/dev/null || echo "  (none found)"
echo ""
echo "Codex skills:"
ls -1 ~/.codex/skills/ 2>/dev/null || echo "  (none found)"

echo ""
echo "=== Done ==="
echo "To update skills later: cd ~/dev/mattpocock-skills && git pull"
echo "Both agents pick up changes immediately (symlinks)."
