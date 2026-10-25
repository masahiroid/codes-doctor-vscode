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

## When User Asks for `@codedoctor`, `/prompt`, or Refactoring:
1. Run `node packages/cli/bin/codes-doctor.js analyze .` to inspect current code metrics and security score.
2. Address any Critical or High issues, prioritize God classes with high scores, and resolve circular dependencies.
3. Preserve backward compatibility, keep public APIs intact, and run `npm test` after all changes.
