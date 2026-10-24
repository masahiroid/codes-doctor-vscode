"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAuditReport = buildAuditReport;
exports.auditReportToCsv = auditReportToCsv;
const scan_1 = require("./scan");
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
            ...(c.flow ? {
                sourceLine: c.flow.source.line,
                source: c.flow.source.code,
                sink: c.flow.sink.code,
                // A sink in another file: where the dangerous operation itself is.
                ...(c.flow.sink.file ? { sinkFile: c.flow.sink.file, sinkLine: c.flow.sink.line } : {}),
            } : {}),
        })));
        const kind = compiled.find((item) => item.pack.id === pack.id && item.rule.id === rule.id)?.taint?.kind;
        const method = rule.detect !== undefined
            ? (kind === 'access' || rule.detect?.type === 'object_access' ? 'access' : 'dataflow')
            : rule.pattern !== undefined ? 'pattern' : 'manual';
        const failed = invalid.some((item) => item.packId === pack.id && item.ruleId === rule.id);
        const analyzedFiles = method === 'dataflow' || method === 'access' ? coveredFiles(pack.id, rule.id) : undefined;
        // Every handler the access analysis classified, with where the ownership check (if any) is.
        const endpoints = method === 'access'
            ? results.flatMap(({ file, endpoints: byRule }) => (byRule?.[(0, scan_1.ruleKey)(pack.id, rule.id)] ?? [])
                .filter((endpoint) => endpoint.status !== 'no_object_access')
                .map((endpoint) => ({
                file,
                line: endpoint.line,
                ...(endpoint.function ? { function: endpoint.function } : {}),
                ...(endpoint.route ? { route: endpoint.route } : {}),
                status: endpoint.status,
                ...(endpoint.evidence ? { evidenceLine: endpoint.evidence.line, evidence: endpoint.evidence.code, ...(endpoint.evidence.file ? { evidenceFile: endpoint.evidence.file } : {}) } : {}),
            })))
            : undefined;
        const count = (status) => endpoints?.filter((endpoint) => endpoint.status === status).length ?? 0;
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
                : method === 'access'
                    ? (locations.length > 0 ? 'owner_check_missing' : analyzedFiles === 0 ? 'no_target_files' : 'no_owner_check_missing')
                    : method === 'dataflow'
                        ? (locations.length > 0 ? 'flow_detected' : analyzedFiles === 0 ? 'no_target_files' : 'no_flow_detected')
                        : locations.length > 0 ? 'review_required' : 'manual_check_required',
            candidateCount: locations.length,
            ...(analyzedFiles === undefined ? {} : { analyzedFiles }),
            locations,
            ...(endpoints ? {
                endpoints,
                endpointSummary: { missing: count('owner_check_missing'), unverified: count('owner_field_unverified'), checked: count('owner_checked') },
            } : {}),
            sourceUrls: rule.sourceUrls,
            checkSteps: rule.checkSteps,
        };
    }));
    return {
        ...context,
        compliance: 'unverified',
        note: 'Data flows show untrusted input reaching a dangerous operation, followed through calls between workspace files. Access (BOLA) results show request IDs reaching object lookups with no ownership check found; whether an object may be public cannot be judged from code. Pattern matches are review candidates only. No empty result establishes compliance; every item still needs a manual check and evidence.',
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
    const header = ['pack_id', 'pack_version', 'channel', 'rule_id', 'title', 'severity', 'owasp_category', 'excel_column', 'action_required', 'method', 'status', 'candidate_count', 'locations', 'source_urls', 'endpoints_missing', 'endpoints_unverified', 'endpoints_checked'];
    const lines = report.rules.map((rule) => [
        rule.packId, rule.packVersion, rule.channel, rule.ruleId, rule.title, rule.severity, rule.owaspCategory, rule.excelColumn, rule.actionRequired,
        rule.method, rule.status, rule.candidateCount, rule.locations.map((l) => `${l.file}:${l.line}`).join('; '), rule.sourceUrls.join(' '),
        // Access (BOLA) rules only; empty for other methods.
        ...(rule.endpointSummary ? [rule.endpointSummary.missing, rule.endpointSummary.unverified, rule.endpointSummary.checked] : ['', '', '']),
    ].map(csvCell).join(','));
    // The BOM lets Excel open the Japanese text as UTF-8.
    return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`;
}
module.exports = { buildAuditReport, auditReportToCsv };
