# Codes Doctor — AI 連携・活用ガイド

Codes Doctor は、決定論的な静的解析（AST 構文解析、汚染データフロー追跡、メトリクス算出）と AI（LLM）を組み合わせたハイブリッド型のコード品質・セキュリティ改善ツールです。

外部 API キー（OpenAI / Anthropic）を直接設定して利用できるだけでなく、**VS Code にインストールされた AI 機能拡張（Claude 拡張、ChatGPT 拡張、GitHub Copilot、Continue 等）の Language Model API（`vscode-lm`）を利用することで、拡張機能への個別 API キー設定不要** で AI レビューやチャット対話、ワンクリック修正を活用できます。

さらに、**Claude Code** や **Antigravity**、**Codex** などの自律型コーディングエージェントとの CLI 連携や、**MCP（Model Context Protocol）** による直接的なツール呼び出しにも対応を進めています。

---

## 目次

1. [AI 連携方式・対応ツール一覧](#1-ai-連携方式対応ツール一覧)
2. [VS Code チャット対話（@codedoctor）](#2-vs-code-チャット対話codedoctor)
3. [ワンクリック AI Fix 差分プレビュー](#3-ワンクリック-ai-fix-差分プレビュー)
4. [VS Code AI 機能拡張との連携（vscode-lm）](#4-vs-code-ai-機能拡張との連携vscode-lm)
5. [自律型コーディングエージェント・MCP 連携](#5-自律型コーディングエージェントmcp-連携)
   - [Claude Code（Anthropic ターミナルエージェント）](#claude-codeanthropic-ターミナルエージェント)
   - [Antigravity（Google コーディングエージェント）](#antigravitygoogle-コーディングエージェント)
   - [MCP（Model Context Protocol）連携](#mcpmodel-context-protocol連携)
   - [Cursor / Codex 等へのプロンプト連携](#cursor--codex-等へのプロンプト連携)
6. [直接 API キー連携（OpenAI / Anthropic）](#6-直接-api-キー連携openai--anthropic)
7. [プライバシーとデータの安全性](#7-プライバシーとデータの安全性)

---

## 1. AI 連携方式・対応ツール一覧

Codes Doctor は特定のプロバイダーに縛られず、利用者の環境に合わせて柔軟に AI を選択できます。

| ツール / AI | 連携方式 | APIキー設定 | 主な用途・特徴 |
| :--- | :--- | :---: | :--- |
| **Claude (Anthropic)** | ① VS Code 内の Claude 拡張 / Copilot（`vscode-lm`）<br>② 直接 API（`anthropic`） | ① **不要**<br>② 必要 | Claude 各モデルによる高精度な脆弱性レビューやリファクタリング提案。 |
| **ChatGPT / OpenAI** | ① VS Code 内の ChatGPT 拡張 / Copilot（`vscode-lm`）<br>② 直接 API（`openai`） | ① **不要**<br>② 必要 | GPT シリーズや Codex 各モデルを使ったコードレビュー、修正コード生成。 |
| **GitHub Copilot** | `@codedoctor` / `vscode-lm` | **不要** | チャットでの対話、AI レビュー生成、AI Fix 差分プレビュー。サインイン済みエディタで即座に動作。 |
| **Claude Code** | CLI (`codes-doctor`) / MCP 連携 | 各自設定 | ターミナルで解析を実行させ、出力された指摘を Claude Code が自律的にコード修正。 |
| **Antigravity** | CLI / エディタ拡張 | 各自設定 | エージェントが解析結果を読み取り、安全なパッチ作成と自動テスト検証を自律実行。 |
| **MCP 対応クライアント** | MCP（Model Context Protocol） | クライアント側 | Claude Desktop、Cursor、エージェント環境から Codes Doctor の静的解析ツールを直接呼び出し。 |
| **ローカルLLM（Continue / Cline 等）** | `vscode-lm` | **不要** | VS Code の Language Model API に登録されているローカルモデルやカスタムモデルを利用。 |

---

## 2. VS Code チャット対話（@codedoctor）

VS Code のチャットパネルで `@codedoctor` と入力することで、直前の静的解析結果を完全に把握した専門のアシスタントと対話できます。

> [!TIP]
> メンション名は `@codedoctor`（単数形）です。

### 自動で注入されるコンテキスト
チャットで呼び出すと、以下の情報が自動的にプロンプトへ組み込まれます：
- **直前の解析サマリー**: セキュリティスコア、技術的負債、ファイル数
- **上位セキュリティ脆弱性**: 汚染データフロー（危険な入力元 Source から到達先 Sink までの追跡経路）
- **God Class（肥大化クラス）**: 警告度の高い上位クラスとメトリクス
- **循環参照**: 検出された循環依存ループ
- **エディタのアクティブファイル・選択範囲コード**: 現在開いているファイルや選択中のコードブロック

### 専用スラッシュコマンド

```text
@codedoctor /security
```
検出されたセキュリティ脆弱性（SQL インジェクション、XSS、パストラバーサル等）について、なぜ危険なのか、どう対策すべきかをわかりやすく解説します。

```text
@codedoctor /fix
```
現在エディタで選択しているコードや検出された問題箇所に対して、具体的な修正コードを生成します。

```text
@codedoctor /refactor
```
肥大化した God Class の責務分割案や、循環参照を解消するための設計パターン・リファクタリング手順を提案します。

```text
@codedoctor /analyze
```
最新の解析サマリーを解説し、優先して対応すべき課題を要約します。

```text
@codedoctor この関数に渡す入力値のバリデーションコードを書いて
```
自由入力で、検出内容に基づいた任意の質問やコード生成を依頼できます。

---

## 3. ワンクリック AI Fix 差分プレビュー

エディタの波線下線や Problems パネルに表示された指摘から、直接 AI に修正案を生成させることができます。

1. 指摘のあるコード箇所の電球マーク（Quick Fix）をクリック、または右クリックメニューから **「Codes Doctor: AI Fix プレビュー」** を選択。
2. VS Code 標準の **左右並びの差分エディタ（Diff Editor）** が開き、AI が提案した修正コードと元コードの差分が表示されます。
3. 差分を確認し、問題がなければエディタ上部の **「Apply Fix（修正を適用）」** を押すだけで安全にコードへ反映されます。

---

## 4. VS Code AI 機能拡張との連携（vscode-lm）

HTML レポートやダッシュボード内に表示される「総合 AI レビュー」は、エディタに導入済みの AI 機能拡張を通じて実行できます。

### 設定手順
1. VS Code の設定を開き、`codeDoctor.llmProvider` を検索します（またはダッシュボードの設定タブを開きます）。
2. プロバイダーを **`vscode-lm`** に設定します。
3. （任意）`codeDoctor.llmModel` で、エディタ環境で利用可能な特定のモデルを選択できます。空欄の場合は既定の推奨モデルが自動選択されます。
4. ダッシュボードで **「LLMレビューを実行」** をクリックします。

VS Code 内でサインインしている AI アカウント（Claude 拡張、ChatGPT 拡張、GitHub Copilot 等）を利用してレビューが生成され、レポート内に保存されます。

---

## 5. 自律型コーディングエージェント・MCP 連携

Codes Doctor は、独立した CLI パッケージ（`@codes-doctor/cli`）および **MCP（Model Context Protocol）** を通じて、外部の自律型 AI エージェントと深く連携できます。

### Claude Code（Anthropic ターミナルエージェント）との連携

> [!IMPORTANT]
> **「普通にインストールしただけでは動かない？」への回答**
> VS Code 拡張機能として Codes Doctor をインストールすると、VS Code 本体のチャットパネルで `@codedoctor` が使えるようになりますが、**ターミナルで動作する Claude Code（CLI や Claude 専用ツール）側には自動的には引き継がれません**。
> Claude Code はエディタの拡張機能環境とは独立したサンドボックスで動作しているため、Claude Code に Codes Doctor の解析結果を渡すには、以下のいずれかの方法を取る必要があります。

#### 方法 1: ワンクリックで AI エージェント用プロンプトをコピーして貼り付ける（最もおすすめ）
外部 LLM の API 費用をかけず、Codes Doctor の確定的な静的解析結果（God Class の行数やメソッド数、循環参照ループ、テイントフロー脆弱性）をそのまま Claude Code に渡す方法です。

1. VS Code で **「現在のワークスペースを解析」** を実行します。
2. ダッシュボードの概要カードにある **`📋 AIエージェント用プロンプトをコピー`** ボタンをクリックします（または `Cmd+Shift+P` → `Codes Doctor: AIエージェント用プロンプトをコピー`）。
3. クリップボードにマークダウン形式の「AIエージェント用リファクタリング指示書」がコピーされます。
4. Claude Code のプロンプト入力欄にそのまま **貼り付け（`Cmd+V` / `Ctrl+V`）** して送信します。
5. Claude Code は幻覚（ハルシネーション）なく、指定されたファイル・クラスの安全な分割や脆弱性の修正を自律的に進めます。

#### 方法 2: Claude Code に直接 CLI を実行させる
Claude Code はシェルコマンドの実行権限を持っているため、Claude Code の対話画面で直接指示してスキャンさせることができます。

```bash
# Claude Code 画面での指示例
> npx @codes-doctor/cli analyze . を実行して、出力されたレポートから技術的負債やセキュリティ警告（Critical/High）を把握し、コードをリファクタリングしてテストを実行してください。
```

#### 方法 3: `CLAUDE.md` で Claude Code に Codes Doctor を自動認識させる
プロジェクトのルートに **`CLAUDE.md`**（Claude Code 専用のプロジェクト指示書）を配置しておくと、Claude Code は起動時にこれを自動学習します。

```markdown
# CLAUDE.md 設定例
## コード品質・セキュリティ点検
- このプロジェクトでは静的解析ツール Codes Doctor を利用しています。
- コードの点検やリファクタリングを行う際は、まず `node packages/cli/bin/codes-doctor.js analyze .`（または `npx @codes-doctor/cli analyze .`）を実行して、検出された God Class や循環依存、セキュリティ指摘を確認してください。
- ユーザーから「@codedoctor」や「リファクタリングして」と指示された場合は、上記コマンドを実行してその結果に基づき作業してください。
```

---

### Google Cloud Code（Gemini Code Assist）との連携
Google Cloud Code（Cloud Code 拡張機能 / Gemini Code Assist）を VS Code 内で利用している場合は、VS Code 標準の **`vscode.lm`（Language Model API）** を通じてシームレスに連携できます。

1. VS Code 設定で `codeDoctor.llmProvider` を **`vscode-lm`** に設定します。
2. `codeDoctor.llmModel` に Cloud Code 提供のモデル（または既定値）を選択します。
3. これにより、個別 API キーを設定することなく、VS Code にサインイン中の Google Cloud アカウントの権限で AI レビューや自動修正が利用できます。

### Antigravity（Google コーディングエージェント）
Antigravity などのエージェント環境では、ワークスペース内で静的解析を実行し、AST レベルの正確な問題箇所（Source -> Sink のデータフロー）を把握させた上で、的確なリファクタリングを指示できます。

```bash
# CI やスクリプトでの品質チェック連携
npx @codes-doctor/cli analyze . --min-security 80 --min-debt 75
```

### MCP（Model Context Protocol）連携
Codes Doctor は、Anthropic が提唱するオープン標準プロトコル **MCP** に対応しています。
Claude Desktop、Claude Code、Cursor 等の MCP クライアントから、Codes Doctor をツールとして直接登録・呼び出し可能です。

- **静的解析ツール (`analyze`)**: プロジェクト全体の構造診断やセキュリティ点検を実行
- **汚染追跡ツール (`get_taint_flow`)**: 特定の脆弱性に関する危険なデータフロー経路を取得
- **God Class 診断ツール (`get_god_classes`)**: リファクタリング対象の肥大化クラスを取得

これにより、AI エージェントが自律的に Codes Doctor の診断結果を直接参照しながら、正確な修正コードを作成できます。

### Cursor / Codex 等へのプロンプト連携
ダッシュボードの **出力モード** を **`AIコーディング用プロンプト`**（`agentPrompt`）に設定して生成すると、Cursor や Codex にそのまま貼り付けて使える指示書（Markdown）が出力されます。

- **AI向けにコピー（Markdown）** ボタンをクリック。
- Cursor や ChatGPT、Claude のプロンプト欄に貼り付けるだけで、あいまいさのない正確な作業指示を AI に与えることができます。

---

## 6. 直接 API キー連携（OpenAI / Anthropic）

エディタの拡張機能とは別に、自身の OpenAI または Anthropic の API キーを使用して直接モデルを呼び出すことも可能です。

1. コマンドパレット（`Cmd+Shift+P` / `Ctrl+Shift+P`）を開きます。
2. **`Codes Doctor: Set LLM API Key`** を実行します。
3. プロバイダー（`openai` または `anthropic`）を選び、API キーを入力します。
   - キーは VS Code の安全な **Secret Storage** に暗号化して保存されます（設定ファイル `settings.json` に平文で書き込まれることはありません）。
4. モデルや最大トークン数を設定してレビューを実行します。

---

## 7. プライバシーとデータの安全性

- **静的解析**:
  - すべてのコード解析（AST 構文解析、メトリクス算出、データフロー追跡、SBOM 抽出）は手元のマシン上の Node.js プロセス内で完結します。ソースコードが外部サーバーへアップロードされることは一切ありません。
- **AI 機能の利用時**:
  - AI 機能（レビュー生成、`@codedoctor` チャット、AI Fix プレビュー、MCP ツール実行）を**明示的に実行した場合のみ**、問題箇所のスニペットや解析サマリーが選択されたプロバイダー（VS Code LM / OpenAI / Anthropic / MCP クライアント）に送信されます。
  - AI 機能を実行しない限り、外部通信は一切発生しません。
