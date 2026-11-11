// Block fetches to local, link-local, private, and metadata addresses.
// Validate the URL before each request, use redirect: "manual", and
// re-validate every hop so a public URL cannot bounce into a blocked host.

export const MAX_REDIRECTS = 5;

const TRAILING_DOTS = /\.+$/;

function normalizeHost(hostname) {
  let host = String(hostname || "").trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  const zone = host.indexOf("%");
  if (zone >= 0) host = host.slice(0, zone);
  return host.replace(TRAILING_DOTS, "");
}

function parseIpv4Part(part) {
  if (part === "") return null;
  if (/^0x[0-9a-f]+$/i.test(part)) {
    const n = parseInt(part, 16);
    return Number.isFinite(n) ? n : null;
  }
  if (/^0[0-7]+$/.test(part)) return parseInt(part, 8);
  if (part === "0" || /^[1-9][0-9]*$/.test(part)) return parseInt(part, 10);
  return null;
}

/** Parse dotted, shorthand, decimal, octal, or hex IPv4 into a 32-bit number. */
export function parseIPv4(host) {
  const raw = String(host || "");
  const parts = raw.split(".");
  if (parts.length < 1 || parts.length > 4) return null;
  const nums = [];
  for (const p of parts) {
    const n = parseIpv4Part(p);
    if (n == null || !Number.isFinite(n) || n < 0) return null;
    nums.push(n);
  }
  let addr;
  if (nums.length === 1) {
    if (nums[0] > 0xffffffff) return null;
    addr = nums[0];
  } else if (nums.length === 2) {
    if (nums[0] > 0xff || nums[1] > 0xffffff) return null;
    addr = ((nums[0] << 24) >>> 0) + nums[1];
  } else if (nums.length === 3) {
    if (nums[0] > 0xff || nums[1] > 0xff || nums[2] > 0xffff) return null;
    addr = ((nums[0] << 24) >>> 0) + (nums[1] << 16) + nums[2];
  } else {
    if (nums.some((n) => n > 0xff)) return null;
    addr = ((nums[0] << 24) >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3];
  }
  return addr >>> 0;
}

export function ipv4ToString(addr) {
  const a = addr >>> 0;
  return [24, 16, 8, 0].map((s) => (a >>> s) & 0xff).join(".");
}

export function isBlockedIPv4(addr) {
  const a = addr >>> 0;
  const o1 = (a >>> 24) & 0xff;
  const o2 = (a >>> 16) & 0xff;
  if (o1 === 0) return true; // 0.0.0.0/8
  if (o1 === 127) return true; // 127/8
  if (o1 === 10) return true; // 10/8
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16/12
  if (o1 === 192 && o2 === 168) return true; // 192.168/16
  if (o1 === 169 && o2 === 254) return true; // 169.254/16
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return true; // 100.64/10
  return false;
}

function expandIPv6(host) {
  const raw = normalizeHost(host);
  if (!raw.includes(":")) return null;
  // IPv4-mapped dotted tail: ::ffff:127.0.0.1
  let s = raw;
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIPv4(tail);
    if (v4 == null) return null;
    const hi = ((v4 >>> 16) & 0xffff).toString(16);
    const lo = (v4 & 0xffff).toString(16);
    s = s.slice(0, lastColon + 1) + hi + ":" + lo;
  }
  const sides = s.split("::");
  if (sides.length > 2) return null;
  const left = sides[0] ? sides[0].split(":") : [];
  const right = sides.length === 2 ? (sides[1] ? sides[1].split(":") : []) : [];
  if (sides.length === 1 && left.length !== 8) return null;
  const missing = 8 - (left.length + right.length);
  if (sides.length === 2 && missing < 0) return null;
  const zeros = sides.length === 2 ? Array(missing).fill("0") : [];
  const groups = [...left, ...zeros, ...right];
  if (groups.length !== 8) return null;
  const nums = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    nums.push(parseInt(g, 16));
  }
  return nums;
}

