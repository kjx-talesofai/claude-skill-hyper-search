#!/usr/bin/env node

// dist/config.js
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
var CONFIG_DIR = process.env.HYPER_SEARCH_CONFIG_DIR ?? join(homedir(), ".config", "hyper-search");
var CONFIG_PATH = process.env.HYPER_SEARCH_CONFIG ?? join(CONFIG_DIR, "config.yaml");
function getDefaultEnvVarName(providerId) {
  return `HYPER_SEARCH_${providerId.toUpperCase().replace(/-/g, "_")}_API_KEY`;
}
function ensureConfigDir() {
  mkdirSync(CONFIG_DIR, { recursive: true });
}
function loadConfig() {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return parseYaml(raw);
  } catch (err) {
    if (err.code === "ENOENT") {
      return { providers: {} };
    }
    throw err;
  }
}
function saveConfig(config) {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, stringifyYaml(config), "utf-8");
}
function resolveApiKey(providerId, config) {
  if (config.apiKey && !config.apiKey.startsWith("${")) {
    return config.apiKey;
  }
  if (config.apiKeyEnv) {
    const val = process.env[config.apiKeyEnv];
    if (val)
      return val;
  }
  const defaultEnv = getDefaultEnvVarName(providerId);
  if (process.env[defaultEnv]) {
    return process.env[defaultEnv];
  }
  if (config.apiKey?.startsWith("${") && config.apiKey.endsWith("}")) {
    const envName = config.apiKey.slice(2, -1);
    const val = process.env[envName];
    if (val)
      return val;
  }
  return void 0;
}
function isProviderConfigured(providerId, config, requiresCredential = true) {
  if (config.enabled === false)
    return false;
  if (!requiresCredential)
    return true;
  const key = resolveApiKey(providerId, config);
  return !!key;
}
var YAML_LINE_RE = /^(\s*)(\w+):\s*(.*)$/;
function parseYaml(raw) {
  const lines = raw.split("\n");
  const result = { providers: {} };
  let currentProvider = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#"))
      continue;
    const match = line.match(YAML_LINE_RE);
    if (!match)
      continue;
    const [, spaces, key, value] = match;
    const depth = spaces.length;
    if (depth === 0 && key === "providers") {
      continue;
    }
    if (depth === 2 && key) {
      currentProvider = key;
      result.providers[currentProvider] = {};
      continue;
    }
    if (depth === 4 && currentProvider) {
      const providerConfig = result.providers[currentProvider];
      if (value === "true" || value === "false") {
        providerConfig[key] = value === "true";
      } else if (value === "" && (key === "apiKey" || key === "apiKeyEnv" || key === "baseUrl")) {
        providerConfig[key] = void 0;
      } else {
        providerConfig[key] = stripQuotes(value);
      }
    }
    if (depth === 2 && key === "defaults") {
      result.defaults = {};
    }
    if (depth === 4 && result.defaults && !currentProvider) {
      if (key === "count" || key === "cacheTtlMinutes" || key === "timeoutSeconds") {
        result.defaults[key] = Number(value) || void 0;
      } else {
        result.defaults[key] = value;
      }
    }
  }
  return result;
}
function stripQuotes(value) {
  if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}
function stringifyYaml(config) {
  const lines = ["providers:"];
  for (const [id, provider] of Object.entries(config.providers)) {
    lines.push(`  ${id}:`);
    if (provider.enabled !== void 0)
      lines.push(`    enabled: ${provider.enabled}`);
    if (provider.apiKey !== void 0)
      lines.push(`    apiKey: "${provider.apiKey}"`);
    if (provider.apiKeyEnv !== void 0)
      lines.push(`    apiKeyEnv: "${provider.apiKeyEnv}"`);
    if (provider.baseUrl !== void 0)
      lines.push(`    baseUrl: "${provider.baseUrl}"`);
  }
  if (config.defaults) {
    lines.push("defaults:");
    for (const [key, value] of Object.entries(config.defaults)) {
      if (value !== void 0)
        lines.push(`  ${key}: ${value}`);
    }
  }
  return lines.join("\n") + "\n";
}

