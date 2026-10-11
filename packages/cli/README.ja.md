# Codes Doctor CLI

- English: [README.md](README.md)
- 日本語: この文書

ターミナルや CI から Codes Doctor の解析を実行し、VS Code 拡張機能と同じ HTML レポート（God Class、技術的負債、セキュリティ、依存グラフ、SBOM）を出力します。

## 使い方

```bash
codes-doctor analyze [パス] [オプション]
```

| オプション | 内容 |
| --- | --- |
| `-o, --out <dir>` | レポートの出力先（既定: `./codes-doctor-report`） |
| `--lang <en\|ja>` | レポートの言語（既定: `en`） |
| `--language <name>` | 解析する言語を 1 つに限定（`auto`、`typescript`、`javascript`、`php`、`dart`、`python`、`go`、`swift`、`csharp`、`java`、`kotlin`、`rust`、`cpp`） |
| `--min-security <n>` | セキュリティスコアが `n` 未満なら終了コード 1 |
| `--min-debt <n>` | 技術的負債スコアが `n` 未満なら終了コード 1 |
| `--json` | 結果の要約を JSON で出力 |
| `--verbose` | エンジンの進行ログを表示 |

終了コード: `0` 成功、`1` スコアが下限未満、`2` 引数の誤りまたは解析エラー。対応言語のファイルがないフォルダーではスコアは「なし」になり、下限判定で失敗にはなりません。

## CI での利用

```yaml
- run: npx codes-doctor analyze . --out codes-doctor-report --min-security 80
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: codes-doctor-report
    path: codes-doctor-report
```

## このリポジトリからのビルド

```bash
cd packages/cli
npm install
npm run build   # エンジンをビルドして vendor/ にコピー
npm test
node bin/codes-doctor.js analyze ../vscode/src
```
