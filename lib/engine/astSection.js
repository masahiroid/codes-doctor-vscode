"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const astRendering_1 = require("./astRendering");
const sourceReplacement_1 = require("./sourceReplacement");
module.exports = function patch(source) {
    const boxStart = source.indexOf('    <div class="box" style="margin-bottom: 16px;');
    const boxEnd = source.indexOf('    <div class="box" style="border-left-color: var(--warning)">', boxStart);
    if (boxStart < 0 || boxEnd < 0)
        throw new Error('AST overview markers missing');
    source = source.slice(0, boxStart) + `    \${savedAstResult ? \`<div class="box"><h3>AST専用LLMレビュー</h3><div id="astResult" class="llm-result" data-md="\${initialAstDataMd}">\${initialAstContent}</div></div>\` : '<div id="astReview" hidden><h3>AST専用LLMレビュー</h3><div id="astResult" data-md=""></div></div>'}
` + source.slice(boxEnd);
    source = (0, sourceReplacement_1.replaceRequired)(source, "'未実行。VS Code拡張のダッシュボードパネルから「Run LLM Review」を実行してください。'", "''");
    source = source.replace("    const initialAstStatus = savedAstResult ? 'レポート生成時の保存済み結果' : '';\n", '');
    // Include every analyzed file and every structure item. Only DOM display is batched.
    source = source.replace('    const maxFilesPerLang = 5;\n', '');
    source = source.replace('const maxChars = 40000;', 'const maxChars = Infinity;');
    source = source.replace(/\.slice\(0, maxFilesPerLang\)/g, '');
    source = source.replace(/(const AST_\w+_LIMIT = )\d+;/g, '$1Infinity;');
    const notesStart = source.indexOf('    <div class="box" style="border-left-color: var(--warning)">');
    const notesEnd = source.indexOf('    ${tsStructure', notesStart);
    if (notesStart < 0 || notesEnd < 0)
        throw new Error('AST notes markers missing');
    source = source.slice(0, notesStart) + source.slice(notesEnd);
    source = source.replace(/(const (?:tsAstBlocks|phpAstBlocks|dartBlocks|pythonBlocks|tsStructure|phpStructure|dartStructure|pythonStructure) = )(.*)\.join\(''\);/g, (_, prefix, entries) => prefix + 'renderAstFileList(' + entries + ');');
    source = (0, sourceReplacement_1.replaceRequired)(source, '  </section>`;', '  ' + '${' + JSON.stringify(astRendering_1.astPaginationScript) + '}' + '\n  </section>`;');
    for (const language of ['Dart', 'Python']) {
        source = (0, sourceReplacement_1.replaceRequired)(source, '<h3>' + language + '</h3>${' + language.toLowerCase() + 'Structure}', '<h3>' + language + '</h3><p>' + language + 'の構造表示は簡易抽出です。完全なAST解析ではありません。</p>${' + language.toLowerCase() + 'Structure}');
    }
    source += '\n' + astRendering_1.renderAstFileList.toString() + '\n';
    for (const [from, to] of Object.entries(astRendering_1.astLabels))
        source = source.split(from).join(to);
    return source;
};