// dist/cache.js
var MemoryCache = class {
  store = /* @__PURE__ */ new Map();
  maxSize;
  constructor(maxSize = 1e3) {
    this.maxSize = maxSize;
  }
  get(key) {
    const entry = this.store.get(key);
    if (!entry)
      return void 0;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return void 0;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }
  set(key, value, ttlMs) {
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== void 0)
        this.store.delete(firstKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
  clear() {
    this.store.clear();
  }
};
var DEFAULT_CACHE_TTL_MINUTES = 15;
function resolveCacheTtlMs(configured) {
  return (configured ?? DEFAULT_CACHE_TTL_MINUTES) * 60 * 1e3;
}

// dist/schema.js
var DEFAULT_SEARCH_COUNT = 5;
var MAX_SEARCH_COUNT = 10;
function resolveSearchCount(value, fallback = DEFAULT_SEARCH_COUNT) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(MAX_SEARCH_COUNT, Math.floor(parsed)));
}
function readStringParam(args, key) {
  const val = args[key];
  if (typeof val === "string" && val.trim())
    return val.trim();
  return void 0;
}
function readNumberParam(args, key) {
  const val = args[key];
  if (typeof val === "number" && Number.isFinite(val))
    return val;
  if (typeof val === "string") {
    const parsed = Number.parseInt(val, 10);
    if (Number.isFinite(parsed))
      return parsed;
  }
  return void 0;
}
function readStringArrayParam(args, key) {
  const val = args[key];
  if (Array.isArray(val))
    return val.filter((v) => typeof v === "string");
  return void 0;
}
function buildCacheKey(provider, args) {
  const parts = [provider, args.query];
  if (args.count !== void 0)
    parts.push(args.count);
  if (args.country)
    parts.push(args.country);
  if (args.language)
    parts.push(args.language);
  if (args.freshness)
    parts.push(args.freshness);
  if (args.dateAfter)
    parts.push(args.dateAfter);
  if (args.dateBefore)
    parts.push(args.dateBefore);
  if (args.searchLang)
    parts.push(args.searchLang);
  if (args.uiLang)
    parts.push(args.uiLang);
  if (args.domainFilter?.length)
    parts.push(args.domainFilter.join(","));
  if (args.maxTokens)
    parts.push(args.maxTokens);
  if (args.maxTokensPerPage)
    parts.push(args.maxTokensPerPage);
  return parts.join(":");
}

