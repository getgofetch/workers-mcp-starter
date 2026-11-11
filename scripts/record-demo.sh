#!/usr/bin/env bash
# Local demo only. No wrangler login, no production deploy.
set -euo pipefail
cd "$(dirname "$0")/.."
port=8799
pause() { sleep "${1:-0.7}"; }

printf '\n  workers-mcp-starter  —  local demo (no login, no deploy)\n\n'
pause 1.2

printf '$ npm test\n'
npm test
pause 1.4

printf '\n$ npx wrangler dev --local --port %s\n' "$port"
npx wrangler dev --local --ip 127.0.0.1 --port "$port" >/tmp/workers-mcp-starter-wrangler.log 2>&1 &
wid=$!
cleanup() {
  kill "$wid" 2>/dev/null || true
  # children may outlive the npm wrapper
  fuser -k "${port}/tcp" >/dev/null 2>&1 || true
}
trap cleanup EXIT

ready=0
for i in $(seq 1 40); do
  if curl -sf --max-time 1 "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.25
done
if [ "$ready" != 1 ]; then
  echo "wrangler did not come up; last log:" >&2
  tail -20 /tmp/workers-mcp-starter-wrangler.log >&2
  exit 1
fi
echo "Ready on http://127.0.0.1:${port}"
pause 1.0

printf '\n$ curl -sS http://127.0.0.1:%s/health\n' "$port"
curl -sS --max-time 5 "http://127.0.0.1:${port}/health"
echo
pause 1.0

printf '\n$ curl -sS http://127.0.0.1:%s/mcp  -H content-type:application/json  -d '\''{initialize...}'\''\n' "$port"
curl -sS --max-time 5 "http://127.0.0.1:${port}/mcp" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"demo","version":"0"}}}'
echo
pause 1.2

printf '\n$ curl -sS ... tools/call page_title url=https://example.com\n'
curl -sS --max-time 8 "http://127.0.0.1:${port}/mcp" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"page_title","arguments":{"url":"https://example.com"}}}'
echo
pause 1.4
printf '\nThat is the local path. Deploy is wrangler deploy, on your own account.\n\n'
pause 1.6
