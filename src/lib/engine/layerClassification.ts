
import { replaceAllRequired } from './sourceReplacement';

module.exports = function patch(source: string) {
  const apply = (from: string, to: string) => { source = replaceAllRequired(source, from, to); };

    apply('function generateLayerHeatmap(tsFiles, phpFiles, godClasses, pythonFiles = [], goFiles = []) {', `function generateLayerHeatmap(tsFiles, phpFiles, godClasses, pythonFiles = [], goFiles = [], repoPath) {
    if (repoPath) {
        const path = require('node:path');
        const relative = value => path.relative(repoPath, value).split(path.sep).join('/');
        const convert = file => ({ ...file, filePath: relative(file.filePath) });
        tsFiles = tsFiles.map(convert);
        phpFiles = phpFiles.map(convert);
        pythonFiles = pythonFiles.map(convert);
        goFiles = goFiles.map(convert);
        godClasses = godClasses.map(convert);
    }`);
    apply('pattern.test(filePath)', "pattern.test('/' + filePath)");

  return source;
};

export {};
