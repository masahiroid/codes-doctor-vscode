# Architecture

- English: this document
- 日本語: [ARCHITECTURE.ja.md](ARCHITECTURE.ja.md)

Last updated: 2026-10-11 (monorepo)

## Overview

The Codes Doctor engine (`packages/engine`) is a Node.js/TypeScript library that analyzes a codebase and generates a self-contained HTML audit report. The VS Code extension (`packages/vscode`) and the CLI (`packages/cli`) in the same repository copy its build output into their `vendor/` folders (`scripts/vendor-engine.mjs`) and call it in-process. The engine is used exactly as built; consumers do not patch it.

## System Components

```
src/
├── index.ts                 Public API
├── fileWalker.ts            Single-pass file listing grouped by extension
├── config.ts                Runtime configuration (env vars, feature flags)
├── types.ts                 Shared type definitions
├── analyzer/
│   ├── languages/
│   │   ├── catalog.ts       The language catalog — single source of truth for every language
│   │   └── analyzers/       One analyzer per catalog language (TS, PHP, generic lightweight)
│   ├── parsing/sourceText.ts  Shared text utilities: comment stripping, brace matching, line math
│   ├── languageDetector.ts  Counts files per source language in one directory walk
│   ├── runner.ts            Orchestrates one full analysis run
│   ├── pipeline/            Language stage, then global stages (graph, quality, supply chain)
│   ├── typescript/          TS/JS AST parsing, God Score, call graph
│   ├── php/                 PHP AST parsing, call graph
│   ├── bracelang/           Shared lightweight engine for brace-delimited languages
│   ├── swift/ csharp/ java/ kotlin/ cpp/   Per-language configs for the bracelang engine
│   ├── go/ rust/            Standalone lightweight parsers (methods live outside the type body)
│   ├── python/ dart/        Standalone lightweight parsers (indentation / Dart syntax)
│   ├── security/patterns.ts Security pattern families, one per language
│   ├── securityScore.ts     Security scan and scoring
│   ├── moduleMetrics.ts     Fan-in/fan-out, instability, structural score, cycles
│   ├── layerAnalysis.ts     Architecture layer detection and heatmap
│   ├── technicalDebt.ts     Technical debt scoring
│   ├── vulnerability/       Trivy / npm audit dependency scanning
│   └── sbom/                CycloneDX / SPDX export
├── graph/                   Mermaid and D3 diagram generation
├── report/
│   ├── htmlBuilder.ts       Page layout only
│   ├── sections/index.ts    Tab registry: which sections each report tab shows
│   ├── sections/            One module per report section
│   ├── sections/ast/        AST section: outline renderer, per-parser structure builders, batch size
│   ├── browser/             Scripts and libraries that run in the report page
│   ├── reviewElements.ts    Report element ID for each LLM mode
│   └── liveUpdate.ts        Writes a new LLM result into an already-saved report
├── llm/
│   ├── focus.ts             Focus IDs and LLM modes (review, AST-only, agent prompt)
│   ├── artifacts.ts         Reads/writes LLM context and result files
│   ├── context/             LLM context builders
│   └── openai/ providers/   Prompts and provider adapters (OpenAI, Anthropic)
└── services/                Entry points: repository analysis, LLM requests

scripts/
├── build-report-libraries.mjs  Bundles Chart.js, Mermaid, marked+DOMPurify and D3 into assets/
└── localize-en.mjs             Generates the English build (dist-en/) from dist/
```

## The Language Catalog

`analyzer/languages/catalog.ts` defines every supported language once:

- `SOURCE_LANGUAGES` — file-extension families found during detection (TypeScript and JavaScript are separate here), with display labels.
- `LANGUAGES` — analysis languages in pipeline order. Each entry declares its label, which source languages it parses, whether it uses a full AST or the lightweight parser, its security pattern family (if any), and how its dependencies feed the layer heatmap.
- `ANALYSIS_LANGUAGES` / `toAnalysisLanguage()` — the valid values of the "analysis language" option, and validation for untrusted input (query strings, settings). Unknown values are rejected.

Everything else is derived from the catalog: detection, the per-language analysis loop, security targets, layer sources, the file statistics table, the AST section, the AST-only LLM context, the web UI's language dropdown, and the "no supported files" banner. Per-concern tables that must handle each language (`LANGUAGE_ANALYZERS`, the AST structure builders, the LLM samplers) are typed as `Record<LanguageId, …>`, so adding a language to the catalog fails to compile until every table handles it.

### Adding a language

