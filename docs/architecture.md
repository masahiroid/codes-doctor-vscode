# Extension architecture

## Responsibilities and dependency direction

The extension uses a small layered structure rather than a framework:

- `extension.js` composes and registers VS Code adapters.
- `dashboardView.js` owns view lifecycle, UI state and message dispatch. Its existing public rendering methods delegate to `dashboard/presentation.js`; styles live in `dashboard/styles.css`.
- `dashboardReview.js` coordinates the review user operation. Engine invocation remains behind `analyzer.js`, and report opening behind `reportViewer.js`.
- `analyzer.js` is the public engine facade. `reports/repository.js` owns filesystem history and report metadata; facade exports preserve callers' existing imports.
- `enginePatches.js` and `dependencyPatches.js` select a Strategy by upstream file path. Each `engine/` strategy owns one upstream transformation. Shared Markdown, AST rendering, security explanation, prompt rules, and source-replacement helpers have separate modules.

Provider state remains in the provider; extracting render methods does not duplicate state. Public method names, HTML IDs, messages, file naming, localization and report-opening behavior remain compatible. Presentation currently receives the provider as its rendering context to preserve public-method customization; it is not an independent frontend framework.

## Constants and configuration

`package.json` is the single source for extension settings defaults, numeric limits, command IDs and view IDs. `settingsSchema.js` exposes those values and token validation to backend and rendering code. `engine/policy.js` defines extension-owned retry, AST display batching and security caps; vendoring embeds the policy in generated modules, which must run without extension imports. Adapter-level review defaults and report storage directory are named definitions in `settingsSchema.js`.

Static protocol names, upstream patch markers, translation keys and CSS/SVG declarations describe external contracts or visual assets. They remain explicit in their owning modules. They are not made user-configurable or replaced with artificial numeric constants. CSS dimensions live in the dedicated stylesheet. Upstream generated `vendor/` code is regenerated rather than broadly rewritten; upstream-owned scoring thresholds are outside this refactor.

When adding a behavior-affecting threshold or default, define it in the manifest or policy module and reference it; do not duplicate its literal in validation, templates or processing. When adding an engine compatibility patch, register a path-specific strategy and retain marker validation. Keep public facade methods compatible.

## Validation (1.0.14)

`npm run vendor:csap` regenerates Japanese and English engines successfully. `npm test` passes all 36 tests, including report generation, dashboard messages/localization, review success/failure, extraction/classification, report integrity, copying and the new repository boundary tests. `git diff --check` passes. Version fields are synchronized at 1.0.14; no release was published.

Live VS Code interaction and live provider API calls have not been run. Existing filename-based history listing also accepts `<analysisId>.llm-context.json` as a `context` history item; this behavior was discovered by the repository regression test and intentionally preserved in this behavior-preserving refactor. Any correction should be treated as a separate behavior change.

## TypeScript implementation (1.5.1)

Edit implementation files in `src/extension.ts`, `src/lib/` and `src/scripts/`. The existing root `extension.js`, `lib/**/*.js` and `scripts/*.js` paths are generated CommonJS runtime outputs, preserving VS Code loading, serialized browser functions and existing module consumers. JSON catalogs and CSS remain runtime assets. Vendored upstream code is regenerated, not migrated or edited directly. The existing Node regression tests remain JavaScript; browser integration tests use TypeScript.

`npm run build` compiles with strict mode and refuses emission on type errors. `npm run typecheck` checks without writing output. The test and vendoring scripts build before running. VSIX packaging ships runtime JavaScript and assets; it does not require a TypeScript loader. VS Code types are pinned to the supported 1.90 API. Browser adapters, provider state, review requests and history entries have explicit types. Compatibility adapters for untyped upstream modules still use `any`; migrating filenames does not imply complete end-to-end type safety across the vendor boundary.

`npm run test:browser` generates real reports for both languages and clicks every report tab, then expands the pending AST batch. Install Chromium with `npx playwright install chromium`, or set `CODE_DOCTOR_BROWSER_EXECUTABLE` to an installed compatible browser.

The silent tab failure was reproduced in an actual saved report: a global copy-script replacement matched escaped source inside the AST preview and consumed closing template markup. The tab script became inert template content, so there was no JavaScript console exception. Copy upgrades now operate only within actual script elements. Browser regression fixtures prove that the former replacement corrupts generated HTML and that the corrected upgrade keeps all tabs and AST pagination functional, even with external CDN requests blocked.

Already-corrupted reports have lost markup and source-preview content; they cannot be faithfully restored by injecting a new handler. They are detected on opening, preserved, and accompanied by a regeneration message. A fresh analysis of this workspace was generated and every tab verified in Chrome; prior reports and LLM results were retained.

## Dependency and report asset pipeline (1.5.2)

`npm run build` now uses the TypeScript 7 compiler alias and runs `scripts/build-browser-libraries.js`. The runtime parser API remains TypeScript 6 to satisfy typescript-estree's peer range. Node16 module resolution preserves CommonJS runtime outputs. Report libraries are rebuilt with esbuild, including the patched KaTeX override, and embedded in both generated engine languages. Bundled assets also ship for upgrading saved reports. Product headings use the manifest's displayName. See dependency-update.md and dependency-audit.json for versions, compatibility exceptions and audit results.

## Security and measurement (1.5.3)

