# Codes Doctor

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/masahirocom.codes-doctor?label=Visual%20Studio%20Marketplace&color=brightgreen)](https://marketplace.visualstudio.com/items?itemName=masahirocom.codes-doctor)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/masahirocom.codes-doctor?color=brightgreen)](https://marketplace.visualstudio.com/items?itemName=masahirocom.codes-doctor)
[![Rating](https://img.shields.io/visual-studio-marketplace/stars/masahirocom.codes-doctor?color=brightgreen)](https://marketplace.visualstudio.com/items?itemName=masahirocom.codes-doctor&ssr=false#review-details)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/15686/badge)](https://www.bestpractices.dev/projects/15686)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/masahiroid/codes-doctor-vscode/blob/main/LICENSE)

- English: [README.md](README.md)
- 日本語: [README.ja.md](README.ja.md)

Codes Doctor は、現在開いているワークスペースフォルダーを分析し、God Class・技術的負債・セキュリティ問題・依存グラフ・SBOM を含む構造診断レポートを VS Code 内で直接生成します。解析エンジンはプロセス内で実行されるため、外部サーバーは不要です。

📘 **はじめての方は [利用マニュアル](docs/USER_GUIDE.ja.md) をご覧ください** — 導入、レポートの各タブの読み方、設定、トラブルシューティングをまとめています。
🤖 **AI 連携ガイド: [AI_INTEGRATION.ja.md](docs/AI_INTEGRATION.ja.md)** — `@codedoctor`、GitHub Copilot（`vscode-lm` / APIキー不要）、Claude Code、Antigravity、Codex 連携。

## 6.x でできること

- **エディターで問題を確認。** セキュリティ指摘と God Class を Problems パネル・下線・ホバーで確認し、Activity Bar の Findings から該当行へ移動できます。ステータスバーにはセキュリティと技術的負債のスコアを表示します。
- **変更箇所を優先。** `Analyze Git Changes` で未コミットの変更ファイル（なければ直前のコミット）にエディター診断と Findings を絞れます。保存時の自動解析や、無視コメントの Quick Fix にも対応しています。
- **VS Code の AI を利用。** `vscode-lm` を選ぶと、GitHub Copilot などが提供する利用可能なモデルでレビューやプロンプトを生成できます。拡張機能への API キー設定は不要です。
- **チャットから相談・修正。** `@codedoctor` の `/analyze`・`/security`・`/refactor`・`/fix` で解析結果を使えます。AI の修正案は差分を確認し、**Apply Fix** を選んで適用します。
- **大きなプロジェクトにも配慮。** 宣言ファイルやビルド成果物を除外し、階層ごとの `.gitignore` を反映。巨大な AST 出力を制限し、大きすぎる WebView レポートは外部ブラウザーで開きます。

バージョンごとの変更は [CHANGELOG](CHANGELOG.md) を参照してください。

## はじめの解析

1. VS Code 1.90 以降で、拡張機能の検索から **Codes Doctor**（発行元: `masahirocom`）をインストールします。
2. 調べたいプロジェクトのフォルダーを開き、ワークスペースを信頼します。
3. Activity Bar の Codes Doctor を開き、必要なら **画面・レポートの言語** を **日本語** にします。
4. **Analyze Current Workspace** を実行します。複数フォルダーの場合は対象を選びます。
5. 開いた HTML レポートで全体を確認し、Problems / Findings で該当ソースを確認します。

通常の静的解析に AI の契約や API キーは不要です。まず全体を解析し、日々の変更の確認には **Analyze Git Changes** を使うと便利です。Git 変更解析でも HTML レポートとスコアはプロジェクト全体の結果です。

## 実際の画面

以下は Codes Doctor を自分自身のソースコードに対して実行して生成した、実際のレポートです。

**Overview & Quality** — 技術的負債スコアとセキュリティスコアが一目でわかり、God Class ランキングも表示されます。

![Overview tab](https://raw.githubusercontent.com/masahiroid/codes-doctor-vscode/main/packages/vscode/media/screenshots/overview.png)

**Risk & Security** — セキュリティスコアと、各指摘の重大度・対策を表示します。経路を追跡できた指摘には入力からの経路も示します。

![Risk & Security tab](https://raw.githubusercontent.com/masahiroid/codes-doctor-vscode/main/packages/vscode/media/screenshots/risk-security.png)

**Dependency Graphs** — 実際の import 関係から生成されたインタラクティブなモジュール依存グラフです。

![Dependency graph tab](https://raw.githubusercontent.com/masahiroid/codes-doctor-vscode/main/packages/vscode/media/screenshots/dependency-graph.png)

**SBOM & Vulnerabilities** — 直接・推移・開発依存の内訳を含む完全なソフトウェア部品表と、依存関係の脆弱性スキャン（Trivy があれば Trivy、なければ `npm audit`）です。

![SBOM tab](https://raw.githubusercontent.com/masahiroid/codes-doctor-vscode/main/packages/vscode/media/screenshots/sbom.png)

## 主なコマンド

- `Codes Doctor: Analyze Current Workspace`
- `Codes Doctor: Analyze Git Changes`
- `Codes Doctor: Open Latest Report`
- `Codes Doctor: Copy Analysis Summary`
- `Codes Doctor: Copy Analysis Summary as JSON`
- `Codes Doctor: Preview AI Fix in Diff Editor`
- `Codes Doctor: Clear Editor Diagnostics`
- `Codes Doctor: Set LLM API Key`

## ダッシュボード（Activity Bar）

インストール後、Activity Bar に Codes Doctor アイコンが表示されます。ダッシュボードから以下を操作できます。

- 解析対象の言語の選択（`auto`、または対応言語のいずれか 1 つ）
- レポートの開き方の選択（外部ブラウザ / VS Code WebView / VS Code URI オープン）
- 解析の実行
- LLM プロバイダの選択、API キーの設定、モデル一覧のライブ取得、任意の AI 構造レビューの実行

## 使い方

1. ダッシュボードのボタン、またはコマンドパレットから `Analyze Current Workspace` を実行
2. ワークスペースに複数フォルダーがある場合は対象を選択
3. 同梱された解析エンジンがそのフォルダーを直接分析（サーバープロセスは不要）
4. 生成された HTML レポートが `codeDoctor.reportOpenMode` の設定に応じて開く

## 任意機能: LLM 構造レビュー

Codes Doctor は LLM（OpenAI、Anthropic、または VS Code が提供するモデル）に分析結果をレビューさせ、構造評価をレポートに書き込ませることができます。

**VS Code の AI を使う場合:** プロバイダーで **VS Code Built-in AI** を選び、モデルを取得・選択してレビューを実行します。利用可能なモデルを提供する拡張機能やアカウントが必要で、利用条件や認証は提供元に従います。

**OpenAI / Anthropic を使う場合:**

1. ダッシュボードの **LLMプロバイダー** でプロバイダを選択
2. **APIキーを設定** をクリックして API キーを貼り付け — VS Code の secret storage（OS keychain）に保存され、settings.json やワークスペース内のどこにも平文で残りません
3. **取得** をクリックして、そのキーでアクセス可能なモデル一覧をライブ取得し、1つ選択
4. 分析を実行した後、**LLMレビューを実行** をクリック — 結果は生成済みレポートに書き戻されます

### AIコーディング用プロンプトモード

**出力モード** を **AIコーディング用プロンプト** にして **AIコーディング用プロンプトを生成** をクリックすると、人が読むレポートではなく、AIコーディングエージェント（Claude Code、Cursor、GitHub Copilot、Codex）にそのまま貼り付けられる作業指示プロンプトをLLMが書きます。目的・根拠となる指標・優先順位付きタスク（最大5件。それぞれ対象・根拠・先に確認すべきこと・変更内容・変えてはいけないもの・完了条件）・手を付けない項目・エージェントに求める最終報告で構成されます。ファイル名やシンボルは解析結果に含まれるものだけを使い、不確かな点は「確認手順」として書かれます。レポートのLLMタブにコピーボタン付きの専用欄として表示され、レビュー結果は上書きされません。

モデル一覧は毎回プロバイダの API から直接取得されるため、ハードコードされた古いモデル名に縛られることはありません。

## セキュリティルールセット（緊急点検）

[masahiroid/security-rules](https://github.com/masahiroid/security-rules) で配信されるルールパック（NICT A2B注意喚起、OWASP Top 10:2025）を読み込み、手動確認が必要なコード箇所を示します。

- Codes Doctorパネル（アクティビティバー）の**セキュリティルール**欄で、同期、点検するパックの選択、走査、結果のクリックによるコードへの移動までを一か所で行えます。各ルールの点検手順と管理表の列も確認できます。
- **Codes Doctor: セキュリティルールを同期** は `manifest.json` と各パックを取得し、マニフェストのSHA-256と照合したうえで、検証済みの写しを拡張機能の保存領域に保存します。取得に失敗した場合（オフライン、閉域網）は、このキャッシュを使います。写しはワークスペースに置かず、`sourceUrl` もユーザー設定でのみ指定できるため、点検対象のリポジトリが自分を点検するルールを選ぶことはできません。
- 開いた・保存したTypeScript、JavaScript、PHP、JSONファイルを読み込み済みルールで走査します。一致箇所はルールID付きでProblemsに表示され、ホバーでパック、出典、点検手順、管理表の列を確認できます。
- **Codes Doctor: セキュリティルールでワークスペースを走査** はワークスペース全体を走査します。**Codes Doctor: セキュリティ監査レポートを出力** は、JSONとCSV（Excel向けBOM付きUTF-8）を `.codes-doctor/security-audit/` に書き出します。
- 同期を実行するまで何も取得しません。`codeDoctor.securityRules.autoSync` をオンにすると、起動時と `syncIntervalHours` ごとに取得します。`codeDoctor.securityRules.sourceUrl` には社内ミラーも指定できます。

`detect` を持つルールは、正規表現ではなくデータフロー解析で判定します。外部入力がSQL・コマンド実行・コード実行・SSRFの処理に届く箇所だけを、入力元から到達先までの経路付きで示します。ワークスペースの走査では、先にすべての関数を要約するため、ほかのファイルへの呼び出しをまたいで値を追跡します（相対パスの `import` / `require` と、名前が一つに決まるプロジェクト内の関数・メソッド）。ほかのファイルへ届く流れは、入力を渡している呼び出しの行に表示し、経路にはそのファイルの行も示します。`if` 条件やガード節での入力検証（`is_numeric`、アンカー付き `preg_match`、`filter_var`、`Number.isInteger`、許可リスト）を認識し、SQLのエスケープは引用符の内側でのみ有効として扱います。外部パッケージへの呼び出しや名前の重複する関数は追跡しないため、「到達なし」は安全の証明ではありません。テストコードは対象外です。

### 認可不備（BOLA / IDOR）

`detect: { type: object_access }` のルールは、リクエストで指定されたID（パスパラメータ、または名前がIDを表すクエリ・本文の値）で保存済みのオブジェクトを取得・変更・削除する処理を調べ、処理ごとに次のいずれかを示します。

| 状態 | 意味 |
| --- | --- |
| 所有者照合なし | IDで対象を選んでおり、下記の根拠が見つからない。Problemsに表示します |
| 所有者項目で絞り込み — 値の出所を確認 | 所有者の項目（`UserId`、`user_id`、`owner_id` など）でも絞り込んでいるが、その値がログイン中のユーザーとは判断できない（ミドルウェアが設定する場合など） |
| 所有者照合あり | 問い合わせがログイン中のユーザーで絞り込まれている、ログイン中のユーザーとの比較（リテラルとの比較は除く）を条件にした `if` がある、または認可の呼び出し（`authorize`、`Gate::allows`、`can` など）がある。パネルに根拠の行を示します |

ログイン中のユーザーとは、`req.user`、`req.session`、`$_SESSION`、`auth()`、`Auth::`、`$request->user()`、`currentUser` などの名前と、それらから代入された変数です。Cookieは利用者が設定できるため含めません。IDの数値変換や形式チェックは根拠になりません。オブジェクトを公開してよいかはコードから判断できないため、公開データ（商品、公開レビューなど）の参照も検出されます。ルールでは、プロジェクト独自のログイン中のユーザーの式（`owner_references`）と認可の呼び出し（`authorization_calls`）を追加できます。

コミットを固定した、意図的に脆弱なアプリでの測定結果です（テストコードを除く）。すべての検出を人手で判定しており、本物の検出が消えるか、未判定の検出が増えるとCIが失敗します（[ベンチマーク](../engine/benchmark/security)）。

| プロジェクト | 判定 | 本物の検出 | 誤検知 | 既知の見逃し |
| --- | --- | --- | --- | --- |
| [OWASP Juice Shop](https://github.com/juice-shop/juice-shop)（TypeScript） | SQL・コマンド実行・コード実行・SSRF | 13 | 0 | 1：オブジェクト経由で `vm` サンドボックスに渡る入力 |
| | BOLA | 10 | 15：公開データ（8）、解析から見えないミドルウェアが設定する所有者（5）、ミドルウェアでの役割制限（1）、推測できない追跡番号（1） | — |
| [DVWA](https://github.com/digininja/DVWA)（PHP） | SQL・コマンド実行・コード実行・SSRF | 25 | 0 | 2：別ページでセッションに保存された入力（二次的な流れ） |
| | BOLA | 18 | 0 | — |

7.0では、SQL・コマンド実行・コード実行・SSRFについて、同じコードで本物の検出34件、誤検知6件、既知の見逃し7件でした。NoSQLインジェクションはまだ対象外です。このリポジトリ（Web APIではないVS Code拡張）では、検出は0件です。

パターンの一致箇所は**要確認の候補**であり、合格・不合格の判定ではありません。すべてのルールは手動点検項目のため、「一致なし」は適合を意味せず、レポートには `compliance: unverified` と記録します。ハッシュは転送中の改変や取り違えの検出用で、配信者の署名ではないため、ルールリポジトリの書き込み権限を管理してください。ソースコードがPCの外へ送られることはありません。

## 設定

ダッシュボードの **画面・レポートの言語** で **English**（デフォルト）または **日本語** を選択できます。画面・通知・新しく生成するHTMLレポート・AIレビューに適用されます。既存レポートは生成時の言語を保持し、履歴から追加するAIレビューもその言語に合わせます。言語を切り替えた後、再解析すると選択した言語のレポートを生成できます。

- `codeDoctor.displayLanguage`（デフォルト: `en`） — `en` / `ja`。アプリ全体のユーザー設定として保存され、次に変更するまで、ワークスペースの切り替えや再起動後も選択を保持します。解析対象のプログラミング言語とは独立した設定です。
- `codeDoctor.analysisLanguage`（デフォルト: `auto`） — `auto` / `typescript` / `javascript` / `php` / `dart` / `python` / `go` / `swift` / `csharp` / `java` / `kotlin` / `rust` / `cpp`
- `codeDoctor.reportOpenMode`（デフォルト: `external`）
  - `external`: 既定のブラウザで開く
  - `webview`: VS Code の WebView パネルで開く
  - `vscode`: VS Code 自身の URI ハンドラーで開く
- `codeDoctor.llmProvider`（デフォルト: `openai`） — `openai` / `anthropic` / `vscode-lm`
- `codeDoctor.llmOutputMode`（デフォルト: `review`） — `review`（構造レビューレポート） / `agentPrompt`（AIコーディング用プロンプト）
- `codeDoctor.llmModel`（デフォルト: 空） — ダッシュボードのモデル取得後にドロップダウンから設定
- `codeDoctor.llmMaxOutputTokens`（デフォルト: `16000`） — AI 出力の上限トークン数（200〜1,000,000）

- `codeDoctor.minSecurity` / `codeDoctor.minTechnicalDebt`（既定: `0`） — 0〜100 の警告しきい値。0 で無効。スコアが下回ると通知します。
- `codeDoctor.outputDirectory`（既定: 空） — レポート出力先。空なら拡張機能のストレージを使用します。
- `codeDoctor.analyzeOnSave`（既定: `false`） — 保存時のバックグラウンド解析を有効にします。

## 日々の確認と AI 修正

解析後は Findings の項目をクリックしてコードへ移動します。指摘をホバーすると説明・対策・追跡経路を確認できます。無視する指摘には電球メニューから無視コメントを追加でき、保存時に再評価されます。`code-doctor-ignore-next-line`、`code-doctor-ignore`、`code-doctor-ignore-file` に対応します。

AI を設定したら、対象コードの電球メニューまたは **Preview AI Fix in Diff Editor** を使います。修正前後を確認し、**Apply Fix** または **Discard** を選択します。適用するとファイルが保存されるため、再解析とプロジェクトのテストで確認してください。

VS Code Chat では `@codedoctor /analyze` で全体の要約、`/security` でセキュリティの説明、`/refactor` で改善計画、`/fix` で修正プレビューを利用できます。Chat とモデル API が利用可能な VS Code 環境が必要です。

AI レビューでは解析情報を、修正プレビューでは対象ファイルの内容を選択したモデルへ渡します。利用するプロバイダーのデータ取り扱いを確認してください。

## 対応言語

| 言語 | God Class | 技術的負債 | セキュリティ | コールグラフ |
|------|-----------|-----------|-------------|-------------|
| TypeScript / JavaScript | ✅ | ✅ | ✅ | ✅ |
| PHP | ✅ | ✅ | ✅ | ✅ |
| Python | ✅ | ✅ | ✅ | — |
| Go | ✅ | ✅ | ✅ | — |
| Swift | ✅ | ✅ | ✅ | — |
| C# | ✅ | ✅ | ✅ | — |
| Java | ✅ | ✅ | ✅ | — |
| Kotlin | ✅ | ✅ | ✅ | — |
| Rust | ✅ | ✅ | ✅ | — |
| C++ | ✅ | ✅ | ✅ | — |
| Dart | ✅ | ✅ | — | — |

TypeScript/JavaScript と PHP は専用の完全なパーサー、Python・Go・Java・C#・Rust・C++ は Tree-sitter、Swift・Kotlin・Dart は簡易的な構造抽出で解析します。依存グラフ・循環依存検出・レイヤー分析・SBOM/脆弱性スキャンは、言語を問わず対応する全ファイルを横断して実行されます。

> **言語ごとの精度について。** メインの対応言語は TypeScript/JavaScript と PHP で、専用の完全なパーサーで解析し、最も検証されています。Python、Go、Java、C#、Rust、C++ は Tree-sitter で構文木に変換して解析するため、構造（クラス・メソッド・関数・インポート）は正確に取れます。セキュリティ検査でも、コメント、ただの文字列、定数だけを渡す呼び出しは指摘しません。これらの言語と TypeScript/JavaScript、PHP では、関数内で利用者の入力が危険な処理まで届くかも追跡します。経路を確認できた指摘は「入力から到達」、パターンに一致しただけの指摘は Low に下げて「要確認」と表示します。別の関数を経由する入力はまだ追跡しないため、見落としや「要確認」止まりの指摘は残ります。Swift、Kotlin、Dart は簡易的な構造抽出のままで、誤検知や見落としが多くなります。テストコード内の指摘は「テストコード」と表示し、セキュリティスコアには含めません。結果は確定した評価ではなく、確認のきっかけとして扱ってください。

C++の解析対象は `.cpp` / `.cc` / `.cxx` / `.hpp` / `.hh` です。`.h` / `.c`（Cの可能性があるファイル）は解析対象外です。

## 開発

この拡張機能は、解析エンジン（`packages/engine`）と CLI（`packages/cli`）と同じ [codes-doctor-vscode](https://github.com/masahiroid/codes-doctor-vscode) モノレポで管理しています。Node.js 24 以降を使ってください。

```bash
npm ci --prefix packages/engine
cd packages/vscode
npm ci                # package-lock.json のとおりに入れる
npm run vendor:csap   # packages/engine をビルドして vendor/ にコピー
npm test              # 画面の二言語対応、レポート、レビュー用プロンプトを検証
npm run package       # codes-doctor-<version>.vsix を生成
```

`node_modules` が `package-lock.json` と一致しない場合、パッケージ作成は止まります。依存関係の検査は、リポジトリのルートで `npm run verify:deps` を実行してください。

エンジンのビルドで、日本語版（`vendor/csap`）、英語版（`vendor/csap-en`）、レポート用ブラウザーライブラリー（`vendor/assets`）ができます。拡張機能はそれらをそのまま使います。

## ライセンス

Apache License 2.0 — [LICENSE](LICENSE) を参照してください。

## セキュリティーとレポートの見方

MarkdownのHTMLはサニタイズしてから描画します。拡張経由で開くレポートは同梱のブラウザー用ライブラリーを使用します。WebViewはスクリプトの実行を制限し、ネットワーク接続を禁止します。

静的セキュリティー検出は、内容の確認が必要な候補です。コメント、文字列内のコード例、正規表現リテラルの `.exec()` は指摘しません。実行されるテンプレート式は検査します。型専用importは実行時の依存グラフに含めません。生成JSとTSソースの両方があるリポジトリでは重複計測されることがあります。

バージョン履歴は [CHANGELOG](CHANGELOG.md)、拡張機能と解析エンジンの構成は [docs/architecture.md](docs/architecture.md) を参照してください。
