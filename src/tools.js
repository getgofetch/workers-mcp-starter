// Example tool for the starter. Search for REPLACE THIS when you add your own.

import { isBlockedHostname, fetchPublicHtml } from "./safe-url.js";

export const TOOLS = [
  {
    name: "page_title",
    description:
      "Fetch a public http(s) HTML page and return its <title>. Reads static HTML only. Rejects private or local addresses.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "A public http or https URL.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
];

const MAX_BYTES = 512_000;
const FETCH_MS = 8_000;

export function blockedHost(hostname) {
  return isBlockedHostname(hostname);
}

export function parsePublicHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: "missing_url" };
  }
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "unsupported_protocol" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "url_has_credentials" };
  }
  if (blockedHost(parsed.hostname)) {
    return { ok: false, error: "blocked_host" };
  }
  return { ok: true, url: parsed.toString() };
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleFromHtml(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return "";
  return decodeEntities(match[1]).slice(0, 500);
}

// REPLACE THIS: the example tool body.
export async function pageTitle(urlValue, fetchImpl = fetch) {
  const parsed = parsePublicHttpUrl(urlValue);
  if (!parsed.ok) return parsed;

  let res;
  try {
    res = await fetchPublicHtml(parsed.url, {
      timeoutMs: FETCH_MS,
      maxBytes: MAX_BYTES,
      maxRedirects: 5,
      fetchImpl,
    });
  } catch (err) {
    if (err && err.code === "blocked_host") return { ok: false, error: "blocked_host" };
    if (err && err.code === "invalid_url") return { ok: false, error: "invalid_url" };
    const aborted = err && (err.name === "AbortError" || /abort/i.test(String(err)));
    if (aborted) return { ok: false, error: "timeout" };
    if (err && /too many redirects/i.test(String(err.message || err))) {
      return { ok: false, error: "too_many_redirects" };
    }
    return { ok: false, error: "fetch_failed" };
  }

  if (!res.ok) {
    return { ok: false, error: "http_error", status: res.status };
  }

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType && !contentType.includes("html") && !contentType.includes("text/plain") && !contentType.includes("xml")) {
    return { ok: false, error: "not_html", content_type: contentType.split(";")[0] };
  }

  const buf = await res.arrayBuffer();
  const bytes = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf;
  const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const title = titleFromHtml(html);
  if (!title) return { ok: false, url: parsed.url, error: "no_title" };
  return { ok: true, url: parsed.url, title };
}
