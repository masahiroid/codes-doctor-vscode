# Codes Doctor — AI 連携・活用ガイド

Codes Doctor は、決定論的な静的解析（AST 構文解析、汚染データフロー追跡、メトリクス算出）と AI（LLM）を組み合わせたハイブリッド型のコード品質・セキュリティ改善ツールです。

外部 API キー（OpenAI / Anthropic）を直接設定して利用できるだけでなく、**VS Code にサインイン済みの GitHub Copilot や各種エディタ内モデル（`vscode-lm`）を利用することで、API キー不要・追加費用なしで AI レビューやチャット対話、ワンクリック修正** を活用できます。

さらに、**Claude Code** や **Antigravity**、**Codex** などの自律型コーディングエージェントとも CLI やプロンプト経由でシームレスに連携できます。

---

## 目次

1. [AI 連携方式・対応ツール一覧](#1-ai-連携方式対応ツール一覧)
2. [VS Code チャット対話（@codedoctor）](#2-vs-code-チャット対話codedoctor)
3. [ワンクリック AI Fix 差分プレビュー](#3-ワンクリック-ai-fix-差分プレビュー)
4. [API キー不要の AI レビュー（vscode-lm）](#4-api-キー不要の-ai-レビューvscode-lm)
5. [自律型コーディングエージェントとの連携](#5-自律型コーディングエージェントとの連携)
   - [Claude Code（Anthropic ターミナルエージェント）](#claude-codeanthropic-ターミナルエージェント)
   - [Antigravity（Google コーディングエージェント）](#antigravitygoogle-コーディングエージェント)
   - [Cursor / Codex 等へのプロンプト連携](#cursor--codex-等へのプロンプト連携)
6. [直接 API キー連携（OpenAI / Anthropic）](#6-直接-api-キー連携openai--anthropic)
7. [プライバシーとデータの安全性](#7-プライバシーとデータの安全性)

---

## 1. AI 連携方式・対応ツール一覧

| ツール / AI | 連携方式 | APIキー | 主な用途・特徴 |
| :--- | :--- | :---: | :--- |
| **GitHub Copilot** | `@codedoctor` / `vscode-lm` | **不要** | チャットでの対話、AI レビュー生成、AI Fix 差分プレビュー。サインイン済みアカウントで即座に動作。 |
| **Claude (Anthropic)** | ① `anthropic` (直接API)<br>② `vscode-lm` (Copilot経由) | ① 必要<br>② **不要** | Claude 3.5 Sonnet や Claude 3 Opus による高精度な脆弱性レビューやリファクタリング提案。 |
| **Codex / OpenAI** | ① `openai` (直接API)<br>② `vscode-lm` (Copilot経由) | ① 必要<br>② **不要** | GPT-4o や Codex 系モデルを使ったコードレビュー、修正コード生成。 |
| **Claude Code** | CLI (`codes-doctor`) | 各自設定 | ターミナルで解析を実行させ、出力された指摘を Claude Code が自律的にコード修正。 |
| **Antigravity** | CLI / エディタ拡張 | 各自設定 | エージェントが解析結果を読み取り、安全なパッチ作成と自動テスト検証を自律実行。 |
| **Continue / Cline 等** | `vscode-lm` | **不要** | VS Code の Language Model API に登録されているローカル LLM やサードパーティモデルを利用。 |

---

## 2. VS Code チャット対話（@codedoctor）

GitHub Copilot Chat などのチャットパネルで `@codedoctor` と入力することで、直前の解析結果を完全に把握した専門のアシスタントと対話できます。

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

## 4. API キー不要の AI レビュー（vscode-lm）

HTML レポートやダッシュボード内に表示される「総合 AI レビュー」も、OpenAI や Anthropic の API キーなしで実行できます。

### 設定手順
1. VS Code の設定を開き、`codeDoctor.llmProvider` を検索します（またはダッシュボードの設定タブを開きます）。
2. プロバイダーを **`vscode-lm`** に設定します。
3. （任意）`codeDoctor.llmModel` で、Copilot が提供する特定のモデル（GPT-4o、Claude 3.5 Sonnet 等）を選択できます。空欄の場合は既定の推奨モデルが自動選択されます。
4. ダッシュボードで **「LLMレビューを実行」** をクリックします。

GitHub Copilot の契約アカウントを利用してレビューが生成され、レポート内に保存されます。

---

## 5. 自律型コーディングエージェントとの連携

Codes Doctor は、独立した CLI パッケージ（`@codes-doctor/cli`）を提供しており、ターミナルで動作する自律型コーディングエージェントと抜群の相性を持っています。

### Claude Code（Anthropic ターミナルエージェント）
ターミナルで動作する `claude` CLI に対し、Codes Doctor の解析結果をそのまま指示として渡すことができます。

```bash
# ターミナルでの対話例
$ claude
> npx @codes-doctor/cli analyze . を実行して、検出されたセキュリティ警告（Critical/High）をすべて修正し、テストを実行してください。
```

Claude Code は CLI を実行し、出力されたファイル名・行番号・脆弱性タイプを解析して、コードの修正とテスト確認まで自動で完了させます。

### Antigravity（Google コーディングエージェント）
Antigravity などのエージェント環境では、ワークスペース内で静的解析を実行し、AST レベルの正確な問題箇所（Source -> Sink のデータフロー）を把握させた上で、的確なリファクタリングを指示できます。

```bash
# CI やスクリプトでの品質チェック連携
npx @codes-doctor/cli analyze . --min-security 80 --min-debt 75
```

### Cursor / Codex 等へのプロンプト連携
ダッシュボードの **出力モード** を **`AIコーディング用プロンプト`**（`agentPrompt`）に設定して生成すると、Cursor や Codex にそのまま貼り付けて使える指示書（Markdown）が出力されます。

- **AI向けにコピー（Markdown）** ボタンをクリック。
- Cursor や ChatGPT、Claude のプロンプト欄に貼り付けるだけで、あいまいさのない正確な作業指示を AI に与えることができます。

---

## 6. 直接 API キー連携（OpenAI / Anthropic）

エディタのアカウントとは別に、自身の OpenAI または Anthropic の API キーを使用して直接モデルを呼び出すことも可能です。

1. コマンドパレット（`Cmd+Shift+P` / `Ctrl+Shift+P`）を開きます。
2. **`Codes Doctor: Set LLM API Key`** を実行します。
3. プロバイダー（`openai` または `anthropic`）を選び、API キーを入力します。
   - キーは VS Code の安全な **Secret Storage** に暗号化して保存されます（設定ファイル `settings.json` に平文で書き込まれることはありません）。
4. モデル（`gpt-4o`、`claude-3-5-sonnet-latest` など）や最大トークン数を設定してレビューを実行します。

---

## 7. プライバシーとデータの安全性

- **静的解析**:
  - すべてのコード解析（AST 構文解析、メトリクス算出、データフロー追跡、SBOM 抽出）は手元のマシン上の Node.js プロセス内で完結します。ソースコードが外部サーバーへアップロードされることは一切ありません。
- **AI 機能の利用時**:
  - AI 機能（レビュー生成、`@codedoctor` チャット、AI Fix プレビュー）を**明示的に実行した場合のみ**、問題箇所のスニペットや解析サマリーが選択されたプロバイダー（VS Code LM / OpenAI / Anthropic）に送信されます。
  - AI 機能を実行しない限り、外部通信は一切発生しません。

