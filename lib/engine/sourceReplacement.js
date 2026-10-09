"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replaceRequired = replaceRequired;
exports.replaceAllRequired = replaceAllRequired;
function replaceRequired(source, from, to) {
    if (!source.includes(from))
        throw new Error(`Engine patch marker missing: ${from}`);
    return source.replace(from, () => to);
}
module.exports = { replaceRequired };
function replaceAllRequired(source, from, to) {
    if (!source.includes(from))
        throw new Error(`Dependency patch marker missing: ${from}`);
    return source.replaceAll(from, () => to);
}
module.exports.replaceAllRequired = replaceAllRequired;
