# Extension architecture

The extension is a thin VS Code layer over the analysis engine in `packages/engine`. The engine produces the complete report; the extension runs it, opens the report, and manages the dashboard, settings, API keys and history.

## Engine boundary

- `npm run vendor:csap` builds the engine and runs `scripts/vendor-engine.mjs` (repository root), which copies `dist/` to `vendor/csap` (Japanese report), `dist-en/` to `vendor/csap-en` (English report) and `assets/` to `vendor/assets` (report browser libraries). Nothing is patched.
- `analyzer.ts` is the only module that loads the engine's analysis and LLM entry points. It passes the extension version (`generatorVersion`) for the report's `codes-doctor-version` tag and re-exports the engine's `LLM_FOCUS` IDs.
- `engine.ts` loads the engine for a report language: from `vendor/` during development and tests, or from the bundle in the VSIX.
- `reportScripts.ts` re-exports the engine's report browser modules (tabs, copy-for-AI, libraries). `reportViewer.ts` uses them to upgrade reports saved by older versions when they are reopened.

## Packaging

`npm run bundle` (`scripts/bundle.mjs`) builds `dist/` with esbuild: `extension.js` (the extension, `vscode` external), `engine-ja.js` and `engine-en.js` (each report language's engine with its parsers), a single shared copy of the `typescript` compiler, the report libraries and the dashboard stylesheet. The VSIX contains only `dist/`, the icons and the manifest files (`.vscodeignore`), and is packaged with `--no-dependencies`. `test/bundle.test.js` loads the bundled extension and runs both bundled engines.

## Responsibilities

- `extension.ts` composes and registers the VS Code adapters.
- `dashboardView.ts` owns only view attachment, redraw and disposal. `dashboard/controller.ts` composes typed state with the action and review workflows; `dashboard/presentation.ts`, `controls.ts` and `history.ts` render; `dashboard/actions.ts` handles validated webview messages.
- `dashboardReview.ts` runs the LLM review workflow; `reportViewer.ts` opens reports; `reports/repository.ts` owns report and LLM-result files on disk.
- `webviewSecurity.ts` applies a hashed-script CSP with no network access to every webview.

## Constants and configuration

`package.json` is the single source for setting defaults, enum values, numeric limits, command IDs and view IDs. `settingsSchema.ts` exposes them; `dashboard/settings.ts` builds the dashboard's select options from the manifest enums, and a missing label is an error at load time. `test/language-catalog.test.js` fails if the `codeDoctor.analysisLanguage` enum differs from the engine's `ANALYSIS_LANGUAGES`.

## Build and tests

Sources are TypeScript in `src/`; `npm run build` emits the CommonJS runtime files (`extension.js`, `lib/`). `npm test` runs the Node regression tests against the vendored engine; `npm run test:browser` generates real reports in both languages and clicks through every tab in Chromium (set `CODE_DOCTOR_BROWSER_EXECUTABLE` to use an installed browser).
