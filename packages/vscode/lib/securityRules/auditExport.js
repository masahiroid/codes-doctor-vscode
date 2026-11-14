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
const engine_1 = require("../engine");
const rules_1 = require("./rules");
/** Where audit reports are written, relative to the workspace folder. */
exports.REPORT_DIRECTORY = node_path_1.default.join('.codes-doctor', 'security-audit');
/**
 * The audit report of a workspace scan: the enabled packs' results with the tool, ruleset and
 * coverage details an audit needs to tell which rules decided it and what was analyzed.
 */
function buildWorkspaceAuditReport(input) {
    const { root, ruleset, outcome } = input;
    return (0, rules_1.rulesModule)().buildAuditReport((ruleset?.packs ?? []).filter((pack) => !input.disabledPacks.has(pack.id)), outcome.results, input.invalid, {
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
 * Write the report as JSON and CSV, and the management sheet as CSV and Excel, under the workspace's
 * report directory, all named after the report's time. The sheet's labels follow `language`.
 * Returns the CSV and Excel paths; the user is offered to open the CSV.
 */
async function writeAuditReportFiles(root, report, language = 'ja') {
    const directory = node_path_1.default.join(root, exports.REPORT_DIRECTORY);
    const stamp = report.generatedAt.replace(/[:.]/g, '-');
    const csvPath = node_path_1.default.join(directory, `security-audit-${stamp}.csv`);
    await promises_1.default.mkdir(directory, { recursive: true });
    await promises_1.default.writeFile(node_path_1.default.join(directory, `security-audit-${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await promises_1.default.writeFile(csvPath, (0, rules_1.rulesModule)().auditReportToCsv(report), 'utf8');
    // Each engine build carries the sheet labels in its own language.
    const sheets = (0, engine_1.loadEngine)(language).securityRules;
    const xlsxPath = node_path_1.default.join(directory, `security-audit-${stamp}.xlsx`);
    await promises_1.default.writeFile(node_path_1.default.join(directory, `security-audit-${stamp}-sheet.csv`), sheets.submissionCsv(report), 'utf8');
    await promises_1.default.writeFile(xlsxPath, sheets.submissionXlsx(report));
    return { csvPath, xlsxPath };
}
module.exports = { REPORT_DIRECTORY: exports.REPORT_DIRECTORY, buildWorkspaceAuditReport, writeAuditReportFiles };