// dist/engine.js
var NO_PROVIDERS_ERROR = "No search providers are configured. Run 'hyper-search setup' to configure one.";
var SearchEngine = class {
  providers = /* @__PURE__ */ new Map();
  cache;
  config;
  ttlMs;
  configuredProviders;
  constructor(config, cache) {
    this.config = config;
    this.cache = cache ?? new MemoryCache();
    this.ttlMs = resolveCacheTtlMs(config.defaults?.cacheTtlMinutes);
  }
  register(provider) {
    this.providers.set(provider.id, provider);
    this.configuredProviders = void 0;
  }
  listProviders() {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      label: p.label,
      hint: p.hint,
      configured: isProviderConfigured(p.id, this.config.providers[p.id] ?? {}, p.requiresCredential),
      requiresCredential: p.requiresCredential,
      supportedParams: p.supportedParams
    }));
  }
  getConfiguredProviders() {
    if (!this.configuredProviders) {
      this.configuredProviders = Array.from(this.providers.values()).filter((p) => isProviderConfigured(p.id, this.config.providers[p.id] ?? {}, p.requiresCredential)).sort((a, b) => (a.autoDetectOrder ?? 999) - (b.autoDetectOrder ?? 999));
    }
    return this.configuredProviders;
  }
  resolveProviderId(explicit) {
    if (explicit) {
      if (this.providers.has(explicit))
        return explicit;
      throw new Error(`Unknown provider "${explicit}".`);
    }
    const configured = this.getConfiguredProviders();
    const preferred = configured.find((p) => p.requiresCredential) ?? configured.find((p) => !p.requiresCredential);
    if (preferred)
      return preferred.id;
    throw new Error(NO_PROVIDERS_ERROR);
  }
  async search(args) {
    const providerId = this.resolveProviderId(args.provider);
    const provider = this.providers.get(providerId);
    return this.searchWithProvider(provider, args);
  }
  async searchWithProvider(provider, args) {
    const count = resolveSearchCount(args.count, this.config.defaults?.count);
    const searchArgs = { ...args, count, provider: provider.id };
    const cacheKey = buildCacheKey(provider.id, searchArgs);
    const ttlMs = this.ttlMs;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }
    const providerConfig = this.config.providers[provider.id] ?? {};
    const start = Date.now();
    const result = await provider.execute(searchArgs, providerConfig);
    result.tookMs = Date.now() - start;
    this.cache.set(cacheKey, result, ttlMs);
    return result;
  }
  async searchWithFallback(args) {
    const candidates = this.getConfiguredProviders();
    if (candidates.length === 0) {
      throw new Error(NO_PROVIDERS_ERROR);
    }
    const explicit = args.provider;
    if (explicit) {
      return this.search(args);
    }
    let lastError;
    for (const provider of candidates) {
      try {
        return await this.searchWithProvider(provider, { ...args, provider: provider.id });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
};

// dist/normalize.js
var LLM_SPECIAL_TOKENS = [
  "<|im_start|>",
  "<|im_end|>",
  "<|endoftext|>",
  "<|begin_of_text|>",
  "<|end_of_text|>",
  "<|start_header_id|>",
  "<|end_header_id|>",
  "<|eot_id|>",
  "<|python_tag|>",
  "<|eom_id|>",
  "<|fim_prefix|>",
  "<|fim_middle|>",
  "<|fim_suffix|>",
  "<|fim_pad|>"
];
var LLM_TOKEN_RE = new RegExp(LLM_SPECIAL_TOKENS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
function escapeLlmTokens(text) {
  if (!text.includes("<|"))
    return text;
  return text.replace(LLM_TOKEN_RE, "");
}
function stripHtml(text) {
  if (!text.includes("<"))
    return text.trim();
  return text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function sanitize(text) {
  return escapeLlmTokens(stripMarkdownLinks(stripHtml(text)));
}
function stripMarkdownLinks(text) {
  return text.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
}
function resolveSiteName(url) {
  if (!url)
    return void 0;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return void 0;
  }
}
function normalizeUrl(url) {
  return url.split("#")[0].replace(/\/$/, "");
}
function renderResultMarkdown(result, unsupportedWarning) {
  const lines = [];
  if (unsupportedWarning) {
    lines.push(unsupportedWarning);
  }
  if (result.answer) {
    lines.push(`## Answer`);
    lines.push("");
    lines.push(escapeLlmTokens(result.answer));
    lines.push("");
    if (result.citations && result.citations.length > 0) {
      lines.push("### Sources");
      lines.push("");
      for (const c of result.citations) {
        const site = c.siteName ? ` \u2014 ${c.siteName}` : "";
        lines.push(`${c.number}. [${c.title}](${c.url})${site}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }
  lines.push(`## Search Results for "${result.query}"`);
  if (result.provider) {
    lines.push(`*Provider: ${result.provider}${result.cached ? " (cached)" : ""}*`);
  }
  lines.push("");
  for (let i = 0; i < result.results.length; i++) {
    const item = result.results[i];
    lines.push(renderItemMarkdown(i + 1, item));
    lines.push("");
  }
  if (result.results.length === 0) {
    lines.push("*No results found.*");
  }
  return lines.join("\n");
}
function renderItemMarkdown(index, item) {
  const published = item.published ? ` | **Published:** ${item.published}` : "";
  const author = item.author ? ` | **Author:** ${item.author}` : "";
  const description = sanitize(item.description);
  return [
    `### ${index}. [${sanitize(item.title)}](${item.url})`,
    `**Source:** ${item.siteName ?? resolveSiteName(item.url) ?? "unknown"}${published}${author}`,
    description
  ].join("\n");
}

// dist/aggregate.js
async function multiSearch(engine, args, providerIds) {
  const start = Date.now();
  const promises = providerIds.map(async (id) => {
    try {
      return await engine.search({ ...args, provider: id });
    } catch (error) {
      return null;
    }
  });
  const results = (await Promise.all(promises)).filter((r) => r !== null);
  const tookMs = Date.now() - start;
  if (results.length === 0) {
    throw new Error("All providers failed for multi-search.");
  }
  const limit = args.count ?? 5;
  const seenUrls = /* @__PURE__ */ new Set();
  const mergedItems = [];
  const iterators = results.map((r) => r.results[Symbol.iterator]());
  while (mergedItems.length < limit) {
    let added = false;
    for (const it of iterators) {
      const next = it.next();
      if (next.done)
        continue;
      const normalized = normalizeUrl(next.value.url);
      if (seenUrls.has(normalized))
        continue;
      seenUrls.add(normalized);
      mergedItems.push(next.value);
      added = true;
      if (mergedItems.length >= limit)
        break;
    }
    if (!added)
      break;
  }
  return {
    query: args.query,
    provider: results.map((r) => r.provider).join(", "),
    count: mergedItems.length,
    tookMs,
    results: mergedItems
  };
}

// dist/setup.js
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}
function askYesNo(rl, question) {
  return new Promise((resolve) => {
    rl.question(`${question} (y/n) `, (answer) => {
      resolve(answer.trim().toLowerCase().startsWith("y"));
    });
  });
}
async function runSetup() {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.log("hyper-search setup wizard\n");
    const config = loadConfig();
    const providers = [
      { id: "tavily", label: "Tavily", hint: "Structured snippets with depth control", requiresCredential: true, envVars: ["TAVILY_API_KEY"] },
      { id: "exa", label: "Exa", hint: "Neural search with content extraction", requiresCredential: true, envVars: ["EXA_API_KEY"] },
      { id: "firecrawl", label: "Firecrawl", hint: "Web search with content extraction", requiresCredential: true, envVars: ["FIRECRAWL_API_KEY"] },
      { id: "serpapi", label: "SerpAPI", hint: "Google search via SerpAPI", requiresCredential: true, envVars: ["SERPAPI_API_KEY"] },
      { id: "duckduckgo", label: "DuckDuckGo", hint: "Free, no API key needed (experimental)", requiresCredential: false, envVars: [] }
    ];
    for (const provider of providers) {
      const existing = config.providers[provider.id];
      const isEnabled = existing?.enabled !== false;
      console.log(`
${provider.label}`);
      console.log(`  ${provider.hint}`);
      if (provider.requiresCredential) {
        const envValue = process.env[provider.envVars[0]];
        const hasKey = envValue || existing?.apiKey || existing?.apiKeyEnv;
        if (hasKey) {
          console.log(`  API key configured`);
        } else {
          const want = await askYesNo(rl, `  Enable ${provider.label}?`);
          if (!want) {
            config.providers[provider.id] = { enabled: false };
            continue;
          }
          const useEnv = await askYesNo(rl, `  Use env var ${provider.envVars[0]}?`);
          if (useEnv) {
            config.providers[provider.id] = { enabled: true, apiKey: `\${${provider.envVars[0]}}` };
          } else {
            const customEnv = await ask(rl, "  Enter custom env var name (or leave empty for inline): ");
            if (customEnv.trim()) {
              config.providers[provider.id] = { enabled: true, apiKeyEnv: customEnv.trim() };
            } else {
              const inline = await ask(rl, "  Enter API key (not recommended): ");
              config.providers[provider.id] = { enabled: true, apiKey: inline.trim() };
            }
          }
        }
      } else {
        if (!isEnabled) {
          const want = await askYesNo(rl, `  Enable ${provider.label}?`);
          config.providers[provider.id] = { enabled: want };
        } else {
          console.log(`  Enabled (no API key required)`);
          config.providers[provider.id] = { enabled: true };
        }
      }
    }
    console.log("\nDefaults:");
    const defaultCount = await ask(rl, "  Default result count (1-10) [5]: ");
    config.defaults = {
      count: Number.parseInt(defaultCount, 10) || 5
    };
    saveConfig(config);
    console.log("\nConfig saved to ~/.config/hyper-search/config.yaml");
  } finally {
    rl.close();
  }
}

// dist/providers/base.js
var BaseProvider = class {
  getApiKey(config) {
    return resolveApiKey(this.id, config);
  }
  missingKeyError() {
    const envName = getDefaultEnvVarName(this.id);
    return new Error(`The ${this.label} provider requires an API key. Set it via config (apiKey/apiKeyEnv) or environment variable ${envName}.`);
  }
  requireApiKey(config) {
    const key = this.getApiKey(config);
    if (!key)
      throw this.missingKeyError();
    return key;
  }
  mapResult(title, url, description, published, author) {
    return {
      title: sanitize(title ?? ""),
      url: url ?? "",
      description: sanitize(description ?? ""),
      published: published ?? void 0,
      author: author ?? void 0,
      siteName: resolveSiteName(url)
    };
  }
  async throwOnHttpError(response) {
    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`${this.label} API error (${response.status}): ${detail}`);
    }
  }
};

// dist/providers/duckduckgo.js
var DDG_LITE_URL = "https://lite.duckduckgo.com/lite";
var DuckDuckGoProvider = class extends BaseProvider {
  id = "duckduckgo";
  label = "DuckDuckGo";
  hint = "Free, no-key web search. Best for quick lookups and fallback. Short snippets, basic freshness filter.";
  requiresCredential = false;
  envVars = [];
  autoDetectOrder = 100;
  supportedParams = ["query", "count", "country", "language", "freshness"];
  async execute(args) {
    const query = args.query;
    const count = args.count ?? 5;
    const region = args.country ? `${args.country.toLowerCase()}-en` : void 0;
    const url = new URL(DDG_LITE_URL);
    const params = new URLSearchParams();
    params.set("q", query);
    if (region)
      params.set("kl", region);
    if (args.freshness) {
      const df = this.freshnessToDdgCode(args.freshness);
      if (df)
        params.set("df", df);
    }
    url.search = params.toString();
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; hyper-search/0.1)",
        "Accept": "text/html"
      },
      signal: args.signal
    });
    await this.throwOnHttpError(response);
    const html = await response.text();
    const results = this.parseResults(html, count);
    return {
      query,
      provider: this.id,
      count: results.length,
      results
    };
  }
  parseResults(html, maxCount) {
    const results = [];
    const trRegex = /<tr\b[\s\S]*?<\/tr>/gi;
    const rows = [];
    let m;
    while ((m = trRegex.exec(html)) !== null) {
      rows.push(m[0]);
    }
    let i = 0;
    while (i < rows.length && results.length < maxCount) {
      const row = rows[i];
      if (row.includes("result-sponsored")) {
        i++;
        continue;
      }
      const linkMatch = row.match(/<a\b[^>]*\bclass=['"]result-link['"][^>]*>(.*?)<\/a>/i);
      if (!linkMatch) {
        i++;
        continue;
      }
      const fullTag = linkMatch[0];
      const hrefMatch = fullTag.match(/href=['"]([^'"]*)['"]/i);
      const rawUrl = hrefMatch ? this.decodeHtmlEntities(hrefMatch[1]) : "";
      const url = this.extractRedirectUrl(rawUrl);
      if (!url || url.includes("duckduckgo.com/y.js") || url.includes("ad_domain=")) {
        i++;
        continue;
      }
      const title = this.decodeHtmlEntities(stripHtml(linkMatch[1]));
      let snippet = "";
      let published;
      i++;
      if (i < rows.length) {
        const snippetMatch = rows[i].match(/<td\b[^>]*\bclass=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/i);
        if (snippetMatch) {
          const snippetContent = snippetMatch[1];
          const tsMatch = snippetContent.match(/<span\b[^>]*\bclass=['"]timestamp['"][^>]*>([\s\S]*?)<\/span>/i);
          if (tsMatch) {
            published = stripHtml(tsMatch[1]);
          }
          snippet = this.decodeHtmlEntities(stripHtml(snippetContent.replace(/<span\b[^>]*\bclass=['"]timestamp['"][^>]*>[\s\S]*?<\/span>/gi, "")));
          i++;
        }
      }
      if (i < rows.length) {
        const urlRow = rows[i];
        if (!published) {
          const tsMatch = urlRow.match(/<span\b[^>]*\bclass=['"]timestamp['"][^>]*>([\s\S]*?)<\/span>/i);
          if (tsMatch) {
            published = stripHtml(tsMatch[1]);
          }
        }
        if (urlRow.includes("link-text")) {
          i++;
        }
      }
      if (i < rows.length && rows[i].match(/<td[^>]*>&nbsp;<\/td>\s*<td[^>]*>&nbsp;<\/td>/)) {
        i++;
      }
      results.push({
        title: sanitize(title),
        url,
        description: sanitize(snippet),
        published,
        siteName: resolveSiteName(url)
      });
    }
    return results;
  }
  extractRedirectUrl(rawUrl) {
    try {
      if (rawUrl.includes("uddg=")) {
        const url = new URL(rawUrl.startsWith("http") ? rawUrl : `https:${rawUrl}`);
        const uddg = url.searchParams.get("uddg");
        if (uddg)
          return decodeURIComponent(uddg);
      }
    } catch {
    }
    return rawUrl;
  }
  decodeHtmlEntities(text) {
    const named = /* @__PURE__ */ new Map([
      ["&amp;", "&"],
      ["&apos;", "'"],
      ["&lt;", "<"],
      ["&gt;", ">"],
      ["&quot;", '"'],
      ["&nbsp;", " "]
    ]);
    return text.replace(/&(?:amp|apos|lt|gt|quot|nbsp);/g, (m) => named.get(m) ?? m).replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCharCode(Number(code));
      } catch {
        return _;
      }
    }).replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return _;
      }
    });
  }
  freshnessToDdgCode(freshness) {
    switch (freshness) {
      case "day":
        return "d";
      case "week":
        return "w";
      case "month":
        return "m";
      case "year":
        return "y";
      default:
        return void 0;
    }
  }
};

// dist/providers/exa.js
var EXA_API_URL = "https://api.exa.ai/search";
var ExaProvider = class extends BaseProvider {
  id = "exa";
  label = "Exa";
  hint = "Neural search with rich highlights. Best for research, deep context, domain filtering, and date ranges. Long excerpts with authors and published dates.";
  requiresCredential = true;
  envVars = ["EXA_API_KEY"];
  autoDetectOrder = 30;
  supportedParams = [
    "query",
    "count",
    "dateAfter",
    "dateBefore",
    "domainFilter",
    "freshness",
    "maxTokensPerPage"
  ];
  async execute(args, config) {
    const apiKey = this.requireApiKey(config);
    const body = {
      query: args.query,
      numResults: args.count ?? 5,
      contents: {
        highlights: { maxCharacters: 1200 },
        text: {
          maxCharacters: args.maxTokensPerPage ?? 4e3
        }
      }
    };
    if (args.freshness) {
      body.type = "fast";
      const startDate = this.freshnessToDate(args.freshness);
      if (startDate) {
        body.startPublishedDate = startDate;
      }
    }
    if (args.dateAfter) {
      body.startPublishedDate = args.dateAfter;
    }
    if (args.dateBefore) {
      body.endPublishedDate = args.dateBefore;
    }
    if (args.domainFilter && args.domainFilter.length > 0) {
      body.includeDomains = args.domainFilter;
    }
    const response = await fetch(config.baseUrl ?? EXA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify(body),
      signal: args.signal
    });
    await this.throwOnHttpError(response);
    const data = await response.json();
    return {
      query: args.query,
      provider: this.id,
      count: data.results?.length ?? 0,
      results: (data.results ?? []).map((r) => this.mapExaResult(r))
    };
  }
  mapExaResult(r) {
    const highlights = r.highlights ? r.highlights.slice(0, 3) : [];
    const description = highlights.length > 0 ? highlights.join("\n\n") : r.text ?? r.summary ?? "";
    return {
      title: sanitize(r.title ?? ""),
      url: r.url ?? "",
      description: sanitize(description),
      published: r.publishedDate ?? void 0,
      author: r.author ?? void 0,
      siteName: resolveSiteName(r.url)
    };
  }
  freshnessToDate(freshness) {
    const now = /* @__PURE__ */ new Date();
    const isoDate = (d) => d.toISOString().split("T")[0];
    switch (freshness) {
      case "day":
        return isoDate(new Date(now.getTime() - 1 * 24 * 60 * 60 * 1e3));
      case "week":
        return isoDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1e3));
      case "month":
        return isoDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1e3));
      case "year":
        return isoDate(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1e3));
      default:
        return void 0;
    }
  }
};

