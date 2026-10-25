# Codes Doctor — AI Integration & Workflow Guide

Codes Doctor combines deterministic static analysis (AST parsing, taint data-flow tracking, software metrics) with AI (LLMs) to create a hybrid workflow for code quality and security remediation.

In addition to direct OpenAI and Anthropic API connections, Codes Doctor supports **`vscode-lm` (VS Code Language Model API)**, allowing you to use installed AI extensions in VS Code (**Claude extensions, ChatGPT extensions, GitHub Copilot, Continue, etc.**) with **no separate extension API keys and zero configuration**.

Furthermore, Codes Doctor integrates with autonomous coding agents such as **Claude Code**, **Antigravity**, **Cursor**, and **Codex** via CLI automation, **MCP (Model Context Protocol)** tools, and structured agent prompts.

---

## Table of Contents

1. [Supported AI Tools & Integration Matrix](#1-supported-ai-tools--integration-matrix)
2. [Interactive Chat Assistant (@codedoctor)](#2-interactive-chat-assistant-codedoctor)
3. [1-Click AI Fix Diff Preview](#3-1-click-ai-fix-diff-preview)
4. [VS Code AI Extensions Integration (vscode-lm)](#4-vs-code-ai-extensions-integration-vscode-lm)
5. [Autonomous Coding Agents & MCP Integration](#5-autonomous-coding-agents--mcp-integration)
   - [Claude Code (Anthropic Terminal Agent)](#claude-code-anthropic-terminal-agent)
   - [Antigravity (Google Coding Agent)](#antigravity-google-coding-agent)
   - [MCP (Model Context Protocol) Integration](#mcp-model-context-protocol-integration)
   - [Cursor / Codex Prompt Workflow](#cursor--codex-prompt-workflow)
6. [Direct API Key Integration (OpenAI / Anthropic)](#6-direct-api-key-integration-openai--anthropic)
7. [Privacy and Security Guarantees](#7-privacy-and-security-guarantees)

---

## 1. Supported AI Tools & Integration Matrix

Codes Doctor is vendor-neutral and adapts to your chosen development environment.

| Tool / Model | Integration Method | API Key Setup | Primary Use Case & Highlights |
| :--- | :--- | :---: | :--- |
| **Claude (Anthropic)** | ① VS Code Claude extensions / Copilot (`vscode-lm`)<br>② Direct API (`anthropic`) | ① **None**<br>② Required | High-precision taint-flow security reviews, God Class decomposition, and refactoring proposals using Claude models. |
| **ChatGPT / OpenAI** | ① VS Code ChatGPT extensions / Copilot (`vscode-lm`)<br>② Direct API (`openai`) | ① **None**<br>② Required | Comprehensive code reviews and targeted fix generation using GPT and Codex family models. |
| **GitHub Copilot** | `@codedoctor` / `vscode-lm` | **None** | In-editor chat assistant, comprehensive AI reviews, 1-click diff preview. Powered by your active editor AI subscription. |
| **Claude Code** | CLI (`codes-doctor`) / MCP | Configured in CLI | Terminal-based autonomous agent runs `codes-doctor analyze` and resolves reported critical/high security issues automatically. |
| **Antigravity** | CLI / Extension | Built-in | Autonomous agent reads deterministic analysis findings (Source -> Sink flows) and executes verified patches with test suites. |
| **MCP Clients** | MCP (Model Context Protocol) | Configured in Client | Claude Desktop, Cursor, and agent environments invoke Codes Doctor static analysis tools directly. |
| **Local LLMs (Continue / Cline / etc.)** | `vscode-lm` | **None** | Works with local LLMs and third-party models registered with the VS Code Language Model API. |

---

## 2. Interactive Chat Assistant (@codedoctor)

Open the VS Code Chat panel and mention `@codedoctor` to interact with an AI specialist that has full visibility into your latest Codes Doctor analysis.

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

## 4. VS Code AI Extensions Integration (vscode-lm)

The comprehensive AI Review and AI Agent Prompt generation in the Codes Doctor dashboard and HTML report can run through any AI extension installed in your editor.

### Setup
1. Open VS Code Settings and search for `codeDoctor.llmProvider` (or open the Settings tab in the Codes Doctor Dashboard).
2. Set the provider to **`vscode-lm`**.
3. *(Optional)* Select a specific model available from your installed AI extensions in `codeDoctor.llmModel`. If left blank, the default recommended model is used.
4. Click **"Run LLM Review"** on the Dashboard.

The review is generated using your signed-in editor AI account (Claude extension, ChatGPT extension, GitHub Copilot, etc.) and embedded into the report.

---

## 5. Autonomous Coding Agents & MCP Integration

Codes Doctor ships with `@codes-doctor/cli` and supports **MCP (Model Context Protocol)**, making it an ideal companion for autonomous agentic workflows.

### Claude Code (Anthropic Terminal Agent)

> [!IMPORTANT]
> **"Does it work out of the box just by installing the VS Code extension?"**
> Installing Codes Doctor as a VS Code extension registers `@codedoctor` within the **VS Code Chat panel**. However, because **Claude Code** runs as an autonomous agent in a terminal shell outside the VS Code extension host, it does not automatically receive the `@codedoctor` participant.
> To use Codes Doctor with Claude Code, choose one of the three workflows below.

#### Method 1: 1-Click Copy AI Agent Prompt (Recommended)
This method is deterministic, zero-cost (no LLM API needed), and delivers exact AST metrics to Claude Code:

1. Run **"Codes Doctor: Analyze Current Workspace"** in VS Code.
2. In the dashboard overview card, click **`📋 Copy Prompt for AI Agents`** (or press `Cmd+Shift+P` → `Codes Doctor: Copy Prompt for AI Agents`).
3. An actionable Markdown task prompt (containing ranked God Classes, line counts, method counts, circular imports, and taint flow traces) is copied to your clipboard.
4. **Paste (`Cmd+V` / `Ctrl+V`)** directly into Claude Code.
5. Claude Code will autonomously refactor the code according to the verified AST metrics without hallucinations.

#### Method 2: Direct CLI Execution in Claude Code
Because Claude Code has shell execution capabilities, you can prompt it to run the analysis directly:

```bash
# In Claude Code
> Run "npx @codes-doctor/cli analyze ." and refactor the detected God classes and High/Critical security vulnerabilities. Verify with tests.
```

#### Method 3: Instruct Claude Code via `CLAUDE.md`
Add a `CLAUDE.md` file to your project root so Claude Code knows about Codes Doctor automatically:

```markdown
# Codes Doctor Quality Inspection
- When asked to inspect code health or refactor, run `npx @codes-doctor/cli analyze .`.
- Follow the deterministic findings in the generated report to refactor monolithic classes and resolve circular dependencies.
```

---

### Google Cloud Code (Gemini Code Assist)
If you use Google Cloud Code / Gemini Code Assist in VS Code:
1. In VS Code settings, set `codeDoctor.llmProvider` to **`vscode-lm`**.
2. Set `codeDoctor.llmModel` to the Cloud Code / Gemini model provided by the extension.
3. Codes Doctor will utilize your signed-in Google Cloud account without requiring manual API key configuration.

### Antigravity (Google Coding Agent)
In Antigravity agent workflows, deterministic static analysis identifies exact taint paths without hallucination, enabling the agent to create robust, verifiable patches.

```bash
# Quality gate integration
npx @codes-doctor/cli analyze . --min-security 80 --min-debt 75
```

### MCP (Model Context Protocol) Integration
Codes Doctor supports Anthropic's open standard **MCP**. MCP clients such as Claude Desktop, Claude Code, and Cursor can connect to Codes Doctor as a tool server:

- **Analysis Tool (`analyze`)**: Run workspace-wide structural and security audits.
- **Taint Flow Tool (`get_taint_flow`)**: Retrieve Source -> Sink data flow paths for vulnerabilities.
- **God Class Tool (`get_god_classes`)**: Retrieve monolithic classes and refactoring metrics.

This allows AI agents to query verified static analysis findings directly without guessing or hallucinating code paths.

### Cursor / Codex Prompt Workflow
Set the dashboard's **Output Mode** to **`agentPrompt`** (AI Coding Prompt) to produce an actionable Markdown specification for external AI agents:

- Click **Copy for AI (Markdown)**.
- Paste directly into Cursor, ChatGPT, or Claude. The prompt includes exact filenames, line numbers, and deterministic verification steps with zero hallucinations.

---

## 6. Direct API Key Integration (OpenAI / Anthropic)

If you prefer to use your own direct API account for custom rate limits or organization keys:

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
  - Code snippets and analysis metadata are transmitted to AI providers **only when you explicitly trigger an AI action** (running an LLM review, prompting `@codedoctor`, requesting an AI Fix Preview, or invoking an MCP tool).
  - When AI features are not invoked, zero external network requests are made.
