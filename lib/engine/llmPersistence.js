"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sourceReplacement_1 = require("./sourceReplacement");
module.exports = function patch(source) {
    source = (0, sourceReplacement_1.replaceRequired)(source, "astOnlyMode ? 'llmAstResult' : 'llmResult'", "astOnlyMode ? 'astResult' : 'llmResult'");
    source = (0, sourceReplacement_1.replaceRequired)(source, 'const patched = html.replace(pattern,', 'let patched = html.replace(pattern,');
    source = (0, sourceReplacement_1.replaceRequired)(source, 'html.replace(pattern, `$1 data-md="${escaped}"$2${escaped}$3`)', 'html.replace(pattern, (_match, before, after, close) => `${before} data-md="${escaped}"${after}${escaped}${close}`)');
    source = (0, sourceReplacement_1.replaceRequired)(source, 'if (patched !== html) {', `if (divId === 'astResult') patched = patched.replace('<div id="astReview" hidden>', '<div id="astReview">');
    if (patched !== html) {`);
    return source;
};
