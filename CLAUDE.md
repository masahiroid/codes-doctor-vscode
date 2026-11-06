# Codes Doctor — Claude Code Project Guide

## Overview
This repository contains Codes Doctor, a static analysis engine, CLI, and VS Code extension for code health, God Class detection, circular dependency tracking, and taint-flow security analysis.

## Codes Doctor CLI
To run static analysis and technical debt audit on this codebase:
```bash
node packages/cli/bin/codes-doctor.js analyze .
```
Or across individual packages:
- Engine: `node packages/cli/bin/codes-doctor.js analyze packages/engine`
- VS Code Extension: `node packages/cli/bin/codes-doctor.js analyze packages/vscode`

## Versioning and Releases
The engine, CLI (published to npm as `codesdoctor`) and VS Code extension live in this monorepo and share one version. `scripts/bump-version.mjs` updates every `package.json`, `package-lock.json` and changelog (`CHANGELOG.md`, `CHANGELOG.ja.md`, `packages/vscode/CHANGELOG.md`). `npm run check:versions` verifies them, and CI runs it.

Merging a version bump to `main` releases it: the workflow tags it, creates the GitHub release, and publishes to the Marketplace and to npm under `latest`.
- To merge without a new release, leave the version unchanged. If the current version is tagged but missing from npm, any non-Dependabot push to `main` still publishes it.
- Scheduled releases and Dependabot pushes do not publish to npm, so the CLI can lag the extension until the next such push or a manual run.

## When User Asks for `@codedoctor`, `/prompt`, or Refactoring:
1. Run `node packages/cli/bin/codes-doctor.js analyze .` to inspect current code metrics and security score.
2. Address any Critical or High issues, prioritize God classes with high scores, and resolve circular dependencies.
3. Preserve backward compatibility, keep public APIs intact, and run `npm test` after all changes.
