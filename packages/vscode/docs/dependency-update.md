# レポート表題と依存更新（1.5.2、2026-10-10）

レポートのtitle・h1・フッターを「Codes Doctor」へ統一した。名前の定義元はpackage.jsonのdisplayName。既存の正常なレポートも、拡張から開く際に表題と既知のライブラリー読込タグを更新する。リポジトリ名、ソース表示、保存済みレビューには一括置換を行わない。

## 更新結果

| 対象 | 更新後 |
| --- | --- |
| TypeScriptコンパイラー | 7.0.2（typescript-compilerというnpm alias） |
| TypeScript解析API | 6.0.3 |
| @typescript-eslint/typescript-estree | 8.71.1 |
| php-parser | 3.7.0 |
| @vscode/vsce | 4.0.0 |
| marked | 18.1.0 |
| Mermaid | 12.1.0 |
| KaTeX | 0.19.0（Mermaidの依存をoverride） |
| Chart.js | 4.5.1 |
| D3 | 7.9.0 |
| esbuild | 0.28.2 |

Playwright 1.64.0、Node型定義26.6.4は確認時点の最新版を維持した。uuidは削除し、エンジン再取り込み時にNode標準のcrypto.randomUUIDへ置き換えた。解析IDとSBOMシリアルのUUID v4形式は維持される。

Mermaid 12.1.0の通常依存はKaTeX 0.16系列に留まっていた。npm overridesだけではCDNの配布済みバンドルは変更されないため、esbuildでmermaid.coreから再構築し、修正済みKaTeX 0.19.0を実際に含めた。メタファイルでnode_modules/katex/dist/katex.mjsの取り込みを確認した。対処した指摘は[KaTeXのセキュリティアドバイザリー](https://github.com/advisories/GHSA-238p-pmpm-9mq7)。

Chart.js、Mermaid、marked、D3はロックファイルに従ってローカルでバンドルし、HTMLへ埋め込む。新規レポートはCDNスクリプトを使用しない。既存レポートの既知のCDNタグも拡張から開く際に同じバンドルへ置き換える。生成したJSアセットはVSIXにも収録する。

## 互換性による例外

- typescript-estree 8.71.1の公開peerDependenciesはtypescript >=4.8.4 <6.1.0。この解析APIには6.0.3を使用する。開発時の型チェック・コンパイルは別名で導入した最新版7.0.2を明示的に実行する。[TypeScript公式のCompiler API説明](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)も従来のAPIと新系列の相違を扱っている。
- @types/vscodeは1.90.0を維持する。最新版1.140.0へ上げると、現在のengines.vscode ^1.90.0との不整合でvsceがパッケージ作成を拒否する。既存の対応VS Codeを切り捨てる変更は行っていない。

上記2件以外の直接依存は、npm registryのlatestを確認して更新した。更新後のnpm outdatedに残る項目は上記2件のみ。

## 検証

- npm audit（開発用を含む）：更新前10件（High 8、Moderate 2）→更新後0件。
- npm audit --omit=dev：0件。
- npm run typecheck：成功（TypeScript 7）。
- npm test：46件成功。
- npm run test:browser：日英2件成功。外部通信を遮断した状態で表題、全6タブ、Mermaid SVG、KaTeX MathML、AST追加表示を確認。
- バンドル内のドル置換文字列とbody終了文字列によるHTML破損も回帰テストで確認。

監査結果・直接依存の確定バージョンはdependency-audit.jsonに記録した。0件は検証時点のnpm監査データに基づく既知の指摘件数であり、未知の問題がないという意味ではない。VS Code本体でのライブ操作は今回未実施。

Node.js 22以上が開発・VSIX作成ツールの実行要件。runtimeのVS Code対応範囲は維持した。

## 1.5.3のセキュリティー追補

DOMPurifyを開発依存に追加し、markedのブラウザバンドルへ組み込んだ。配布先ではnpmやCDN経由の追加ロードを必要としない。既存の埋込ライブラリーも拡張からレポートを開いた時に更新する。`npm audit`、`npm audit --omit=dev` はともに0件。現在の確定依存はdependency-audit.json、最新の検証結果はsecurity-remediation.mdを参照。
