import type { SearchArgs, SearchResult, SearchResultItem } from "./types.js";
import type { SearchEngine } from "./engine.js";
import { normalizeUrl } from "./normalize.js";

export async function multiSearch(
  engine: SearchEngine,
  args: SearchArgs,
  providerIds: string[],
): Promise<SearchResult> {
  const start = Date.now();
  const promises = providerIds.map(async (id) => {
    try {
      return await engine.search({ ...args, provider: id });
    } catch (error) {
      return null;
    }
  });

  const results = (await Promise.all(promises)).filter((r): r is SearchResult => r !== null);
  const tookMs = Date.now() - start;

  if (results.length === 0) {
    throw new Error("All providers failed for multi-search.");
  }

  const limit = args.count ?? 5;
  const seenUrls = new Set<string>();
  const mergedItems: SearchResultItem[] = [];

  // Round-robin interleaving across providers
  const iterators = results.map((r) => r.results[Symbol.iterator]());
  while (mergedItems.length < limit) {
    let added = false;
    for (const it of iterators) {
      const next = it.next();
      if (next.done) continue;
      const normalized = normalizeUrl(next.value.url);
      if (seenUrls.has(normalized)) continue;
      seenUrls.add(normalized);
      mergedItems.push(next.value);
      added = true;
      if (mergedItems.length >= limit) break;
    }
    if (!added) break;
  }

  return {
    query: args.query,
    provider: results.map((r) => r.provider).join(", "),
    count: mergedItems.length,
    tookMs,
    results: mergedItems,
  };
}
