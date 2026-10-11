"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.translate = translate;
exports.translator = translator;
const config_1 = require("./config");
const japanese = require('./locales/ui-ja.json');
function translate(language, message, values = {}) {
    const template = language === 'ja' ? japanese[message] || message : message;
    return template.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
}
function translator(vscode) {
    return (message, values) => translate((0, config_1.getDisplayLanguage)(vscode), message, values);
}
module.exports = { translate, translator };
