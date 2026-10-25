# Changelog

All notable changes to the Codes Doctor monorepo (`@codes-doctor/engine`, `codes-doctor` CLI, and `codes-doctor` VS Code extension) are documented here.

- English: [CHANGELOG.md](CHANGELOG.md)
- 日本語: [CHANGELOG.ja.md](CHANGELOG.ja.md)

---

## 7.2.6

- Documentation & Agent Integration: Added comprehensive Claude Code & Google Cloud Code integration guide to `AI_INTEGRATION.ja.md` and `AI_INTEGRATION.md`, explaining why CLI agents require prompt copy or CLI execution instead of in-editor `@` mentions, and added `CLAUDE.md` to project root.

## 7.2.5

- CI action & runner exclusion: Added reusable composite GitHub Action (`action.yml`) enabling automated Codes Doctor analysis across any project repo. Updated `fileWalker` to automatically ignore runner directory patterns (`.codes-doctor*`).

## 7.2.4

- Refactoring & Debt Reduction: Separated tree item presentation and child generation out of `FindingsTreeDataProvider` into pure helper functions (reducing God Score from 27 to 19). Extracted `FlowCollector` out of `FlowAnalysis` in the taint engine to isolate flow deduplication and summary sink tracking from AST traversal (reducing God Score from 45 to 38, lowering workspace average God score from 30 to 22, and boosting Technical Debt score from 85 to 86/100).
- Security rule hygiene: Replaced `RegExp.prototype.exec` with `String.prototype.match` across supply chain, AI fix preview, and comment ignore modules to eliminate false-positive shell command injection pattern flags.

## 7.2.3

- Deterministic AI Agent Prompt export: Added 1-click prompt generation and clipboard copying (`codeDoctor.copyAiAgentPrompt`, `@codedoctor /prompt`, and a dashboard "Copy Prompt for AI Agents" button) for Copilot, Claude Code, Antigravity, and Codex. It synthesizes technical debt (God Classes, complex methods), circular dependency chains, and taint-flow security findings into actionable agent tasks with zero LLM API dependency.

## 7.2.2

- Update dependencies across monorepo packages to latest minor/patch versions (`@azure/identity` 4.14.0, `@azure/msal-browser` 5.26.0, `@azure/msal-common` 16.14.3, `open` 11.0.4, `qs` 6.16.1, `es-toolkit` 1.53.0, `cytoscape` 3.34.4).
- Verified dependency supply chain, signatures, and lockfiles across all packages (`npm run verify:deps`).

## 7.2.1

- Internal: split responsibilities out of four modules without changing behavior: workspace analysis and API key commands out of the command handlers, security finding detection out of the security score, audit report output out of the security rules controller, and the module coupling report section out of the overview sections. Characterization tests were added first for the commands and the controller; report and security score output were compared byte for byte before and after.

## 7.2.0

- Data flows are followed across files: a workspace scan summarizes every function first, then connects calls through relative `import` / `require` and to project functions and methods with a unique name. A flow into another file is reported on the call that passes the input, with the other file's lines in the path, Problems and hovers. Single files saved later are scanned against the last workspace scan's summaries.
- Broken object level authorization (BOLA / IDOR): rules with `detect: { type: object_access }` check every request handler that uses a requested ID to read, change or delete an object, and report it as "No ownership check", "Filtered by an owner field — check where its value comes from" or "Ownership check found" (with the line). Ownership evidence is a lookup scoped to the signed-in user, an `if` comparing with the signed-in user, or an authorization call. Rules can add project-specific owner expressions and authorization calls. The panel lists the handlers per status, and the audit report adds the handlers and their counts (new CSV columns endpoints_missing, endpoints_unverified, endpoints_checked).
- Engine: object literal shorthand (`{ id }`) now carries taint, and a callback passed as an argument no longer counts as the argument's value.
- Dependency checks: npm audit now uses the same reviewed allowlist as the OSV check (`security/osv-allowlist.json`, reason and expiry required). Allowed until 2026-11-24: GHSA-xcx6-jx8p-x3h5 in @azure/msal-node 6.0.1, a development dependency of the VSIX publishing tool; it affects only the authorization code flow, which the tool does not use, and no fixed @azure/identity release exists yet.
- Benchmark adds BOLA: Juice Shop 10 true and 15 false positives (mostly public data and owners set by middleware), DVWA 18 true and 0 false positives; the other checks are unchanged (38 true, 0 false positives).

