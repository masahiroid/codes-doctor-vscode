"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.localizeEngineSource = localizeEngineSource;
const typescript_1 = __importDefault(require("typescript"));
const translations = require('./locales/report-en.json');
const japanese = /[\u3000-\u30ff\u3400-\u9fff\uff01-\uffef]+/g;
// Translate engine-owned literals before execution; repository names, paths,
// source samples, and provider responses are never passed through this catalog.
function localizeEngineSource(source, filename) {
    const tree = typescript_1.default.createSourceFile(filename, source, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.JS);
    const edits = [];
    function visit(node) {
        if (typescript_1.default.isStringLiteral(node) || typescript_1.default.isNoSubstitutionTemplateLiteral(node) ||
            node.kind === typescript_1.default.SyntaxKind.TemplateHead || node.kind === typescript_1.default.SyntaxKind.TemplateMiddle ||
            node.kind === typescript_1.default.SyntaxKind.TemplateTail) {
            const start = node.getStart(tree);
            const original = source.slice(start, node.end);
            const translated = original.replace(japanese, (phrase) => {
                if (!(phrase in translations))
                    throw new Error(`Missing English report translation in ${filename}: ${phrase}`);
                return translations[phrase];
            }).replace(/lang="ja"/g, 'lang="en"').replace(/ja-JP/g, 'en-US')
                .replace(/in Japanese/g, 'in English');
            if (translated !== original)
                edits.push({ start, end: node.end, translated });
        }
        typescript_1.default.forEachChild(node, visit);
    }
    visit(tree);
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
        source = source.slice(0, edit.start) + edit.translated + source.slice(edit.end);
    }
    return source;
}
module.exports = { localizeEngineSource };
