"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEngine = loadEngine;
const node_path_1 = __importDefault(require("node:path"));
const bundled = typeof CODE_DOCTOR_BUNDLED !== 'undefined' && CODE_DOCTOR_BUNDLED;
/**
 * The engine build for a report language. Each language is a separate engine build:
 * bundled next to the extension in the VSIX (dist/engine-ja.js, dist/engine-en.js),
 * or copied by the vendor step (vendor/csap, vendor/csap-en) during development and tests.
 */
function loadEngine(language) {
    const location = bundled
        ? node_path_1.default.join(__dirname, language === 'ja' ? 'engine-ja.js' : 'engine-en.js')
        : node_path_1.default.join(__dirname, '..', 'vendor', language === 'ja' ? 'csap' : 'csap-en');
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(location);
}
