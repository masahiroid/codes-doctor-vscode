"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sourceReplacement_1 = require("./sourceReplacement");
module.exports = function patch(source) {
    const apply = (from, to) => { source = (0, sourceReplacement_1.replaceAllRequired)(source, from, to); };
    apply('function generateLayerHeatmap(tsFiles, phpFiles, godClasses, pythonFiles = [], goFiles = [], swiftFiles = [], csharpFiles = [], javaFiles = [], kotlinFiles = [], rustFiles = []) {', `function generateLayerHeatmap(tsFiles, phpFiles, godClasses, pythonFiles = [], goFiles = [], swiftFiles = [], csharpFiles = [], javaFiles = [], kotlinFiles = [], rustFiles = [], repoPath) {
    if (repoPath) {
        const path = require('node:path');
        const relative = value => path.relative(repoPath, value).split(path.sep).join('/');
        const convert = file => ({ ...file, filePath: relative(file.filePath) });
        tsFiles = tsFiles.map(convert);
        phpFiles = phpFiles.map(convert);
        pythonFiles = pythonFiles.map(convert);
        goFiles = goFiles.map(convert);
        swiftFiles = swiftFiles.map(convert);
        csharpFiles = csharpFiles.map(convert);
        javaFiles = javaFiles.map(convert);
        kotlinFiles = kotlinFiles.map(convert);
        rustFiles = rustFiles.map(convert);
        godClasses = godClasses.map(convert);
    }`);
    apply('pattern.test(filePath)', "pattern.test('/' + filePath)");
    return source;
};
