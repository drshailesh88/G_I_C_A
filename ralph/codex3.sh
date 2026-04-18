#!/usr/bin/env bash
# Repo-local Codex account alias: codex3 -> ~/.codex-acc3

set -euo pipefail

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex-acc3}"
exec codex "$@"
