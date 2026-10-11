// Generates the English engine (dist-en/) from the Japanese build (dist/).
// Only engine-owned string literals are translated, fragment by fragment, from
// locales/report-en.json; a fragment without a translation fails the build.
// Repository names, paths, source samples and LLM output never pass through here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'dist');
const target = path.join(root, 'dist-en');
const translations = JSON.parse(fs.readFileSync(path.join(root, 'locales', 'report-en.json'), 'utf8'));
const japanese = /[　-ヿ㐀-鿿！-￯]+/g;
/** Scripts that run in the report page and pick their language from <html lang>. */
const SELF_LOCALIZED_DIRS = [path.join('report', 'browser')];

export function localize(code, filename) {
  const tree = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = [];
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
        node.kind === ts.SyntaxKind.TemplateHead || node.kind === ts.SyntaxKind.TemplateMiddle ||
        node.kind === ts.SyntaxKind.TemplateTail) {
      const start = node.getStart(tree);
      const original = code.slice(start, node.end);
      const translated = original.replace(japanese, (phrase) => {
        if (!(phrase in translations)) throw new Error(`Missing English report translation in ${filename}: ${phrase}`);
        return translations[phrase];
      }).replace(/lang="ja"/g, 'lang="en"').replace(/ja-JP/g, 'en-US').replace(/in Japanese/g, 'in English');
      if (translated !== original) edits.push({ start, end: node.end, translated });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    code = code.slice(0, edit.start) + edit.translated + code.slice(edit.end);
  }
  return code;
}

function copyTree(from, to, relative = '') {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    const rel = path.join(relative, entry.name);
    if (entry.isDirectory()) copyTree(src, dest, rel);
    else if (entry.name.endsWith('.js') && !SELF_LOCALIZED_DIRS.some((dir) => rel.startsWith(dir + path.sep))) {
      fs.writeFileSync(dest, localize(fs.readFileSync(src, 'utf8'), rel));
    } else fs.copyFileSync(src, dest);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.rmSync(target, { recursive: true, force: true });
  copyTree(source, target);
}
