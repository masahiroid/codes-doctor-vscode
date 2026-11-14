# Codes Doctor CLI

- English: [README.md](README.md)
- 日本語: この文書

ターミナルや CI から Codes Doctor の解析を実行し、VS Code 拡張機能と同じ HTML レポート（God Class、技術的負債、セキュリティ、依存グラフ、SBOM）を出力します。

## 使い方

```bash
codesdoctor analyze [パス] [オプション]
```

| オプション | 内容 |
| --- | --- |
| `-o, --out <dir>` | レポートの出力先（既定: `./codes-doctor-report`） |
| `--lang <en\|ja>` | レポートの言語（既定: `en`） |
| `--language <name>` | 解析する言語を 1 つに限定（`auto`、`typescript`、`javascript`、`php`、`dart`、`python`、`go`、`swift`、`csharp`、`java`、`kotlin`、`rust`、`cpp`） |
| `--min-security <n>` | セキュリティスコアが `n` 未満なら終了コード 1 |
| `--min-debt <n>` | 技術的負債スコアが `n` 未満なら終了コード 1 |
| `--fail-on <severity>` | 指定した重大度以上のセキュリティ検出（コードと依存関係）があれば終了コード 1。`low`、`medium`、`high`、`critical` から指定。ロックファイルがないなど依存関係スキャンが完了しない場合も失敗 |
| `--allow-incomplete-scan` | スキャン未完了を理由に `--fail-on` を失敗させない |
| `--json` | 結果の要約を JSON で出力 |
| `--verbose` | エンジンの進行ログを表示 |

終了コード: `0` 成功、`1` スコアが下限未満、`2` 引数の誤りまたは解析エラー。対応言語のファイルがないフォルダーではスコアは「なし」になり、下限判定で失敗にはなりません。

Node.js 24 以上が必要です。`codes-doctor` もコマンドの別名としてインストールされます。

`codesdoctor` 0.1.0 からの移行: コマンドは `codesdoctor analyze <パス>` になり、`--display-language` は `--lang`、`--output` は `--out` に変わりました。JavaScript API の公開は終了しました。

## CI での利用

```yaml
- run: npx codesdoctor@latest analyze . --out codes-doctor-report --min-security 80 --fail-on critical
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: codes-doctor-report
    path: codes-doctor-report
```

## セキュリティルール点検

```bash
codesdoctor audit [path] [options]
```

配信セキュリティルール（[masahiroid/security-rules](https://github.com/masahiroid/security-rules)）でフォルダを点検します。拡張機能の「セキュリティルール」パネルと同じルール・同じ解析です。`./codes-doctor-report/security-audit` に次を出力します。

| ファイル | 内容 |
| --- | --- |
| `security-audit.json` | 監査レポート。ルールごとの判定、該当箇所とデータフロー、ルールセットの版、前回からのルール変更 |
| `security-audit.csv` | ルールごとに1行（機械処理用の列） |
| `security-audit-sheet.csv`、`security-audit.xlsx` | 注意喚起の点検提出用の管理表。分類、ルールID、項目名、対象ファイル・行、自動判定、点検ステータス、是正要否、担当者、点検日時、証跡。Excelには検出箇所の一覧シートも入ります。表記は `--lang` に従います |

`=`、`+`、`-`、`@`、タブ、改行で始まるセルには `'` を付け、表計算ソフトで式として実行されないようにします。

| オプション | 意味 |
| --- | --- |
| `--rules <url>` | ルールのマニフェスト（`https:` または `file:`。既定は公開版のsecurity-rules） |
| `--rules-cache <dir>` | 検証済みルールの保存先（既定はユーザーのキャッシュフォルダ。点検対象のフォルダには置きません）。次回のダウンロードと比較します |
| `--offline` | キャッシュ済みのルールだけを使う |
| `--channel <list>` / `--pack <list>` | 対象のチャネル（`emergency`、`baseline`、`regulatory`）またはパックID |
| `--format <list>` | `json`、`csv`、`xlsx`（既定はすべて） |
| `--evidence <file>` と `--target <name>` | サービスと環境を指定して、点検の証跡を作成・更新する |
| `--check` | 証跡を更新せずに検証する。選んだ全ルールに有効な点検結果がなければ終了コード1 |
| `--fail-on-findings` | 入力の到達または所有者照合なしが見つかったら終了コード1 |
| `--json` | 要約をJSONで出力する |

### 点検の証跡（`evidence.json`）

security-rules の `rules.py init-evidence` と同じ形式で、`--check` は `rules.py check` と同じ条件で判定します。どちらのツールで作成・検証しても構いません。各ルールの項目は、対象・パックの版・ルールのSHA-256に結び付きます。

| フィールド | 意味 |
| --- | --- |
| `status` | `pending`（未着手）、`in_progress`（対応中）、`pass`（合格）、`fail`（要対応）、`not_applicable`（対象外）。合格扱いは `pass` と `not_applicable` だけ |
| `evidence` | 試験結果やログ調査報告などの参照先。1件以上 |
| `reviewer` | 点検担当者 |
| `checked_at` | タイムゾーン付きのISO日時。30日以内で未来でないこと |
| `reason` | 対象外の理由（`not_applicable` のとき） |
| `analysis` | このツールが付ける自動判定（結果、該当箇所、ツールとルールセットの版）。合格のステータスを自動で付けることはありません |

パックの版やルールの内容が変わると、その項目は `pending` に戻り、以前の点検結果は `superseded` に残ります。`--check` は、`pass` の項目で入力の到達が検出されている場合に警告を出します。担当者の本人性や参照先の実在は検証しないため、証跡ファイルはCODEOWNERS等で承認対象にしてください。

### ルール更新時の再点検

実行のたびに、ダウンロードしたルールをキャッシュ済みのルールと比較し、追加・変更・削除されたルールを表示します。注意喚起が `fix_status: released`（修正版公開）に移ったルールは先頭に `! fix released` として表示します。再点検して修正を適用してください。拡張機能も同期後に同じ変更を通知します。

### GitHub Actionsでの点検

```yaml
name: Security rule audit
on:
  pull_request:
  schedule:
    - cron: '0 0 * * *'
permissions:
  contents: read
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: >-
          npx codesdoctor@latest audit . --channel emergency
          --evidence security/evidence.json --target "${{ github.repository }}/production"
          --check --out security-audit
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: security-audit
          path: security-audit
```

各リポジトリで同じワークフローを動かし、成果物（artifact）から各回の `security-audit.json` と `.xlsx` を回収できます。複数リポジトリの結果を1つの管理表にまとめる機能はありません。

自動判定は確認候補です。「到達なし」は安全の証明ではなく、どの結果も単独では適合を示しません。

## このリポジトリからのビルド

```bash
cd packages/cli
npm install
npm run build   # エンジンをビルドして vendor/ にコピー
npm test
node bin/codes-doctor.js analyze ../vscode/src
```
