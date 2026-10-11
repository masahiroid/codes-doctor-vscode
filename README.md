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
| Release (`release.yml`) | Fridays, or manually | If dependencies changed since the last `v*` tag: bumps the patch version, updates the CHANGELOG, tags, attaches the VSIX to a GitHub release, and publishes to the Marketplace when enabled. |

### One-time GitHub setup

1. **Settings → General:** enable "Allow auto-merge".
2. **Settings → Code security:** enable Dependabot alerts and Dependabot security updates.
3. **Settings → Branches:** protect `main` and require the `CI / test` check, so only passing updates merge. The release workflow pushes its version commit and tag with `GITHUB_TOKEN`; allow GitHub Actions to bypass the rule, or the push is rejected.
4. **Marketplace publishing (optional):** add the secret `VSCE_PAT` (an Azure DevOps token with Marketplace → Manage scope for the `masahirocom` publisher), then set the repository variable `AUTO_PUBLISH` to `true`. Until then, releases stop at the GitHub release with the VSIX attached.

## History

The engine was developed in a separate `csap-main` repository (originally a web server). It was imported here with its history; the last server-capable version is tagged `engine-server-final`.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
