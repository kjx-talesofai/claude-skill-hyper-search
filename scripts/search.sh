#!/usr/bin/env bash
# Hyper Search wrapper script
# Usage: search.sh "<query>" [provider] [count]
# Returns JSON for programmatic use.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QUERY="${1:-}"
PROVIDER="${2:-}"
COUNT="${3:-5}"

if [[ -z "$QUERY" ]]; then
  echo '{"error": "Usage: search.sh \"<query>\" [provider] [count]"}' >&2
  exit 1
fi

# Build args array
ARGS=("search" "$QUERY" "--count" "$COUNT" "--format" "json")

if [[ -n "$PROVIDER" ]]; then
  ARGS+=("--provider" "$PROVIDER")
fi

# Run bundled CLI and pass through JSON output
exec node "$SCRIPT_DIR/cli.js" "${ARGS[@]}"