1. Add the extension family to `SOURCE_LANGUAGES` and the language to `LANGUAGES`.
2. Write a parser that returns `SimpleFileInfo[]`. For a brace-delimited language, add a `BraceLanguageConfig` for `analyzer/bracelang/engine.ts`.
3. Register it in `analyzer/languages/analyzers/index.ts` with `createSimpleAnalyzer`.
4. Add a security pattern family in `analyzer/security/patterns.ts` if the language has one.
5. Follow the compiler errors: the AST section and LLM sampler tables need an entry.

## Analysis Flow

1. `analyzeRepository(path, language, outputDir)` (`services/pathAnalysis.ts`) validates the folder and the `language` option (`toAnalysisLanguage()`).
2. `analyzer/languageDetector.ts` walks the folder once and groups files by source language.
3. `analyzer/pipeline/languageAnalysis.ts` loops over `LANGUAGES` and runs each language's analyzer, collecting parsed files (`AnalysisResult.files`, keyed by language ID), God Class candidates, and the call graph.
4. `analyzer/pipeline/globalAnalysis.ts` runs language-agnostic analysis across every file: dependency graph, module metrics, circular dependencies, technical debt, security score, layer heatmap.
5. `analyzer/pipeline/supplyChainAnalysis.ts` generates the SBOM and runs a vulnerability scan.
6. `report/htmlBuilder.ts` lays out the page; `report/sections/index.ts` decides which sections each tab shows.
7. The report is written to `<outputDir>/<analysisId>.html`, with the LLM context files next to it, and the result is returned to the caller.

## Build Output and Localization

`npm run build` produces `dist/` (Japanese report text), `dist-en/` and `assets/report-libraries/`. Report text is written in Japanese in the source; `scripts/localize-en.mjs` translates every Japanese fragment of every string literal from `locales/report-en.json` and fails on a missing fragment. Repository names, paths, source samples and LLM output are data, not literals, so they are never translated. Scripts in `report/browser/` carry both languages and choose one from `<html lang>` at runtime, so they are copied untranslated. `report/browser/libraries.ts` finds `assets/` by searching upward from its own location, which works in the engine package and in the extension's and CLI's `vendor/` folders.

## Per-Language Implementation

| Language | Parser | Library | Call graph |
|----------|--------|---------|------------|
| TypeScript/JavaScript | Full AST | `@typescript-eslint/typescript-estree` | ✅ |
| PHP | Full AST | `php-parser` v3 | ✅ |
| Swift, C#, Java, Kotlin, C++ | Lightweight, shared bracelang engine | none | — |
| Go, Rust | Lightweight, standalone (brace-tracking) | none | — |
| Python | Lightweight, indentation-tracking | none | — |
| Dart | Lightweight, brace-tracking | none | — |

Lightweight parsers avoid pulling in a full language SDK. They track type and function boundaries well enough for God Class scoring, security scanning, and import extraction, but don't build a full AST or a call graph. All of them return the same `SimpleFileInfo` shape and share the text utilities in `analyzer/parsing/sourceText.ts` (comment stripping with per-language string delimiters, brace matching, line counting, top-level parameter counting).

The bracelang engine (`analyzer/bracelang/engine.ts`) handles languages where one type header owns one body. Each language supplies only a `BraceLanguageConfig`: its type, method and import patterns, string delimiters, and keywords that look like calls. C++'s method header tolerates a constructor initializer list. Only `.cpp`/`.cc`/`.cxx`/`.hpp`/`.hh` are treated as C++; `.h`/`.c` are skipped because they are ambiguous with plain C. C++ member functions defined outside the class body are not attributed to the class.

Go and Rust have standalone parsers because their methods live outside the type declaration (`func (r *X) Method()`, `impl X { fn method() }`); both pair methods with their type by name. A Rust struct's `lineCount` covers only its field block, so line-based God Score weighting undercounts Rust types relative to languages whose methods live inside the type body.

### God Class Scoring

Implemented once in `analyzer/typescript/godScore.ts` (`calculateGodScore`) and applied to every language's classes through `scoreGodClasses()`, so the formula is identical across languages:

```
godScore = methodScore + lineScore + importScore + propertyScore   (0–100)
  methodScore:   min(methodCount / 20 * 40, 40)
  lineScore:     min(lineCount / 500 * 30, 30)
  importScore:   min(importCount / 15 * 20, 20)
  propertyScore: min(propertyCount / 20 * 10, 10)

+ complexity penalty if cyclomaticComplexity > 15 (TS/JS, PHP only — the only
  languages this codebase computes cyclomatic complexity for)

rank: critical (>=75) / high (>=50) / medium (>=25) / low (<25)
```

