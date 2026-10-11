# セキュリティー・保守性・TypeScript改善記録

## 最新のSRP分割（1.5.5、2026-10-10）

「2個の中程度の複雑度クラス」は同じCodeDoctorDashboardViewProviderのTSソースと生成JSの重複計測だった。今回、VS Codeアダプターには接続・再描画・破棄のみを残し、状態と操作の組み立てはdashboard/controller.tsの型付きファクトリーへ移した。描画は専用の関数を直接呼び出す。クラスに画面状態と描画の中継メソッドを集中させない。

| 項目 | 1.5.4 | 1.5.5 |
| --- | --- | --- |
| providerメソッド数 | 14 | 4 |
| provider行数（TS） | 96 | 35 |
| Godスコア（TS / 生成JS） | 48 / 46、Medium | 16 / 16、Low |
| 中程度のクラス候補 | 2 | 0 |
| 保守性 | 69 | 72 |
| 技術負債 | 89 | 92 |

Critical/High/Mediumは技術負債・セキュリティーとも0件。不安定候補・循環依存も0件。Lowは同じ軽量providerを二重に数えた2件で、クラスの個別警告は0件。採点基準は変更していない。

実装58ファイルはTypeScriptで、明示的any型は0。Nodeテストとvendor解析エンジンはJavaScriptのまま。生成JSは配布用であり未移行ソースではない。strict型チェック、Node53件、Chrome6件が成功。view差し替え時のイベント購読破棄・閉じたviewの解放も追加検証。

最新版レポート: `/Users/masahiro/Library/Application Support/Code/User/globalStorage/masahirocom.codes-doctor/reports/b156353e-351f-4854-8a24-c252a36bbbaf.html`
最新データ: [security-measurement.json](security-measurement.json)。1.5.5のVSIXを作成してローカル反映する。VS CodeのReload Window後に新しい分析を作成する。

## 1.5.4時点の改善記録（以下は履歴）


検証日: 2026-10-10 / バージョン: 1.5.4

## インストール版との差異

ユーザーの追加レポートは、インストールされていた1.5.2のエンジンの指摘だった。1.5.3のソース修正は前回作業時点でインストールされていなかったため、文字列のテスト用コードとRegExp.execが脆弱性として再び数えられた。今回は1.5.4のVSIXを作成し、同梱エンジンの検証とローカルインストールまで実施する。読み込まれている旧モジュールを切り替えるにはVS CodeのReload Windowが必要。Marketplaceへの公開は行わない。

生成レポートには `codes-doctor-version` メタデータを記録する。古いレポートのスコアは表示を開くだけでは再計算されない。新規分析を使用する。元のレポートとレビューは保持した。

新レポート: `/Users/masahiro/Library/Application Support/Code/User/globalStorage/masahirocom.codes-doctor/reports/c37ce94d-b8f6-4459-b35f-e04888bb3b27.html`
詳細な数値は [security-measurement.json](security-measurement.json)。

## 結果

| 項目 | ユーザーの指摘 | 修正後 |
| --- | --- | --- |
| 保守性 | 63 / 100 | 69 / 100 |
| 不安定モジュールの候補 | 4件 | 0件 |
| 循環依存 | 1件 | 0件 |
| Security Critical / High / Medium | 19 / 3 / 1 | 0 / 0 / 0 |
| セキュリティースコア | Criticalあり | 99 / A |
| 技術負債スコア | 前回85〜87 / A | 89 / A |
| npm audit（開発依存含む・実行時のみ） | — | 両方0件 |

Infoは5件で、CSAP_ROOTとブラウザ実行ファイルの環境変数参照。秘密値の保存・出力ではない。God ClassのMediumは2件で、同じダッシュボードクラスのTSソースと生成JSが重複計測されている。クラスの個別警告は0件。

保守性スコアは不安定モジュールの件数だけではなく構造スコアの平均で決まるため、69点のままでも不安定候補・循環依存の問題点は空である。採点の閾値と対象範囲は緩和していない。スコアを100にするための検出除外は行っていない。

## 構造の改善

- presentationから履歴表示(history)、入力欄と状態表示(controls)、ブラウザのイベント(browser)、エスケープ(format)を分離。
- 描画・操作・レビューは具体的なDashboardViewProviderクラスに依存せずDashboardHostインターフェースを使用。型専用依存から実行時の循環を作らない。
- bilingualテストをUIとエンジンへ分離し、report-integrityから資産更新のテストを分離。テスト内容と安全性検出のテスト対象は維持。
- JSON履歴の値をunknownとして扱い、文字列を検証。null・配列・不正な値は履歴表示へ流さない。

## TypeScript

実装ソース57ファイルはすべてTypeScript。前回のany単語の出現数は99箇所（文章を含む）。今回、型ASTで確認した明示的any型は0箇所。ローカルモジュールは型付きimport/exportを使用し、VS Code API、設定定義、Markdownトークナイザー、AST参照、パッチ置換、ファイル操作、履歴、メッセージ、エンジンAPIの契約を型付けした。既存のCommonJS公開形と生成JSの読込経路は保持。

明示的any型が0でも完全な実行時安全性の保証にはならない。vendorエンジンはJavaScriptで、外部APIの契約は型注釈による境界。NodeテストはJavaScriptで、ブラウザテストはTypeScript。すべてのvendorコードとNodeテストの移行は未完了。

## セキュリティー対策・検証

1.5.3のDOMPurify、WebViewのハッシュCSP、拡張コマンドの許可リスト、HTML/JSONのエスケープ、SVG DOM構築、型専用import除外を維持。コメント・文字列のコード例とRegExpリテラルのexecを除外する一方、実行コードのeval/exec/innerHTML/認証情報は検出する。

Nodeテスト52件、実Chromeテスト6件、strict型チェック、git diff --checkは成功。日英ダッシュボードの全操作がCSP下でメッセージを送ること、日英レポートの全タブ・図表・AST追加表示、MarkdownのXSS除去を検証。

VSIXの同梱エンジンでもテスト文字列の誤検出0と実際のeval検出を確認する。外部LLM APIは呼び出していない。静的ルールはデータフロー解析ではなく、未知の脆弱性は保証しない。
