import type { SearchArgs, SearchResult, ProviderConfig, SearchParam } from "../types.js";
import { BaseProvider } from "./base.js";

const SERPAPI_URL = "https://serpapi.com/search.json";

export class SerpApiProvider extends BaseProvider {
  id = "serpapi";
  label = "SerpAPI";
  hint = "Google search via API. Best for geo-targeted queries and when you need Google-specific ranking. Supports country, language, date range, and domain filters.";
  requiresCredential = true;
  envVars = ["SERPAPI_API_KEY"];
  autoDetectOrder = 40;
  supportedParams: SearchParam[] = ["query", "count", "country", "language", "freshness", "dateAfter", "dateBefore", "domainFilter"];

  async execute(args: SearchArgs, config: ProviderConfig): Promise<SearchResult> {
    const apiKey = this.requireApiKey(config);

    const url = new URL(config.baseUrl ?? SERPAPI_URL);
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", args.query);
    url.searchParams.set("api_key", apiKey);
    if (args.count) url.searchParams.set("num", String(args.count));
    if (args.country) url.searchParams.set("gl", args.country.toLowerCase());
    if (args.language) url.searchParams.set("hl", args.language);

    const tbs = this.buildTbs(args);
    if (tbs) url.searchParams.set("tbs", tbs);

    if (args.domainFilter && args.domainFilter.length > 0) {
      const siteFilters = args.domainFilter.map(d => `site:${d}`).join(" OR ");
      url.searchParams.set("q", `${args.query} (${siteFilters})`);
    }

    const response = await fetch(url.toString(), {
      signal: args.signal,
    });

    await this.throwOnHttpError(response);

    const data = await response.json() as SerpApiSearchResponse;
    const organic = data.organic_results ?? [];

    return {
      query: args.query,
      provider: this.id,
      count: organic.length,
      results: organic.map(r => this.mapResult(r.title, r.link, r.snippet, r.date)),
    };
  }

  private buildTbs(args: SearchArgs): string | undefined {
    if (args.freshness) {
      switch (args.freshness) {
        case "day": return "qdr:d";
        case "week": return "qdr:w";
        case "month": return "qdr:m";
        case "year": return "qdr:y";
      }
    }
    if (args.dateAfter || args.dateBefore) {
      const min = args.dateAfter ?? "";
      const max = args.dateBefore ?? "";
      return `cdr:1,cd_min:${min},cd_max:${max}`;
    }
    return undefined;
  }
}

interface SerpApiSearchResponse {
  organic_results?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    date?: string;
  }>;
}
