#!/usr/bin/env bash
# SessionStart hook. Emits concise harness context when available.
set -euo pipefail
[ -d .harness ] || exit 0
echo "## Harness Session Start"
echo "Read AGENTS.md, README.md, and current source before making changes."
