
import { replaceAllRequired } from './sourceReplacement';

module.exports = function patch(source: string) {
  const apply = (from: string, to: string) => { source = replaceAllRequired(source, from, to); };

    apply('function generateLayerHeatmap(tsFiles, phpFiles, godClasses, pythonFiles = [], goFiles = [], swiftFiles = [], csharpFiles = [], javaFiles = [], kotlinFiles = [], rustFiles = [], cppFiles = []) {', `function generateLayerHeatmap(tsFiles, phpFiles, godClasses, pythonFiles = [], goFiles = [], swiftFiles = [], csharpFiles = [], javaFiles = [], kotlinFiles = [], rustFiles = [], cppFiles = [], repoPath) {
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
        cppFiles = cppFiles.map(convert);
        godClasses = godClasses.map(convert);
    }`);
    apply('pattern.test(filePath)', "pattern.test('/' + filePath)");

  return source;
};

export {};
