import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HyperSearchConfig, ProviderConfig } from "./types.js";

const CONFIG_DIR = process.env.HYPER_SEARCH_CONFIG_DIR ?? join(homedir(), ".config", "hyper-search");
const CONFIG_PATH = process.env.HYPER_SEARCH_CONFIG ?? join(CONFIG_DIR, "config.yaml");

export function resolveConfigPath(): string {
  return CONFIG_PATH;
}

export function getDefaultEnvVarName(providerId: string): string {
  return `HYPER_SEARCH_${providerId.toUpperCase().replace(/-/g, "_")}_API_KEY`;
}

export function ensureConfigDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

export function loadConfig(): HyperSearchConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return parseYaml(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { providers: {} };
    }
    throw err;
  }
}

export function saveConfig(config: HyperSearchConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, stringifyYaml(config), "utf-8");
}

export function resolveApiKey(providerId: string, config: ProviderConfig): string | undefined {
  if (config.apiKey && !config.apiKey.startsWith("${")) {
    return config.apiKey;
  }
  if (config.apiKeyEnv) {
    const val = process.env[config.apiKeyEnv];
    if (val) return val;
  }
  const defaultEnv = getDefaultEnvVarName(providerId);
  if (process.env[defaultEnv]) {
    return process.env[defaultEnv];
  }
  if (config.apiKey?.startsWith("${") && config.apiKey.endsWith("}")) {
    const envName = config.apiKey.slice(2, -1);
    const val = process.env[envName];
    if (val) return val;
  }
  return undefined;
}

export function isProviderConfigured(providerId: string, config: ProviderConfig, requiresCredential = true): boolean {
  if (config.enabled === false) return false;
  if (!requiresCredential) return true;
  const key = resolveApiKey(providerId, config);
  return !!key;
}

// Minimal YAML parser for our config shape
const YAML_LINE_RE = /^(\s*)(\w+):\s*(.*)$/;

function parseYaml(raw: string): HyperSearchConfig {
  const lines = raw.split("\n");
  const result: HyperSearchConfig = { providers: {} };
  let currentProvider: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = line.match(YAML_LINE_RE);
    if (!match) continue;

    const [, spaces, key, value] = match;
    const depth = spaces.length;

    if (depth === 0 && key === "providers") {
      continue;
    }
    if (depth === 2 && key) {
      currentProvider = key;
      result.providers[currentProvider] = {};
      continue;
    }
    if (depth === 4 && currentProvider) {
      const providerConfig = result.providers[currentProvider];
      if (value === "true" || value === "false") {
        providerConfig[key] = value === "true";
      } else if (value === "" && (key === "apiKey" || key === "apiKeyEnv" || key === "baseUrl")) {
        providerConfig[key] = undefined;
      } else {
        providerConfig[key] = stripQuotes(value);
      }
    }
    if (depth === 2 && key === "defaults") {
      result.defaults = {};
    }
    if (depth === 4 && result.defaults && !currentProvider) {
      if (key === "count" || key === "cacheTtlMinutes" || key === "timeoutSeconds") {
        (result.defaults as Record<string, unknown>)[key] = Number(value) || undefined;
      } else {
        (result.defaults as Record<string, unknown>)[key] = value;
      }
    }
  }
  return result;
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

// Minimal YAML stringifier
function stringifyYaml(config: HyperSearchConfig): string {
  const lines: string[] = ["providers:"];
  for (const [id, provider] of Object.entries(config.providers)) {
    lines.push(`  ${id}:`);
    if (provider.enabled !== undefined) lines.push(`    enabled: ${provider.enabled}`);
    if (provider.apiKey !== undefined) lines.push(`    apiKey: "${provider.apiKey}"`);
    if (provider.apiKeyEnv !== undefined) lines.push(`    apiKeyEnv: "${provider.apiKeyEnv}"`);
    if (provider.baseUrl !== undefined) lines.push(`    baseUrl: "${provider.baseUrl}"`);
  }
  if (config.defaults) {
    lines.push("defaults:");
    for (const [key, value] of Object.entries(config.defaults)) {
      if (value !== undefined) lines.push(`  ${key}: ${value}`);
    }
  }
  return lines.join("\n") + "\n";
}
