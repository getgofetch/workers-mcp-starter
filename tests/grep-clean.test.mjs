import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Patterns are split so this file does not itself contain the banned strings.
const FORBIDDEN = [
  ["x", "402"],
  ["USD", "C"],
  ["USD", "T"],
  ["EIP-", "3009"],
  ["eip", "155"],
  ["Pay", "AI"],
  ["Pay", "To"],
  ["PAY", "_TO"],
  ["block", "chain"],
  ["crypto", "currency"],
  ["N", "FT"],
  ["NF", "Ts"],
  ["on-", "chain"],
  ["main", "net"],
  ["test", "net"],
  ["facil", "itator"],
  ["New", "tons"],
  ["Petty", " Cash"],
  ["grow", "er"],
].map((parts) => new RegExp(parts.join(""), "i"));
FORBIDDEN.push(/0x[a-fA-F0-9]{40}/);
FORBIDDEN.push(new RegExp("0x71" + "4F", "i"));
FORBIDDEN.push(new RegExp("0xef" + "B5", "i"));

const REQUIRED = [
  "README.md",
  "LICENSE",
  "package.json",
  "wrangler.toml",
  "src/worker.js",
  "src/mcp.js",
  "src/tools.js",
  "skills/mcp-on-workers/SKILL.md",
  ".cursor/rules/mcp-on-workers.mdc",
  "rules/cloudflare-workers-mcp.mdc",
  ".mcp.json",
  ".github/workflows/test.yml",
  "docs/demo.gif",
  "scripts/record-demo.sh",
];

function walk(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".wrangler", "dist", ".git"].includes(ent.name)) continue;
    if (ent.name === "package-lock.json") continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

test("repo contains the starter files", () => {
  for (const rel of REQUIRED) {
    assert.ok(existsSync(join(ROOT, rel)), "missing " + rel);
  }
});

test("README has the Pro upsell and MIT is present", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const license = readFileSync(join(ROOT, "LICENSE"), "utf8");
  assert.match(readme, /Pro version/i);
  assert.match(readme, /getgofetch\.dev\/kits/);
  assert.match(readme, /Deploy to Cloudflare/);
  assert.match(license, /MIT License/);
  assert.match(license, /2026 gofetch/);
});

test("no forbidden payment-rail, wallet, or identity terms", () => {
  const files = walk(ROOT).filter((p) => {
    const n = p.toLowerCase();
    return !n.endsWith(".png") && !n.endsWith(".zip") && !n.endsWith(".gif") && !n.endsWith(".mp4") && !n.endsWith(".cast") && !n.endsWith(".lock");
  });
  const hits = [];
  for (const p of files) {
    const text = readFileSync(p, "utf8");
    for (const re of FORBIDDEN) {
      const m = text.match(re);
      if (m) hits.push(p.slice(ROOT.length + 1) + ": " + m[0]);
    }
  }
  assert.deepEqual(hits, [], hits.join("\n"));
});
