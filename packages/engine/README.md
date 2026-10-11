# Codes Doctor engine

- English: this document
- 日本語: [README.ja.md](README.ja.md)

The analysis engine behind the [Codes Doctor VS Code extension](../vscode) and the [`codes-doctor` CLI](../cli). It analyzes a folder and writes a self-contained HTML report: God Classes, technical debt, security findings, dependency and call graphs, architecture layers, an AST view, and an SBOM with a dependency vulnerability scan. It runs in-process; there is no server.

Supported languages: TypeScript/JavaScript and PHP (full AST), and Python, Go, Swift, C#, Java, Kotlin, Rust, C++ and Dart (lightweight structural scan). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

> **Accuracy by language.** TypeScript/JavaScript and PHP are the primary languages: they are parsed by dedicated full parsers and are the most thoroughly tested. Python, Go, Java, C#, Rust and C++ are parsed into a syntax tree with Tree-sitter, so their structure (classes, methods, functions, imports) is reliable, and the security scan ignores comments, plain strings and calls made only with constant arguments. In these languages and in TypeScript/JavaScript and PHP, the engine also follows user input within each function to dangerous calls: findings with a traced path are labelled "Input reaches", and pattern matches without one are lowered to Low and labelled "Needs review". Input passed through other functions is not followed yet, so some findings are still missed or only marked for review. Swift, Kotlin and Dart still use a lightweight structural scan and produce more false positives and missed findings. Findings in test code are listed with a "Test code" label and do not lower the security score. Treat results as leads to review, not verdicts.

## Build

```bash
npm install
npm run build
```

The build produces:

| Output | Contents |
| --- | --- |
| `dist/` | The engine, with a Japanese report |
| `dist-en/` | The same engine with an English report, generated from `dist/` using `locales/report-en.json`. A Japanese fragment without a translation fails the build. |
| `assets/report-libraries/` | Chart.js, Mermaid, marked (with DOMPurify) and D3, bundled and embedded into every report so it opens offline |

## API

```ts
import { analyzeRepository } from './dist'; // or './dist-en' for English reports

const { reportPath, result } = await analyzeRepository('/path/to/repo', 'auto', '/path/to/output', {
  generatorVersion: 'my-tool 1.0.0',
});
console.log(result.technicalDebt?.overallScore, result.securityScore?.overallScore);
```

| Export | Purpose |
| --- | --- |
| `analyzeRepository(path, language, outputDir?, reportOptions?)` | Analyze a folder, write `<analysisId>.html` and the LLM context files, and return the result |
| `analyzePathRequest(...)` | The same, returning only the report location |
| `analyzeLlmRequest(config, body)` | Run an LLM review or AI coding prompt for a saved analysis and write it into its report |
| `listLlmModels(provider, apiKey)` / `getSavedLlmResult(...)` | Live model list; saved LLM results |
| `ANALYSIS_LANGUAGES`, `toAnalysisLanguage(value)` | Valid `language` values (`auto`, `typescript`, `javascript`, `php`, …) and their validation |
| `LLM_FOCUS` | Focus IDs of the three LLM modes |

## Configuration

`getConfig()` reads these environment variables; callers can also pass a config object to `analyzeLlmRequest`.

| Variable | Default | Description |
| --- | --- | --- |
| `CSAP_LLM_ENABLED` | `false` | Allow LLM calls with the server-side API key (a key passed with a request is always allowed) |
| `CSAP_LLM_PROVIDER` | `openai` | `openai` or `anthropic` |
| `CSAP_LLM_MODEL` / `CSAP_LLM_AST_MODEL` | `gpt-5.4` / `gpt-5.3-chat` | Models for the full and AST-only reviews |
| `CSAP_LLM_MAX_TOKENS` / `CSAP_LLM_AST_MAX_TOKENS` | `3000` / `4000` | Output token limits |
| `CSAP_LLM_TEMPERATURE` | `0.2` | Sampling temperature |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | — | Server-side API keys |
| `CSAP_PHP_ENABLED` | `true` | Analyze PHP |
| `CSAP_OUTPUT_DIR` | `<cwd>/output` | Default report folder |

Model names change over time; `listLlmModels` returns the models a key can actually use.

## Reading the report

- **God score (0–100):** a weighted sum of method, line, import and property counts. 75+ is `critical`, 50–74 `high`, 25–49 `medium`, below that `low`.
- **Instability (0–1):** `fan-out / (fan-in + fan-out)`. Entry points are naturally unstable; that alone is not a design flaw.
- **Technical debt score (0–100):** A from 83, B from 70, C from 55, D from 40, otherwise F.
- **Security score (0–100):** A from 90, B from 80, C from 70, D from 60, otherwise F. Any critical finding caps the score at 59, high at 79, medium at 89.

The [User Guide](../vscode/docs/USER_GUIDE.md) explains every report tab.

## History

This engine started as the `csap` web server (ZIP upload, web UI, PDF export, Docker). The server was removed when the engine moved into this repository; its last version is tagged `engine-server-final`.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
