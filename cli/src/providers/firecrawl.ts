import type { SearchArgs, SearchResult, ProviderConfig, SearchParam } from "../types.js";
import { BaseProvider } from "./base.js";

const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1/search";

export class FirecrawlProvider extends BaseProvider {
  id = "firecrawl";
  label = "Firecrawl";
  hint = "Web search via Firecrawl. Short descriptions, similar to other search engines. No full-page extraction — use a dedicated fetch tool if you need article text.";
  requiresCredential = true;
  envVars = ["FIRECRAWL_API_KEY"];
  autoDetectOrder = 35;
  supportedParams: SearchParam[] = ["query", "count", "freshness"];

  async execute(args: SearchArgs, config: ProviderConfig): Promise<SearchResult> {
    const apiKey = this.requireApiKey(config);

    const body: Record<string, unknown> = {
      query: args.query,
      limit: args.count ?? 5,
    };
    if (args.freshness) {
      const tbs = this.freshnessToTbs(args.freshness);
      if (tbs) body.tbs = tbs;
    }

    const response = await fetch(config.baseUrl ?? FIRECRAWL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: args.signal,
    });

    await this.throwOnHttpError(response);

    const data = await response.json() as FirecrawlSearchResponse;
    const results = Array.isArray(data.data) ? data.data : [];

    return {
      query: args.query,
      provider: this.id,
      count: results.length,
      results: results.map(r => this.mapResult(r.title, r.url, r.description)),
    };
  }

  private freshnessToTbs(freshness: string): string | undefined {
    switch (freshness) {
      case "day": return "qdr:d";
      case "week": return "qdr:w";
      case "month": return "qdr:m";
      case "year": return "qdr:y";
      default: return undefined;
    }
  }
}

interface FirecrawlSearchResponse {
  success?: boolean;
  data?: Array<{
    title?: string;
    url?: string;
    description?: string;
    position?: number;
  }>;
}
