import type { SearchArgs, SearchProvider, SearchResult, HyperSearchConfig, Cache } from "./types.js";
import { isProviderConfigured } from "./config.js";
import { MemoryCache, resolveCacheTtlMs } from "./cache.js";
import { buildCacheKey, resolveSearchCount } from "./schema.js";

const NO_PROVIDERS_ERROR = "No search providers are configured. Run 'hyper-search setup' to configure one.";

export class SearchEngine {
  private providers = new Map<string, SearchProvider>();
  private cache: Cache;
  private config: HyperSearchConfig;
  private ttlMs: number;
  private configuredProviders: SearchProvider[] | undefined;

  constructor(config: HyperSearchConfig, cache?: Cache) {
    this.config = config;
    this.cache = cache ?? new MemoryCache();
    this.ttlMs = resolveCacheTtlMs(config.defaults?.cacheTtlMinutes);
  }

  register(provider: SearchProvider): void {
    this.providers.set(provider.id, provider);
    this.configuredProviders = undefined;
  }

  listProviders(): Array<{
    id: string;
    label: string;
    hint: string;
    configured: boolean;
    requiresCredential: boolean;
    supportedParams: string[];
  }> {
    return Array.from(this.providers.values()).map(p => ({
      id: p.id,
      label: p.label,
      hint: p.hint,
      configured: isProviderConfigured(p.id, this.config.providers[p.id] ?? {}, p.requiresCredential),
      requiresCredential: p.requiresCredential,
      supportedParams: p.supportedParams,
    }));
  }

  private getConfiguredProviders(): SearchProvider[] {
    if (!this.configuredProviders) {
      this.configuredProviders = Array.from(this.providers.values())
        .filter(p => p.autoDetect !== false)
        .filter(p => isProviderConfigured(p.id, this.config.providers[p.id] ?? {}, p.requiresCredential))
        .sort((a, b) => (a.autoDetectOrder ?? 999) - (b.autoDetectOrder ?? 999));
    }
    return this.configuredProviders;
  }

  private resolveProviderId(explicit?: string): string {
    if (explicit) {
      if (this.providers.has(explicit)) return explicit;
      throw new Error(`Unknown provider "${explicit}".`);
    }

    const configured = this.getConfiguredProviders();
    const preferred = configured.find(p => p.requiresCredential) ?? configured.find(p => !p.requiresCredential);
    if (preferred) return preferred.id;

    throw new Error(NO_PROVIDERS_ERROR);
  }

  async search(args: SearchArgs): Promise<SearchResult> {
    const providerId = this.resolveProviderId(args.provider);
    const provider = this.providers.get(providerId)!;
    return this.searchWithProvider(provider, args);
  }

  private async searchWithProvider(provider: SearchProvider, args: SearchArgs): Promise<SearchResult> {
    const count = resolveSearchCount(args.count, this.config.defaults?.count);
    const searchArgs = { ...args, count, provider: provider.id };

    const cacheKey = buildCacheKey(provider.id, searchArgs);
    const ttlMs = this.ttlMs;

    const cached = this.cache.get<SearchResult>(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    const providerConfig = this.config.providers[provider.id] ?? {};
    const start = Date.now();
    const result = await provider.execute(searchArgs, providerConfig);
    result.tookMs = Date.now() - start;
    this.cache.set(cacheKey, result, ttlMs);
    return result;
  }

  async searchWithFallback(args: SearchArgs): Promise<SearchResult> {
    const candidates = this.getConfiguredProviders();
    if (candidates.length === 0) {
      throw new Error(NO_PROVIDERS_ERROR);
    }

    const explicit = args.provider;
    if (explicit) {
      return this.search(args);
    }

    let lastError: unknown;
    for (const provider of candidates) {
      try {
        return await this.searchWithProvider(provider, { ...args, provider: provider.id });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
