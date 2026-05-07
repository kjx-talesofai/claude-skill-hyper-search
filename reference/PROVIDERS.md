# Provider Selection Guide

## Benchmark summary

Measured across two queries (fandom + current events, 5 results each):

| Provider | Avg Latency | Avg Tokens | Avg Description | Published | Author | Best For |
|----------|------------|-----------|-----------------|-----------|--------|----------|
| **SerpAPI** | ~340ms | ~514 | ~144 chars | 50% | — | Speed, geo-targeting, general use |
| **Firecrawl** | ~1450ms | ~364 | ~147 chars | — | — | Minimal context, quick lookups |
| **DuckDuckGo** | ~1115ms | ~473 | ~211 chars | — | — | Free fallback, no API key |
| **Tavily** | ~3545ms | ~785 | ~458 chars | — | — | AI-optimized snippets, news |
| **Exa** | ~1827ms | ~1490 | ~1014 chars | 80% | 50% | Research, deep context, rich metadata |

*Token estimate: ~4 characters per token. Payload includes titles, URLs, descriptions, and metadata.*

## Selection guidance

### Default / reliable: SerpAPI
Fastest provider (~340ms). Good descriptions, decent metadata (published dates on ~50% of results). Supports country, language, date range, and domain filters via `site:` syntax. Best general-purpose choice when configured.

### Research / deep context: Exa
Highest token cost (~1490 tokens) but richest output. Highlights-first descriptions (~1000 chars), published dates (80% of results), and authors (50%). Best for research, fact-checking, and any task where context depth matters more than token budget.

### Token-constrained: Firecrawl or DuckDuckGo
- **Firecrawl** (~360 tokens): Shortest descriptions, requires API key
- **DuckDuckGo** (~470 tokens, free): Slightly longer descriptions, no key needed. Best zero-cost fallback.

Use these when context window is tight or the user only needs links + brief snippets.

### Current events / news: Tavily or Exa
- **Tavily**: AI-optimized snippets, supports `freshness` and `domainFilter`. Good for quick news summaries.
- **Exa**: Richer excerpts with dates. Use with `--freshness week` or `--freshness day` for time-sensitive queries.

### Free / no-key: DuckDuckGo
Always available. HTML-scraped results. Descriptions are present but shorter and less structured than API providers. Use as fallback when all API providers fail.

## Parameter support matrix

| Parameter | Tavily | Exa | Firecrawl | SerpAPI | DuckDuckGo |
|-----------|--------|-----|-----------|---------|------------|
| `query` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `count` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `freshness` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `dateAfter` | — | ✓ | — | ✓ | — |
| `dateBefore` | — | ✓ | — | ✓ | — |
| `domainFilter` | ✓ | ✓ | — | ✓ | — |
| `country` | — | — | — | ✓ | ✓ |
| `language` | — | — | — | ✓ | ✓ |
| `maxTokensPerPage` | — | ✓ | — | — | — |

## Fallback order

When no provider is specified, the engine tries configured providers in priority order. The first configured provider is used; on failure, the next is tried automatically. DuckDuckGo is the ultimate free fallback.
