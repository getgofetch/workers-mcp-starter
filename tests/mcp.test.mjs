import { test } from "node:test";
import assert from "node:assert/strict";
import { route } from "../src/worker.js";
import { parsePublicHttpUrl, titleFromHtml, blockedHost } from "../src/tools.js";

const env = { SERVICE_NAME: "workers-mcp-starter" };

function mockFetchFactory(handler) {
  return async (url, init = {}) => handler(url, init);
}

async function mcp(body, fetchImpl) {
  const res = await route(
    new Request("http://example/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
    fetchImpl
  );
  return res;
}

test("GET /health returns ok and the service name", async () => {
  const res = await route(new Request("http://example/health"), env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "workers-mcp-starter");
});

test("GET / points at POST /mcp", async () => {
  const res = await route(new Request("http://example/"), env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mcp, "POST /mcp");
});

test("GET /mcp is 405 with a hint", async () => {
  const res = await route(new Request("http://example/mcp"), env);
  assert.equal(res.status, 405);
  const body = await res.json();
  assert.equal(body.error, "method_not_allowed");
  assert.match(body.hint, /POST/);
});

test("initialize returns a supported protocol version and serverInfo", async () => {
  const res = await mcp({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    },
  });
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("mcp-session-id"));
  const body = await res.json();
  assert.equal(body.result.protocolVersion, "2025-03-26");
  assert.equal(body.result.serverInfo.name, "workers-mcp-starter");
  assert.equal(body.result.capabilities.tools.listChanged, false);
});

test("notifications/initialized returns 202", async () => {
  const res = await mcp({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(res.status, 202);
  assert.equal(await res.text(), "");
});

test("tools/list includes page_title", async () => {
  const res = await mcp({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const body = await res.json();
  const names = body.result.tools.map((t) => t.name);
  assert.deepEqual(names, ["page_title"]);
  assert.ok(body.result.tools[0].inputSchema.properties.url);
});

test("tools/call page_title returns the mocked title", async () => {
  const fetchImpl = mockFetchFactory(async (url) => {
    assert.equal(url, "https://example.com/");
    return new Response("<html><head><title>Example Domain</title></head></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  });
  const res = await mcp(
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "page_title", arguments: { url: "https://example.com" } },
    },
    fetchImpl
  );
  const body = await res.json();
  assert.equal(body.result.isError, false);
  const payload = JSON.parse(body.result.content[0].text);
  assert.equal(payload.ok, true);
  assert.equal(payload.title, "Example Domain");
});

test("page_title rejects localhost and private addresses without fetching", async () => {
  let called = 0;
  const fetchImpl = mockFetchFactory(async () => {
    called += 1;
    return new Response("nope");
  });
  for (const url of ["http://localhost/secret", "http://127.0.0.1/", "http://192.168.0.1/", "file:///etc/passwd"]) {
    const res = await mcp(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "page_title", arguments: { url } },
      },
      fetchImpl
    );
    const payload = JSON.parse((await res.json()).result.content[0].text);
    assert.equal(payload.ok, false, url);
  }
  assert.equal(called, 0);
});

test("unknown MCP method is JSON-RPC -32601", async () => {
  const res = await mcp({ jsonrpc: "2.0", id: 9, method: "nope/thanks" });
  const body = await res.json();
  assert.equal(body.error.code, -32601);
});

test("bad JSON is -32700", async () => {
  const res = await route(
    new Request("http://example/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
    env
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, -32700);
});

test("URL and HTML helpers", () => {
  assert.equal(blockedHost("127.0.0.1"), true);
  assert.equal(blockedHost("10.1.2.3"), true);
  assert.equal(blockedHost("example.com"), false);
  assert.equal(parsePublicHttpUrl("https://example.com").ok, true);
  assert.equal(parsePublicHttpUrl("http://169.254.169.254/latest").ok, false);
  assert.equal(titleFromHtml("<title>A &amp; B</title>"), "A & B");
});
