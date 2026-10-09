# Changelog

## 1.0.0

- Initial public release.
- In-process analysis engine (no external server required): God Class detection, technical debt scoring, security scoring, dependency/call graphs, architecture layer analysis, SBOM generation.
- Language support: TypeScript/JavaScript, PHP, Dart, Python.
- Dashboard (Activity Bar) with language mode and report-open-mode controls.
- Reports open in an external browser, a VS Code WebView panel, or via VS Code's own URI handler.
- Optional LLM structural review: choose OpenAI or Anthropic, set an API key via secure secret storage, fetch the provider's live model list, and run a review that's written back into the report.
