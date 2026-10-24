"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.flowRulesOf = exports.SCAN_EXCLUDE_GLOB = exports.UNSUPPORTED_SOURCE_GLOB = exports.SCAN_GLOB = exports.ruleKey = exports.SCAN_LIMITS = void 0;
exports.compileRules = compileRules;
exports.languageForFile = languageForFile;
exports.scanText = scanText;
exports.scanFile = scanFile;
const node_path_1 = __importDefault(require("node:path"));
/** Compiling rules (patterns and engine data-flow detectors) and scanning file contents with them. */
const MAX_PATTERN_LENGTH = 500;
exports.SCAN_LIMITS = Object.freeze({ maxFileBytes: 1024 * 1024, maxPerRulePerFile: 200, maxTotalCandidates: 5000 });
// A quantified group that itself contains a quantifier, e.g. (a+)+. Rules arrive over the network
// and run on the extension host thread, so patterns that can backtrack catastrophically are refused.
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,\d*\})/;
const ruleKey = (packId, ruleId) => `${packId}/${ruleId}`;
exports.ruleKey = ruleKey;
function compileRules(packs, engine) {
    const compiled = [];
    const invalid = [];
    for (const pack of packs) {
        for (const rule of pack.rules) {
            // A rule with a deterministic detector uses it instead of its pattern.
            if (rule.detect !== undefined) {
                try {
                    if (!engine)
                        throw new Error('the analysis engine is not available');
                    compiled.push({ pack, rule, taint: engine.compileTaintRule(rule.id, rule.detect) });
                }
                catch (error) {
                    invalid.push({ packId: pack.id, ruleId: rule.id, reason: error instanceof Error ? error.message : String(error) });
                }
                continue;
            }
            if (rule.pattern === undefined) {
                compiled.push({ pack, rule });
                continue;
            }
            const reason = rule.pattern.length > MAX_PATTERN_LENGTH
                ? 'pattern is too long'
                : NESTED_QUANTIFIER.test(rule.pattern)
                    ? 'pattern has nested quantifiers and could backtrack catastrophically'
                    : undefined;
            if (reason) {
                invalid.push({ packId: pack.id, ruleId: rule.id, reason });
                continue;
            }
            try {
                compiled.push({ pack, rule, regex: new RegExp(rule.pattern, 'g') });
            }
            catch (error) {
                invalid.push({ packId: pack.id, ruleId: rule.id, reason: error instanceof Error ? error.message : String(error) });
            }
        }
    }
    return { compiled, invalid };
}
const LANGUAGE_BY_EXTENSION = {
    '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.json': 'json',
    '.php': 'php',
};
function languageForFile(fileName) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.d.ts') || lower.endsWith('.min.js') || lower.endsWith('.bundle.js'))
        return undefined;
    return LANGUAGE_BY_EXTENSION[node_path_1.default.extname(lower)];
}
exports.SCAN_GLOB = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,json,php}';
/** Source files no security rule can analyze yet; counted so the panel can say they were not checked. */
exports.UNSUPPORTED_SOURCE_GLOB = '**/*.{py,go,java,kt,kts,rb,cs,rs,swift,dart,c,cc,cpp,h,hpp,scala}';
exports.SCAN_EXCLUDE_GLOB = '**/{node_modules,.git,dist,dist-en,out,build,coverage,vendor,.venv,.codes-doctor}/**';
function scanText(text, language, rules, limits = exports.SCAN_LIMITS) {
    const candidates = [];
    let lineStarts;
    const position = (offset) => {
        if (!lineStarts) {
            lineStarts = [0];
            for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1))
                lineStarts.push(index + 1);
        }
        let low = 0;
        let high = lineStarts.length - 1;
        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (lineStarts[mid] <= offset)
                low = mid;
            else
                high = mid - 1;
        }
        return { line: low, column: offset - lineStarts[low] };
    };
    for (const { pack, rule, regex } of rules) {
        if (!regex || !rule.targetLanguages.includes(language))
            continue;
        regex.lastIndex = 0;
        let count = 0;
        for (let match = regex.exec(text); match && count < limits.maxPerRulePerFile; match = regex.exec(text)) {
            if (match[0].length === 0)
                regex.lastIndex++;
            const start = position(match.index);
            const end = position(match.index + Math.max(match[0].length, 1));
            candidates.push({ packId: pack.id, ruleId: rule.id, startLine: start.line, startColumn: start.column, endLine: end.line, endColumn: end.column });
            count++;
        }
    }
    return candidates;
}
/** Pattern matches plus data flows for the rules that have a detector. */
/** The rules with a data-flow detector. */
const flowRulesOf = (rules) => rules.filter((item) => item.taint !== undefined);
exports.flowRulesOf = flowRulesOf;
/**
 * Pattern matches plus data flows. With a project index, calls into other files of the workspace
 * are followed; a flow into another file is placed on the call in this file.
 */
async function scanFile(text, language, filePath, rules, engine, index, endpoints) {
    const candidates = scanText(text, language, rules);
    if (!engine)
        return candidates;
    const flowRules = (0, exports.flowRulesOf)(rules);
    if (flowRules.length === 0)
        return candidates;
    let results = [];
    try {
        // One parse of the file serves every rule.
        const taintRules = flowRules.map((item) => item.taint);
        results = index
            ? await engine.analyzeTaintRulesWithIndex(index, taintRules, language, filePath, text)
            : await engine.analyzeTaintRules(taintRules, language, filePath, text);
    }
    catch {
        // A file the parser cannot read yields no flows; the pattern pass above still ran.
    }
    const place = (packId, ruleId, flow) => {
        const line = Math.max((flow.entry ?? flow.sink).line - 1, 0);
        const lineText = text.split('\n', line + 1)[line] ?? '';
        const indent = lineText.length - lineText.trimStart().length;
        candidates.push({ packId, ruleId, startLine: line, startColumn: indent, endLine: line, endColumn: Math.max(lineText.length, indent + 1), flow });
    };
    for (const [position, { pack, rule }] of flowRules.entries()) {
        for (const flow of results[position] ?? [])
            place(pack.id, rule.id, flow);
    }
    // Access (BOLA) rules: every handler gets a status; only lookups without an ownership check are findings.
    const accessRules = flowRules.filter((item) => item.taint.kind === 'access');
    if (accessRules.length > 0) {
        let access = [];
        try {
            access = await engine.analyzeAccessRules(accessRules.map((item) => item.taint), language, filePath, text, index);
        }
        catch {
            // As above: no endpoints for a file the parser cannot read.
        }
        for (const [position, { pack, rule }] of accessRules.entries()) {
            const found = access[position];
            if (!found || found.length === 0)
                continue;
            endpoints?.set((0, exports.ruleKey)(pack.id, rule.id), found);
            for (const endpoint of found)
                for (const flow of endpoint.findings)
                    place(pack.id, rule.id, flow);
        }
    }
    return candidates;
}
module.exports = { SCAN_LIMITS: exports.SCAN_LIMITS, compileRules, flowRulesOf: exports.flowRulesOf, ruleKey: exports.ruleKey, languageForFile, SCAN_GLOB: exports.SCAN_GLOB, UNSUPPORTED_SOURCE_GLOB: exports.UNSUPPORTED_SOURCE_GLOB, SCAN_EXCLUDE_GLOB: exports.SCAN_EXCLUDE_GLOB, scanText, scanFile };
