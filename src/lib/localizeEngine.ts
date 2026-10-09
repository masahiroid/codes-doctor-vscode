import ts from 'typescript';
const translations: Record<string, string> = require('./locales/report-en.json');
const japanese = /[\u3000-\u30ff\u3400-\u9fff\uff01-\uffef]+/g;

// Translate engine-owned literals before execution; repository names, paths,
// source samples, and provider responses are never passed through this catalog.
export function localizeEngineSource(source: string, filename: string) {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits: Array<{ start: number; end: number; translated: string }> = [];
  function visit(node: import('typescript').Node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
        node.kind === ts.SyntaxKind.TemplateHead || node.kind === ts.SyntaxKind.TemplateMiddle ||
        node.kind === ts.SyntaxKind.TemplateTail) {
      const start = node.getStart(tree);
      const original = source.slice(start, node.end);
      const translated = original.replace(japanese, (phrase: string) => {
        if (!(phrase in translations)) throw new Error(`Missing English report translation in ${filename}: ${phrase}`);
        return translations[phrase];
      }).replace(/lang="ja"/g, 'lang="en"').replace(/ja-JP/g, 'en-US')
        .replace(/in Japanese/g, 'in English');
      if (translated !== original) edits.push({ start, end: node.end, translated });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.translated + source.slice(edit.end);
  }
  return source;
}
module.exports = { localizeEngineSource };
