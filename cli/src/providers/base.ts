import type { SearchArgs, SearchResult, ProviderConfig, SearchProvider, SearchParam, SearchResultItem } from "../types.js";
import { resolveApiKey, getDefaultEnvVarName } from "../config.js";
import { sanitize, resolveSiteName } from "../normalize.js";

export abstract class BaseProvider implements SearchProvider {
  abstract id: string;
  abstract label: string;
  abstract hint: string;
  abstract requiresCredential: boolean;
  abstract envVars: string[];
  abstract autoDetectOrder: number;
  abstract supportedParams: SearchParam[];

  abstract execute(args: SearchArgs, config: ProviderConfig): Promise<SearchResult>;

  protected getApiKey(config: ProviderConfig): string | undefined {
    return resolveApiKey(this.id, config);
  }

  protected missingKeyError(): Error {
    const envName = getDefaultEnvVarName(this.id);
    return new Error(
      `The ${this.label} provider requires an API key. Set it via config (apiKey/apiKeyEnv) or environment variable ${envName}.`,
    );
  }

  protected requireApiKey(config: ProviderConfig): string {
    const key = this.getApiKey(config);
    if (!key) throw this.missingKeyError();
    return key;
  }

  protected mapResult(
    title?: string,
    url?: string,
    description?: string,
    published?: string,
    author?: string,
  ): SearchResultItem {
    return {
      title: sanitize(title ?? ""),
      url: url ?? "",
      description: sanitize(description ?? ""),
      published: published ?? undefined,
      author: author ?? undefined,
      siteName: resolveSiteName(url),
    };
  }

  protected async throwOnHttpError(response: Response): Promise<void> {
    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`${this.label} API error (${response.status}): ${detail}`);
    }
  }
}
