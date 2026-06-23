import type { SearchArgs, SearchResult, SearchParam } from "../types.js";
import { BaseProvider } from "./base.js";
import { sanitize } from "../normalize.js";

const WX_SEARCH_URL = "https://weixin.sogou.com/weixinjs";

export class WeixinSearchProvider extends BaseProvider {
  id = "weixin-search";
  label = "WeChat Articles";
  hint = "Search WeChat Official Account (微信公众号) articles via Sogou. Returns title, source account, date, and snippet. Free, no key. Set MEDIA_FETCH_PROXY_URL to route requests through a proxy if needed.";
  requiresCredential = false;
  envVars: string[] = ["MEDIA_FETCH_PROXY_URL"];
  autoDetectOrder = 90;
  supportedParams: SearchParam[] = ["query", "count", "freshness", "dateAfter", "dateBefore"];

  async execute(args: SearchArgs): Promise<SearchResult> {
    const query = args.query;
    const count = args.count ?? 5;
    const maxPages = Math.ceil(count / 10);
    const items: ParsedItem[] = [];
    const proxyUrl = process.env.MEDIA_FETCH_PROXY_URL?.trim() || "";

    for (let page = 1; page <= maxPages; page++) {
      const sogouUrl = new URL(WX_SEARCH_URL);
      sogouUrl.searchParams.set("type", "2");
      sogouUrl.searchParams.set("query", query);
      sogouUrl.searchParams.set("page", String(page));

      let fetchUrl: string;
      let fetchHeaders: Record<string, string>;

      if (proxyUrl) {
        // Route through proxy
        fetchUrl = `${proxyUrl.replace(/\/$/, "")}/proxy?url=${encodeURIComponent(sogouUrl.toString())}&referer=${encodeURIComponent("https://weixin.sogou.com/")}`;
        fetchHeaders = {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        };
      } else {
        fetchUrl = sogouUrl.toString();
        fetchHeaders = {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "zh-CN,zh;q=0.9",
        };
      }

      const response = await fetch(fetchUrl, {
        headers: fetchHeaders,
        signal: args.signal,
      });

      await this.throwOnHttpError(response);

      const raw = await response.text();
      if (!raw.startsWith("weixin(")) break;

      const jsonStr = raw.replace(/^weixin\(/, "").replace(/\)$/, "");
      let data: WeixinResponse;
      try {
        data = JSON.parse(jsonStr);
      } catch {
        break;
      }

      if (!data.items?.length) break;

      for (const xml of data.items) {
        const item = this.parseXmlItem(xml);
        if (item) items.push(item);
      }

      if (data.totalPages <= page) break;
    }

    // Client-side sort: Sogou API returns results in non-deterministic order.
    // When user requests time-sensitive results, sort by date descending.
    if (args.freshness || args.dateAfter || args.dateBefore) {
      items.sort((a, b) => {
        const da = this.parseDate(a.date);
        const db = this.parseDate(b.date);
        return db - da; // newest first
      });
    }

    const results = items.slice(0, count).map(this.toSearchItem);

    return {
      query,
      provider: this.id,
      count: results.length,
      results,
    };
  }

  private parseXmlItem(xml: string): ParsedItem | null {
    const get = (name: string): string => {
      const m = xml.match(new RegExp("<" + name + "><!\\[CDATA\\[(.*?)\\]\\]></" + name + ">"));
      const raw = m ? m[1] : "";
      // Remove Sogou highlight control characters (U+E000–U+F8FF, private use area)
      return raw.replace(/[\uE000-\uF8FF]/g, "");
    };

    const dateMatch = xml.match(/<date>(.*?)<\/date>/);
    const date = dateMatch ? dateMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "") : "";

    const title = get("title");
    if (!title) return null;

    const encUrl = get("encArticleUrl") || get("encGzhUrl");
    const url = encUrl
      ? `https://weixin.sogou.com${encUrl}`
      : "";

    return {
      title,
      url,
      date: date.trim(),
      source: get("sourcename"),
      summary: get("content168") || get("content68") || get("content50") || "",
      headImage: get("imglink") || get("headimage") || "",
    };
  }

  /** Parse Chinese date strings like "2026-3-25" or "2026年3月25日" to Unix ms. */
  private parseDate(dateStr: string): number {
    if (!dateStr) return 0;
    // Normalize: "2026-3-25" or "2026年3月25日"
    const cleaned = dateStr.replace(/[年月]/g, "-").replace(/日/g, "");
    const parsed = Date.parse(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  private toSearchItem(item: ParsedItem): SearchResult["results"][number] {
    return {
      title: sanitize(item.title),
      url: item.url || `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(item.title)}`,
      description: sanitize(item.summary),
      published: item.date || undefined,
      author: item.source || undefined,
      siteName: item.source ? `${item.source} (微信公众号)` : "微信公众号",
    };
  }
}

interface ParsedItem {
  title: string;
  url: string;
  date: string;
  source: string;
  summary: string;
  headImage: string;
}

interface WeixinResponse {
  totalPages: number;
  page: number;
  items: string[];
}
