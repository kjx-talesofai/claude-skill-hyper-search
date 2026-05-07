import type { SearchArgs, SearchResult, SearchParam } from "../types.js";
import { BaseProvider } from "./base.js";
import { resolveSiteName, stripHtml, sanitize } from "../normalize.js";

const DDG_LITE_URL = "https://lite.duckduckgo.com/lite";

export class DuckDuckGoProvider extends BaseProvider {
  id = "duckduckgo";
  label = "DuckDuckGo";
  hint = "Free, no-key web search. Best for quick lookups and fallback. Short snippets, basic freshness filter.";
  requiresCredential = false;
  envVars: string[] = [];
  autoDetectOrder = 100;
  supportedParams: SearchParam[] = ["query", "count", "country", "language", "freshness"];

  async execute(args: SearchArgs): Promise<SearchResult> {
    const query = args.query;
    const count = args.count ?? 5;
    const region = args.country ? `${args.country.toLowerCase()}-en` : undefined;

    const url = new URL(DDG_LITE_URL);
    const params = new URLSearchParams();
    params.set("q", query);
    if (region) params.set("kl", region);
    if (args.freshness) {
      const df = this.freshnessToDdgCode(args.freshness);
      if (df) params.set("df", df);
    }
    url.search = params.toString();

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; hyper-search/0.1)",
        "Accept": "text/html",
      },
      signal: args.signal,
    });

    await this.throwOnHttpError(response);

    const html = await response.text();
    const results = this.parseResults(html, count);

    return {
      query,
      provider: this.id,
      count: results.length,
      results,
    };
  }

  private parseResults(html: string, maxCount: number): SearchResult["results"] {
    const results: SearchResult["results"] = [];

    // Extract all <tr> elements.  Use [\s\S] so we catch newlines inside rows.
    const trRegex = /<tr\b[\s\S]*?<\/tr>/gi;
    const rows: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = trRegex.exec(html)) !== null) {
      rows.push(m[0]);
    }

    let i = 0;
    while (i < rows.length && results.length < maxCount) {
      const row = rows[i];

      // Skip sponsored / ad rows
      if (row.includes("result-sponsored")) {
        i++;
        continue;
      }

      // Look for a title row: contains <a class="result-link"> or <a class='result-link'>
      const linkMatch = row.match(/<a\b[^>]*\bclass=['"]result-link['"][^>]*>(.*?)<\/a>/i);
      if (!linkMatch) {
        i++;
        continue;
      }

      const fullTag = linkMatch[0];
      const hrefMatch = fullTag.match(/href=['"]([^'"]*)['"]/i);
      const rawUrl = hrefMatch ? this.decodeHtmlEntities(hrefMatch[1]) : "";
      const url = this.extractRedirectUrl(rawUrl);

      // Skip ad/tracking links that didn't resolve
      if (!url || url.includes("duckduckgo.com/y.js") || url.includes("ad_domain=")) {
        i++;
        continue;
      }

      const title = this.decodeHtmlEntities(stripHtml(linkMatch[1]));
      let snippet = "";
      let published: string | undefined;

      i++; // move past title row

      // Check next row for snippet (td.result-snippet)
      if (i < rows.length) {
        const snippetMatch = rows[i].match(/<td\b[^>]*\bclass=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/i);
        if (snippetMatch) {
          const snippetContent = snippetMatch[1];
          // Timestamp may be inside the snippet td
          const tsMatch = snippetContent.match(/<span\b[^>]*\bclass=['"]timestamp['"][^>]*>([\s\S]*?)<\/span>/i);
          if (tsMatch) {
            published = stripHtml(tsMatch[1]);
          }
          // Remove the timestamp span from snippet text so we don't duplicate it
          snippet = this.decodeHtmlEntities(stripHtml(snippetContent.replace(/<span\b[^>]*\bclass=['"]timestamp['"][^>]*>[\s\S]*?<\/span>/gi, "")));
          i++; // consume snippet row
        }
      }

      // Check next row for display URL (link-text) and timestamp
      if (i < rows.length) {
        const urlRow = rows[i];
        // If we haven't already found a timestamp, look for one here
        if (!published) {
          const tsMatch = urlRow.match(/<span\b[^>]*\bclass=['"]timestamp['"][^>]*>([\s\S]*?)<\/span>/i);
          if (tsMatch) {
            published = stripHtml(tsMatch[1]);
          }
        }
        // Consume the display-URL row if it contains link-text
        if (urlRow.includes("link-text")) {
          i++;
        }
      }

      // Skip the spacer row (<td>&nbsp;</td><td>&nbsp;</td>)
      if (i < rows.length && rows[i].match(/<td[^>]*>&nbsp;<\/td>\s*<td[^>]*>&nbsp;<\/td>/)) {
        i++;
      }

      results.push({
        title: sanitize(title),
        url,
        description: sanitize(snippet),
        published,
        siteName: resolveSiteName(url),
      });
    }

    return results;
  }

  private extractRedirectUrl(rawUrl: string): string {
    try {
      if (rawUrl.includes("uddg=")) {
        const url = new URL(rawUrl.startsWith("http") ? rawUrl : `https:${rawUrl}`);
        const uddg = url.searchParams.get("uddg");
        if (uddg) return decodeURIComponent(uddg);
      }
    } catch {
      // fall through
    }
    return rawUrl;
  }

  private decodeHtmlEntities(text: string): string {
    const named = new Map([
      ["&amp;", "&"],
      ["&apos;", "'"],
      ["&lt;", "<"],
      ["&gt;", ">"],
      ["&quot;", '"'],
      ["&nbsp;", " "],
    ]);
    return text
      .replace(/&(?:amp|apos|lt|gt|quot|nbsp);/g, (m) => named.get(m) ?? m)
      .replace(/&#(\d+);/g, (_, code) => {
        try { return String.fromCharCode(Number(code)); } catch { return _; }
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        try { return String.fromCharCode(parseInt(hex, 16)); } catch { return _; }
      });
  }

  private freshnessToDdgCode(freshness: string): string | undefined {
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
        return undefined;
    }
  }
}
