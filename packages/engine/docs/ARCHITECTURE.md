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
│   ├── syntax/              Tree-sitter parsing: runtime, generic structure extraction, per-language specs
│   ├── bracelang/           Lightweight engine for brace-delimited languages without a grammar
│   ├── swift/ kotlin/ dart/ Lightweight parsers (Swift and Kotlin use bracelang)
│   ├── security/            Pattern families, syntax evidence, test-code detection
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
| Python, Go, Java, C#, Rust, C++ | Syntax tree | Tree-sitter (`@vscode/tree-sitter-wasm`) | — |
| Swift, Kotlin | Lightweight, brace-tracking (bracelang engine) | none | — |
| Dart | Lightweight, brace-tracking | none | — |

### Tree-sitter languages

`analyzer/syntax/treeSitter.ts` loads the WebAssembly runtime and grammars from `@vscode/tree-sitter-wasm` (the same package VS Code uses), so nothing is compiled natively. Each language has a `LanguageSyntaxSpec` (`syntax/languages/`) that names the grammar's node types: type declarations and their bodies, functions, fields, imports, constructors, and — for the security scan — comments, string and other literals, calls and import nodes. `syntax/structure.ts` turns any tree into the shared `SimpleFileInfo` with one generic walk:

- Types declared inside functions (local classes, test fixtures) are still types.
- Methods declared outside their type are credited to it: Go receivers and Rust `impl` blocks always (the type may be in another file); C++ `Scope::name` only when `Scope` is a type declared in the same file, because the scope may be a namespace. Rust blanket impls (`impl<T> Trait for T`) are not types.
- C++ counts methods declared in a class body, including constructors.

Only `.cpp`/`.cc`/`.cxx`/`.hpp`/`.hh` are treated as C++; `.h`/`.c` are skipped because they are ambiguous with plain C.

### Lightweight languages

Swift, Kotlin and Dart have no grammar in `@vscode/tree-sitter-wasm`. Swift and Kotlin use the bracelang engine (`analyzer/bracelang/engine.ts`): comment stripping, brace matching and import extraction shared, with per-language type/method/import patterns. Dart has its own scanner. They track type and function boundaries well enough for scoring, but miss unusual layouts and cannot inform the security scan.

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

Pattern families live in `analyzer/security/patterns.ts`, typed as `Record<SecurityLanguage, SecurityPattern[]>`. `calculateSecurityScore(targets, repoPath)` scans each target (`{ language, files }`) built from the catalog's `security` keys. Before reporting a match it consults the file's syntax:

- **Text, not code.** TS/JS uses the TypeScript compiler's ranges (a match starting in a string, comment or regex literal is skipped). Tree-sitter languages use `security/syntaxEvidence.ts`: a match lying entirely inside a comment or a string is skipped. Strings in import statements stay code, so a pattern for an imported module still fires.
- **Constant-only calls.** For command-execution patterns, a call whose arguments are all literals (strings, numbers, lists of them, keyword arguments with literal values; not interpolated strings) is not reported.
- **Test code.** `security/testCode.ts` recognises test files by directory (`test/`, `tests/`, `__tests__/`, `testdata/`, …) and file name (`*_test.go`, `test_*.py`, `*Test.java`, `*.spec.ts`, …), relative to the repository. Such findings carry `inTest: true`: they are listed with a label, but the score, explanation, category breakdown and top risks cover production code only.

Patterns cover code and command injection, hard-coded credentials, weak cryptography and randomness, string-built SQL, and language-specific risks. They do not follow data from a source to a sink; that taint analysis is planned on top of the syntax trees. Dart has no pattern family yet.

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

- `<analysisId>.llm-context.json` — metrics-driven context (module hotspots, call graph stats, dependency stats, circular dependency samples, God Class ranking) and security evidence by level: traced input-to-sink flows with their path lines, enclosing function and its callers; untraced pattern matches grouped by category; and other findings. Test-code findings are only counted.
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