`dashboard/actions.ts` handles validated messages, model fetches and history opening; the provider retains lifecycle and public delegation methods. `webviewSecurity.ts` applies hashed-script CSP with no network connections or local resource roots. DOMPurify is bundled into the marked adapter so both persisted and interactive Markdown rendering are sanitized. Saved embedded library tags are refreshed on opening.

`engine/securitySyntax.ts` provides offset-preserving ignored ranges for literals, comments and proven literal RegExp calls. Template expressions remain executable candidates. Exported declarations are unwrapped before structural measurement. Type-only import/export edges do not contribute to runtime dependency metrics. See security-remediation.md for measured results and remaining limitations.

## Typed dashboard boundaries (1.5.4)

The current implementation removes explicit any types and uses typed local module imports. DashboardHost is the contract shared by rendering and workflows, so those modules no longer import the concrete provider type. History, controls, browser events and formatting live in focused modules. Parsed history metadata is unknown until string validation. Node regression tests are split by UI, engine and asset responsibilities. These supersede the earlier compatibility-any status above; the JavaScript vendor remains outside end-to-end static type checking.

Generated reports record the extension version in codes-doctor-version metadata. Source changes must be packaged and installed before the running VS Code extension uses them. See security-remediation.md for current results.

## Single-responsibility view adapter (1.5.5)

CodeDoctorDashboardViewProvider now owns only VS Code view attachment, redraw and disposal. createDashboardController composes typed state with the existing action and review workflows; it does not own VS Code view lifecycle. Presentation functions call the focused control/history renderers directly instead of routing every section through provider methods. DashboardHost therefore no longer includes rendering methods. Replacing a view disposes its prior subscriptions, and closing a view releases the retained reference.

The provider has four methods and no structural warnings; its source and generated JavaScript both score 16 (Low). Medium candidates are zero. Implementation sources are 58 TypeScript files; Node tests and the JavaScript vendor are still outside that migration scope.

## Catalog-driven engine and slimmer patch set (2.0.0)

### Engine

The vendored engine now defines every language once, in `analyzer/languages/catalog.ts`. Detection, the language analysis loop, security targets, layer sources, the AST section, the AST-only LLM context and the server's language dropdown all derive from it. Analysis results expose parsed files as `files: Record<LanguageId, …>` instead of eleven `xxxFiles` fields. Detection reports `fileCounts`/`enabled` per source language. Tables that must cover every language are typed `Record<LanguageId, …>`, so a new catalog entry does not compile until each table handles it. See the engine's `docs/ARCHITECTURE.md` for the full layout.

Responsibilities that used to be mixed into orchestrators were split out: `llm/artifacts.ts` (context/result files), `services/llmRequest.ts` (request validation and option resolution), `report/liveUpdate.ts` (writing a result into a saved report), `report/sections/index.ts` (tab → section registry), and `report/sections/ast/` (limits, outline rendering, per-parser structure builders).

### Patch inventory

Engine fixes that the extension used to apply as patches are now part of the engine, and their patches were deleted:

- `qualityPipeline` / `layerClassification`: repo-relative layer classification is built into `generateLayerHeatmap(sources, godClasses, repoPath)`.
- Most of `llmPersistence`: the AST-only element ID and the `$`-safe replacement are fixed in the engine. The patch now targets `report/liveUpdate.js` and only reveals the extension's hidden AST review wrapper.

The `astSection` patch was rewritten against named functions (`renderAstReviewBox`, `renderAstNotes`, `joinAstBlocks`) instead of template fragments. A new `astLimits` patch lifts every cap in `AST_SECTION_LIMITS` to `Infinity`, and `localizeAstLabels` is applied to every module under `report/sections/ast/`. Pagination and the lightweight-parser note therefore cover every language, not only the first five.

### Single sources inside the extension

- Dashboard select options come from the `package.json` enums through `enumOptions()`. A value without a dashboard label is an error at load time.
- `test/language-catalog.test.js` fails if the `codeDoctor.analysisLanguage` enum differs from the engine's `ANALYSIS_LANGUAGES`.
- LLM focus IDs come from the engine (`analyzer.ts` re-exports `LLM_FOCUS`). Review-copy target IDs live in `reviewTargets.ts` and are inlined into the serialized `installReviewCopy` by `reviewCopySource()`.

### Verification

The engine has no unit tests, so the refactor was checked with a golden-master run that compared normalized analysis results, reports and LLM contexts before and after. It covered 16 corpora in the English build: a sample per lightweight language, a polyglot repository in auto mode and in five forced-language modes, an unsupported-language (Ruby) sample, and both codebases. The polyglot repository was also run in the Japanese build. Analysis results were identical except for these intended changes:

- Forced `javascript` mode no longer also analyzes TypeScript.
- Dart classes now enter God Class scoring and the layer heatmap.

Report differences were limited to the intended presentation changes (catalog labels, parsed lightweight structures, pagination for all languages, D3 layout constants).

Codes Doctor's own scores after the refactor:

| Codebase | Technical debt | Security | Notes |
| --- | --- | --- | --- |
| Extension (`src/`) | 91 A | 99 A | No God Class candidates above Low; no cycles. |
| Engine (`src/`) | 86 A | 99 A (was 59 F) | No unstable modules (was 2); no cycles. |

The engine's security grade rose because AST structure is now built from parsed data instead of `RegExp.exec()` loops, and `trivy`/`npm audit` are started with `execFile` (the old `exec` calls interpolated the repository path into a shell command). Engine maintainability is 53, which is the average structural score; that metric favors fewer, larger modules, so it was not optimized at the expense of single-responsibility modules.
