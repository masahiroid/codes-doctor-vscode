"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dependencyHelpers_1 = require("./dependencyHelpers");
const sourceReplacement_1 = require("./sourceReplacement");
module.exports = function patch(source) {
    const apply = (from, to) => { source = (0, sourceReplacement_1.replaceAllRequired)(source, from, to); };
    apply("const deps = 'dependencies' in f ? f.dependencies : f.imports;", "const deps = 'dependencies' in f ? f.dependencies : f.imports.filter(specifier => resolveInternalImport(f.filePath, specifier, allFiles));");
    source += '\n' + dependencyHelpers_1.resolveInternalImport.toString();
    return source;
};
