"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dependencyHelpers_1 = require("./dependencyHelpers");
const sourceReplacement_1 = require("./sourceReplacement");
module.exports = function patch(source) {
    const apply = (from, to) => { source = (0, sourceReplacement_1.replaceAllRequired)(source, from, to); };
    apply('        // Extract classes', '        imports.splice(0, imports.length, ...collectStaticImports(ast));\n        // Extract classes');
    apply("for (const node of ast.body) {\n                if (node.type === 'ClassDeclaration'", "for (const entry of ast.body) {\n                const node = ['ExportNamedDeclaration', 'ExportDefaultDeclaration'].includes(entry.type) ? entry.declaration : entry;\n                if (!node) continue;\n                if (node.type === 'ClassDeclaration'");
    source += '\n' + dependencyHelpers_1.collectStaticImports.toString();
    return source;
};
