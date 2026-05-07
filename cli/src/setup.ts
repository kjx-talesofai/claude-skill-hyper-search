import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { loadConfig, saveConfig } from "./config.js";

function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function askYesNo(rl: ReturnType<typeof createInterface>, question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${question} (y/n) `, (answer) => {
      resolve(answer.trim().toLowerCase().startsWith("y"));
    });
  });
}

interface ProviderMeta {
  id: string;
  label: string;
  hint: string;
  requiresCredential: boolean;
  envVars: string[];
}

export async function runSetup(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
  console.log("hyper-search setup wizard\n");

  const config = loadConfig();

  const providers: ProviderMeta[] = [
    { id: "tavily", label: "Tavily", hint: "Structured snippets with depth control", requiresCredential: true, envVars: ["TAVILY_API_KEY"] },
    { id: "exa", label: "Exa", hint: "Neural search with content extraction", requiresCredential: true, envVars: ["EXA_API_KEY"] },
    { id: "firecrawl", label: "Firecrawl", hint: "Web search with content extraction", requiresCredential: true, envVars: ["FIRECRAWL_API_KEY"] },
    { id: "serpapi", label: "SerpAPI", hint: "Google search via SerpAPI", requiresCredential: true, envVars: ["SERPAPI_API_KEY"] },
    { id: "duckduckgo", label: "DuckDuckGo", hint: "Free, no API key needed (experimental)", requiresCredential: false, envVars: [] },
  ];

  for (const provider of providers) {
    const existing = config.providers[provider.id];
    const isEnabled = existing?.enabled !== false;

    console.log(`\n${provider.label}`);
    console.log(`  ${provider.hint}`);

    if (provider.requiresCredential) {
      const envValue = process.env[provider.envVars[0]];
      const hasKey = envValue || existing?.apiKey || existing?.apiKeyEnv;

      if (hasKey) {
        console.log(`  API key configured`);
      } else {
        const want = await askYesNo(rl, `  Enable ${provider.label}?`);
        if (!want) {
          config.providers[provider.id] = { enabled: false };
          continue;
        }

        const useEnv = await askYesNo(rl, `  Use env var ${provider.envVars[0]}?`);
        if (useEnv) {
          config.providers[provider.id] = { enabled: true, apiKey: `\${${provider.envVars[0]}}` };
        } else {
          const customEnv = await ask(rl, "  Enter custom env var name (or leave empty for inline): ");
          if (customEnv.trim()) {
            config.providers[provider.id] = { enabled: true, apiKeyEnv: customEnv.trim() };
          } else {
            const inline = await ask(rl, "  Enter API key (not recommended): ");
            config.providers[provider.id] = { enabled: true, apiKey: inline.trim() };
          }
        }
      }
    } else {
      if (!isEnabled) {
        const want = await askYesNo(rl, `  Enable ${provider.label}?`);
        config.providers[provider.id] = { enabled: want };
      } else {
        console.log(`  Enabled (no API key required)`);
        config.providers[provider.id] = { enabled: true };
      }
    }
  }

  console.log("\nDefaults:");
  const defaultCount = await ask(rl, "  Default result count (1-10) [5]: ");
  config.defaults = {
    count: Number.parseInt(defaultCount, 10) || 5,
  };

  saveConfig(config);
  console.log("\nConfig saved to ~/.config/hyper-search/config.yaml");
  } finally {
    rl.close();
  }
}
