# Architecture

- English: this document
- 日本語: [ARCHITECTURE.ja.md](ARCHITECTURE.ja.md)

Last updated: 2026-10-09

## Overview

Code Doctor (package name `csap`) is a Node.js/TypeScript application that analyzes a codebase and generates a self-contained HTML audit report. It can run as an Express server (ZIP upload or local-path analysis) or be embedded directly — the [codes-doctor-vscode](https://github.com/masahiroid/codes-doctor-vscode) VS Code extension (a separate repository) vendors this repo's compiled `dist/` output and calls the analysis pipeline in-process, without starting a server.

## System Components

```
src/
├── server.ts              Express entry point
├── app/                    App wiring (middleware, routes, startup)
├── upload.ts               ZIP upload endpoint (multer)
├── zipExtractor.ts          ZIP extraction (unzipper)
├── fileWalker.ts            File listing / reading (no ZIP dependency)
├── config.ts                Runtime configuration (env vars, feature flags)
├── types.ts                  Shared type definitions
├── analyzer/
│   ├── languageDetector.ts  Detects which languages are present
│   ├── runner.ts             Orchestrates one full analysis run
│   ├── pipeline/             Per-language and global analysis stages
│   ├── typescript/           TS/JS AST parsing, God Score, call graph
│   ├── php/                  PHP AST parsing, God Score, call graph
│   ├── dart/                 Lightweight regex-based Dart parser
│   ├── python/                Lightweight indentation-based Python parser
│   ├── vulnerability/        Trivy / npm audit dependency scanning
│   ├── sbom/                  CycloneDX / SPDX export
│   ├── moduleMetrics.ts      Fan-in/fan-out, instability, structural score
│   ├── layerAnalysis.ts      Architecture layer detection and heatmap
│   ├── technicalDebt.ts      Technical debt scoring
│   └── securityScore.ts      Security pattern scanning
├── graph/                    Mermaid and D3 diagram generation
├── report/                   HTML report assembly (one section module per concern)
├── llm/                       OpenAI integration and LLM context builders
└── services/                  Request-level orchestration (path analysis, LLM requests)
```

## Request Flow (server mode)

1. Client uploads a ZIP to `POST /api/upload`, or calls `POST /api/analyze-path` with a local directory path
2. `zipExtractor.ts` extracts the ZIP (if applicable) into a temp directory
3. `analyzer/languageDetector.ts` scans the directory and counts files per language
4. `analyzer/pipeline/languageAnalysis.ts` runs each detected language's parser (TS/JS, PHP, Dart, Python) and scores God Classes for each
5. `analyzer/pipeline/globalAnalysis.ts` runs language-agnostic analysis across every file: dependency graph, module metrics, circular dependency detection, technical debt, security score, layer heatmap
6. `analyzer/pipeline/supplyChainAnalysis.ts` generates the SBOM and runs a vulnerability scan
7. `report/htmlBuilder.ts` assembles the HTML report from per-section builders in `report/sections/`
8. The report is written to `output/<analysisId>.html`; an LLM context JSON is written alongside it for optional later analysis

## Embedding Without a Server (VS Code extension)

`services/pathAnalysis.ts` exposes `analyzePathRequest(repoPath, language, outputDir)` as a plain async function with no Express dependency in its call chain. The VS Code extension imports the compiled version of this function directly (via `vendor/csap/services/pathAnalysis.js`, copied from this repo's `dist/` at package time) and calls it with its own output directory. PDF generation (which depends on `puppeteer`, a large dependency) lives in a separate module (`report/pdfOutput.ts`) specifically so that embedding callers that don't need PDF export don't have to bundle Chromium.

## Per-Language Implementation

| Language | Parser | Library | Call graph |
|----------|--------|---------|------------|
| TypeScript/JavaScript | Full AST | `@typescript-eslint/typescript-estree` | ✅ |
| PHP | Full AST | `php-parser` v3 | ✅ |
| Python | Lightweight, indentation-tracking | none (regex + indent depth) | — |
| Dart | Lightweight, brace-tracking | none (regex + brace depth) | — |

The lightweight parsers (Python, Dart) avoid pulling in a full language SDK; they track class/function boundaries well enough for God Class scoring, security pattern scanning, and import extraction, but don't build a full AST or a call graph.

### God Class Scoring

Implemented once in `analyzer/typescript/godScore.ts` (`calculateGodScore`) and reused by every language's pipeline stage, so the scoring formula is identical across languages:

```
godScore = methodScore + lineScore + importScore + propertyScore   (0–100)
  methodScore:   min(methodCount / 20 * 40, 40)
  lineScore:     min(lineCount / 500 * 30, 30)
  importScore:   min(importCount / 15 * 20, 20)
  propertyScore: min(propertyCount / 20 * 10, 10)

+ complexity penalty if cyclomaticComplexity > 15 (TS/JS, PHP only — these are the
  only languages this codebase computes cyclomatic complexity for)

rank: critical (>=75) / high (>=50) / medium (>=25) / low (<25)
```

### Security Scoring

Each language has its own pattern list in `analyzer/securityScore.ts` (regex-based, with comment-line filtering per language's comment syntax). Patterns cover code injection (`eval`/`exec`), command injection, hardcoded credentials, weak cryptography, and language-specific risks (e.g. Python's `pickle.load`, `yaml.load` without a safe loader; PHP's `$_GET`/`$_POST` direct use). Dart has no security patterns defined yet.

## Language-Agnostic Analysis

These stages operate on the union of all detected files regardless of language:

- **Dependency graph** (`graph/mermaid.ts`, `graph/d3/`) — built from each file's import/use statements
- **Module metrics** (`analyzer/moduleMetrics.ts`) — fan-in, fan-out, instability (`fanOut / (fanIn + fanOut)`), betweenness centrality, and a composite structural score
- **Circular dependency detection** (`analyzer/moduleMetrics.ts`) — DFS over the same dependency graph
- **Layer analysis** (`analyzer/layerAnalysis.ts`) — infers architectural layers from directory-name patterns (`components/`, `services/`, `controllers/`, etc.) and builds a layer × layer dependency heatmap
- **Technical debt score** (`analyzer/technicalDebt.ts`) — weighted combination of code complexity (God Classes), maintainability (module metrics), and circular dependencies
- **SBOM / vulnerability scan** (`analyzer/sbom/`, `analyzer/vulnerability/`) — npm-specific today (reads `package.json`/`package-lock.json`); runs independently of the source-code language

## LLM Integration (optional)

When `CSAP_LLM_ENABLED=true`, two context documents are generated per analysis and written to `output/`:

- `<analysisId>.llm-context.json` — metrics-driven context (module hotspots, call graph stats, dependency stats, circular dependency samples, God Class ranking)
- `<analysisId>.llm-ast-only.json` — structure-driven context (sampled files' AST-level structure, ranked by a complexity heuristic independent of fan-in/fan-out)

`POST /api/llm/analyze` sends one of these contexts to the configured OpenAI model (`llm/openai.ts`) and caches the result alongside the report; `GET /api/llm/result/:analysisId/:focus` retrieves a cached result without calling the LLM again.

## Report Generation

`report/htmlBuilder.ts` assembles one `<section>` per concern, each implemented in its own module under `report/sections/`:

- `overviewSections.ts` — summary cards, God Class ranking, module metrics, layer analysis, file stats
- `riskSections.ts` — technical debt and security score sections
- `graphSections.ts` — dependency graph (D3) and circular dependency sections, plus the Mermaid wrapper
- `supplyChainSections.ts` — SBOM and vulnerability scan sections
- `astSection.ts` — sampled AST structure viewer, with the optional LLM review control

The report is a single self-contained HTML file; charts (Chart.js), diagrams (Mermaid.js, D3.js), and markdown rendering (marked) are loaded from a CDN, so the report needs network access to render those widgets but no server-side dependency to generate.
