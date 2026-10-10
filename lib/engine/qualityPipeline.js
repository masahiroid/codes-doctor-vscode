"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sourceReplacement_1 = require("./sourceReplacement");
module.exports = function patch(source) {
    const apply = (from, to) => { source = (0, sourceReplacement_1.replaceAllRequired)(source, from, to); };
    apply('rankedClasses, pythonFileInfoList, goFileInfoList, swiftFileInfoList);', 'rankedClasses, pythonFileInfoList, goFileInfoList, swiftFileInfoList, repoPath);');
    return source;
};
