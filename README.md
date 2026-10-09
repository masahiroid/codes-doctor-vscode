# 🩺 Code Doctor

- English: [README.md](README.md)
- 日本語: [README.ja.md](README.ja.md)

Code Doctor automatically diagnoses a codebase's structure and visualizes the results as a self-contained HTML report. It finds God Classes, technical debt, security issues, and dependency problems using consistent metrics across languages.

## Features

### Core
- ✅ **Automatic language detection** — TypeScript/JavaScript, PHP, Dart, and Python
- ✅ **God Class detection** — scores classes 0–100 from method count, line count, coupling, and complexity
- ✅ **Dependency graph visualization** — interactive diagrams via Mermaid.js / D3.js
- ✅ **Call graph analysis** — tracks function/method calls (TypeScript/JavaScript, PHP)
- ✅ **Self-contained HTML report** — a single file, easy to share and archive
- ✅ **Web UI** — upload a ZIP or point at a local folder and analyze immediately

### Advanced
- ✅ **Module metrics** — fan-in/fan-out, instability, structural score
- ✅ **Circular dependency detection** — DFS-based cycle detection
- ✅ **Technical debt score** — combines complexity, maintainability, and circular deps (A–F grade)
- ✅ **Security score** — language-specific patterns for eval/exec, command injection, hardcoded credentials, and more
- ✅ **Architecture layer analysis** — infers layers from directory structure and renders a dependency heatmap
- ✅ **SBOM generation** — CycloneDX / SPDX format
- ✅ **Vulnerability scanning** — Trivy (when available) or npm audit over dependencies
- ✅ **LLM analysis (optional)** — generates a structural review via the OpenAI API

## Supported Languages

| Language | Extensions | God Class | Technical Debt | Security | Call Graph |
|----------|-----------|-----------|-----------------|----------|------------|
| TypeScript / JavaScript | `.ts` `.tsx` `.js` `.jsx` | ✅ | ✅ | ✅ | ✅ |
| PHP | `.php` | ✅ | ✅ | ✅ | ✅ |
| Python | `.py` | ✅ | ✅ | ✅ | — |
| Dart | `.dart` | ✅ | ✅ | — | — |

Dependency graphs, circular dependency detection, layer analysis, and SBOM/vulnerability scanning are **language-agnostic** — they run across every supported file regardless of language.

## Prerequisites

- Node.js 18+
- npm

## Quick Start

```bash
git clone <this repo's URL>
cd csap-main

npm install
npm run build
npm run dev
# open http://localhost:3000
```

## Usage

### Web UI
1. Start the server with `npm run dev`
2. Open `http://localhost:3000` in a browser
3. Pick a language mode (auto-detect is usually fine)
4. Upload a ZIP file, or enter the absolute path of a local folder the server can read
5. Review the generated HTML report

### Docker

```bash
docker build -t code-doctor:latest .
docker run -p 3000:3000 \
  -e CSAP_LLM_ENABLED=true \
  -e OPENAI_API_KEY=sk-proj-xxx... \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/output:/app/output \
  code-doctor:latest
```

### docker-compose (for production use)

```bash
cp .env.example .env   # edit OPENAI_API_KEY
docker-compose up -d
docker-compose logs -f csap
docker-compose down
```

### CLI

```bash
npx ts-node scripts/test-run.ts /path/to/your/repo
# report at: ./output/<analysisId>.html
```

### API

