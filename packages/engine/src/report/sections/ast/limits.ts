/**
 * Display caps for the AST section. Kept in one object so a host that wants the
 * complete structure (e.g. the VS Code extension) can lift every cap in one place.
 */
export const AST_SECTION_LIMITS = {
  /** Files shown per language. */
  filesPerLanguage: 5,
  /** Characters of serialized raw AST shown per file. */
  rawAstChars: 40000,
  /** Characters of source shown for languages without a full AST. */
  sourcePreviewChars: 2000,
  /** Imports / functions / types listed per file. */
  listItems: 30,
  /** Classes listed (with their members) per file. */
  classes: 20,
  /** Methods listed per class. */
  methods: 20,
  /** Namespaces listed per file. */
  namespaces: 10,
};
