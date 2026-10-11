import { getDisplayLanguage } from './config';
const japanese: Record<string, string> = require('./locales/ui-ja.json');
export function translate(language: 'en' | 'ja', message: string, values: Record<string, unknown> = {}) {
  const template = language === 'ja' ? japanese[message] || message : message;
  return template.replace(/\{(\w+)\}/g, (match: string, key: string) => Object.hasOwn(values, key) ? String(values[key]) : match);
}
export function translator(vscode: typeof import('vscode')) {
  return (message: string, values?: Record<string, unknown>) => translate(getDisplayLanguage(vscode), message, values);
}
module.exports = { translate, translator };