// dist/providers/firecrawl.js
var FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1/search";
var FirecrawlProvider = class extends BaseProvider {
  id = "firecrawl";
  label = "Firecrawl";
  hint = "Web search via Firecrawl. Short descriptions, similar to other search engines. No full-page extraction \u2014 use a dedicated fetch tool if you need article text.";
  requiresCredential = true;
  envVars = ["FIRECRAWL_API_KEY"];
  autoDetectOrder = 35;
  supportedParams = ["query", "count", "freshness"];
  async execute(args, config) {
    const apiKey = this.requireApiKey(config);
    const body = {
      query: args.query,
      limit: args.count ?? 5
    };
    if (args.freshness) {
      const tbs = this.freshnessToTbs(args.freshness);
      if (tbs)
        body.tbs = tbs;
    }
    const response = await fetch(config.baseUrl ?? FIRECRAWL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: args.signal
    });
    await this.throwOnHttpError(response);
    const data = await response.json();
    const results = Array.isArray(data.data) ? data.data : [];
    return {
      query: args.query,
      provider: this.id,
      count: results.length,
      results: results.map((r) => this.mapResult(r.title, r.url, r.description))
    };
  }
  freshnessToTbs(freshness) {
    switch (freshness) {
      case "day":
        return "qdr:d";
      case "week":
        return "qdr:w";
      case "month":
        return "qdr:m";
      case "year":
        return "qdr:y";
      default:
        return void 0;
    }
  }
};

