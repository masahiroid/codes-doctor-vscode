"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCAN_EXCLUDE_GLOB = exports.UNSUPPORTED_SOURCE_GLOB = exports.SCAN_GLOB = exports.SCAN_LIMITS = exports.MANIFEST_FILE = exports.DEFAULT_MANIFEST_URL = void 0;
exports.sha256Hex = sha256Hex;
exports.parseManifest = parseManifest;
exports.parsePack = parsePack;
exports.fetchBytes = fetchBytes;
exports.downloadRuleset = downloadRuleset;
exports.writeRulesetCache = writeRulesetCache;
exports.readRulesetCache = readRulesetCache;
exports.compileRules = compileRules;
exports.languageForFile = languageForFile;
exports.scanText = scanText;
exports.scanFile = scanFile;
exports.buildAuditReport = buildAuditReport;
exports.auditReportToCsv = auditReportToCsv;
exports.escapeMarkdown = escapeMarkdown;
const node_crypto_1 = require("node:crypto");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_url_1 = require("node:url");
exports.DEFAULT_MANIFEST_URL = 'https://raw.githubusercontent.com/masahiroid/security-rules/main/dist/manifest.json';
exports.MANIFEST_FILE = 'manifest.json';
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const MAX_PATTERN_LENGTH = 500;
exports.SCAN_LIMITS = Object.freeze({ maxFileBytes: 1024 * 1024, maxPerRulePerFile: 200, maxTotalCandidates: 5000 });
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;
// A quantified group that itself contains a quantifier, e.g. (a+)+. Rules arrive over the network
// and run on the extension host thread, so patterns that can backtrack catastrophically are refused.
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,\d*\})/;
function fail(message) {
    throw new Error(message);
}
function str(value, field) {
    return typeof value === 'string' && value.length > 0 ? value : fail(`Invalid ruleset: "${field}" must be a non-empty string`);
}
function strings(value, field) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
        fail(`Invalid ruleset: "${field}" must be an array of non-empty strings`);
    }
    return value;
}
function record(value, field) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : fail(`Invalid ruleset: "${field}" must be an object`);
}
function channel(value, field) {
    return value === 'baseline' || value === 'emergency' || value === 'regulatory' ? value : fail(`Invalid ruleset: "${field}" has an unknown channel`);
}
function sha256Hex(data) {
    return (0, node_crypto_1.createHash)('sha256').update(data).digest('hex');
}
function parseManifest(text) {
    const data = record(JSON.parse(text), 'manifest');
    if (!Array.isArray(data.packs) || data.packs.length === 0)
        fail('Invalid ruleset: manifest has no packs');
    const packs = data.packs.map((raw, index) => {
        const entry = record(raw, `packs[${index}]`);
        const file = str(entry.file, `packs[${index}].file`);
        const sha256 = str(entry.sha256, `packs[${index}].sha256`);
        // The file name is joined onto the manifest URL and the cache directory; it must stay a plain name.
        if (!SAFE_FILE_NAME.test(file) || file === exports.MANIFEST_FILE)
            fail(`Invalid ruleset: unsafe pack file name "${file}"`);
        if (!/^[0-9a-f]{64}$/.test(sha256))
            fail(`Invalid ruleset: malformed sha256 for "${file}"`);
        return {
            id: str(entry.id, `packs[${index}].id`),
            version: str(entry.version, `packs[${index}].version`),
            channel: channel(entry.channel, `packs[${index}].channel`),
            mandatory: entry.mandatory === true,
            file,
            sha256,
        };
    });
    return { version: str(data.version, 'version'), description: typeof data.description === 'string' ? data.description : '', packs };
}
function parseRule(raw, index) {
    const rule = record(raw, `rules[${index}]`);
    const id = str(rule.id, `rules[${index}].id`);
    const severity = rule.severity === 'error' || rule.severity === 'warning' ? rule.severity : fail(`Invalid ruleset: rule "${id}" has an unknown severity`);
    const excel = record(rule.excel_mapping, `${id}.excel_mapping`);
    return {
        id,
        title: str(rule.title, `${id}.title`),
        category: str(rule.category, `${id}.category`),
        message: str(rule.message, `${id}.message`),
        severity,
        targetLanguages: strings(rule.target_languages, `${id}.target_languages`),
        pattern: rule.pattern === undefined ? undefined : str(rule.pattern, `${id}.pattern`),
        detect: rule.detect,
        owaspCategory: typeof rule.owasp_category === 'string' ? rule.owasp_category : undefined,
        sourceUrls: strings(rule.source_urls, `${id}.source_urls`).filter((url) => url.startsWith('https://')),
        checkSteps: strings(rule.check_steps, `${id}.check_steps`),
        excelColumn: str(excel.column, `${id}.excel_mapping.column`),
        actionRequired: str(excel.action_required, `${id}.excel_mapping.action_required`),
    };
}
// The hash is checked against the downloaded bytes before anything is parsed.
function parsePack(bytes, entry) {
    if (sha256Hex(bytes) !== entry.sha256)
        fail(`Checksum mismatch for ${entry.file}: the file does not match the manifest`);
    const data = record(JSON.parse(Buffer.from(bytes).toString('utf8')), entry.file);
    if (data.id !== entry.id || data.version !== entry.version)
        fail(`Pack ${entry.file} does not match its manifest entry`);
    if (!Array.isArray(data.rules) || data.rules.length === 0)
        fail(`Pack ${entry.file} has no rules`);
    return {
        id: entry.id,
        version: entry.version,
        description: typeof data.description === 'string' ? data.description : '',
        channel: entry.channel,
        mandatory: entry.mandatory,
        publishedAt: typeof data.published_at === 'string' ? data.published_at : undefined,
        advisoryPublishedAt: typeof data.advisory_published_at === 'string' ? data.advisory_published_at : undefined,
        sha256: entry.sha256,
        rules: data.rules.map(parseRule),
    };
}
async function fetchBytes(url, fetchImpl = fetch, timeoutMs = 15000) {
    // A file: URL reads a local or shared-drive copy (closed networks, testing rules before publishing).
    if (new URL(url).protocol === 'file:') {
        const bytes = await promises_1.default.readFile((0, node_url_1.fileURLToPath)(url));
        if (bytes.length > MAX_DOWNLOAD_BYTES)
            fail(`File is too large: ${url}`);
        return new Uint8Array(bytes);
    }
    if (new URL(url).protocol !== 'https:')
        fail(`Refusing to download rules over a URL that is neither HTTPS nor file:: ${url}`);
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok)
        fail(`Download failed (${response.status}): ${url}`);
    if (response.url && new URL(response.url).protocol !== 'https:')
        fail(`Download was redirected to a non-HTTPS URL: ${url}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_BYTES)
        fail(`Download is too large: ${url}`);
    return bytes;
}
async function downloadRuleset(manifestUrl, fetchImpl) {
    const manifestBytes = await fetchBytes(manifestUrl, fetchImpl);
    const manifestText = Buffer.from(manifestBytes).toString('utf8');
    const manifest = parseManifest(manifestText);
    const files = { [exports.MANIFEST_FILE]: manifestText };
    const packs = [];
    for (const entry of manifest.packs) {
        const bytes = await fetchBytes(new URL(entry.file, manifestUrl).toString(), fetchImpl);
        packs.push(parsePack(bytes, entry));
        files[entry.file] = Buffer.from(bytes).toString('utf8');
    }
    return { manifest, packs, source: 'network', files };
}
async function writeRulesetCache(cacheDir, ruleset) {
    await promises_1.default.mkdir(cacheDir, { recursive: true });
    // The manifest goes last, so an interrupted write never leaves a manifest pointing at missing packs.
    const names = Object.keys(ruleset.files).sort((a, b) => Number(a === exports.MANIFEST_FILE) - Number(b === exports.MANIFEST_FILE));
    for (const name of names) {
        const target = node_path_1.default.join(cacheDir, name);
        const temp = `${target}.${process.pid}.tmp`;
        await promises_1.default.writeFile(temp, ruleset.files[name], 'utf8');
        await promises_1.default.rename(temp, target);
    }
}
// The cache is re-verified against its manifest, so a hand-edited file is rejected rather than trusted.
async function readRulesetCache(cacheDir) {
    const manifestText = await promises_1.default.readFile(node_path_1.default.join(cacheDir, exports.MANIFEST_FILE), 'utf8');
    const manifest = parseManifest(manifestText);
    const files = { [exports.MANIFEST_FILE]: manifestText };
    const packs = [];
    for (const entry of manifest.packs) {
        const bytes = await promises_1.default.readFile(node_path_1.default.join(cacheDir, entry.file));
        packs.push(parsePack(bytes, entry));
        files[entry.file] = bytes.toString('utf8');
    }
    return { manifest, packs, source: 'cache', files };
}
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
async function scanFile(text, language, filePath, rules, engine) {
    const candidates = scanText(text, language, rules);
    if (!engine)
        return candidates;
    const flowRules = rules.filter((item) => item.taint !== undefined);
    if (flowRules.length === 0)
        return candidates;
    let results = [];
    try {
        // One parse of the file serves every rule.
        results = await engine.analyzeTaintRules(flowRules.map((item) => item.taint), language, filePath, text);
    }
    catch {
        // A file the parser cannot read yields no flows; the pattern pass above still ran.
    }
    for (const [index, { pack, rule }] of flowRules.entries()) {
        for (const flow of results[index] ?? []) {
            const line = Math.max(flow.sink.line - 1, 0);
            const lineText = text.split('\n', line + 1)[line] ?? '';
            const indent = lineText.length - lineText.trimStart().length;
            candidates.push({ packId: pack.id, ruleId: rule.id, startLine: line, startColumn: indent, endLine: line, endColumn: Math.max(lineText.length, indent + 1), flow });
        }
    }
    return candidates;
}
function buildAuditReport(packs, results, invalid, context, compiled = [], engine) {
    const coveredFiles = (packId, ruleId) => {
        const taint = compiled.find((item) => item.pack.id === packId && item.rule.id === ruleId)?.taint;
        if (!taint || !engine)
            return 0;
        return Object.entries(context.filesByLanguage).reduce((sum, [language, count]) => sum + (engine.taintRuleCovers(taint, language) ? count : 0), 0);
    };
    const rules = packs.flatMap((pack) => pack.rules.map((rule) => {
        const locations = results.flatMap(({ file, candidates }) => candidates.filter((c) => c.packId === pack.id && c.ruleId === rule.id).map((c) => ({
            file,
            line: c.startLine + 1,
            ...(c.flow ? { sourceLine: c.flow.source.line, source: c.flow.source.code, sink: c.flow.sink.code } : {}),
        })));
        const method = rule.detect !== undefined ? 'dataflow' : rule.pattern !== undefined ? 'pattern' : 'manual';
        const failed = invalid.some((item) => item.packId === pack.id && item.ruleId === rule.id);
        const analyzedFiles = method === 'dataflow' ? coveredFiles(pack.id, rule.id) : undefined;
        return {
            packId: pack.id,
            packVersion: pack.version,
            channel: pack.channel,
            ruleId: rule.id,
            title: rule.title,
            severity: rule.severity,
            owaspCategory: rule.owaspCategory ?? '',
            excelColumn: rule.excelColumn,
            actionRequired: rule.actionRequired,
            verification: 'manual',
            method,
            // A data flow is input reaching the operation; a regex hit only marks code to look at.
            // Neither "no flow" nor "no hit" proves the item safe: the analysis stays within one file.
            status: failed
                ? 'not_evaluated'
                : method === 'dataflow'
                    ? (locations.length > 0 ? 'flow_detected' : analyzedFiles === 0 ? 'no_target_files' : 'no_flow_detected')
                    : locations.length > 0 ? 'review_required' : 'manual_check_required',
            candidateCount: locations.length,
            ...(analyzedFiles === undefined ? {} : { analyzedFiles }),
            locations,
            sourceUrls: rule.sourceUrls,
            checkSteps: rule.checkSteps,
        };
    }));
    return {
        ...context,
        compliance: 'unverified',
        note: 'Data flows show untrusted input reaching a dangerous operation within one file. Pattern matches are review candidates only. Neither an empty data-flow result nor no match establishes compliance; every item still needs a manual check and evidence.',
        packs: packs.map(({ id, version, channel, mandatory, sha256, publishedAt, advisoryPublishedAt }) => ({ id, version, channel, mandatory, sha256, publishedAt, advisoryPublishedAt })),
        invalidRules: invalid,
        rules,
    };
}
// Spreadsheet applications run cells that start with these characters as formulas.
function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text))
        text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function auditReportToCsv(report) {
    const header = ['pack_id', 'pack_version', 'channel', 'rule_id', 'title', 'severity', 'owasp_category', 'excel_column', 'action_required', 'method', 'status', 'candidate_count', 'locations', 'source_urls'];
    const lines = report.rules.map((rule) => [
        rule.packId, rule.packVersion, rule.channel, rule.ruleId, rule.title, rule.severity, rule.owaspCategory, rule.excelColumn, rule.actionRequired,
        rule.method, rule.status, rule.candidateCount, rule.locations.map((l) => `${l.file}:${l.line}`).join('; '), rule.sourceUrls.join(' '),
    ].map(csvCell).join(','));
    // The BOM lets Excel open the Japanese text as UTF-8.
    return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`;
}
function escapeMarkdown(text) {
    return text.replace(/[\\`*_{}[\]()<>#+!|~&-]/g, '\\$&');
}
module.exports = {
    DEFAULT_MANIFEST_URL: exports.DEFAULT_MANIFEST_URL,
    MANIFEST_FILE: exports.MANIFEST_FILE,
    SCAN_LIMITS: exports.SCAN_LIMITS,
    SCAN_GLOB: exports.SCAN_GLOB,
    SCAN_EXCLUDE_GLOB: exports.SCAN_EXCLUDE_GLOB,
    UNSUPPORTED_SOURCE_GLOB: exports.UNSUPPORTED_SOURCE_GLOB,
    sha256Hex, parseManifest, parsePack, fetchBytes, downloadRuleset, writeRulesetCache, readRulesetCache,
    compileRules, languageForFile, scanText, scanFile, buildAuditReport, auditReportToCsv, escapeMarkdown,
};
