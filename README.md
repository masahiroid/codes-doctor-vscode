# Codes Doctor

- English: [README.md](README.md)
- 日本語: [README.ja.md](README.ja.md)

Codes Doctor analyzes the currently opened workspace folder and generates a structural diagnosis report — God Classes, technical debt, security issues, dependency graphs, and an SBOM — directly inside VS Code. The analysis engine runs in-process; no external server is required.

## Commands

- `Codes Doctor: Analyze Current Workspace`
- `Codes Doctor: Set LLM API Key`

## Dashboard (Activity Bar)

After installation, a Codes Doctor icon appears in the Activity Bar. From the Dashboard you can:

- Choose the language mode (`auto` / TypeScript/JavaScript / PHP / Dart / Python)
- Choose how reports open (external browser / VS Code WebView / VS Code URI open)
- Run the analysis
- Choose an LLM provider, set its API key, fetch its live model list, and run an optional AI structural review

## How It Works

1. Run `Analyze Current Workspace` (from the Dashboard button or the command palette)
2. If the workspace has multiple folders, pick one
3. The bundled analysis engine analyzes that folder directly — no server process involved
4. The generated HTML report opens according to the `codeDoctor.reportOpenMode` setting

## Optional: LLM Structural Review

Codes Doctor can ask an LLM (OpenAI or Anthropic) to review the analysis and write a structural assessment into the report.

1. Pick a provider in the Dashboard's **LLM Provider** dropdown
2. Click **Set API Key** and paste your API key — it's stored in VS Code's secret storage (OS keychain), never in settings.json or anywhere in your workspace
3. Click **Fetch** to pull the live list of models your key can access, then pick one
4. After running an analysis, click **Run LLM Review** — the result is written back into the generated report

The model list is fetched live from the provider's API each time, so you're never stuck with a hardcoded, possibly outdated model name.

## Settings

Choose **Display & Report Language** in the Dashboard: **English** (default) or **日本語**. The dashboard, notifications, new HTML reports, and AI reviews use that language. Existing reports retain their original language; reviews added to a historical report match that report. Run a new analysis after switching languages to generate a report in the new language.

- `codeDoctor.displayLanguage` (default: `en`) — `en` / `ja`, saved as an application-wide user preference. The selection persists across workspace changes and restarts until you change it again, independently of the programming language being analyzed.
- `codeDoctor.analysisLanguage` (default: `auto`) — `auto` / `typescript` / `javascript` / `php` / `dart` / `python`
- `codeDoctor.reportOpenMode` (default: `external`)
  - `external`: open in your default browser
  - `webview`: open in a VS Code WebView panel
  - `vscode`: open via VS Code's own URI handler
- `codeDoctor.llmProvider` (default: `openai`) — `openai` / `anthropic`
- `codeDoctor.llmModel` (default: empty) — set from the Dashboard's model dropdown after fetching

## Supported Languages

| Language | God Class | Technical Debt | Security | Call Graph |
|----------|-----------|-----------------|----------|------------|
| TypeScript / JavaScript | ✅ | ✅ | ✅ | ✅ |
| PHP | ✅ | ✅ | ✅ | ✅ |
| Python | ✅ | ✅ | ✅ | — |
| Dart | ✅ | ✅ | — | — |

Dependency graphs, circular dependency detection, layer analysis, and SBOM/vulnerability scanning run across all supported files regardless of language.

## Development

This extension bundles the compiled output of the [Code Doctor](https://github.com/masahiroid/code-doctor) analysis engine rather than depending on it at runtime. To build locally, use Node.js 22 or newer:

```bash
# 1. Build the engine in a sibling checkout (or point CSAP_ROOT elsewhere)
git clone https://github.com/masahiroid/code-doctor.git ../csap-main
cd ../csap-main && npm install && npm run build && cd -

# 2. Vendor it into this extension and package
npm install
npm run vendor:csap   # reads CSAP_ROOT env var, defaults to ../csap-main
npm test               # verify bilingual UI, reports, and review prompts
npm run package        # produces codes-doctor-<version>.vsix
```

The vendor step generates separate Japanese (`vendor/csap`) and English (`vendor/csap-en`) engine bundles. English translations live in `lib/locales/report-en.json`; the build fails on missing engine translations. Only engine-owned literals are translated, so repository names and source samples remain intact.

## License

Apache License 2.0 — see [LICENSE](LICENSE).

Implementation sources are in `src/`. `npm run build` uses TypeScript 7 and rebuilds browser report libraries. `npm run typecheck` checks types; `npm run test:browser` verifies report tabs and diagrams in a real browser. Reports embed the audited libraries and work without a CDN connection. Dependency compatibility constraints and audit results are recorded in `docs/dependency-update.md`.

## Security and TypeScript migration (1.5.5)

All extension and build implementation sources are TypeScript under `src/`. Root `extension.js`, `lib/**/*.js`, and `scripts/*.js` are generated outputs. Strict compilation is enabled. Explicit `any` types have been removed from implementation sources, and compatibility adapters have typed API contracts. Node tests and the vendored engine remain JavaScript.

Bundled DOMPurify sanitizes Markdown HTML. Opening saved reports through the extension refreshes their library bundles. Webviews allow hashed inline scripts and block network connections; dashboard messages can invoke only this extension's analysis and API-key commands.

Security findings are static candidates. Comments, literal code examples and literal RegExp `.exec()` calls are excluded; executable template expressions remain checked. Type-only imports are excluded from runtime dependency graphs. Repositories containing both generated JavaScript and TypeScript may count both. See [remediation evidence](docs/security-remediation.md) and the [deployment guide](docs/INTERNAL_DEPLOYMENT.md).

Run `npm run lint`, `npm test`, and `npm run test:browser`. Install Chromium with `npx playwright install chromium` or set `CODE_DOCTOR_BROWSER_EXECUTABLE` to an existing Chrome executable.

Version 1.5.4 separates dashboard history, controls and browser interactions; remeasurement finds no unstable-module candidates or cycles. Install the current VSIX, run VS Code Reload Window, and generate a fresh analysis to use the updated engine.

Version 1.5.5 restricts the dashboard provider to VS Code attachment, redraw and disposal, with typed state/workflow composition in a controller. Medium class candidates are zero; maintainability is 72 and technical debt is 92.
