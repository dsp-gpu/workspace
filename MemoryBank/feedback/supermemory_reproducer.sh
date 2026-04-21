#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Supermemory MCP — `listProjects` discoverability bug reproducer
# ---------------------------------------------------------------------------
# Demonstrates that:
#   - memories saved with a custom containerTag ARE stored and retrievable,
#   - but listProjects() does not report them,
#   - and recall() without containerTag returns empty.
#
# Usage:
#   export SUPERMEMORY_MCP_URL="https://<your-mcp-endpoint>"   # streamable-http URL
#   export SUPERMEMORY_TOKEN="<your bearer token>"             # from MCP config
#   bash supermemory_reproducer.sh
#
# Requirements: bash, curl, jq
# ---------------------------------------------------------------------------

set -euo pipefail

: "${SUPERMEMORY_MCP_URL:?set SUPERMEMORY_MCP_URL to the MCP streamable-http endpoint}"
: "${SUPERMEMORY_TOKEN:?set SUPERMEMORY_TOKEN to the bearer token}"

TAG="reproducer-$(date +%s)"
MARKER="[REPRO-$RANDOM] discoverability test"

hr() { printf '\n--- %s ---\n' "$1"; }

call() {
    # $1 = method, $2 = params JSON
    curl -sS -X POST "$SUPERMEMORY_MCP_URL" \
        -H "Authorization: Bearer $SUPERMEMORY_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$(jq -nc --arg m "$1" --argjson p "$2" \
              '{jsonrpc:"2.0",id:1,method:"tools/call",params:{name:$m,arguments:$p}}')"
}

hr "STEP 1 — save memory with containerTag=\"$TAG\""
call "memory" \
    "$(jq -nc --arg c "$MARKER" --arg t "$TAG" \
        '{action:"save",content:$c,containerTag:$t}')" | jq .

hr "STEP 2 — listProjects(refresh:true)     [BUG: does NOT include \"$TAG\"]"
call "listProjects" '{"refresh":true}' | jq .

hr "STEP 3 — recall WITHOUT containerTag    [BUG: returns empty]"
call "recall" \
    "$(jq -nc --arg q "$MARKER" '{query:$q}')" | jq .

hr "STEP 4 — recall WITH containerTag=\"$TAG\"   [OK: returns the memory]"
call "recall" \
    "$(jq -nc --arg q "$MARKER" --arg t "$TAG" \
        '{query:$q,containerTag:$t}')" | jq .

hr "EXPECTED AFTER FIX"
cat <<'EOF'
  - STEP 2 lists every containerTag the current user has written to
    (including the newly created one), ideally with memoryCount and
    lastUpdatedAt per entry.
  - STEP 3 returns matches across ALL of the user's containers and
    includes the containerTag in each result, so the assistant can
    discover and cite the space.
EOF
