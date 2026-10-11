import { resolveInternalImport } from './dependencyHelpers';
import { replaceAllRequired } from './sourceReplacement';

module.exports = function patch(source: string) {
  const apply = (from: string, to: string) => { source = replaceAllRequired(source, from, to); };

    apply("const deps = 'dependencies' in f ? f.dependencies : f.imports;", "const deps = 'dependencies' in f ? f.dependencies : f.imports.filter(specifier => resolveInternalImport(f.filePath, specifier, allFiles));");
    source += '\n' + resolveInternalImport.toString();

  return source;
};

export {};
