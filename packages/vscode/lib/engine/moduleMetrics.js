"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dependencyHelpers_1 = require("./dependencyHelpers");
const sourceReplacement_1 = require("./sourceReplacement");
module.exports = function patch(source) {
    const apply = (from, to) => { source = (0, sourceReplacement_1.replaceAllRequired)(source, from, to); };
    // Use full path identities internally; retain the public basename moduleName.
    apply('return node_path_1.default.basename(filePath, node_path_1.default.extname(filePath));', 'return filePath;');
    apply('const importedModule = node_path_1.default.basename(importPath, node_path_1.default.extname(importPath));', "const importedModule = 'imports' in file ? resolveInternalImport(file.filePath, importPath, files) : files.find(f => node_path_1.default.basename(f.filePath, node_path_1.default.extname(f.filePath)) === node_path_1.default.basename(importPath, node_path_1.default.extname(importPath)))?.filePath;");
    apply('            moduleName,', '            moduleName: node_path_1.default.basename(moduleName, node_path_1.default.extname(moduleName)),');
    apply('betweennessCentrality.get(metric.moduleName)', 'betweennessCentrality.get(metric.filePath)');
    apply('(dist.get(v) || Infinity)', '(dist.get(v) ?? Infinity)');
    apply('dist.get(w) || Infinity', 'dist.get(w) ?? Infinity');
    apply('                if (dfs(neighbor)) {\n                    return true;\n                }', '                dfs(neighbor);');
    apply('                return true;', '                continue;');
    apply('                        cycle,', '                        cycle: cycle.map(filePath => node_path_1.default.basename(filePath, node_path_1.default.extname(filePath))),');
    source += '\n' + dependencyHelpers_1.resolveInternalImport.toString();
    return source;
};