## 7.1.2

- Development and release checks: installs are refused outside Node.js 24+, builds stop when node_modules does not match package-lock.json, and CI and every release verify registry signatures, require each dependency install script to be explicitly allowed or denied, and audit all dependencies (development ones included) with npm audit and OSV. Run them locally with `npm run verify:deps`; `npm run package:vsix` now packages from a clean install.

## 7.1.1

- Fix: TypeScript files with generic arrow functions (`<T>(value: T) => value`) failed to parse and were silently left out of the analysis, the call graph and the AST view. JSX is now enabled only for file types that allow it.
- Update report libraries: DOMPurify 3.4.17 (advisories GHSA-cg2g-xh64-v4q7, GHSA-mrv2-3pqr-j5jr and GHSA-c6gr-qvv4-5v3f; the report's sanitizer settings were not affected), Chart.js 4.6.1, Mermaid 12.2.0, marked 18.1.1.
- The CLI now requires Node.js 24 or newer (Node.js 20 is end-of-life). Development and releases use Node.js 24; CI also tests Node.js 26.
- Internal: split the data-flow analysis (guards, quoting, syntax helpers) and the security-rule modules (ruleset, scan, audit, presentation, workspace scan) into smaller files; no behavior change.

## 7.1.0

- Data-flow analysis follows values through functions in the same file: a parameter that reaches a dangerous call inside a helper, and arguments or input sources carried by return values, are traced from the caller.
- Validation in `if` conditions, `else` branches and guard clauses (`if (!valid($x)) exit;`) makes the validated expression clean: `is_numeric`, `ctype_*`, anchored `preg_match`, `filter_var(..., FILTER_VALIDATE_*)`, strict `in_array`, `Number.isInteger`, anchored `/^…$/.test`, `validator.is*` and constant allowlists.
- SQL escaping (`mysqli_real_escape_string`, `addslashes`, `real_escape_string`) only protects a value inside quotes; a value placed into SQL outside quotes is reported again. Hash output (`md5`, `sha*`, `*.hash()`) is clean.
- A detection benchmark on OWASP Juice Shop and DVWA, pinned to a commit with every finding labeled by hand, runs in CI: 38 true positives, 0 false positives and 3 known misses (7.0: 34, 6 and 7).

## 7.0.0

- Add security rule sets: sync the rule packs from masahiroid/security-rules (SHA-256 verified, cached in the extension's storage for offline use; the source is a user setting only, so a workspace cannot pick the rules it is checked with), flag review candidates in Problems and hovers with source, check steps and management-sheet column, scan the workspace, and export JSON/CSV audit reports. Commands: Sync Security Rules, Scan Workspace with Security Rules, Export Security Audit Report. The dashboard has a Security Rules section: sync, choose which packs to check, scan, see results per rule with clickable locations and check steps, and export. Dashboard sections (Security Rules, Report History, Settings, AI Review) are now collapsible and remember their state. Network access is opt-in (codeDoctor.securityRules.autoSync). Matches are review candidates, never a compliance verdict.
- Deterministic detection for distributed rules: a rule with `detect: { type: taint }` runs the engine's data-flow analysis (TypeScript/JavaScript and PHP to start) and reports only untrusted input that reaches SQL, command, code execution or SSRF calls, with the traced path in Problems and hovers. Rules can add their own sources, sanitizers and sink calls. Test code is excluded from security-rule scans. `sourceUrl` also accepts a `file:` URL for a local or shared-drive ruleset.
- Security-rule scans parse each file once for all data-flow rules, can be cancelled, and show which languages were analyzed: a rule whose languages have no files says "No files to analyze" instead of "No flow found", and source files in unsupported languages are counted as not checked.
- Engine: PHP procedural SQL calls (`mysqli_query($link, $sql)`, `pg_query`) now check the query argument, not only the connection.
- Engine: PHP object and static SQL calls (`$pdo->query`, `DB::select`, `->whereRaw` and similar) are now data-flow sinks.

## 6.0.5

- Refresh English and Japanese READMEs for 6.x: setup, editor findings, Git changes, VS Code AI, chat, fix previews, settings and analysis limitations.

## 6.0.4

- Exclude TypeScript declaration files (`.d.ts`), minified and pre-bundled distribution files (`.min.js`, `.bundle.js`), sourcemaps, and build artifacts from workspace analysis.
- Exclude `lib` compiler output directories when sibling `src` directories exist, and respect hierarchical `.gitignore` files in subdirectories.
- Cap raw AST output size per file to prevent generating oversized HTML reports that freeze external browsers and exhaust extension-host memory.
- Add error handling and fallback notifications when opening reports in the external browser or webview.
- Avoid extension-host memory exhaustion when opening large reports by passing external reports directly to the browser; bound report-language reads and open oversized webviews externally.

## 6.0.3

- Add OpenSSF Best Practices badge to README files.

## 6.0.2

- Sort security and vulnerability finding tables by severity (Critical first) with severity checkbox filters and expand-all buttons.

## 6.0.1

- Add SECURITY.md, CONTRIBUTING.md and a CodeQL code scanning workflow.
- Fix the dashboard browser test to cover both the Analyze Current Workspace and Analyze Git Changes buttons.

## 6.0.0

- Add VS Code Language Model API (vscode.lm) provider option to run AI reviews and prompts without external API keys.
- Add @codedoctor VS Code Chat Participant (/analyze, /security, /refactor, /fix) grounded in Codes Doctor analysis results.
- Add 1-click AI Fix Diff Preview & Apply (codeDoctor.previewAiFix and editor Quick Fix lightbulb action).
- Add Marketplace version, downloads, rating, and license badges to README files.

## 5.0.0

- Add Analyze Git Changes command (codeDoctor.analyzeGitChanges) and Dashboard button to focus diagnostics and Findings tree on uncommitted or last-commit changed files.
- Add inline ignore comment support (code-doctor-ignore-next-line, code-doctor-ignore, code-doctor-ignore-file) with Quick Fix CodeActionProvider in the editor.
- Add immediate ignore comment re-evaluation on file save and optional background analysis on save (codeDoctor.analyzeOnSave).

## 4.0.2

- Add inline editor diagnostics in the Problems panel for security findings (with traced data-flow steps) and God Classes.
- Add hover provider with security explanations, remediation advice, and traced flow paths.
- Add status bar indicator showing live Security and Technical Debt scores with quality gate warnings.
- Add Findings tree view in the Activity Bar to drill down and jump directly to source lines.

## 4.0.1

- Add Quality Gate score threshold warnings (minSecurity, minTechnicalDebt) aligned with CLI.
- Add commands to copy analysis summary as formatted text and JSON.
- Support configurable outputDirectory setting.

## 4.0.0

- **Syntax-tree analysis for Python, Go, Java, C#, Rust and C++.** Tree-sitter parsing for reliable classes, methods, fields, functions, and imports.
- **Fewer security false positives.** Matches in comments and plain strings are ignored; constant-only command executions are excluded.
- **Test code recognition.** Findings in test code are labelled and do not penalize the security score.
- **Redesigned report and dashboard.** Soft pastel design system supporting light/dark OS and VS Code themes.
- **Taint analysis.** Traces untrusted input to dangerous sinks within functions across 8 languages.
- **Security evidence for LLM reviews & coding agent prompts.**
- **Long class names wrap cleanly** in report tables.

## 3.0.0

- Monorepo consolidation: engine, extension, and new CLI in one repository.
- Standalone `codes-doctor` CLI with exit-code quality gates.
- Automated CI, weekly dependency updates, and Marketplace publishing.

## 2.0.0

- Dual-language User Guide (EN/JA).
- AST tab for all languages.
- Hardened dependency scan execution against command injection.

## 1.0.0

- Initial release: in-process analysis engine, God Class detection, technical debt, security scanning, dependency graphs, SBOM, and optional LLM review.