// dist/providers/serpapi.js
var SERPAPI_URL = "https://serpapi.com/search.json";
var SerpApiProvider = class extends BaseProvider {
  id = "serpapi";
  label = "SerpAPI";
  hint = "Google search via API. Best for geo-targeted queries and when you need Google-specific ranking. Supports country, language, date range, and domain filters.";
  requiresCredential = true;
  envVars = ["SERPAPI_API_KEY"];
  autoDetectOrder = 40;
  supportedParams = ["query", "count", "country", "language", "freshness", "dateAfter", "dateBefore", "domainFilter"];
  async execute(args, config) {
    const apiKey = this.requireApiKey(config);
    const url = new URL(config.baseUrl ?? SERPAPI_URL);
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", args.query);
    url.searchParams.set("api_key", apiKey);
    if (args.count)
      url.searchParams.set("num", String(args.count));
    if (args.country)
      url.searchParams.set("gl", args.country.toLowerCase());
    if (args.language)
      url.searchParams.set("hl", args.language);
    const tbs = this.buildTbs(args);
    if (tbs)
      url.searchParams.set("tbs", tbs);
    if (args.domainFilter && args.domainFilter.length > 0) {
      const siteFilters = args.domainFilter.map((d) => `site:${d}`).join(" OR ");
      url.searchParams.set("q", `${args.query} (${siteFilters})`);
    }
    const response = await fetch(url.toString(), {
      signal: args.signal
    });
    await this.throwOnHttpError(response);
    const data = await response.json();
    const organic = data.organic_results ?? [];
    return {
      query: args.query,
      provider: this.id,
      count: organic.length,
      results: organic.map((r) => this.mapResult(r.title, r.link, r.snippet, r.date))
    };
  }
  buildTbs(args) {
    if (args.freshness) {
      switch (args.freshness) {
        case "day":
          return "qdr:d";
        case "week":
          return "qdr:w";
        case "month":
          return "qdr:m";
        case "year":
          return "qdr:y";
      }
    }
    if (args.dateAfter || args.dateBefore) {
      const min = args.dateAfter ?? "";
      const max = args.dateBefore ?? "";
      return `cdr:1,cd_min:${min},cd_max:${max}`;
    }
    return void 0;
  }
};

