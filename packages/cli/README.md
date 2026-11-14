# Codes Doctor CLI

- English: this document
- 日本語: [README.ja.md](README.ja.md)

Runs the Codes Doctor analysis from a terminal or CI job and writes the same HTML report as the VS Code extension: God Classes, technical debt, security findings, dependency graphs and an SBOM.

## Usage

```bash
codesdoctor analyze [path] [options]
```

| Option | Meaning |
| --- | --- |
| `-o, --out <dir>` | Report folder (default: `./codes-doctor-report`) |
| `--lang <en\|ja>` | Report language (default: `en`) |
| `--language <name>` | Analyze only one language (`auto`, `typescript`, `javascript`, `php`, `dart`, `python`, `go`, `swift`, `csharp`, `java`, `kotlin`, `rust`, `cpp`) |
| `--min-security <n>` | Exit with code 1 if the security score is below `n` |
| `--min-debt <n>` | Exit with code 1 if the technical debt score is below `n` |
| `--fail-on <severity>` | Exit with code 1 on security findings (code and dependencies) of this severity or worse: `low`, `medium`, `high`, `critical`. Also fails if the dependency scan could not finish, for example without a lockfile |
| `--allow-incomplete-scan` | Do not fail `--fail-on` because of an unfinished scan |
| `--json` | Print the summary as JSON |
| `--verbose` | Show the engine's progress log |

Exit codes: `0` success, `1` a score is below its minimum, `2` invalid usage or analysis error. When a folder has no files in a supported language, scores are reported as not available and thresholds do not fail.

Requires Node.js 24 or newer. `codes-doctor` is also installed as an alias of the command.

Upgrading from `codesdoctor` 0.1.0: the command is now `codesdoctor analyze <path>`, `--display-language` is `--lang`, `--output` is `--out`, and the JavaScript API is no longer exported.

## In CI

```yaml
- run: npx codesdoctor@latest analyze . --out codes-doctor-report --min-security 80 --fail-on critical
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: codes-doctor-report
    path: codes-doctor-report
```

## Security rule audit

```bash
codesdoctor audit [path] [options]
```

Checks a folder against the distributed security rules ([masahiroid/security-rules](https://github.com/masahiroid/security-rules)), the same rules and analysis as the extension's Security Rules panel. It writes to `./codes-doctor-report/security-audit`:

| File | Contents |
| --- | --- |
| `security-audit.json` | The audit report: every rule with its result, locations and data flows, the ruleset version, and the changes since the last run |
| `security-audit.csv` | The same per rule, one row each (machine-readable columns) |
| `security-audit-sheet.csv`, `security-audit.xlsx` | The management sheet for submitting an advisory check: category, rule ID, item, file and line, automatic result, review status, fix needed, reviewer, date, evidence. The Excel file also lists each detected location. Labels follow `--lang` |

Cells that start with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with `'` so a spreadsheet does not run them as formulas.

| Option | Meaning |
| --- | --- |
| `--rules <url>` | Rules manifest, `https:` or `file:` (default: the public security-rules manifest) |
| `--rules-cache <dir>` | Where the last verified rules are kept (default: the user cache folder, never the folder under review). The next download is compared with it |
| `--offline` | Use the cached rules only |
| `--channel <list>` / `--pack <list>` | Only these channels (`emergency`, `baseline`, `regulatory`) or pack IDs |
| `--format <list>` | `json`, `csv`, `xlsx` (default: all) |
| `--evidence <file>` + `--target <name>` | Create or update the review evidence for a service and environment |
| `--check` | Verify the evidence instead of updating it; exit code 1 unless every selected rule has a current review |
| `--fail-on-findings` | Exit code 1 when an input flow or a missing ownership check is found |
| `--json` | Print the summary as JSON |

### Review evidence (`evidence.json`)

The file has the format of security-rules' `rules.py init-evidence`, and `--check` applies the same conditions as `rules.py check`, so either tool can create or verify it. Each rule has an entry bound to the target, the pack version and the rule's SHA-256:

| Field | Meaning |
| --- | --- |
| `status` | `pending` (not started), `in_progress`, `pass`, `fail` (action required), `not_applicable`. Only `pass` and `not_applicable` satisfy a check |
| `evidence` | References to test results, log reviews and so on; at least one |
| `reviewer` | Who reviewed it |
| `checked_at` | ISO time with a time zone, within the last 30 days and not in the future |
| `reason` | Why the rule does not apply (`not_applicable` only) |
| `analysis` | Added by this tool: the automatic result, locations, tool and ruleset version. It never sets a passing status |

When a pack version or a rule changes, its entry goes back to `pending` and the old review is kept under `superseded`. `--check` also warns when an item marked `pass` has a detected input flow, so the review can be looked at again. The tool does not verify who the reviewer is or that the references exist; protect the evidence file with code owners.

### Rule updates

Each run compares the downloaded rules with the cached ones and lists added, changed and removed rules. A rule whose advisory moved to `fix_status: released` is shown first (`! fix released`), so the item is checked again and the fix applied. The extension shows the same changes after a sync.

### Audit in GitHub Actions

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

Run the same workflow in each repository; the uploaded `security-audit.json` and `.xlsx` of each run can be collected from the artifacts. Collecting them into one sheet across repositories is not built in.

Automatic results are review candidates. "No flow found" is not proof of safety, and no result establishes compliance by itself.

## Building from this repository

```bash
cd packages/cli
npm install
npm run build   # builds the engine and copies it into vendor/
npm test
node bin/codes-doctor.js analyze ../vscode/src
```
