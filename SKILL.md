---
name: hyper-search
description: "Web search across multiple providers with auto-fallback. Triggers: search web, look up, verify."
---

# Hyper Search

Unified web search across Tavily, Exa, Firecrawl, SerpAPI, and DuckDuckGo. Auto-detects the best available provider and falls back on failure.

Use the bundled CLI at `scripts/cli.js`. The `cli/` directory contains TypeScript source code — do not read or use it unless you are developing this skill.

## Quick start

```bash
node scripts/cli.js search "your query"
```

If no providers are configured, run setup first:

```bash
node scripts/cli.js setup
```

## Provider selection

Each provider has different strengths — speed, token efficiency, metadata richness. See [reference/PROVIDERS.md](reference/PROVIDERS.md) for a full comparison and selection guide.

Quick defaults:
- **Fastest / general use:** SerpAPI (~300ms)
- **Rich research context:** Exa (~1500 tokens, dates + authors)
- **Token-constrained:** Firecrawl (~360 tokens) or DuckDuckGo (free, no key)
- **Current events:** Tavily or Exa with `--freshness`
- **WeChat articles:** `weixin-search` — 搜狗微信搜索，免费无需 key，返回公众号文章标题、日期、来源、摘要

## Common patterns

**Search with specific provider:**
```bash
node scripts/cli.js search "query" --provider exa --count 5
```

**Multi-provider blend (broader coverage):**
```bash
node scripts/cli.js multi "query" --providers exa,tavily,serpapi --count 5
```

**Fresh results only:**
```bash
node scripts/cli.js search "query" --freshness week
```

**Domain-restricted search:**
```bash
node scripts/cli.js search "query" --domain-filter nytimes.com,bbc.com
```

## Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `--provider <id>` | Provider to use | `exa`, `tavily`, `serpapi`, `firecrawl`, `duckduckgo`, `weixin-search` |
| `--count <n>` | Number of results (1–10, default 5) | `--count 5` |
| `--freshness <period>` | day, week, month, or year | `--freshness week` |
| `--date-after <date>` | YYYY-MM-DD | `--date-after 2024-01-01` |
| `--date-before <date>` | YYYY-MM-DD | `--date-before 2024-12-31` |
| `--domain-filter <list>` | Comma-separated domains | `--domain-filter github.com` |
| `--country <code>` | 2-letter country code | `--country us` |
| `--language <code>` | ISO language code | `--language en` |

Not all providers support all parameters. See [reference/PROVIDERS.md](reference/PROVIDERS.md) for the support matrix.

## Multi-provider search

Use `multi` to run the same query across several providers and interleave results round-robin. This increases coverage and reduces single-provider blind spots.

```bash
node scripts/cli.js multi "iran strait current situation" --providers exa,tavily,serpapi --count 5
```

Results are deduplicated by URL and blended round-robin (provider A #1, provider B #1, provider A #2, etc.).

Best combinations:
- **Research:** `exa,serpapi` — rich context + speed
- **News/current events:** `tavily,exa,serpapi` — freshness + depth + coverage
- **Token budget:** `firecrawl,duckduckgo` — minimal context, zero cost

## WeChat article search + fetch

The `weixin-search` provider searches WeChat Official Account (微信公众号) articles via Sogou.
Results include Sogou redirect links (`weixin.sogou.com/link?url=...`).

If the sandbox encounters rate-limiting, set `MEDIA_FETCH_PROXY_URL` to route through a proxy.

**Client-side sorting:** Sogou API returns results in non-deterministic order. When
`--freshness`, `--date-after`, or `--date-before` is specified, results are sorted by
date descending (newest first) on the client side.

**To fetch full article content from a Sogou link, use the media-fetcher skill**
(install from [kjx-talesofai/claude-skill-media-fetcher](https://github.com/kjx-talesofai/claude-skill-media-fetcher)):

```bash
# Step 1: Search
node scripts/cli.js search "上海 网络 通知" --provider weixin-search --count 3 --freshness month

# Step 2: Fetch (if media-fetcher installed)
python3 path/to/media-fetcher/scripts/fetch.py "https://weixin.sogou.com/link?url=..."
```

The media-fetcher wechat adapter will:
1. Search Sogou to establish session
2. Click the article link → follow redirect
3. Extract real WeChat URL → fetch full content
4. Return: title, author, text, images

This is a one-step operation from the caller's perspective — just pass the Sogou link to media-fetcher.

## Scripts

For deterministic operations with JSON output:

```bash
bash scripts/search.sh "your query" [provider] [count]
```

## Troubleshooting

**No providers configured**
Run `node scripts/cli.js setup` to configure API keys interactively. Or set environment variables:
```bash
export HYPER_SEARCH_EXA_API_KEY="your-key"
export HYPER_SEARCH_TAVILY_API_KEY="your-key"
```

**All providers failed**
- Check network connectivity
- Verify API keys are valid and not rate-limited
- DuckDuckGo requires no key and works as a fallback

**Empty results**
- Try a broader query
- Use `multi` with multiple providers
- Check if `--freshness` or `--domain-filter` is overly restrictive

**Rate limits**
- SerpAPI and Tavily have strict rate limits on free tiers
- DuckDuckGo is free but may occasionally block automated requests
- Enable caching in config: `cacheTtlMinutes: 15`
