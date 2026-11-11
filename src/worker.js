import { handleMcpMessage } from "./mcp.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers":
    "content-type, accept, mcp-session-id, mcp-protocol-version, authorization",
  "access-control-expose-headers": "mcp-session-id, mcp-protocol-version",
};

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS,
      ...extra,
    },
  });
}

function sessionHeaders(request) {
  const existing = request.headers.get("mcp-session-id");
  const session = existing || crypto.randomUUID();
  return { "mcp-session-id": session };
}

export async function route(request, env, fetchImpl = fetch) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "GET" && path === "/health") {
    return json({ ok: true, service: (env && env.SERVICE_NAME) || "workers-mcp-starter" });
  }

  if (request.method === "GET" && (path === "/" || path === "")) {
    return json({
      ok: true,
      service: (env && env.SERVICE_NAME) || "workers-mcp-starter",
      mcp: "POST /mcp",
      health: "/health",
    });
  }

  if (path === "/mcp") {
    if (request.method !== "POST") {
      return json(
        {
          ok: false,
          error: "method_not_allowed",
          hint: "This server speaks stateless Streamable HTTP. POST a JSON-RPC body to /mcp.",
        },
        405
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
    }

    if (Array.isArray(body)) {
      const items = [];
      for (const item of body) {
        const handled = await handleMcpMessage(item, env, fetchImpl);
        if (!handled.notification && handled.response) items.push(handled.response);
      }
      if (items.length === 0) {
        return new Response(null, { status: 202, headers: { ...CORS, ...sessionHeaders(request) } });
      }
      return json(items, 200, sessionHeaders(request));
    }

    const handled = await handleMcpMessage(body, env, fetchImpl);
    if (handled.notification) {
      return new Response(null, { status: 202, headers: { ...CORS, ...sessionHeaders(request) } });
    }
    return json(handled.response, handled.status || 200, sessionHeaders(request));
  }

  return json({ ok: false, error: "not_found" }, 404);
}

export default {
  async fetch(request, env) {
    return route(request, env);
  },
};
