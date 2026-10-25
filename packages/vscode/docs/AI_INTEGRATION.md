# Codes Doctor — AI Integration & Workflow Guide

Codes Doctor combines deterministic static analysis (AST parsing, taint data-flow tracking, software metrics) with AI (LLMs) to create a hybrid workflow for code quality and security remediation.

In addition to direct OpenAI and Anthropic API connections, Codes Doctor supports **`vscode-lm` (VS Code Language Model API)**, allowing you to use signed-in models from **GitHub Copilot** and other editor AI providers with **no separate API keys, no additional subscriptions, and zero configuration**.

Furthermore, Codes Doctor integrates seamlessly with autonomous coding agents such as **Claude Code**, **Antigravity**, **Cursor**, and **Codex** via CLI automation and structured agent prompts.

---

## Table of Contents

1. [Supported AI Tools & Integration Matrix](#1-supported-ai-tools--integration-matrix)
2. [Interactive Chat Assistant (@codedoctor)](#2-interactive-chat-assistant-codedoctor)
3. [1-Click AI Fix Diff Preview](#3-1-click-ai-fix-diff-preview)
4. [No-API-Key AI Reviews (vscode-lm)](#4-no-api-key-ai-reviews-vscode-lm)
5. [Autonomous Coding Agents Integration](#5-autonomous-coding-agents-integration)
   - [Claude Code (Anthropic Terminal Agent)](#claude-code-anthropic-terminal-agent)
   - [Antigravity (Google Coding Agent)](#antigravity-google-coding-agent)
   - [Cursor / Codex Prompt Workflow](#cursor--codex-prompt-workflow)
6. [Direct API Key Integration (OpenAI / Anthropic)](#6-direct-api-key-integration-openai--anthropic)
7. [Privacy and Security Guarantees](#7-privacy-and-security-guarantees)

---

## 1. Supported AI Tools & Integration Matrix

| Tool / Model | Integration Method | API Key Required? | Primary Use Case & Highlights |
| :--- | :--- | :---: | :--- |
| **GitHub Copilot** | `@codedoctor` / `vscode-lm` | **None** | In-editor chat assistant, comprehensive AI reviews, 1-click diff preview. Powered by your active VS Code Copilot subscription. |
| **Claude (Anthropic)** | ① `anthropic` (Direct API)<br>② `vscode-lm` (via Copilot) | ① Yes<br>② **None** | High-precision taint-flow security reviews, God Class decomposition, and refactoring proposals using Claude 3.5 Sonnet / Opus. |
| **Codex / OpenAI** | ① `openai` (Direct API)<br>② `vscode-lm` (via Copilot) | ① Yes<br>② **None** | Comprehensive code reviews and targeted fix generation using GPT-4o or Codex family models. |
| **Claude Code** | CLI (`codes-doctor`) | Configured in CLI | Terminal-based autonomous agent runs `codes-doctor analyze` and resolves reported critical/high security issues automatically. |
| **Antigravity** | CLI / Extension | Built-in | Autonomous agent reads deterministic analysis findings (Source -> Sink flows) and executes verified patches with test suites. |
| **Continue / Cline / Others** | `vscode-lm` | **None** | Works with local LLMs (Ollama, LM Studio) and third-party models registered with the VS Code Language Model API. |

---

## 2. Interactive Chat Assistant (@codedoctor)

Open the VS Code Chat panel (e.g. GitHub Copilot Chat) and mention `@codedoctor` to interact with an AI specialist that has full visibility into your latest Codes Doctor analysis.

> [!TIP]
> The participant handle is `@codedoctor` (singular).

### Injected Context
Whenever you interact with `@codedoctor`, the following context is automatically assembled:
- **Latest Analysis Summary**: Security score, technical debt score, lines of code, and issue counts.
- **Top Security Findings**: Verified taint-flow traces (Source code -> Sink execution path).
- **Top God Classes**: High-scoring monolithic classes with member/method breakdowns.
- **Circular Dependencies**: Detected import loops.
- **Active Editor Context**: Current active file and any selected snippet of code.

### Slash Commands

```text
@codedoctor /security
```
Explains detected security vulnerabilities (SQL injection, XSS, Path Traversal, etc.), why they are risky, and exact remediation advice.

```text
@codedoctor /fix
```
Generates safe replacement code targeting the selected snippet or the active finding in the editor.

```text
@codedoctor /refactor
```
Proposes architectural decompositions for God Classes or strategies to eliminate circular dependencies.

```text
@codedoctor /analyze
```
Summarizes the latest workspace audit, highlighting top priorities.

```text
@codedoctor Write input validation and sanitization for this route handler
```
Free-form prompting with full awareness of your project's static analysis data.

---

## 3. 1-Click AI Fix Diff Preview

Generate and review code fixes directly from the editor squiggly line or the Problems panel:

1. Click the lightbulb icon (Quick Fix) on a diagnostic finding or right-click to select **"Codes Doctor: Preview AI Fix"**.
2. A side-by-side **Diff Editor** opens showing the proposed fix against your existing code.
3. Review the proposed diff. If satisfied, click **"Apply Fix"** at the top of the editor to safely update your file.

---

## 4. No-API-Key AI Reviews (vscode-lm)

The comprehensive AI Review and AI Agent Prompt generation in the Codes Doctor dashboard and HTML report can run completely without external OpenAI or Anthropic API keys.

### Setup
1. Open VS Code Settings and search for `codeDoctor.llmProvider` (or open the Settings tab in the Codes Doctor Dashboard).
2. Set the provider to **`vscode-lm`**.
3. *(Optional)* Select a specific model (e.g. `gpt-4o`, `claude-3-5-sonnet`) in `codeDoctor.llmModel`. If left blank, the default recommended model is used.
4. Click **"Run LLM Review"** on the Dashboard.

The review is generated using your signed-in VS Code AI credentials and embedded into the report.

---

## 5. Autonomous Coding Agents Integration

Codes Doctor ships with `@codes-doctor/cli`, making it an ideal companion for autonomous agentic workflows.

### Claude Code (Anthropic Terminal Agent)
Run `claude` in your terminal and instruct it to leverage Codes Doctor:

```bash
$ claude
> Run "npx @codes-doctor/cli analyze ." and fix all reported Critical and High security vulnerabilities. Verify with tests.
```

Claude Code will invoke the CLI, parse the deterministic findings, edit the vulnerable code paths, and run the test suite to verify the fixes.

### Antigravity (Google Coding Agent)
In Antigravity agent workflows, deterministic static analysis identifies exact taint paths without hallucination, enabling the agent to create robust, verifiable patches.

```bash
# Quality gate integration
npx @codes-doctor/cli analyze . --min-security 80 --min-debt 75
```

### Cursor / Codex Prompt Workflow
Set the dashboard's **Output Mode** to **`agentPrompt`** (AI Coding Prompt) to produce an actionable Markdown specification for external AI agents:

- Click **Copy for AI (Markdown)**.
- Paste directly into Cursor, ChatGPT, or Claude. The prompt includes exact filenames, line numbers, and deterministic verification steps with zero hallucinations.

---

## 6. Direct API Key Integration (OpenAI / Anthropic)

If you prefer to use your own direct API account for higher rate limits or specific frontier models:

1. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).
2. Run **`Codes Doctor: Set LLM API Key`**.
3. Select your provider (`openai` or `anthropic`) and paste your API key.
   - Keys are stored securely in VS Code's encrypted **Secret Storage** (never written to `settings.json`).
4. Configure your desired model and token limits to run reviews.

---

## 7. Privacy and Security Guarantees

- **Deterministic Static Analysis**:
  - All core parsing, taint analysis, and metrics run locally inside the Node.js process. Your source code is never sent to external servers.
- **AI Requests**:
  - Code snippets and analysis metadata are transmitted to AI providers **only when you explicitly trigger an AI action** (running an LLM review, prompting `@codedoctor`, or requesting an AI Fix Preview).
  - When AI features are not invoked, zero external network requests are made.

