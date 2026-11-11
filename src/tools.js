// Example tool for the starter. Search for REPLACE THIS when you add your own.

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
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/\.+$/, "");
  if (!host) return true;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    host === "[::1]"
  ) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map((n) => Number(n));
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (host.includes(":")) {
    const h = host.replace(/^\[|\]$/g, "");
    if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
    if (h.startsWith("::ffff:")) return blockedHost(h.slice(7));
  }
  return false;
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  let res;
  try {
    res = await fetchImpl(parsed.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" },
    });
  } catch (err) {
    const aborted = err && (err.name === "AbortError" || /abort/i.test(String(err)));
    return { ok: false, error: aborted ? "timeout" : "fetch_failed" };
  } finally {
    clearTimeout(timer);
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
