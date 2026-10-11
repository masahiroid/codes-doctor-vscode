import { collectStaticImports } from './dependencyHelpers';
import { replaceAllRequired } from './sourceReplacement';

module.exports = function patch(source: string) {
  const apply = (from: string, to: string) => { source = replaceAllRequired(source, from, to); };

    apply('        // Extract classes', '        imports.splice(0, imports.length, ...collectStaticImports(ast));\n        // Extract classes');
    apply("for (const node of ast.body) {\n                if (node.type === 'ClassDeclaration'", "for (const entry of ast.body) {\n                const node = ['ExportNamedDeclaration', 'ExportDefaultDeclaration'].includes(entry.type) ? entry.declaration : entry;\n                if (!node) continue;\n                if (node.type === 'ClassDeclaration'");
    source += '\n' + collectStaticImports.toString();

  return source;
};

export {};