export function isBlockedIPv6(host) {
  const groups = expandIPv6(host);
  if (!groups) return true; // unparseable IPv6-looking host: fail closed
  const unspecified = groups.every((g) => g === 0);
  if (unspecified) return true;
  const loopback = groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0 && groups[6] === 0 && groups[7] === 1;
  if (loopback) return true;
  // IPv4-mapped ::ffff:x.x.x.x and IPv4-compatible ::x.x.x.x
  const prefix0 = groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0;
  if (prefix0 && (groups[5] === 0xffff || groups[5] === 0)) {
    const v4 = ((groups[6] << 16) >>> 0) + groups[7];
    if (groups[5] === 0xffff || groups[6] !== 0 || groups[7] > 1) {
      if (isBlockedIPv4(v4)) return true;
      if (groups[5] === 0xffff) return isBlockedIPv4(v4);
    }
  }
  // 6to4 2002::/16 — the next 32 bits are an IPv4 address.
  if (groups[0] === 0x2002) {
    const v4 = ((groups[1] << 16) >>> 0) + groups[2];
    if (isBlockedIPv4(v4)) return true;
  }
  // NAT64 well-known prefix 64:ff9b::/96 — the last 32 bits are an IPv4 address.
  if (
    groups[0] === 0x64 && groups[1] === 0xff9b &&
    groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0
  ) {
    const v4 = ((groups[6] << 16) >>> 0) + groups[7];
    if (isBlockedIPv4(v4)) return true;
  }
  // fc00::/7 unique local
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  // fe80::/10 link-local
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  return false;
}

function looksNumericHost(host) {
  return /^[0-9a-fxX.]+$/.test(host) && /\d/.test(host);
}

export function isBlockedHostname(hostname) {
  const host = normalizeHost(hostname);
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host.includes(":")) return isBlockedIPv6(host);
  const v4 = parseIPv4(host);
  if (v4 != null) return isBlockedIPv4(v4);
  if (looksNumericHost(host)) return true; // ambiguous decimal/octal/hex
  return false;
}

export function publicUrlReason(raw, base) {
  if (typeof raw !== "string" || !raw || raw.length > 2048) return "invalid_url";
  let u;
  try { u = base ? new URL(raw, base) : new URL(raw); }
  catch { return "invalid_url"; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "invalid_url";
  if (isBlockedHostname(u.hostname)) return "blocked_host";
  return null;
}

export function assertPublicHttpUrl(raw, base) {
  const reason = publicUrlReason(raw, base);
  if (reason === "blocked_host") {
    const err = new Error("Blocked host");
    err.code = "blocked_host";
    throw err;
  }
  if (reason) {
    const err = new Error("Invalid URL");
    err.code = "invalid_url";
    throw err;
  }
  return base ? new URL(raw, base) : new URL(raw);
}

export function isPublicHttpUrl(raw) {
  return publicUrlReason(raw) == null;
}

function isRedirect(status) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * GET an http(s) URL, refusing blocked hosts and re-validating every redirect hop.
 * opts.fetchImpl is injectable for tests.
 */
export async function fetchPublicHtml(raw, {
  timeoutMs = 8000,
  maxBytes = 512000,
  userAgent = "public-fetch/1.0",
  maxRedirects = MAX_REDIRECTS,
  fetchImpl,
  extraHeaders = {},
} = {}) {
  const fetchFn = fetchImpl || fetch;
  let current = assertPublicHttpUrl(raw).toString();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      assertPublicHttpUrl(current);
      const res = await fetchFn(current, {
        method: "GET",
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
          "user-agent": userAgent,
          ...extraHeaders,
        },
      });
      if (isRedirect(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error("redirect without location");
        if (hop === maxRedirects) throw new Error("too many redirects");
        current = assertPublicHttpUrl(loc, current).toString();
        continue;
      }
      return res;
    }
    throw new Error("too many redirects");
  } finally {
    clearTimeout(timer);
  }
}
