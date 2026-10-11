import { localizeAstLabels } from './astRendering';

/** Lift every AST display cap: the extension lists all files and items, paginating only in the DOM. */
module.exports = function patch(source: string) {
  const start = source.indexOf('exports.AST_SECTION_LIMITS = {');
  const end = source.indexOf('};', start);
  if (start < 0 || end < 0) throw new Error('AST_SECTION_LIMITS marker missing');
  const limits = source.slice(start, end).replace(/: \d+,/g, ': Infinity,');
  return localizeAstLabels(source.slice(0, start) + limits + source.slice(end));
};

export {};
