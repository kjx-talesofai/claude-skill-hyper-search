import type { SearchResult, SearchResultItem } from "./types.js";

const LLM_SPECIAL_TOKENS = [
  "<|im_start|>", "<|im_end|>", "<|endoftext|>",
  "<|begin_of_text|>", "<|end_of_text|>", "<|start_header_id|>",
  "<|end_header_id|>", "<|eot_id|>", "<|python_tag|>", "<|eom_id|>",
  "<|fim_prefix|>", "<|fim_middle|>", "<|fim_suffix|>", "<|fim_pad|>",
];

const LLM_TOKEN_RE = new RegExp(
  LLM_SPECIAL_TOKENS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "g",
);

export function escapeLlmTokens(text: string): string {
  if (!text.includes("<|")) return text;
  return text.replace(LLM_TOKEN_RE, "");
}

export function stripHtml(text: string): string {
  if (!text.includes("<")) return text.trim();
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitize(text: string): string {
  return escapeLlmTokens(stripMarkdownLinks(stripHtml(text)));
}

function stripMarkdownLinks(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveSiteName(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function normalizeUrl(url: string): string {
  return url.split("#")[0].replace(/\/$/, "");
}

export function renderResultMarkdown(result: SearchResult, unsupportedWarning?: string): string {
  const lines: string[] = [];

  if (unsupportedWarning) {
    lines.push(unsupportedWarning);
  }

  if (result.answer) {
    lines.push(`## Answer`);
    lines.push("");
    lines.push(escapeLlmTokens(result.answer));
    lines.push("");
    if (result.citations && result.citations.length > 0) {
      lines.push("### Sources");
      lines.push("");
      for (const c of result.citations) {
        const site = c.siteName ? ` — ${c.siteName}` : "";
        lines.push(`${c.number}. [${c.title}](${c.url})${site}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  lines.push(`## Search Results for "${result.query}"`);
  if (result.provider) {
    lines.push(`*Provider: ${result.provider}${result.cached ? " (cached)" : ""}*`);
  }
  lines.push("");

  for (let i = 0; i < result.results.length; i++) {
    const item = result.results[i];
    lines.push(renderItemMarkdown(i + 1, item));
    lines.push("");
  }

  if (result.results.length === 0) {
    lines.push("*No results found.*");
  }

  return lines.join("\n");
}

function renderItemMarkdown(index: number, item: SearchResultItem): string {
  const published = item.published ? ` | **Published:** ${item.published}` : "";
  const author = item.author ? ` | **Author:** ${item.author}` : "";
  const description = sanitize(item.description);

  return [
    `### ${index}. [${sanitize(item.title)}](${item.url})`,
    `**Source:** ${item.siteName ?? resolveSiteName(item.url) ?? "unknown"}${published}${author}`,
    description,
  ].join("\n");
}
