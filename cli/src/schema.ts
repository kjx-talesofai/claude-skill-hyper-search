import type { SearchArgs, SearchParam, SearchProvider } from "./types.js";

export const DEFAULT_SEARCH_COUNT = 5;
export const MAX_SEARCH_COUNT = 10;

export const ALL_PARAMS: SearchParam[] = [
  "query",
  "count",
  "country",
  "language",
  "freshness",
  "dateAfter",
  "dateBefore",
  "searchLang",
  "uiLang",
  "domainFilter",
  "maxTokens",
  "maxTokensPerPage",
];

export function resolveSearchCount(value: unknown, fallback = DEFAULT_SEARCH_COUNT): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(MAX_SEARCH_COUNT, Math.floor(parsed)));
}

export function readStringParam(args: Record<string, unknown>, key: string): string | undefined {
  const val = args[key];
  if (typeof val === "string" && val.trim()) return val.trim();
  return undefined;
}

export function readNumberParam(args: Record<string, unknown>, key: string): number | undefined {
  const val = args[key];
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const parsed = Number.parseInt(val, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function readStringArrayParam(args: Record<string, unknown>, key: string): string[] | undefined {
  const val = args[key];
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === "string");
  return undefined;
}

export function buildUnsupportedParamWarning(
  args: SearchArgs,
  provider: SearchProvider,
): string | undefined {
  const unsupported: string[] = [];
  const supported = new Set(provider.supportedParams);

  for (const param of ALL_PARAMS) {
    if (supported.has(param)) continue;
    const val = args[param as keyof SearchArgs];
    if (val !== undefined && val !== "" && typeof val !== "boolean" && !(typeof val === "number" && val === 0) && !(Array.isArray(val) && val.length === 0)) {
      unsupported.push(param);
    }
  }

  if (unsupported.length === 0) return undefined;
  const readable = unsupported.map(p => `--${p.replace(/([A-Z])/g, "-$1").toLowerCase()}`);
  return `> ⚠️ **Note:** The following parameters are not supported by the ${provider.label} provider and were ignored: ${readable.join(", ")}\n`;
}

export function buildCacheKey(provider: string, args: SearchArgs): string {
  const parts: (string | number)[] = [provider, args.query];
  if (args.count !== undefined) parts.push(args.count);
  if (args.country) parts.push(args.country);
  if (args.language) parts.push(args.language);
  if (args.freshness) parts.push(args.freshness);
  if (args.dateAfter) parts.push(args.dateAfter);
  if (args.dateBefore) parts.push(args.dateBefore);
  if (args.searchLang) parts.push(args.searchLang);
  if (args.uiLang) parts.push(args.uiLang);
  if (args.domainFilter?.length) parts.push(args.domainFilter.join(","));
  if (args.maxTokens) parts.push(args.maxTokens);
  if (args.maxTokensPerPage) parts.push(args.maxTokensPerPage);
  return parts.join(":");
}
