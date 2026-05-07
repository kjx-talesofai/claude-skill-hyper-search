import type { SearchArgs, SearchResult, ProviderConfig, SearchParam } from "../types.js";
import { BaseProvider } from "./base.js";

const TAVILY_API_URL = "https://api.tavily.com/search";

export class TavilyProvider extends BaseProvider {
  id = "tavily";
  label = "Tavily";
  hint = "AI-optimized search with concise snippets. Best for quick facts and news. Supports freshness and domain filtering. Short, clean results.";
  requiresCredential = true;
  envVars = ["TAVILY_API_KEY"];
  autoDetectOrder = 25;
  supportedParams: SearchParam[] = [
    "query", "count", "freshness", "domainFilter",
  ];

  async execute(args: SearchArgs, config: ProviderConfig): Promise<SearchResult> {
    const apiKey = this.requireApiKey(config);

    const body: Record<string, unknown> = {
      query: args.query,
      search_depth: args.freshness ? "advanced" : "basic",
      max_results: args.count ?? 5,
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
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: args.signal,
    });

    await this.throwOnHttpError(response);

    const data = await response.json() as TavilySearchResponse;

    return {
      query: args.query,
      provider: this.id,
      count: data.results?.length ?? 0,
      results: (data.results ?? []).map(r => this.mapResult(
        r.title,
        r.url,
        this.pickDescription(r.content, r.snippet),
        r.published_date,
        r.author,
      )),
    };
  }

  private pickDescription(content: string | undefined, snippet: string | undefined): string {
    if (!content) return snippet ?? "";
    // Heuristic 1: >5 markdown links/images = nav-heavy
    const markdownLinks = (content.match(/!?\[.*?\]\(.*?\)/g) ?? []).length;
    if (markdownLinks > 5) return snippet ?? "";
    // Heuristic 2: bullet-heavy text (nav menus often use "* Item * Item")
    const bulletItems = (content.match(/(^|\s)[\*\-]\s+[A-Z]/g) ?? []).length;
    if (bulletItems > 5) return snippet ?? "";
    return content;
  }
}

interface TavilySearchResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    snippet?: string;
    published_date?: string;
    author?: string;
  }>;
}