### Security Scoring

Pattern families live in `analyzer/security/patterns.ts`, typed as `Record<SecurityLanguage, SecurityPattern[]>`. `calculateSecurityScore(targets, repoPath)` scans each target (`{ language, files }`) built from the catalog's `security` keys, skipping matches on comment lines. Patterns cover code and command injection, hard-coded credentials, weak cryptography and randomness, string-built SQL, and language-specific risks (for example Python's `pickle.load`, PHP's direct `$_GET`/`$_POST` use, Go's `InsecureSkipVerify`, Swift's `NSAllowsArbitraryLoads`, C#'s always-true certificate callbacks, C++'s `strcpy`/`gets`). Dart has no pattern family yet.

## Language-Agnostic Analysis

These stages operate on all parsed files regardless of language:

- **Dependency graph** (`graph/mermaid.ts`, `graph/d3/`) — built from each file's import/use statements.
- **Module metrics** (`analyzer/moduleMetrics.ts`) — fan-in, fan-out, instability (`fanOut / (fanIn + fanOut)`), betweenness centrality, and a composite structural score.
- **Circular dependency detection** (`analyzer/moduleMetrics.ts`) — DFS over the same graph.
- **Layer analysis** (`analyzer/layerAnalysis.ts`) — `generateLayerHeatmap(sources, godClasses, repoPath)` makes paths repo-relative, infers layers from directory names (`components/`, `services/`, `controllers/`, …), and builds a layer × layer dependency matrix. TS/JS dependencies are resolved paths; the other languages' dependencies are module names matched by keyword.
- **Technical debt score** (`analyzer/technicalDebt.ts`) — weighted combination of complexity (God Classes), maintainability (module metrics), and circular dependencies.
- **SBOM / vulnerability scan** (`analyzer/sbom/`, `analyzer/vulnerability/`) — npm-specific today. The scan uses Trivy when it is installed and falls back to `npm audit`. Both are started with `execFile` and argument arrays, never a shell command string, so the repository path cannot inject commands.

## LLM Integration (optional)

Two context documents are written next to each report:

- `<analysisId>.llm-context.json` — metrics-driven context (module hotspots, call graph stats, dependency stats, circular dependency samples, God Class ranking).
- `<analysisId>.llm-ast-only.json` — structure-driven context: for every catalog language, the most complex files' structure.

`llm/focus.ts` defines the three modes and their focus IDs: `full` (`graph-metrics`), `ast-only` (`ast-structure-only`), and `agent-prompt` (`agent-prompt`). A request flows through:

1. `services/llmRequest.ts` — validates the body and resolves provider, API key, model, output tokens, and temperature against the server config.
2. `llm/artifacts.ts` — returns a cached result, or reads the context for the mode.
3. The provider (`llm/providers/`) generates the review or agent prompt.
4. `llm/artifacts.ts` saves `<analysisId>.llm-<focus>.json`; `report/liveUpdate.ts` writes the result into the saved report's element for that mode (`report/reviewElements.ts`).

`analyzeLlmRequest` runs this flow; `getSavedLlmResult` returns a saved result without calling the LLM.

## Report Generation

`report/htmlBuilder.ts` owns only the page skeleton. `report/sections/index.ts` lists the report tabs in order and the sections each shows:

- `overviewSections.ts` — summary cards, God Class ranking, module metrics, layer analysis, file statistics.
- `graphSections.ts` — Mermaid wrappers, the D3 class dependency graph, circular dependencies, and the LLM result boxes.
- `astSection.ts` — the AST structure for every catalog language. TS/JS and PHP structures come from their full ASTs (`sections/ast/typescriptStructure.ts`, `phpStructure.ts`); the other languages' structures come from the same `SimpleFileInfo` the scores use (`lightweightStructure.ts`). Every file and every structure item is listed; long file lists are revealed in batches (`AST_FILES_PER_BATCH`, `sections/ast/limits.ts`).
- `riskSections.ts` — technical debt and security score sections.
- `supplyChainSections.ts` — SBOM and vulnerability scan sections.

The report is a single HTML file. Chart.js, Mermaid, marked (wrapped with DOMPurify) and D3 are embedded from `assets/`, so a report opens offline and never loads code from a CDN. `report/browser/` also provides the tab navigation, the "Copy for AI" buttons and the Japanese-aware Markdown emphasis; the extension reuses them to upgrade reports saved by older versions. AST file lists show every file, revealing them in batches of `AST_FILES_PER_BATCH`.
