import { TOOLS, pageTitle } from "./tools.js";

export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];
export const DEFAULT_PROTOCOL_VERSION = "2025-03-26";

function result(id, value) {
  return { jsonrpc: "2.0", id, result: value };
}

function error(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolText(payload, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    isError,
  };
}

export async function handleMcpMessage(message, env = {}, fetchImpl = fetch) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return { response: error(null, -32600, "Invalid Request"), status: 200 };
  }
  if (message.jsonrpc !== "2.0") {
    return { response: error(message.id ?? null, -32600, "Invalid Request"), status: 200 };
  }

  const { method, id, params } = message;
  const isNotification = id === undefined;

  if (typeof method !== "string") {
    return { response: error(id ?? null, -32600, "Invalid Request"), status: 200 };
  }

  if (method === "notifications/initialized" || method.startsWith("notifications/")) {
    return { notification: true, status: 202 };
  }

  if (isNotification) {
    return { notification: true, status: 202 };
  }

  if (method === "initialize") {
    const requested = params && params.protocolVersion;
    const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
      ? requested
      : DEFAULT_PROTOCOL_VERSION;
    return {
      response: result(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: (env && env.SERVICE_NAME) || "workers-mcp-starter",
          version: "1.0.0",
        },
        instructions:
          "A small example server. The only tool is page_title. Replace it in src/tools.js (search for REPLACE THIS).",
      }),
      status: 200,
    };
  }

  if (method === "ping") {
    return { response: result(id, {}), status: 200 };
  }

  if (method === "tools/list") {
    return { response: result(id, { tools: TOOLS }), status: 200 };
  }

  if (method === "tools/call") {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    if (name === "page_title") {
      const out = await pageTitle(args.url, fetchImpl);
      return { response: result(id, toolText(out, !out.ok)), status: 200 };
    }
    return {
      response: result(id, toolText({ ok: false, error: "unknown_tool", name }, true)),
      status: 200,
    };
  }

  return { response: error(id, -32601, `Method not found: ${method}`), status: 200 };
}