// dist/providers/tavily.js
var TAVILY_API_URL = "https://api.tavily.com/search";
var TavilyProvider = class extends BaseProvider {
  id = "tavily";
  label = "Tavily";
  hint = "AI-optimized search with concise snippets. Best for quick facts and news. Supports freshness and domain filtering. Short, clean results.";
  requiresCredential = true;
  envVars = ["TAVILY_API_KEY"];
  autoDetectOrder = 25;
  supportedParams = [
    "query",
    "count",
    "freshness",
    "domainFilter"
  ];
  async execute(args, config) {
    const apiKey = this.requireApiKey(config);
    const body = {
      query: args.query,
      search_depth: args.freshness ? "advanced" : "basic",
      max_results: args.count ?? 5
    };
    if (args.freshness) {
      body.time_range = args.freshness;
    }
    if (args.domainFilter && args.domainFilter.length > 0) {
      body.include_domains = args.domainFilter;
    }
    const response = await fetch(config.baseUrl ?? TAVILY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: args.signal
    });
    await this.throwOnHttpError(response);
    const data = await response.json();
    return {
      query: args.query,
      provider: this.id,
      count: data.results?.length ?? 0,
      results: (data.results ?? []).map((r) => this.mapResult(r.title, r.url, this.pickDescription(r.content, r.snippet), r.published_date, r.author))
    };
  }
  pickDescription(content, snippet) {
    if (!content)
      return snippet ?? "";
    const markdownLinks = (content.match(/!?\[.*?\]\(.*?\)/g) ?? []).length;
    if (markdownLinks > 5)
      return snippet ?? "";
    const bulletItems = (content.match(/(^|\s)[\*\-]\s+[A-Z]/g) ?? []).length;
    if (bulletItems > 5)
      return snippet ?? "";
    return content;
  }
};

