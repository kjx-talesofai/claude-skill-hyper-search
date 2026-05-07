import type { SearchArgs, SearchResult, ProviderConfig, SearchParam, SearchResultItem } from "../types.js";
import { BaseProvider } from "./base.js";
import { sanitize, resolveSiteName } from "../normalize.js";

const EXA_API_URL = "https://api.exa.ai/search";

export class ExaProvider extends BaseProvider {
  id = "exa";
  label = "Exa";
  hint = "Neural search with rich highlights. Best for research, deep context, domain filtering, and date ranges. Long excerpts with authors and published dates.";
  requiresCredential = true;
  envVars = ["EXA_API_KEY"];
  autoDetectOrder = 30;
  supportedParams: SearchParam[] = [
    "query", "count", "dateAfter", "dateBefore", "domainFilter",
    "freshness", "maxTokensPerPage",
  ];

  async execute(args: SearchArgs, config: ProviderConfig): Promise<SearchResult> {
    const apiKey = this.requireApiKey(config);

    const body: Record<string, unknown> = {
      query: args.query,
      numResults: args.count ?? 5,
      contents: {
        highlights: { maxCharacters: 1200 },
        text: {
          maxCharacters: args.maxTokensPerPage ?? 4000,
        },
      },
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
        "x-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: args.signal,
    });

    await this.throwOnHttpError(response);

    const data = await response.json() as ExaSearchResponse;

    return {
      query: args.query,
      provider: this.id,
      count: data.results?.length ?? 0,
      results: (data.results ?? []).map(r => this.mapExaResult(r)),
    };
  }

  private mapExaResult(r: ExaResultItem): SearchResultItem {
    const highlights = r.highlights ? r.highlights.slice(0, 3) : [];
    const description = highlights.length > 0
      ? highlights.join("\n\n")
      : (r.text ?? r.summary ?? "");

    return {
      title: sanitize(r.title ?? ""),
      url: r.url ?? "",
      description: sanitize(description),
      published: r.publishedDate ?? undefined,
      author: r.author ?? undefined,
      siteName: resolveSiteName(r.url),
    };
  }

  private freshnessToDate(freshness: string): string | undefined {
    const now = new Date();
    const isoDate = (d: Date) => d.toISOString().split("T")[0];
    switch (freshness) {
      case "day":
        return isoDate(new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000));
      case "week":
        return isoDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      case "month":
        return isoDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
      case "year":
        return isoDate(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000));
      default:
        return undefined;
    }
  }
}

interface ExaSearchResponse {
  results?: ExaResultItem[];
}

interface ExaResultItem {
  title?: string;
  url?: string;
  text?: string;
  summary?: string;
  highlights?: string[];
  publishedDate?: string;
  author?: string;
}
