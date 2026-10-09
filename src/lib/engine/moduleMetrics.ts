import { resolveInternalImport } from './dependencyHelpers';
import { replaceAllRequired } from './sourceReplacement';

module.exports = function patch(source: string) {
  const apply = (from: string, to: string) => { source = replaceAllRequired(source, from, to); };

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
    source += '\n' + resolveInternalImport.toString();

  return source;
};

export {};