// dist/providers/weixin-search.js
var WX_SEARCH_URL = "https://weixin.sogou.com/weixinjs";
var WeixinSearchProvider = class extends BaseProvider {
  id = "weixin-search";
  label = "WeChat Articles";
  hint = "Search WeChat Official Account (\u5FAE\u4FE1\u516C\u4F17\u53F7) articles via Sogou. Returns title, source account, date, and snippet. Free, no key.";
  requiresCredential = false;
  envVars = [];
  autoDetectOrder = 90;
  supportedParams = ["query", "count"];
  async execute(args) {
    const query = args.query;
    const count = args.count ?? 5;
    const maxPages = Math.ceil(count / 10);
    const items = [];
    for (let page = 1; page <= maxPages; page++) {
      const url = new URL(WX_SEARCH_URL);
      url.searchParams.set("type", "2");
      url.searchParams.set("query", query);
      url.searchParams.set("page", String(page));
      const response = await fetch(url.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "zh-CN,zh;q=0.9"
        },
        signal: args.signal
      });
      await this.throwOnHttpError(response);
      const raw = await response.text();
      if (!raw.startsWith("weixin("))
        break;
      const jsonStr = raw.replace(/^weixin\(/, "").replace(/\)$/, "");
      let data;
      try {
        data = JSON.parse(jsonStr);
      } catch {
        break;
      }
      if (!data.items?.length)
        break;
      for (const xml of data.items) {
        const item = this.parseXmlItem(xml);
        if (item)
          items.push(item);
      }
      if (data.totalPages <= page)
        break;
    }
    const results = items.slice(0, count).map(this.toSearchItem);
    return {
      query,
      provider: this.id,
      count: results.length,
      results
    };
  }
  parseXmlItem(xml) {
    const get = (name) => {
      const m = xml.match(new RegExp("<" + name + "><!\\[CDATA\\[(.*?)\\]\\]></" + name + ">"));
      const raw = m ? m[1] : "";
      return raw.replace(/[\uE000-\uF8FF]/g, "");
    };
    const dateMatch = xml.match(/<date>(.*?)<\/date>/);
    const date = dateMatch ? dateMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "") : "";
    const title = get("title");
    if (!title)
      return null;
    const encUrl = get("encArticleUrl") || get("encGzhUrl");
    const url = encUrl ? `https://weixin.sogou.com${encUrl}` : "";
    return {
      title,
      url,
      date: date.trim(),
      source: get("sourcename"),
      summary: get("content168") || get("content68") || get("content50") || "",
      headImage: get("imglink") || get("headimage") || ""
    };
  }
  toSearchItem(item) {
    return {
      title: sanitize(item.title),
      url: item.url || `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(item.title)}`,
      description: sanitize(item.summary),
      published: item.date || void 0,
      author: item.source || void 0,
      siteName: item.source ? `${item.source} (\u5FAE\u4FE1\u516C\u4F17\u53F7)` : "\u5FAE\u4FE1\u516C\u4F17\u53F7"
    };
  }
};

// dist/providers/index.js
var ALL_PROVIDERS = [
  new DuckDuckGoProvider(),
  new ExaProvider(),
  new FirecrawlProvider(),
  new SerpApiProvider(),
  new TavilyProvider(),
  new WeixinSearchProvider()
];

