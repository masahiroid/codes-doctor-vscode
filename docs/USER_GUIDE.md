# Codes Doctor User Guide

- English: [USER_GUIDE.md](https://github.com/masahiroid/codes-doctor-vscode/blob/main/docs/USER_GUIDE.md)
- 日本語: [USER_GUIDE.ja.md](https://github.com/masahiroid/codes-doctor-vscode/blob/main/docs/USER_GUIDE.ja.md)

This guide explains how to run Codes Doctor, how to read its report, and how to use the optional AI features.

## Contents

1. [What Codes Doctor does](#1-what-codes-doctor-does)
2. [Install](#2-install)
3. [Quick start](#3-quick-start)
4. [The Dashboard](#4-the-dashboard)
5. [Reading the report](#5-reading-the-report)
6. [Supported languages](#6-supported-languages)
7. [AI review and AI coding prompts](#7-ai-review-and-ai-coding-prompts)
8. [Settings reference](#8-settings-reference)
9. [Privacy and data handling](#9-privacy-and-data-handling)
10. [Troubleshooting](#10-troubleshooting)

## 1. What Codes Doctor does

Codes Doctor statically analyzes the folder you have open in VS Code and writes an HTML report covering:

- **God Classes**: classes that have taken on too many responsibilities, ranked by a 0–100 score.
- **Technical debt**: a 0–100 score with an A–F grade, built from complexity, maintainability (module coupling and stability), and circular dependencies.
- **Security**: a 0–100 score with an A–F grade, built from static pattern matches such as command execution, SQL built from strings, weak hashing, and hard-coded secrets.
- **Dependency graphs**: module and class dependencies, function calls, circular dependencies, and architectural layers.
- **SBOM and vulnerabilities**: a software bill of materials for npm dependencies, plus a dependency vulnerability scan (using [Trivy](https://trivy.dev/) when installed, otherwise `npm audit`).

The analysis engine runs inside the extension. Your code is not uploaded anywhere unless you choose to use the AI features (see [section 9](#9-privacy-and-data-handling)).

## 2. Install

1. Install **Codes Doctor** from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=masahirocom.codes-doctor), or run `code --install-extension codes-doctor-<version>.vsix` for a local build.
2. You need VS Code 1.90 or newer.
3. A Codes Doctor icon appears in the Activity Bar.

## 3. Quick start

1. Open the project folder you want to check.
2. Click the Codes Doctor icon in the Activity Bar, then **Analyze Current Workspace**. You can also run `Codes Doctor: Analyze Current Workspace` from the Command Palette.
3. If the workspace has several folders, pick one.
4. The report opens in your browser. You can change where it opens with **Open Report Using**.

Start with the **Overview & Quality** tab: it shows the two scores and the God Class ranking.

## 4. The Dashboard

| Control | What it does |
| --- | --- |
| **Display & Report Language** | English or 日本語. Applies to the dashboard, notifications, new reports, and AI output. Reports that already exist keep their language. |
| **Language Mode** | `Auto Detect (recommended)` analyzes every supported language it finds. Choose a single language to restrict the analysis to that language. |
| **Open Report Using** | External browser, a VS Code WebView panel, or VS Code's own URI handler. |
| **Analyze Current Workspace** | Runs the analysis and opens the report. |
| **LLM Provider / Set API Key / Fetch / Model** | Set up the optional AI review (see [section 7](#7-ai-review-and-ai-coding-prompts)). |
| **Output Mode** | `Review report` for a review written for people, or `AI coding agent prompt` for a task prompt to paste into an AI coding agent. |
| **Maximum output tokens** | Upper limit on the AI's output length. |
| **Run LLM Review / Generate AI Coding Prompt** | Runs the AI step against the most recent analysis. The button label follows the Output Mode. |
| **Report History / LLM Review History** | Reopen earlier reports and see which AI outputs exist for the current one. |

## 5. Reading the report

The report has six tabs.

### Overview & Quality

- **Technical Debt Score** and **Security Score** cards, each 0–100 with a grade. Higher is better.
- If the folder contains no files in any supported language, a warning banner appears and both cards show **N/A**. That means nothing was analyzed, not that the code is perfect.
- **God Class Rankings**: classes sorted by God Class score, with method count, line count, and dependency count. Treat scores of 60 and above as candidates for splitting.
- **Module Coupling Metrics**: fan-in (how many modules depend on this one), fan-out (how many it depends on), and instability (`fan-out / (fan-in + fan-out)`). A module with instability above 0.8 depends on much and is depended on by little, so it changes easily.
- **Architecture Layer Analysis**: files grouped into layers (Presentation, API, Business Logic, Data Access, …) based on directory names, with a layer-to-layer dependency matrix.
- **File Statistics**: per-file language, class count, line count, and a size distribution chart.

### Dependency Graphs

- **Module Dependency Graph** and, for TypeScript/JavaScript and PHP, a **function call graph**.
- **Class Dependency Graph (D3.js)**: an interactive graph you can zoom and drag.
- **Circular Dependencies Detected**: each cycle with its length. Short cycles (two modules referencing each other) are usually easy to break; long cycles usually point to a missing abstraction.

### LLM Analysis

This tab shows the AI review and the AI coding prompt once you have run them. Each has a **Copy for AI (Markdown)** button.

### AST Analysis

Shows the extracted structure of every analyzed file: imports, classes or types with their methods, and functions. For TypeScript/JavaScript and PHP this comes from a full syntax tree, and the raw tree is shown too. For the other languages a lightweight structural scan is used, and the report says so. Long lists load in batches; click **Show more** to load the next batch.

### Risk & Security

- **Technical Debt Score** broken down into complexity, maintainability, and circular dependencies, with the problems and strengths behind each.
- **Security Score** with the issues it found: severity, category, file, line, and a recommendation.

Security findings are pattern-based candidates. Read each one in context before acting. Comments, string literals, and literal `RegExp.exec()` calls are excluded.

### SBOM & Vulnerabilities

The dependencies listed in `package.json` and lock files, split into direct, transitive, and development dependencies. The vulnerability scan uses Trivy when `trivy` is on your `PATH` and falls back to `npm audit` otherwise. `npm audit` needs the project's dependencies installed (`npm install`).

## 6. Supported languages

| Language | Parser | God Class | Technical debt | Security | Call graph |
| --- | --- | --- | --- | --- | --- |
| TypeScript / JavaScript | Full AST | ✅ | ✅ | ✅ | ✅ |
| PHP | Full AST | ✅ | ✅ | ✅ | ✅ |
| Python | Lightweight | ✅ | ✅ | ✅ | — |
| Go | Lightweight | ✅ | ✅ | ✅ | — |
| Swift | Lightweight | ✅ | ✅ | ✅ | — |
| C# | Lightweight | ✅ | ✅ | ✅ | — |
| Java | Lightweight | ✅ | ✅ | ✅ | — |
| Kotlin | Lightweight | ✅ | ✅ | ✅ | — |
| Rust | Lightweight | ✅ | ✅ | ✅ | — |
| C++ | Lightweight | ✅ | ✅ | ✅ | — |
| Dart | Lightweight | ✅ | ✅ | — | — |

- **Full AST** languages are parsed with a real parser. **Lightweight** languages use a brace- and indentation-aware structural scan. It finds classes, methods, functions, and imports reliably in conventional code, but it is not a compiler.
- Dependency graphs, circular dependencies, layer analysis, and the SBOM work across all languages.
- C++ covers `.cpp`, `.cc`, `.cxx`, `.hpp`, and `.hh`. Plain `.h` and `.c` files are skipped because they may be C.
- Files in other languages (for example Ruby) are not analyzed. If a folder contains only such files, the report shows the "no supported files" banner.
- In **Language Mode**, `TypeScript/JavaScript` analyzes both; `JavaScript only` analyzes only `.js`/`.jsx`; every other choice analyzes only that language.

## 7. AI review and AI coding prompts

The AI features are optional and use your own API key from OpenAI or Anthropic.

1. Choose a provider in **LLM Provider**.
2. Click **Set API Key** and paste your key. It is stored in VS Code's secret storage (your OS keychain), never in `settings.json` or the workspace.
3. Click **Fetch** to load the models your key can use, then choose one.
4. Run an analysis if you have not already.
5. Choose an **Output Mode** and click **Run LLM Review** or **Generate AI Coding Prompt**. The result is written into the report, and the report reopens.

### Review report mode

The AI writes a structural review for people to read: what the metrics mean for this codebase, the main risks, and suggested next steps.

### AI coding agent prompt mode

The AI writes a task prompt you can paste unchanged into Claude Code, Cursor, GitHub Copilot, or Codex. It contains:

- the goal and the metrics behind it;
- up to five prioritized tasks, each with its target, evidence, what to inspect first, the change, what not to change, and acceptance checks;
- what to leave as is, and the report the agent should give back.

The prompt only names files and symbols that appear in the analysis. Anything uncertain is written as a step to inspect, not as a fact. Use **Copy for AI (Markdown)** to copy it as is. The review and the prompt are stored separately, so generating one does not replace the other.

### Choosing Maximum output tokens

The default is 16,000. Typical starting points are 4,000–8,000 for non-reasoning models and 16,000–32,000 for reasoning models; reasoning counts toward the limit. If an OpenAI model returns empty output at the limit, Codes Doctor retries once with a larger limit, which can cost more.

## 8. Settings reference

| Setting | Default | Values |
| --- | --- | --- |
| `codeDoctor.displayLanguage` | `en` | `en`, `ja`. Stored as an application-wide preference. |
| `codeDoctor.analysisLanguage` | `auto` | `auto`, `typescript`, `javascript`, `php`, `dart`, `python`, `go`, `swift`, `csharp`, `java`, `kotlin`, `rust`, `cpp` |
| `codeDoctor.reportOpenMode` | `external` | `external`, `webview`, `vscode` |
| `codeDoctor.llmProvider` | `openai` | `openai`, `anthropic` |
| `codeDoctor.llmOutputMode` | `review` | `review`, `agentPrompt` |
| `codeDoctor.llmModel` | empty | Set from the Dashboard after **Fetch** |
| `codeDoctor.llmMaxOutputTokens` | `16000` | 200 – 1,000,000 |

## 9. Privacy and data handling

- **Analysis** runs entirely inside VS Code. Nothing is sent over the network.
- **Reports** are saved in the extension's storage folder and embed their own chart and Markdown libraries, so they open offline. Markdown is sanitized before display, and WebView panels block network access.
- **AI features** send the analysis summary for the folder to the provider you chose: metrics, file paths, and class, method, and function names. Source code is not sent. The provider's own data policy applies.
- **API keys** stay in VS Code's secret storage and are sent only to the provider you chose.

## 10. Troubleshooting

| Symptom | What to do |
| --- | --- |
| Scores show **N/A** with a warning banner | The folder has no files in a supported language. Open the folder that contains the source code, or check **Language Mode**. |
| A language you expected is missing from the report | Check **Language Mode**. A single-language mode skips every other language. |
| **Run LLM Review** is unavailable or fails | Run an analysis first, set the API key, and click **Fetch** to choose a model. Errors from the provider are shown in the notification. |
| AI output is cut off or empty | Raise **Maximum output tokens**, especially for reasoning models. |
| A saved report says its AST display is broken | Run **Analyze Current Workspace** again to regenerate it. The earlier report and AI results are kept. |
| The vulnerability scan says dependencies are not installed | Run `npm install` in the project, or install Trivy so the scan does not depend on `node_modules`. |

See the [CHANGELOG](https://github.com/masahiroid/codes-doctor-vscode/blob/main/CHANGELOG.md) for version history.
