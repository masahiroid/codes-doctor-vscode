# Repository instructions

This is a monorepo: `packages/engine` (analysis engine), `packages/cli` (the `codes-doctor` command) and `packages/vscode` (the VS Code extension). The extension and the CLI consume the engine build through `scripts/vendor-engine.mjs`; the engine is never patched after it is built.

- For each completed task that changes a package, increment the version. Use a patch increment by default unless the user requests a different version.
- All three packages share one version. Keep each `package.json`, the top-level version in its `package-lock.json`, and `packages[""].version` in that lock file synchronized (`scripts/bump-version.mjs` does all of them).
- Add a matching entry to `packages/vscode/CHANGELOG.md` describing the completed changes.
- Increment once per completed change task, not for every individual file edit or follow-up question. Do not publish a release unless requested.
