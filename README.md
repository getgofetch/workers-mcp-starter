# workers-mcp-starter

A small, dependency-free [Model Context Protocol](https://modelcontextprotocol.io/) server that runs on a [Cloudflare Worker](https://developers.cloudflare.com/workers/). It speaks stateless Streamable HTTP at `POST /mcp`, ships one example tool, and has tests that run with `node --test` (no wrangler required for the tests).

This is a starter you deploy on your own account. It is useful on its own if you want to see a working remote MCP server without a framework. It is not a hosted service.

## What you get

- `POST /mcp` — `initialize`, `ping`, `tools/list`, `tools/call`, and notification acks
- `GET /health` and `GET /` — liveness and a short discovery payload
- `page_title` — fetch a public http(s) page and return its HTML `<title>` (static HTML only; private and local addresses are rejected)
- A Cursor rule and a short skill for building MCP servers on Workers
- Offline tests

There is no authentication and no rate limiting in this starter. Do not put a private tool behind it until you add those.

## Run it locally

You need Node 18 or later. Wrangler 4 is only required if you want a local server or a deploy.

```bash
npm install
npm test
npx wrangler dev --local
```

Then, in another terminal:

```bash
curl -sS http://127.0.0.1:8787/health

curl -sS http://127.0.0.1:8787/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

curl -sS http://127.0.0.1:8787/mcp \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"page_title","arguments":{"url":"https://example.com"}}}'
```

Point an MCP client at `http://127.0.0.1:8787/mcp`. A sample Cursor config is in `.mcp.json`. After you deploy, change that URL to your Worker origin.

## Deploy

```bash
npx wrangler login          # your own Cloudflare account, when you are ready
npx wrangler deploy
```

The starter is aimed at the Workers Free plan. Check Cloudflare's current limits before you rely on them. `npm test` should be green before you deploy. This repository will not deploy anything for you.

## Replace the example tool

Search the repo for `REPLACE THIS`. Keep this order in the handler:

1. Validate input and return a structured error. Do not call the network on bad input.
2. Do the work. The example reads static HTML only. It does not render JavaScript and it will not try to get around a bot wall.
3. Update `TOOLS` in `src/tools.js` so `tools/list` matches the new behaviour.

## Pro version

This starter is the cut-down, open-source piece. A paid kit adds API-key and JWT checks, Durable Object rate limits, and a fuller set of Workers / MCP agent skills (wrangler, D1, Durable Objects, deploy and rollback).

When the store listing is live, it will be here:

{{LS_PRODUCT_URL}}

Until that placeholder is replaced, there is nothing to buy.

## Licence

MIT. See `LICENSE`.

No support is promised. The files are provided as is, with no warranty and no obligation to update them when the MCP spec or Cloudflare's APIs change. Check the official docs before you ship.
