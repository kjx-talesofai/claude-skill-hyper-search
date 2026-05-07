import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "cli.js");

const QUERIES = [
  { name: "static", query: "warhammer 40k mankind imperium" },
  { name: "news", query: "iran strait current situation" },
];

const PROVIDERS = ["duckduckgo", "exa", "firecrawl", "serpapi", "tavily"];
const COUNT = 5;

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function analyzeReadability(items) {
  let htmlLeaks = 0;
  let mdLinkLeaks = 0;
  let mdImageLeaks = 0;
  let shortDescs = 0;
  let emptyDescs = 0;
  let navNoise = 0;

  for (const item of items) {
    const d = item.description || "";
    if (d.includes("<") && d.includes(">")) htmlLeaks++;
    if (d.match(/\[.*?\]\(.*?\)/)) mdLinkLeaks++;
    if (d.match(/!\[.*?\]\(.*?\)/)) mdImageLeaks++;
    if (d.length < 50) shortDescs++;
    if (d.length === 0) emptyDescs++;
    if (d.match(/\b(Image \d+|Full Library|Analysts|Business Themes|Contact Us|About Us|Home\b)/i)) navNoise++;
  }

  return { htmlLeaks, mdLinkLeaks, mdImageLeaks, shortDescs, emptyDescs, navNoise };
}

function runSearch(query, provider, count) {
  const stdout = execFileSync("node", [CLI, "search", query, "--provider", provider, "--count", String(count), "--format", "json"], {
    encoding: "utf-8",
    timeout: 30000,
  });
  return JSON.parse(stdout);
}

async function main() {
  console.log("=== Comprehensive Benchmark ===\n");
  const table = [];

  for (const { name, query } of QUERIES) {
    console.log(`\n--- ${name.toUpperCase()}: "${query}" ---\n`);
    for (const provider of PROVIDERS) {
      process.stdout.write(`${provider.padEnd(12)} `);
      const start = Date.now();
      try {
        const result = runSearch(query, provider, COUNT);
        const wallMs = Date.now() - start;
        const items = result.results || [];

        const payload = items.map(r => `${r.title || ""} ${r.url || ""} ${r.description || ""} ${r.published || ""} ${r.author || ""}`).join(" ");
        const tokens = estimateTokens(payload);
        const avgDesc = items.length ? Math.round(items.reduce((s, r) => s + (r.description?.length || 0), 0) / items.length) : 0;
        const withPub = items.filter(r => r.published).length;
        const withAuth = items.filter(r => r.author).length;
        const readability = analyzeReadability(items);

        const issues = [];
        if (readability.htmlLeaks > 0) issues.push(`${readability.htmlLeaks} html`);
        if (readability.mdLinkLeaks > 0) issues.push(`${readability.mdLinkLeaks} md-links`);
        if (readability.mdImageLeaks > 0) issues.push(`${readability.mdImageLeaks} md-images`);
        if (readability.emptyDescs > 0) issues.push(`${readability.emptyDescs} empty`);
        if (readability.navNoise > 0) issues.push(`${readability.navNoise} nav`);

        table.push({ query: name, provider, count: items.length, wallMs, tokens, avgDesc, withPub, withAuth, ...readability, issues: issues.join(", ") || "clean" });

        const status = issues.length > 0 ? `WARN(${issues.join(", ")})` : "OK";
        console.log(`${items.length}res | ${tokens}tok | ${avgDesc}avg | ${wallMs}ms | ${status}`);
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
        table.push({ query: name, provider, error: err.message });
      }
    }
  }

  // Summary tables
  console.log("\n\n=== TOKEN EFFICIENCY ===\n");
  console.log(`${"Query".padEnd(8)} ${"Provider".padEnd(12)} ${"Res".padStart(4)} ${"Tok".padStart(6)} ${"AvgDesc".padStart(8)} ${"Pub".padStart(4)} ${"Auth".padStart(5)}`);
  console.log("-".repeat(60));
  for (const r of table.filter(r => !r.error)) {
    console.log(`${r.query.padEnd(8)} ${r.provider.padEnd(12)} ${String(r.count).padStart(4)} ${String(r.tokens).padStart(6)} ${String(r.avgDesc).padStart(8)} ${String(r.withPub).padStart(4)} ${String(r.withAuth).padStart(5)}`);
  }

  console.log("\n\n=== AGENT READABILITY ===\n");
  console.log(`${"Query".padEnd(8)} ${"Provider".padEnd(12)} ${"HTML".padStart(5)} ${"MD-L".padStart(5)} ${"MD-I".padStart(5)} ${"Short".padStart(6)} ${"Empty".padStart(6)} ${"Nav".padStart(4)} ${"Status"}`);
  console.log("-".repeat(70));
  for (const r of table.filter(r => !r.error)) {
    console.log(`${r.query.padEnd(8)} ${r.provider.padEnd(12)} ${String(r.htmlLeaks||0).padStart(5)} ${String(r.mdLinkLeaks||0).padStart(5)} ${String(r.mdImageLeaks||0).padStart(5)} ${String(r.shortDescs||0).padStart(6)} ${String(r.emptyDescs||0).padStart(6)} ${String(r.navNoise||0).padStart(4)} ${r.issues}`);
  }

  console.log("\n\n=== CROSS-QUERY RANKINGS ===\n");
  const byProvider = {};
  for (const r of table.filter(r => !r.error)) {
    if (!byProvider[r.provider]) byProvider[r.provider] = [];
    byProvider[r.provider].push(r);
  }

  const ranks = [];
  for (const [p, rows] of Object.entries(byProvider)) {
    const avgTok = Math.round(rows.reduce((s, r) => s + r.tokens, 0) / rows.length);
    const avgLat = Math.round(rows.reduce((s, r) => s + r.wallMs, 0) / rows.length);
    const avgDesc = Math.round(rows.reduce((s, r) => s + r.avgDesc, 0) / rows.length);
    const totalIssues = rows.reduce((s, r) => s + (r.htmlLeaks||0) + (r.mdLinkLeaks||0) + (r.mdImageLeaks||0) + (r.emptyDescs||0) + (r.navNoise||0), 0);
    ranks.push({ provider: p, avgTok, avgLat, avgDesc, totalIssues });
  }

  console.log(`${"Provider".padEnd(12)} ${"AvgTok".padStart(7)} ${"AvgLat".padStart(7)} ${"AvgDesc".padStart(8)} ${"Issues".padStart(6)}`);
  console.log("-".repeat(50));
  for (const r of ranks.sort((a, b) => a.totalIssues - b.totalIssues || a.avgTok - b.avgTok)) {
    console.log(`${r.provider.padEnd(12)} ${String(r.avgTok).padStart(7)} ${String(r.avgLat).padStart(7)} ${String(r.avgDesc).padStart(8)} ${String(r.totalIssues).padStart(6)}`);
  }
}

main().catch(console.error);
