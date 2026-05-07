#!/usr/bin/env node
import type { SearchArgs } from "./types.js";
import { loadConfig } from "./config.js";
import { SearchEngine } from "./engine.js";
import { renderResultMarkdown } from "./normalize.js";
import { multiSearch } from "./aggregate.js";
import { runSetup } from "./setup.js";
import { readNumberParam, readStringParam, readStringArrayParam } from "./schema.js";
import { ALL_PROVIDERS } from "./providers/index.js";

let engineCache: SearchEngine | undefined;

function getEngine(): SearchEngine {
  if (!engineCache) {
    const config = loadConfig();
    engineCache = new SearchEngine(config);
    for (const p of ALL_PROVIDERS) engineCache.register(p);
  }
  return engineCache;
}

function splitCommaList(value: string): string[] {
  return value.split(",").map((s) => s.trim());
}

function parseArgs(argv: string[]): Record<string, string | number | boolean | string[]> {
  const args: Record<string, string | number | boolean | string[]> = {};
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

function toSearchArgs(args: Record<string, unknown>): SearchArgs {
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
    maxTokensPerPage: readNumberParam(args, "maxTokensPerPage"),
  };
}

function parseProviderIds(args: Record<string, unknown>): string[] | undefined {
  const val = args.providers;
  if (Array.isArray(val)) return val;
  if (typeof val === "string") return splitCommaList(val);
  return undefined;
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (command === "setup" || command === "configure") {
    await runSetup();
    return;
  }

  if (command === "providers") {
    const engine = getEngine();
    const providers = engine.listProviders();
    const args = parseArgs(rest);

    if (args.format === "json") {
      console.log(JSON.stringify(providers, null, 2));
    } else {
      console.log("Providers:\n");
      for (const p of providers) {
        const status = p.configured ? "✓" : "✗";
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
    const engine = getEngine();
    const args = parseArgs(rest);

    if (!args.query) {
      console.error("Usage: hyper-search search <query> [--provider tavily] [--count 5]");
      process.exit(1);
    }

    const result = await engine.searchWithFallback(toSearchArgs(args));

    if (args.format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(renderResultMarkdown(result));
    }
    return;
  }

  if (command === "multi" || command === "m") {
    const engine = getEngine();
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

    const result = await multiSearch(engine, toSearchArgs(args), providerIds);

    if (args.format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(renderResultMarkdown(result));
    }
    return;
  }

  if (!command || command === "--help" || command === "-h") {
    console.log(`hyper-search — unified web search for coding agents

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

  // Default: treat as search query
  const engine = getEngine();
  const result = await engine.searchWithFallback({
    query: [command, ...rest].join(" "),
  });
  console.log(renderResultMarkdown(result));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
