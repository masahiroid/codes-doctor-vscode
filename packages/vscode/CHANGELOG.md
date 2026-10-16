# Changelog

## 6.0.0

- Add VS Code Language Model API (vscode.lm) provider option to run AI reviews and prompts without external API keys
- Add @codedoctor VS Code Chat Participant (/analyze, /security, /refactor, /fix) grounded in Codes Doctor analysis results
- Add 1-click AI Fix Diff Preview & Apply (codeDoctor.previewAiFix and editor Quick Fix lightbulb action)
- Add Marketplace version, downloads, rating, and license badges to README files

## 5.0.0

- Add Analyze Git Changes command (codeDoctor.analyzeGitChanges) and Dashboard button to focus diagnostics and Findings tree on uncommitted or last-commit changed files
- Add inline ignore comment support (code-doctor-ignore-next-line, code-doctor-ignore, code-doctor-ignore-file) with Quick Fix CodeActionProvider in the editor
- Add immediate ignore comment re-evaluation on file save and optional background analysis on save (codeDoctor.analyzeOnSave)

## 4.0.2

- Add inline editor diagnostics in the Problems panel for security findings (with traced data-flow steps) and God Classes
- Add hover provider with security explanations, remediation advice, and traced flow paths
- Add status bar indicator showing live Security and Technical Debt scores with quality gate warnings
- Add Findings tree view in the Activity Bar to drill down and jump directly to source lines

## 4.0.1

- Add Quality Gate score threshold warnings (minSecurity, minTechnicalDebt) aligned with CLI
- Add commands to copy analysis summary as formatted text and JSON
- Support configurable outputDirectory setting

## 4.0.0

- **Syntax-tree analysis for Python, Go, Java, C#, Rust and C++.** These languages are now parsed with Tree-sitter instead of a regex scan. Classes, methods, fields, functions and imports are read from the syntax tree, so code inside strings and comments is no longer mistaken for declarations, local classes inside functions are found, Go and Rust methods are attached to their types, and C++ methods declared in a class body are counted. Swift, Kotlin and Dart keep the lightweight scan.
- **Fewer security false positives.** In these languages, matches inside comments and plain strings are ignored, and command-execution calls made only with constant arguments (such as `exec.Command("git", "status")`) are not reported.
- **Test code is recognised.** Findings in test files (`*_test.go`, `tests/`, `*Test.java`, `*.spec.ts`, …) are listed with a "Test code" label and no longer lower the security score.
- **Redesigned report and dashboard.** A new design system with soft pastel tones on translucent surfaces replaces the saturated gradients, in light and dark. Reports follow the OS theme, the VS Code theme when opened inside VS Code, or a light/dark/auto toggle in the header. Scores are shown as rings with a one-line verdict, findings as severity bars, and charts, Mermaid diagrams and the D3 graph use the same palette. Distribution charts and the layer heatmap are now plain HTML, so they look the same in every viewer and in print. The dashboard keeps the VS Code theme's colors with pastel accents and Honami in its header.
- **Taint analysis: findings backed by a traced input path.** In JavaScript/TypeScript, PHP, Python, Go, Java, C#, Rust and C++, the engine now follows untrusted input (request parameters, command-line arguments, standard input, …) through assignments within each function to command execution, SQL, `eval`, file paths, outgoing URLs and HTML output. A traced flow is reported with an "Input reaches" label and its path (input → via → sink) in the report. A pattern match where no input could be traced is lowered to Low and labelled "Needs review". Validation and escaping calls (`parseInt`, `escapeshellarg`, `html.escape`, `strconv.Atoi`, …) stop a flow, and parameterized queries are not reported. Flows through other functions are not followed yet.
- **Security evidence for the LLM review and the agent prompt.** The LLM context now includes the security findings, separated by how far they can be trusted: traced flows with their input → via → sink lines, the function they are in and that function's callers; pattern matches without a traced input, grouped by category; and other findings. The review gains a "Security findings" section, and the agent prompt puts fixes for traced flows before refactoring while treating the rest as items to inspect first. Test-code findings are only counted.
- **English report fixes.** Translated text containing an apostrophe no longer breaks the English report's scripts; the security score summary has its missing space, and the SBOM table no longer shows two "Type" columns.
- **Long class names wrap** in report tables instead of pushing the last column out of view.
- **New README screenshots** of the redesigned report.
- **Activity Bar icon.** The Activity Bar now uses a simple cross that stays legible at small sizes; Honami (保奈美) remains the Marketplace icon and appears in the report header.

