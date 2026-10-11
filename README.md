# Codes Doctor

Static structural diagnosis for codebases: God Classes, technical debt, security findings, dependency graphs and an SBOM, in a self-contained HTML report. Supports TypeScript/JavaScript, PHP, Python, Go, Swift, C#, Java, Kotlin, Rust, C++ and Dart.

| Package | What it is |
| --- | --- |
| [`packages/vscode`](packages/vscode) | The [VS Code extension](https://marketplace.visualstudio.com/items?itemName=masahirocom.codes-doctor). Start here as a user: [README](packages/vscode/README.md), [User Guide](packages/vscode/docs/USER_GUIDE.md) / [利用マニュアル](packages/vscode/docs/USER_GUIDE.ja.md). |
| [`packages/cli`](packages/cli) | The `codes-doctor` command for terminals and CI, with score thresholds as exit codes. |
| [`packages/engine`](packages/engine) | The analysis engine both of them run. [Architecture](packages/engine/docs/ARCHITECTURE.md). |

## Development

Node.js 22 or newer.

```bash
npm run install:all   # npm ci in every package
npm test              # engine build, CLI tests, extension tests
npm run package:vsix  # packages/vscode/codes-doctor-<version>.vsix
```

The engine build (`npm run build` in `packages/engine`) bundles the report's browser libraries, compiles the engine, and generates its English build. `scripts/vendor-engine.mjs` copies that output into the extension and the CLI.

## Automation

| Workflow | When | What it does |
| --- | --- | --- |
| Dependabot (`.github/dependabot.yml`) | Mondays | Opens one grouped PR of minor and patch updates per package, plus GitHub Actions updates. Security updates open as soon as an advisory is published. |
| CI (`ci.yml`) | Every PR and push, and weekly | Audits production dependencies, runs all tests and browser tests, and analyzes this repository with the CLI. |
| Dependabot auto-merge | Dependabot PRs | Merges minor and patch updates once CI passes. Major updates wait for review. |
| Release (`release.yml`) | Fridays, a pushed `v*` tag, or manually | Weekly: if dependencies changed since the last `v*` tag, bumps the patch version, updates the CHANGELOG and tags it. Every release builds the VSIX, attaches it to a GitHub release and publishes it to the Visual Studio Marketplace. |

## License

Apache License 2.0 — see [LICENSE](LICENSE).
