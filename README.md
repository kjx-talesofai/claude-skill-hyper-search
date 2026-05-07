<p align="center">
  <img src="https://camo.githubusercontent.com/3e816c82f93843017c24bcc6cc25a3e8f6becd41c6435e39de4dbc11b0ca1485/68747470733a2f2f6173736574732e687970657273616d706c696e672e636f6d2f68797065722d73616d706c696e672d322e6a7067" alt="hyper-sampling" height="50"/>
  &nbsp;&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/kjx-talesofai/claude-skill-hypersampling/master/neta_logo.png" alt="neta.art" height="50"/>
</p>

# hyper-search

A Claude Code Agent Skill for unified web search across multiple providers (Tavily, Exa, Firecrawl, SerpAPI, DuckDuckGo) with automatic fallback and clean normalization.

## Why

Different search providers excel at different things. SerpAPI is fast, Exa is deep, DuckDuckGo is free. Rather than hardcoding one provider, hyper-search auto-detects the best available option and falls back automatically if it fails. It also normalizes all responses into clean, agent-readable markdown.

## Install as skill

**Global (personal):**
```bash
cp -r . ~/.claude/skills/hyper-search/
```

**Project-local:**
```bash
cp -r . .claude/skills/hyper-search/
```

The skill auto-triggers on search-related queries. No slash command needed.

## Quick use

```bash
# Search
node scripts/cli.js search "latest TypeScript features"

# Configure providers
node scripts/cli.js setup
```

For full usage, see `SKILL.md` (loaded by Claude when the skill triggers) and `reference/PROVIDERS.md`.

## Repo structure

```
.
├── SKILL.md              # Agent skill instructions
├── reference/
│   └── PROVIDERS.md      # Provider selection guide
├── scripts/
│   ├── cli.js            # Bundled CLI (self-contained)
│   ├── search.sh         # Bash wrapper
│   └── benchmark.mjs     # Provider benchmark
└── cli/                  # TypeScript source + build
    ├── src/
    ├── package.json
    └── tsconfig.json
```

## Development

Source code lives in `cli/`. The skill uses the bundled output at `scripts/cli.js`.

```bash
cd cli

# Install dependencies
npm install

# Build TypeScript to cli/dist/
npm run build

# Bundle into scripts/cli.js
npm run bundle
```

After editing `cli/src/`, run `npm run build && npm run bundle` to regenerate `scripts/cli.js`.

## Author

Built by [Jiaxin Kou](https://hypersampling.com) · [Neta Art](https://www.neta.art) · [GitHub](https://github.com/kjx-talesofai)

## License

MIT