```bash
# Upload a ZIP file to analyze
curl -X POST http://localhost:3000/api/upload \
  -F "file=@/path/to/repo.zip"

# Analyze a local folder directly
curl -X POST http://localhost:3000/api/analyze-path \
  -H "Content-Type: application/json" \
  -d '{"repoPath":"/absolute/path/to/repo","language":"auto"}'

# Health check
curl http://localhost:3000/api/health

# Fetch a report
curl http://localhost:3000/reports/<analysisId>
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Web UI |
| POST | `/api/upload` | Upload a ZIP and start analysis |
| POST | `/api/analyze-path` | Analyze a local folder the server can read |
| GET | `/api/health` | Health check |
| GET | `/reports/:analysisId` | Fetch the HTML report |
| GET | `/reports/:analysisId/pdf` | Fetch a PDF report (via Puppeteer) |
| POST | `/api/llm/analyze` | Run an LLM structural review (requires `CSAP_LLM_ENABLED=true`) |
| GET | `/api/llm/result/:analysisId/:focus` | Fetch a saved LLM result |
| POST | `/api/llm/models` | Fetch the live model list for a provider, given an API key (`{ "provider": "openai"\|"anthropic", "apiKey": "..." }`) |

The language parameter (`?language=` query param, or `language` in the request body) accepts `auto`, `typescript`, `javascript`, `php`, `dart`, or `python`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `NODE_ENV` | `development` | Runtime environment |
| `CSAP_LLM_ENABLED` | `false` | Enable LLM analysis |
| `CSAP_LLM_PROVIDER` | `openai` | LLM provider: `openai` or `anthropic` |
| `CSAP_LLM_MODEL` | `gpt-5.4` | Model ID for full analysis (see "Choosing a model" below) |
| `CSAP_LLM_AST_MODEL` | `gpt-5.3-chat` | Model ID for AST-only analysis |
| `CSAP_LLM_MAX_TOKENS` | `3000` | Max output tokens for full analysis |
| `CSAP_LLM_AST_MAX_TOKENS` | `4000` | Max output tokens for AST-only analysis |
| `CSAP_LLM_TEMPERATURE` | `0.2` | LLM temperature |
| `OPENAI_API_KEY` | — | OpenAI API key (required when `CSAP_LLM_PROVIDER=openai`) |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (required when `CSAP_LLM_PROVIDER=anthropic`) |
| `CSAP_PHP_ENABLED` | `true` | Enable PHP analysis |
| `CSAP_MAX_FILE_SIZE` | `524288000` | Max upload size in bytes |
| `CSAP_UPLOADS_DIR` | `<cwd>/uploads` | Where uploaded ZIPs are stored |
| `CSAP_TEMP_DIR` | `<cwd>/temp` | Where extracted repos are stored |
| `CSAP_OUTPUT_DIR` | `<cwd>/output` | Where generated reports are stored |

### Choosing a Model

Model names change over time, so rather than guessing a model ID, call `POST /api/llm/models` with your provider and API key to get the live list your key can actually access, then set `CSAP_LLM_MODEL`/`CSAP_LLM_AST_MODEL` to one of the returned IDs:

```bash
curl -X POST http://localhost:3000/api/llm/models \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","apiKey":"sk-proj-xxx..."}'
```

The VS Code extension's Dashboard does this for you with a "Fetch" button next to the model dropdown.

## Reading the Report

The generated HTML report is organized top to bottom as:

1. **Overview** — summary cards for total files, total classes, average God score, and the technical debt/security score headlines
2. **God Class Ranking** — the highest-scoring classes, with a score-distribution histogram. Ranked `critical` / `high` / `medium` / `low`
3. **Module Coupling Metrics** — a fan-in/fan-out scatter plot and structural scores. "Lightweight entrypoints" (bootstrap scripts, etc.) are called out separately since their natural instability isn't a design problem
4. **Technical Debt / Security Score** — an A–F grade plus a breakdown of the issues behind it
5. **Dependency Graph / Call Graph** — diagrams of inter-module references and call relationships, with circular dependencies highlighted
6. **Architecture Layer Analysis** — a dependency heatmap across layers inferred from directory structure
7. **SBOM / Vulnerability Scan** — the dependency inventory and any known vulnerabilities
8. **AST Structure** — a tree view of sampled files' structure (imports/classes/functions). When `CSAP_LLM_ENABLED=true`, this section can also request an LLM code-design review

How to read the key metrics:

- **God score (0–100)**: a weighted sum of method count, line count, import count, and property count. 75+ is `critical` (consider splitting the class first), 50–74 is `high`, 25–49 is `medium`, below that is `low`
- **Instability (0–1)**: `fan-out / (fan-in + fan-out)`. Closer to 1 means "depends on many things, is depended on by few." Entrypoints are naturally unstable by this measure — that alone isn't a design flaw
- **Technical Debt / Security score (0–100, A–F)**: 90+ is A, 80+ is B, 70+ is C, 60+ is D, below that is F. The explanation text in the report breaks down how many critical/high issues drove the score

## VS Code Extension "Code Doctor"

`vscode-extension/csap-analyzer` ships a VS Code extension that analyzes the open workspace directly. The analysis engine is bundled inside the extension, so you don't need to run this repo's server separately.

```bash
npm run build   # from this repo's root
cd vscode-extension/csap-analyzer
npm install
npm run package  # produces code-doctor-<version>.vsix
```

See [vscode-extension/csap-analyzer/README.md](vscode-extension/csap-analyzer/README.md) for details.

## Documentation

| Document | Contents |
|----------|----------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, analysis pipeline, and per-language implementation details |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Full request/response spec for every API endpoint |

## Troubleshooting

**`Cannot find module '@typescript-eslint/typescript-estree'`**
```bash
npm install
npm run build
```

**Docker: port already in use**
```bash
docker run -p 3001:3000 code-doctor:latest
```

**Upload fails with a 413 error**
You've exceeded `CSAP_MAX_FILE_SIZE` (default 500MB). Raise it via the environment variable.

**Report doesn't show up**
```bash
ls -la output/
curl http://localhost:3000/reports/<analysisId>
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).

## Contributing

Please open an issue or pull request with improvement proposals.

## References

- [TypeScript ESTree](https://github.com/typescript-eslint/typescript-eslint/tree/main/packages/typescript-estree)
- [php-parser](https://github.com/glayzzle/php-parser)
- [Mermaid.js](https://mermaid.js.org/)
- [D3.js](https://d3js.org/)
- [Express.js](https://expressjs.com/)
# code-doctor
