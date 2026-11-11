---
name: mcp-on-workers
description: Implement a remote MCP server on a Cloudflare Worker using stateless Streamable HTTP. Use when the user wants a Worker that serves tools at POST /mcp, or when wiring initialize, tools/list and tools/call without a framework.
---

# MCP on Workers

A Cloudflare Worker can be a remote MCP server. Clients POST JSON-RPC to one HTTPS URL. You do not need a long-lived process.

## Transport

- Endpoint: `POST /mcp` with `content-type: application/json`.
- Speak JSON-RPC 2.0. Support at least `initialize`, `notifications/initialized`, `ping`, `tools/list` and `tools/call`.
- `notifications/initialized` has no `id`. Answer with HTTP 202 and an empty body.
- This starter is stateless. You may echo an `mcp-session-id` header. Do not require server-side session storage for the basic path.
- `GET /mcp` is not implemented here (no SSE stream). Return 405 with a short hint.

## Initialize

Return a `protocolVersion` the client asked for if you support it, otherwise a version you do support (this starter understands `2025-06-18`, `2025-03-26` and `2024-11-05`). Include `capabilities.tools` and `serverInfo`.

## Tools

Describe each tool with `name`, `description` and a JSON Schema `inputSchema`. In `tools/call`, map `params.name` to a function, validate `params.arguments`, then do the work. On failure, still return a JSON-RPC result with `isError: true` and a readable `content` payload, unless the method itself is unknown (`-32601`).

Validate URLs and other untrusted input before calling `fetch`. Reject `localhost`, private IPv4 ranges, link-local addresses, and non-http(s) schemes.

## Test and deploy

1. Write a Node test that calls the Worker `fetch` (or the route function) with Request objects. Mock outbound `fetch` for tools that hit the network.
2. Run the tests. Then, if wrangler is available, `wrangler dev --local`.
3. Deploy only when the user asks, after tests pass. Use the user's Cloudflare account. Do not put tokens in the repo.

## What to leave out until asked

Authentication, rate limits, Durable Objects, D1, and JavaScript rendering are out of scope for a first starter. Add them later, in the Worker, in front of the tool.
