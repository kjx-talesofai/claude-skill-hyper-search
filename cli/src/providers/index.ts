import { DuckDuckGoProvider } from "./duckduckgo.js";
import { ExaProvider } from "./exa.js";
import { FirecrawlProvider } from "./firecrawl.js";
import { SerpApiProvider } from "./serpapi.js";
import { TavilyProvider } from "./tavily.js";

export { DuckDuckGoProvider } from "./duckduckgo.js";
export { ExaProvider } from "./exa.js";
export { FirecrawlProvider } from "./firecrawl.js";
export { SerpApiProvider } from "./serpapi.js";
export { TavilyProvider } from "./tavily.js";

export const ALL_PROVIDERS = [
  new DuckDuckGoProvider(),
  new ExaProvider(),
  new FirecrawlProvider(),
  new SerpApiProvider(),
  new TavilyProvider(),
];
