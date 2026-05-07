export interface SearchArgs {
  query: string;
  count?: number;
  provider?: string;
  country?: string;
  language?: string;
  freshness?: string;
  dateAfter?: string;
  dateBefore?: string;
  searchLang?: string;
  uiLang?: string;
  domainFilter?: string[];
  maxTokens?: number;
  maxTokensPerPage?: number;
  signal?: AbortSignal;
}

export interface SearchResult {
  query: string;
  provider: string;
  count: number;
  tookMs?: number;
  results: SearchResultItem[];
  answer?: string;
  citations?: Citation[];
  cached?: boolean;
}

export interface SearchResultItem {
  title: string;
  url: string;
  description: string;
  published?: string;
  author?: string;
  siteName?: string;
}

export interface Citation {
  number: number;
  title: string;
  url: string;
  siteName?: string;
}

export interface ProviderConfig {
  enabled?: boolean;
  apiKey?: string;
  apiKeyEnv?: string;
  baseUrl?: string;
  [key: string]: unknown;
}

export interface HyperSearchConfig {
  providers: Record<string, ProviderConfig>;
  defaults?: {
    provider?: string;
    count?: number;
    cacheTtlMinutes?: number;
    timeoutSeconds?: number;
  };
}

export interface SearchProvider {
  id: string;
  label: string;
  hint: string;
  requiresCredential: boolean;
  envVars: string[];
  autoDetectOrder: number;
  supportedParams: SearchParam[];
  execute(args: SearchArgs, config: ProviderConfig): Promise<SearchResult>;
}

export type SearchParam =
  | "query"
  | "count"
  | "country"
  | "language"
  | "freshness"
  | "dateAfter"
  | "dateBefore"
  | "searchLang"
  | "uiLang"
  | "domainFilter"
  | "maxTokens"
  | "maxTokensPerPage";

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface Cache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
}

export interface EngineOptions {
  config: HyperSearchConfig;
  cache?: Cache;
  preferRuntimeProviders?: boolean;
  providerId?: string;
}
