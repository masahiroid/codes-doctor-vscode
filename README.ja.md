# Codes Doctor

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/masahirocom.codes-doctor?label=Visual%20Studio%20Marketplace&color=brightgreen)](https://marketplace.visualstudio.com/items?itemName=masahirocom.codes-doctor)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/masahirocom.codes-doctor?color=brightgreen)](https://marketplace.visualstudio.com/items?itemName=masahirocom.codes-doctor)
[![Rating](https://img.shields.io/visual-studio-marketplace/stars/masahirocom.codes-doctor?color=brightgreen)](https://marketplace.visualstudio.com/items?itemName=masahirocom.codes-doctor&ssr=false#review-details)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/15686/badge)](https://www.bestpractices.dev/projects/15686)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

- English: [README.md](README.md)
- 日本語: [README.ja.md](README.ja.md)

Codes Doctor は、ソースコードの構造診断、God Class（肥大化クラス）検出、技術的負債スコア、データフロー追跡付きセキュリティ診断、依存グラフ、および SBOM（ソフトウェア部品表）を単一の HTML レポートにまとめる静的解析ツールです。

TypeScript/JavaScript、PHP、Python、Go、Swift、C#、Java、Kotlin、Rust、C++、Dart に対応しています。解析エンジンは手元のプロセス内で直接動作するため、ソースコードが外部サーバーへ送信されることは一切ありません。

📘 **利用マニュアル**: [USER_GUIDE.ja.md](packages/vscode/docs/USER_GUIDE.ja.md) / [USER_GUIDE.md](packages/vscode/docs/USER_GUIDE.md) — 導入方法、レポート各タブの読み方、AI機能、設定、トラブルシューティング。過去の更新履歴は **[更新履歴 (Changelog)](CHANGELOG.ja.md)** をご覧ください。

---

## 実際の画面

Codes Doctor 自身のリポジトリを解析して生成した実際のレポート画面です。

| 概要・品質（Overview & Quality） | リスク・セキュリティ（Taint Flow 追跡） |
| :---: | :---: |
| [![Overview](https://raw.githubusercontent.com/masahiroid/codes-doctor-vscode/main/packages/vscode/media/screenshots/overview.png)](https://raw.githubusercontent.com/masahiroid/codes-doctor-vscode/main/packages/vscode/media/screenshots/overview.png) | [![Risk & Security](https://raw.githubusercontent.com/masahiroid/codes-doctor-vscode/main/packages/vscode/media/screenshots/risk-security.png)](https://raw.githubusercontent.com/masahiroid/codes-doctor-vscode/main/packages/vscode/media/screenshots/risk-security.png) |
| **依存グラフ（D3.js インタラクティブ操作）** | **SBOM & 脆弱性（推移的依存 CVE スキャン）** |
| [![Dependency Graphs](https://raw.githubusercontent.com/masahiroid/codes-doctor-vscode/main/packages/vscode/media/screenshots/dependency-graph.png)](https://raw.githubusercontent.com/masahiroid/codes-doctor-vscode/main/packages/vscode/media/screenshots/dependency-graph.png) | [![SBOM](https://raw.githubusercontent.com/masahiroid/codes-doctor-vscode/main/packages/vscode/media/screenshots/sbom.png)](https://raw.githubusercontent.com/masahiroid/codes-doctor-vscode/main/packages/vscode/media/screenshots/sbom.png) |

---

## モノレポのパッケージ構成

| パッケージ | 概要 | リンク |
| --- | --- | --- |
| [`packages/vscode`](packages/vscode) | **VS Code 拡張機能**<br>ダッシュボード、Problems パネル診断、データフロー ホバー、1クリック AI 修正差分プレビュー、`@codedoctor` チャット参加機能。 | [Marketplace](https://marketplace.visualstudio.com/items?itemName=masahirocom.codes-doctor) • [README](packages/vscode/README.ja.md) • [利用マニュアル](packages/vscode/docs/USER_GUIDE.ja.md) |
| [`packages/cli`](packages/cli) | **CLI ツール (ターミナル & CI)**<br>ローカルスクリプトや CI/CD の品質ゲート（`--min-security`、`--min-debt`）で使用する `codes-doctor` コマンド。 | [CLI README (日本語)](packages/cli/README.ja.md) |
| [`packages/engine`](packages/engine) | **解析エンジン**<br>AST パーサー（TSESTree、Tree-sitter、php-parser）、汚染データフロー解析、各種メトリクス計算、自己完結 HTML レポート生成。 | [アーキテクチャ設計書](packages/engine/docs/ARCHITECTURE.md) • [README (日本語)](packages/engine/README.ja.md) |

---

## 主な機能

- **エディタ統合診断**: セキュリティ上の問題点や God Class、技術的負債スコアを VS Code の Problems パネル、波線下線、ホバー、ステータスバーにリアルタイム表示。
- **汚染データフロー追跡（Taint Flow）**: 外部からの入力値（Source）が危険な処理（Sink: SQL 実行、XSS innerHTML、コマンド実行、パストラバーサル）に届く経路を解析し、定数呼び出しなどの誤検知を排除。
- **1クリック AI Fix 差分プレビュー**: GitHub Copilot（`vscode.lm`）や外部 LLM（OpenAI、Anthropic、Gemini）を活用し、左右の差分エディタで修正案をプレビューして安全にワンクリック適用（Apply Fix）。
- **高速 Git 変更差分解析**: `Analyze Git Changes` により、未コミットの変更ファイル（または直前コミット）のみを数秒でピンポイント診断。
- **完全な SBOM & 脆弱性スキャン**: 直接・推移的・開発依存を含むソフトウェア部品表の出力と、Trivy / `npm audit` による既知の CVE 検出。
- **CI/CD 品質ゲート**: `--min-security 80` などの閾値を指定し、基準スコアを下回った場合に CI パイプラインを自動で Fail 判定。
- **プライバシー保護**: 静的解析は完全にローカルマシン上で実行され、ソースコードが勝手に外部へアップロードされることはありません。

---

## クイックスタート

### VS Code 拡張機能での利用

1. [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=masahirocom.codes-doctor) から **Codes Doctor** をインストール（VS Code 1.90 以降）。
2. プロジェクトのフォルダーを開き、ワークスペースを信頼します。
3. アクティビティバーの **聴診器マーク（Codes Doctor）** をクリック。
4. **「現在のワークスペースを解析」**（`Analyze Current Workspace`）を実行。
5. 生成された HTML レポートで全体を確認し、Problems パネルから該当行へ直接ジャンプして修正できます。

### CLI での利用（ターミナル & CI）

グローバルインストール不要で `npx` から即座に実行可能です。

```bash
# プロジェクトを解析しレポートを出力
npx @codes-doctor/cli analyze . --out ./reports

# CI 品質ゲート: セキュリティスコアが 80点 未満の場合は終了コード 1 で失敗
npx @codes-doctor/cli analyze . --min-security 80 --min-debt 75
```

---

## 開発環境のセットアップ

Node.js 24 以上が必要です（`.nvmrc`）。

```bash
npm run install:all   # 全パッケージで npm ci を実行
npm run verify:deps   # ロックファイルの整合性、署名、OSV アドバイザリ検証
npm test              # エンジンビルド、CLI テスト、拡張機能テスト（全100件以上）
npm run package:vsix  # クリーンビルドと VS Code 拡張機能（VSIX）のパッケージング
```

### 依存関係とセキュリティポリシー

- インストールスクリプトは各パッケージの `package.json` 内 `allowScripts` で明示的に許可されたもののみ実行されます。
- 既知の脆弱性（npm advisories や OSV）が検知された場合、CI は自動的に失敗します。
- エンジンビルドはレポート用ブラウザライブラリ（Chart.js、D3、Mermaid、marked、DOMPurify）を内包し、`scripts/vendor-engine.mjs` を通じて多言語ビルドと同期されます。

---

## 自動化ワークフロー

| ワークフロー | 実行契機 | 内容 |
| --- | --- | --- |
| **CI** (`ci.yml`) | PR 作成・Push 時 | Node.js 24 / 26 環境での依存検証、全テスト、ベンチマーク、ブラウザテスト、CLI 実行検証。 |
| **CodeQL** (`codeql.yml`) | PR 作成・Push 時 | GitHub 公式のセキュリティ静的コード解析。 |
| **Dependabot** (`dependabot.yml`) | 毎週および緊急時 | パッチ/マイナー更新のグループ化 PR、重大なセキュリティ更新の即時 PR。 |
| **Release** (`release.yml`) | タグ `v*` プッシュ時 | VSIX パッケージ生成、GitHub Releases への添付、Marketplace への自動公開。 |

---

## ライセンス

[Apache License 2.0](LICENSE) © masahiroid

