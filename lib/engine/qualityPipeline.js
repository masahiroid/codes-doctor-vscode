"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sourceReplacement_1 = require("./sourceReplacement");
module.exports = function patch(source) {
    const apply = (from, to) => { source = (0, sourceReplacement_1.replaceAllRequired)(source, from, to); };
    apply('rankedClasses, pythonFileInfoList, goFileInfoList, swiftFileInfoList, csharpFileInfoList, javaFileInfoList, kotlinFileInfoList, rustFileInfoList);', 'rankedClasses, pythonFileInfoList, goFileInfoList, swiftFileInfoList, csharpFileInfoList, javaFileInfoList, kotlinFileInfoList, rustFileInfoList, repoPath);');
    return source;
};