// dist/cli.js
var engineCache;
function getEngine() {
  if (!engineCache) {
    const config = loadConfig();
    engineCache = new SearchEngine(config);
    for (const p of ALL_PROVIDERS)
      engineCache.register(p);
  }
  return engineCache;
}
function splitCommaList(value) {
  return value.split(",").map((s) => s.trim());
}
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        if (key === "domainFilter" || key === "providers") {
          args[key] = splitCommaList(next);
        } else {
          const parsed = Number.parseInt(next, 10);
          args[key] = String(parsed) === next ? parsed : next;
        }
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args.query = arg;
    }
  }
  return args;
}
function toSearchArgs(args) {
  return {
    query: String(args.query),
    count: readNumberParam(args, "count"),
    provider: readStringParam(args, "provider"),
    country: readStringParam(args, "country"),
    language: readStringParam(args, "language"),
    freshness: readStringParam(args, "freshness"),
    dateAfter: readStringParam(args, "dateAfter"),
    dateBefore: readStringParam(args, "dateBefore"),
    domainFilter: readStringArrayParam(args, "domainFilter"),
    maxTokensPerPage: readNumberParam(args, "maxTokensPerPage")
  };
}
function parseProviderIds(args) {
  const val = args.providers;
  if (Array.isArray(val))
    return val;
  if (typeof val === "string")
    return splitCommaList(val);
  return void 0;
}
async function main() {
  const [, , command, ...rest] = process.argv;
  if (command === "setup" || command === "configure") {
    await runSetup();
    return;
  }
  if (command === "providers") {
    const engine2 = getEngine();
    const providers = engine2.listProviders();
    const args = parseArgs(rest);
    if (args.format === "json") {
      console.log(JSON.stringify(providers, null, 2));
    } else {
      console.log("Providers:\n");
      for (const p of providers) {
        const status = p.configured ? "\u2713" : "\u2717";
        const cred = p.requiresCredential ? "[API key]" : "[free]";
        console.log(`  ${status} ${p.label} ${cred}`);
        console.log(`    hint:    ${p.hint}`);
        console.log(`    params:  ${p.supportedParams.join(", ")}`);
        console.log("");
      }
      console.log("Run 'hyper-search setup' to configure providers.");
    }
    return;
  }
  if (command === "search" || command === "s") {
    const engine2 = getEngine();
    const args = parseArgs(rest);
    if (!args.query) {
      console.error("Usage: hyper-search search <query> [--provider tavily] [--count 5]");
      process.exit(1);
    }
    const result2 = await engine2.searchWithFallback(toSearchArgs(args));
    if (args.format === "json") {
      console.log(JSON.stringify(result2, null, 2));
    } else {
      console.log(renderResultMarkdown(result2));
    }
    return;
  }
  if (command === "multi" || command === "m") {
    const engine2 = getEngine();
    const args = parseArgs(rest);
    if (!args.query) {
      console.error("Usage: hyper-search multi <query> [--providers tavily,exa] [--count 5]");
      process.exit(1);
    }
    const providerIds = parseProviderIds(args);
    if (!providerIds) {
      console.error("Usage: hyper-search multi <query> --providers tavily,exa");
      process.exit(1);
    }
    const result2 = await multiSearch(engine2, toSearchArgs(args), providerIds);
    if (args.format === "json") {
      console.log(JSON.stringify(result2, null, 2));
    } else {
      console.log(renderResultMarkdown(result2));
    }
    return;
  }
  if (!command || command === "--help" || command === "-h") {
    console.log(`hyper-search \u2014 unified web search for coding agents

Usage:
  hyper-search setup                    Configure search providers
  hyper-search search <query>           Search the web
  hyper-search multi <query>            Search across multiple providers
  hyper-search providers                List configured providers

Search options:
  --provider <id>          Provider to use (see 'providers' command for details)
  --count <n>              Number of results (1-10, default 5)
  --country <code>         2-letter country code
  --language <code>        ISO language code
  --freshness <period>     day, week, month, or year
  --date-after <date>      YYYY-MM-DD
  --date-before <date>     YYYY-MM-DD
  --domain-filter <list>   Comma-separated domains (e.g. nytimes.com,cnn.com)
  --max-tokens-per-page <n> Max text length per result (Exa only, default 4000)

Multi-search options:
  --providers <list>   Comma-separated provider IDs

Environment variables:
  HYPER_SEARCH_CONFIG              Path to config file
  HYPER_SEARCH_<PROVIDER>_API_KEY  Default API key for provider
`);
    return;
  }
  const engine = getEngine();
  const result = await engine.searchWithFallback({
    query: [command, ...rest].join(" ")
  });
  console.log(renderResultMarkdown(result));
}
main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
