"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rulesModule = void 0;
const engine_1 = require("../engine");
let loaded;
const rulesModule = () => (loaded ??= (0, engine_1.loadEngine)('ja').securityRules);
exports.rulesModule = rulesModule;
