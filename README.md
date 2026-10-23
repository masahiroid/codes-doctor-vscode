# Codes Doctor

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/masahirocom.codes-doctor?label=Visual%20Studio%20Marketplace&color=brightgreen)](https://marketplace.visualstudio.com/items?itemName=masahirocom.codes-doctor)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/masahirocom.codes-doctor?color=brightgreen)](https://marketplace.visualstudio.com/items?itemName=masahirocom.codes-doctor)
[![Rating](https://img.shields.io/visual-studio-marketplace/stars/masahirocom.codes-doctor?color=brightgreen)](https://marketplace.visualstudio.com/items?itemName=masahirocom.codes-doctor&ssr=false#review-details)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/15686/badge)](https://www.bestpractices.dev/projects/15686)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

Static structural diagnosis for codebases: God Classes, technical debt, security findings, dependency graphs and an SBOM, in a self-contained HTML report. Supports TypeScript/JavaScript, PHP, Python, Go, Swift, C#, Java, Kotlin, Rust, C++ and Dart.

| Package | What it is |
| --- | --- |
| [`packages/vscode`](packages/vscode) | The [VS Code extension](https://marketplace.visualstudio.com/items?itemName=masahirocom.codes-doctor). Start here as a user: [README](packages/vscode/README.md), [User Guide](packages/vscode/docs/USER_GUIDE.md) / [利用マニュアル](packages/vscode/docs/USER_GUIDE.ja.md). |
| [`packages/cli`](packages/cli) | The `codes-doctor` command for terminals and CI, with score thresholds as exit codes. |
| [`packages/engine`](packages/engine) | The analysis engine both of them run. [Architecture](packages/engine/docs/ARCHITECTURE.md). |

## Get started

Install **Codes Doctor** by `masahirocom` in VS Code 1.90 or newer, open a trusted project folder, and run **Codes Doctor: Analyze Current Workspace**. Read the HTML report, then use Problems and the Findings view to jump to source lines. Static analysis requires no AI API key.

The 6.x extension includes editor diagnostics, Git changes filtering, optional analysis on save, score threshold warnings, and AI reviews through OpenAI, Anthropic or VS Code model providers. Use `@codedoctor` in VS Code Chat to discuss analysis results or preview a proposed code fix before applying it.

For setup, settings and limitations, see the [English README](packages/vscode/README.md) / [日本語 README](packages/vscode/README.ja.md). For terminal and CI usage, see the [CLI README](packages/cli/README.md).

## Development

Node.js 24 or newer (`.nvmrc`). Installing with another version fails on purpose.

```bash
npm run install:all   # npm ci in every package
npm run verify:deps   # lockfile match, registry signatures, install scripts, npm audit and OSV
npm test              # engine build, CLI tests, extension tests
npm run package:vsix  # clean install, then packages/vscode/releases/codes-doctor-<version>.vsix
```

Builds refuse to run when `node_modules` does not match `package-lock.json`; run `npm ci` in that package. Dependency rules:

- An install script runs only when the package is listed as `true` under `allowScripts` in that package's `package.json`; deny it with `false` when it is not needed. Unlisted install scripts fail CI.
- A known vulnerability fails CI. If it cannot be fixed yet and does not affect Codes Doctor, add it to `security/osv-allowlist.json` with the reason and an expiry date.

The engine build (`npm run build` in `packages/engine`) bundles the report's browser libraries, compiles the engine, and generates its English build. `scripts/vendor-engine.mjs` copies that output into the extension and the CLI.

## Automation

| Workflow | When | What it does |
| --- | --- | --- |
| Dependabot (`.github/dependabot.yml`) | Mondays | Opens one grouped PR of minor and patch updates per package, plus GitHub Actions updates. Security updates open as soon as an advisory is published. |
| CI (`ci.yml`) | Every PR and push, and weekly | On Node.js 24 and 26: verifies dependencies (`npm run verify:deps`), runs all tests, the detection benchmark and browser tests, and analyzes this repository with the CLI. |
| Dependabot auto-merge | Dependabot PRs | Merges minor and patch updates once CI passes. Major updates wait for review. |
| Release (`release.yml`) | Fridays, a pushed `v*` tag, or manually | Weekly: if dependencies changed since the last `v*` tag, bumps the patch version, updates the CHANGELOG and tags it. Every release verifies dependencies, runs the tests, builds the VSIX, attaches it to a GitHub release and publishes it to the Visual Studio Marketplace. |

## License

Apache License 2.0 — see [LICENSE](LICENSE).
