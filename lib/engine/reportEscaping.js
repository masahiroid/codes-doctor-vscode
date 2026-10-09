"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeReportSource = escapeReportSource;
/** JSON embedded in script elements must not contain a literal HTML closing tag. */
function safeReportJson(value) {
    return JSON.stringify(value)?.replace(/</g, '\\u003c');
}
function escapeReportSource(source, relativePath) {
    if (!relativePath.startsWith('report/sections/'))
        return source;
    const expressions = [
        'node_path_1.default.basename(godClass.filePath)',
        'node_path_1.default.basename(issue.filePath)',
        'node_path_1.default.basename(filePath)',
        'displayPath', 'fileInfo.name', 'component.name', 'component.version',
    ];
    for (const expression of expressions) {
        source = source.replaceAll('${' + expression + '}', "${require('../../html').escapeHtml(String(" + expression + '))}');
    }
    source = source.replaceAll('<strong>${metric.moduleName}</strong>', "<strong>${require('../../html').escapeHtml(metric.moduleName)}</strong>");
    source = source.replaceAll('<td>${layer.name}</td>', "<td>${require('../../html').escapeHtml(layer.name)}</td>");
    source = source.replaceAll("${layer.dependencies.join(', ') || 'なし'}", "${require('../../html').escapeHtml(layer.dependencies.join(', ') || 'なし')}");
    // Heatmap labels are later inserted into HTML in the browser.
    source = source.replace('layerHeatmap.layers.map((layer) => layer.name)', "layerHeatmap.layers.map((layer) => require('../../html').escapeHtml(layer.name))");
    if (source.includes('JSON.stringify(')) {
        source = source.replaceAll('JSON.stringify(', 'safeReportJson(');
        source += '\n' + safeReportJson.toString();
    }
    return source;
}
