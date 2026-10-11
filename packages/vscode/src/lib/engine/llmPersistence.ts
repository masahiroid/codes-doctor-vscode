import { replaceRequired } from './sourceReplacement';

/** The extension's AST section hides its review wrapper until a result exists; reveal it on the first save. */
module.exports = function patch(source: string) {
    source = replaceRequired(source, 'const patched = html.replace(pattern,', 'let patched = html.replace(pattern,');
    source = replaceRequired(source, 'if (patched !== html) {', `if (divId === 'astResult') patched = patched.replace('<div id="astReview" hidden>', '<div id="astReview">');
    if (patched !== html) {`);

  return source;
};

export {};