## 3.0.2

- New icon: Honami (保奈美), for the Marketplace and the Activity Bar.

## 3.0.1

- The extension is now bundled with esbuild: the VSIX contains 23 files instead of 645 and is about half the size (3.6 MB), so it installs and starts faster.
- The VSIX now includes the license file.

## 3.0.0

- Documentation: results for languages other than TypeScript/JavaScript and PHP come from a lightweight scan and can include more false positives (for example in Go); the READMEs and User Guide now say so.
- Repository: the extension, its analysis engine and a new CLI now live in one monorepo (`packages/vscode`, `packages/engine`, `packages/cli`). The engine's former web server was removed.
- The extension uses the engine exactly as built: all vendor-time patches were moved into the engine or became its defaults. Report behavior is unchanged.
- Reports: removed the "Start New Analysis" and "PDF Download" buttons, which pointed at the former server and did nothing; raw AST previews are indented again.
- New `codes-doctor` CLI for terminals and CI, with `--min-security`/`--min-debt` thresholds as exit codes. See [packages/cli](https://github.com/masahiroid/codes-doctor-vscode/tree/main/packages/cli).
- Releases are automated: weekly dependency updates, CI, and publishing to the Visual Studio Marketplace.
- The VSIX is smaller (about 7 MB instead of 10 MB): report libraries are no longer shipped twice.

## 2.0.0

### New

- **User guide** in English and Japanese ([docs/USER_GUIDE.md](docs/USER_GUIDE.md), [docs/USER_GUIDE.ja.md](docs/USER_GUIDE.ja.md)). It covers setup, every report tab, language support, the AI review and AI coding prompt, settings, privacy and troubleshooting. The READMEs link to it and list what is new in 2.0.
- **AST tab for every language.** All analyzed files of every language are listed with their imports, types (with methods and property counts) and functions. Lightweight-parser languages show the structure the analysis actually used, instead of a separate regex scan that could disagree with the scores. Pagination and the "lightweight extraction" note now apply to all languages, not only TypeScript/JavaScript, PHP, Dart, Python and Go.

### Changed

- **Dart** classes are now included in God Class scoring and in the layer heatmap, like every other language.
- In **JavaScript only** mode, TypeScript files are no longer analyzed as well.
- The file statistics table labels TypeScript/JavaScript files as "TypeScript/JavaScript", and the "no supported files" banner lists languages in catalog order.
- Engine (bundled): every language is defined once in a language catalog that drives detection, analysis, security scanning, layer analysis, the AST view and the AI context. Orchestrators were split into single-responsibility modules (LLM request resolution, LLM artifacts, live report updates, a report tab registry, AST section builders), and remaining magic numbers were replaced with named constants. Fixes the extension previously applied as patches (repo-relative layer classification, the AST review element ID, `$`-safe review saving) are now built into the engine, and those patches were removed.
- Dashboard options are generated from the setting definitions in `package.json`, and a test fails if the language setting and the engine's language list ever differ.

### Fixed

- **Security:** the dependency vulnerability scan (`trivy` and `npm audit`) no longer builds a shell command from the folder path. A folder name containing quotes or `$(…)` could previously run a command.
- Unknown `language` values sent to the engine are rejected with an error instead of being passed through.
- Engine server mode: the "LLM is disabled" error now maps to HTTP 400 instead of 500.
- The English report heading "LLM Structural Analysis" no longer runs the words together.

## 1.5.14

- Add an LLM **Output Mode** setting (`codeDoctor.llmOutputMode`). The new **AI coding agent prompt** mode asks the LLM to write a ready-to-paste task prompt for Claude Code, Cursor, GitHub Copilot, or Codex — goal, supporting metrics, up to five prioritized tasks with inspect-first steps and acceptance checks, items to leave alone, and the report the agent should return — instead of a review for people to read. It is shown in its own box on the report's LLM tab with a copy button that copies the prompt as-is, and does not overwrite the review.
- Fix the `codeDoctor.analysisLanguage` values listed in the READMEs, which still showed only the original six languages.

## 1.5.13

- When a workspace contains no files in any supported language, the report now shows a warning banner explaining that nothing was analyzed, and the Technical Debt / Security score cards show "N/A" instead of a misleading 100/100 grade A.

## 1.5.12

- Add C++ language support: God Class scoring (class/struct + inline member functions, including constructor initializer lists), technical debt, and security pattern scanning (shell command execution via `system`/`popen`, unsafe string functions with buffer overflow risk such as `strcpy`/`strcat`/`sprintf`/`gets`, weak hashing, weak randomness via `rand()`, hardcoded secrets, string-concatenated SQL). Uses the shared `bracelang` parsing engine (same one Java and Kotlin use). Only `.cpp`/`.cc`/`.cxx`/`.hpp`/`.hh` are analyzed — plain `.h`/`.c` are skipped since they may be C, not C++, which this parser doesn't model. Member functions defined outside the class body (`Type::method() {}`) aren't attributed to the class; only inline definitions are counted. No call graph (same limitation as the other lightweight-parser languages).

## 1.5.11

- Add Java, Kotlin, and Rust language support: God Class scoring, technical debt, and security pattern scanning (shell command execution, weak hashing, hardcoded secrets, string-built SQL) for all three. Java and Kotlin share a new generic lightweight parsing engine (`analyzer/bracelang/engine.ts`) that factors out the comment-stripping/brace-matching/import-extraction plumbing already duplicated across the Go/Swift/C# parsers — new C-family languages now only need to supply their type/method/import regex. Rust keeps its own standalone parser, since its `struct` fields and `impl` methods live in physically separate blocks that don't fit that engine's one-header-one-body model (it pairs them by type name instead, the same receiver-matching approach Go uses). No call graph for any of the three (same limitation as the other lightweight-parser languages).

## 1.5.10

- Add C# language support: God Class scoring (class/struct/interface/record + methods, with auto-property `{ get; set; }` syntax correctly excluded from method counts), technical debt, and security pattern scanning (shell command execution via `Process.Start`, weak hash/randomness, hardcoded secrets, string-concatenated SQL, disabled TLS verification via `ServerCertificateValidationCallback`). Uses a lightweight brace-tracking parser, matching the approach already used for Go, Swift, Python, and Dart. No call graph (same limitation as the other lightweight-parser languages).

## 1.5.9

- Add Swift language support: God Class scoring (class/struct/enum + methods), technical debt, and security pattern scanning (shell command execution via `Process()`, weak hash/randomness, hardcoded secrets, `UserDefaults`-stored credentials, disabled TLS verification via `NSAllowsArbitraryLoads`). Uses a lightweight brace-tracking parser, matching the approach already used for Go, Python, and Dart. No call graph (same limitation as the other lightweight-parser languages).

## 1.5.8

- Add Go language support: God Class scoring (struct + methods), technical debt, and security pattern scanning (command injection, SQL injection, weak crypto/randomness, hardcoded secrets, text/template XSS risk, insecure TLS). Uses a lightweight brace-tracking parser, matching the approach already used for Python and Dart. No call graph (same limitation as Python/Dart).

## 1.5.7

- Add a "See it in action" section to both READMEs with real screenshots (Overview & Quality, Risk & Security, Dependency Graphs, SBOM) captured from a live report generated by running Codes Doctor on its own source.

## 1.5.6

- Remove internal refactoring details, project measurement scores and version-specific progress notes from both READMEs; keep version history in this changelog and describe report behavior for users.

## 1.5.5

- Restrict the dashboard provider to VS Code view attachment, redraw and subscription cleanup; move UI state and workflow composition into a typed controller factory.
- Render sections through focused functions instead of routing each section through provider methods, narrowing dashboard interfaces.
- Dispose replaced view subscriptions and release detached views; add lifecycle regression coverage and refresh structural measurements.

## 1.5.4

- Split dashboard history, controls and browser event handling into focused modules; depend on a dashboard interface instead of the concrete provider.
- Split UI, engine and report-asset tests by responsibility, removing all reported unstable-module candidates without relaxing analysis thresholds.
- Replace explicit any annotations with concrete types, typed local imports and vendor API contracts; validate JSON history metadata at runtime.
- Record extension-version provenance in generated reports and verify the packaged engine against security fixtures, preserving executable-risk detection.
- Refresh measurement and deployment documentation; prepare the updated local VSIX.

## 1.5.3

- Sanitize Markdown HTML with bundled DOMPurify, upgrade saved report bundles, and restrict webview scripts and network access with CSP hashes.
- Allow only extension commands from dashboard messages; split dashboard actions from presentation and lifecycle.
- Exclude literal examples, comments and proven RegExp calls from security findings while retaining executable risks. Measure exported TypeScript declarations and exclude type-only dependency edges.
- Escape repository/file display names and script-embedded JSON to prevent HTML injection.
- Replace copy-icon HTML injection with SVG DOM construction, add security regression coverage, make lint run type checking, and refresh development/deployment documentation.

## 1.5.2

- Use Codes Doctor for report titles, headings and attribution, including saved reports.
- Update dependencies and TypeScript compiler, replace UUID dependency with Node crypto, and rebuild report libraries with patched KaTeX. Embed audited browser libraries and upgrade known legacy CDN tags on opening.
- Preserve literal replacement sequences in embedded bundles and keep navigation scripts outside library HTML export strings.

## 1.5.1

- Fix report-copy upgrades matching escaped AST source examples and removing closing template markup, which silently prevented report tabs from running.
- Refresh existing navigation scripts instead of relying only on an installation marker.
- Move all extension and vendoring implementation sources to TypeScript under src, preserving generated JavaScript entry points for VS Code and existing callers. Add strict compilation and real-browser report navigation tests.

## 1.5.0

- Keep report tabs interactive when browser storage is blocked or optional Markdown/diagram scripts fail. Initialize navigation in its own script.
- Upgrade tab handling in previously saved reports when opened through the extension, preserving valid saved tab selection.

## 1.0.14

- Separate dashboard presentation and styles, report history storage, and path-specific engine patch strategies while keeping public APIs intact.
- Use manifest settings as the source of defaults and token constraints, and centralize retry, AST batching, security caps and command identifiers.
- Add repository boundary regression coverage for sorting, metadata and corrupt files.

## 1.0.13

- Extract static CommonJS imports, re-exports and dynamic imports; resolve internal dependencies by file path and exclude external packages from internal counts.
- Prevent zero coupling from being classified as high, correct centrality and cycle traversal, and classify layers relative to the workspace.
- Delegate dashboard LLM review execution to an internal workflow helper while preserving public methods and messages.

## 1.0.12

- Prepend coding-agent implementation instructions when copying LLM reviews and place a compact copy icon at the right of each result. Upgrade copy controls in previously saved reports.
- Preserve literal dollar replacement sequences, Japanese text, and code when saving LLM results to HTML.

## 1.0.11

- Add Copy for AI buttons to full and AST LLM reviews, preserving original Markdown and code blocks, with clipboard feedback in browsers and VS Code webviews.

## 1.0.10

- Add a configurable LLM output token limit in VS Code settings and the dashboard, defaulting to 16,000, with model-specific starting points and retry cost guidance.
- Pass the configured limit to review requests and point token-exhaustion errors to the extension setting.

## 1.0.9

- Retry empty OpenAI reviews once with a larger token budget when reasoning exhausts the output limit, and show actionable errors for persistent empty output or refusal.
- Extract Responses API review text from all message items, including messages following reasoning output.

## 1.0.8

- Show the lightweight structure extraction notice only beside Dart or Python results when files of that language are present.

## 1.0.7

- Simplify AST headings and remove the introductory explanation and sampling notes.
- Include every analyzed file in the AST report, with 20-file batches and a Show more button for longer lists.
- Remove structure-item and raw-data truncation limits so complete detected structures and TypeScript/JavaScript/PHP AST data can be inspected. Dart/Python parsing capabilities are unchanged.

## 1.0.6

- Fix class dependency graphs initializing at zero width in hidden tabs; render when visible, resize with the panel, and explain missing links or a failed D3 download.
- Show initial static AST structures without misleading LLM execution instructions, localize AST headings and structure labels, and fix saved AST-specific review updates.
- Cap security scores by detected severity (Critical: 59, High: 79, Medium: 89, other findings: 99) so findings cannot round up to 100; make explanations reflect actual severity and distinguish detection candidates from confirmed vulnerabilities.

## 1.0.5

- Fix Japanese Markdown bold rendering next to punctuation and surrounding text in LLM reports, while preserving code spans and fenced code.
- Improve AI review prompts with actionable inspection, conditional refactoring, and acceptance checks within the existing report sections.

## 1.0.4

- Fix: keep the selected Display & Report Language as an application-wide user preference, preventing older workspace settings from overriding it after selection, rerendering, or restart.

## 1.0.3

- Localize VS Code settings, command titles, and the dashboard view name in Japanese.

- Add English/Japanese dashboard and report language selection, with English as the default. Localize notifications, diagnostic explanations, graphs, and AI review prompts. Historical reports keep their language when an AI review is appended.

## 1.0.2

- Fix: a saved LLM review's Markdown result was patched into the report file as a raw, unrendered string (and could show mojibake), because only the visible text was updated, not the `data-md` attribute the report's Markdown renderer reads on load. Both are now kept in sync.
- Fix: after "Run LLM Review" completes, the report is now reopened automatically so the result is visible without manually finding and reloading the old tab/panel.
- Add: Dashboard now shows a "Report History" list (every previously generated report for this workspace, by repo name and analysis time) — click an entry to reopen that report, which also makes it the target for "Run LLM Review".

## 1.0.1

- Fix: OpenAI reasoning/GPT-5 models that reject a custom `temperature` (require the API default) now automatically retry without it, instead of failing the review.
- Fix: OpenAI models that reject `max_tokens` (require `max_completion_tokens`) now automatically retry with the correct parameter name.
- Fix: running an LLM review no longer requires `CSAP_LLM_ENABLED` on the bundled engine — a caller-supplied API key is always enough.
- Change: the generated report's LLM sections are now read-only displays of the saved result. All configuration (provider, API key, model) and the "run" action live only in the Dashboard panel, which is the only place that can securely hold the key.
- Add: Dashboard now remembers the previously selected model (and keeps it usable) even before models are re-fetched.
- Add: Dashboard shows a clear running/done/error state while an LLM review is in flight, instead of relying solely on a notification popup.
- Add: Dashboard lists the history of past LLM reviews (focus, provider, model, timestamp) for the current analysis.

## 1.0.0

- Initial public release.
- In-process analysis engine (no external server required): God Class detection, technical debt scoring, security scoring, dependency/call graphs, architecture layer analysis, SBOM generation.
- Language support: TypeScript/JavaScript, PHP, Dart, Python.
- Dashboard (Activity Bar) with language mode and report-open-mode controls.
- Reports open in an external browser, a VS Code WebView panel, or via VS Code's own URI handler.
- Optional LLM structural review: choose OpenAI or Anthropic, set an API key via secure secret storage, fetch the provider's live model list, and run a review that's written back into the report.
