# Codes Doctor CLI

- English: this document
- 日本語: [README.ja.md](README.ja.md)

Runs the Codes Doctor analysis from a terminal or CI job and writes the same HTML report as the VS Code extension: God Classes, technical debt, security findings, dependency graphs and an SBOM.

## Usage

```bash
codes-doctor analyze [path] [options]
```

| Option | Meaning |
| --- | --- |
| `-o, --out <dir>` | Report folder (default: `./codes-doctor-report`) |
| `--lang <en\|ja>` | Report language (default: `en`) |
| `--language <name>` | Analyze only one language (`auto`, `typescript`, `javascript`, `php`, `dart`, `python`, `go`, `swift`, `csharp`, `java`, `kotlin`, `rust`, `cpp`) |
| `--min-security <n>` | Exit with code 1 if the security score is below `n` |
| `--min-debt <n>` | Exit with code 1 if the technical debt score is below `n` |
| `--json` | Print the summary as JSON |
| `--verbose` | Show the engine's progress log |

Exit codes: `0` success, `1` a score is below its minimum, `2` invalid usage or analysis error. When a folder has no files in a supported language, scores are reported as not available and thresholds do not fail.

## In CI

```yaml
- run: npx codes-doctor analyze . --out codes-doctor-report --min-security 80
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: codes-doctor-report
    path: codes-doctor-report
```

## Building from this repository

```bash
cd packages/cli
npm install
npm run build   # builds the engine and copies it into vendor/
npm test
node bin/codes-doctor.js analyze ../vscode/src
```
