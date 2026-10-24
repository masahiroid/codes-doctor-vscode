"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPORT_DIRECTORY = void 0;
exports.buildWorkspaceAuditReport = buildWorkspaceAuditReport;
exports.writeAuditReportFiles = writeAuditReportFiles;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const settingsSchema_1 = require("../settingsSchema");
const audit_1 = require("./audit");
/** Where audit reports are written, relative to the workspace folder. */
exports.REPORT_DIRECTORY = node_path_1.default.join('.codes-doctor', 'security-audit');
/**
 * The audit report of a workspace scan: the enabled packs' results with the tool, ruleset and
 * coverage details an audit needs to tell which rules decided it and what was analyzed.
 */
function buildWorkspaceAuditReport(input) {
    const { root, ruleset, outcome } = input;
    return (0, audit_1.buildAuditReport)((ruleset?.packs ?? []).filter((pack) => !input.disabledPacks.has(pack.id)), outcome.results, input.invalid, {
        generatedAt: new Date().toISOString(),
        toolName: settingsSchema_1.PRODUCT_NAME,
        toolVersion: settingsSchema_1.EXTENSION_VERSION,
        workspace: node_path_1.default.basename(root),
        rulesetVersion: ruleset?.manifest.version ?? '',
        rulesSource: input.rulesSource,
        source: ruleset?.source ?? 'cache',
        scannedFiles: outcome.scanned,
        skippedFiles: outcome.skipped,
        testFilesExcluded: outcome.tests,
        filesByLanguage: outcome.filesByLanguage,
        unsupportedFiles: outcome.unsupported,
    }, input.compiled, input.engine);
}
/**
 * Write the report as JSON and CSV under the workspace's report directory, both named after the
 * report's time. Returns the CSV path, which the user is offered to open.
 */
async function writeAuditReportFiles(root, report) {
    const directory = node_path_1.default.join(root, exports.REPORT_DIRECTORY);
    const stamp = report.generatedAt.replace(/[:.]/g, '-');
    const csvPath = node_path_1.default.join(directory, `security-audit-${stamp}.csv`);
    await promises_1.default.mkdir(directory, { recursive: true });
    await promises_1.default.writeFile(node_path_1.default.join(directory, `security-audit-${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await promises_1.default.writeFile(csvPath, (0, audit_1.auditReportToCsv)(report), 'utf8');
    return { csvPath };
}
module.exports = { REPORT_DIRECTORY: exports.REPORT_DIRECTORY, buildWorkspaceAuditReport, writeAuditReportFiles };
