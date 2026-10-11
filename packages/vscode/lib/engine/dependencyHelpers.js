"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectStaticImports = collectStaticImports;
exports.resolveInternalImport = resolveInternalImport;
function collectStaticImports(ast) {
    const imports = new Set();
    function visit(input, shadowed = false) {
        if (!input || typeof input !== 'object')
            return;
        const node = input;
        if (typeof node.type !== 'string')
            return;
        if (/Function/.test(node.type) && node.params?.some((p) => p.type === 'Identifier' && p.name === 'require'))
            shadowed = true;
        if (node.importKind === 'type' || node.exportKind === 'type')
            return;
        if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && typeof node.source?.value === 'string')
            imports.add(node.source.value);
        if (node.type === 'ImportExpression' && typeof node.source?.value === 'string')
            imports.add(node.source.value);
        if (!shadowed && node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'require' && node.arguments?.length === 1 && typeof node.arguments[0].value === 'string')
            imports.add(node.arguments[0].value);
        for (const [key, value] of Object.entries(node)) {
            if (key === 'parent')
                continue;
            if (Array.isArray(value))
                value.forEach((child) => visit(child, shadowed));
            else if (value && typeof value === 'object')
                visit(value, shadowed);
        }
    }
    visit(ast);
    return [...imports];
}
function resolveInternalImport(filePath, specifier, files) {
    const path = require('node:path');
    if (!specifier.startsWith('.') && !path.isAbsolute(specifier))
        return undefined;
    const base = path.resolve(path.dirname(filePath), specifier);
    const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
    const directoryEntrypoint = 'index';
    const candidates = [base, ...sourceExtensions.map((ext) => base + ext), ...sourceExtensions.map((ext) => path.join(base, directoryEntrypoint + ext))];
    return files.find((file) => candidates.includes(path.resolve(file.filePath)))?.filePath;
}
module.exports = { collectStaticImports, resolveInternalImport };
