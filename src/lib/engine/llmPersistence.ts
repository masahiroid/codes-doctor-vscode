import { replaceRequired } from './sourceReplacement';

module.exports = function patch(source: string) {
    source = replaceRequired(source, "astOnlyMode ? 'llmAstResult' : 'llmResult'", "astOnlyMode ? 'astResult' : 'llmResult'");
    source = replaceRequired(source, 'const patched = html.replace(pattern,', 'let patched = html.replace(pattern,');
    source = replaceRequired(source, 'html.replace(pattern, `$1 data-md="${escaped}"$2${escaped}$3`)', 'html.replace(pattern, (_match, before, after, close) => `${before} data-md="${escaped}"${after}${escaped}${close}`)');
    source = replaceRequired(source, 'if (patched !== html) {', `if (divId === 'astResult') patched = patched.replace('<div id="astReview" hidden>', '<div id="astReview">');
    if (patched !== html) {`);

  return source;
};

export {};
