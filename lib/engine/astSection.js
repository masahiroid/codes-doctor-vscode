"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const astRendering_1 = require("./astRendering");
const sourceReplacement_1 = require("./sourceReplacement");
/** Replace a whole top-level function of the compiled section, located by its signature. */
function replaceFunction(source, signature, replacement) {
    const start = source.indexOf(signature);
    const end = source.indexOf('\n}\n', start);
    if (start < 0 || end < 0)
        throw new Error(`AST section marker missing: ${signature}`);
    return source.slice(0, start) + replacement + source.slice(end + '\n}\n'.length);
}
module.exports = function patch(source) {
    // The review box only appears once an AST review exists; the dashboard fills the hidden one live.
    source = replaceFunction(source, 'function renderAstReviewBox(', `function renderAstReviewBox(savedAstResult) {
    if (!savedAstResult) return '<div id="astReview" hidden><h3>AST専用LLMレビュー</h3><div id="astResult" data-md=""></div></div>';
    const escaped = (0, html_1.escapeHtml)(savedAstResult);
    return \`<div class="box"><h3>AST専用LLMレビュー</h3><div id="astResult" class="llm-result" data-md="\${escaped}">\${escaped}</div></div>\`;
}
`);
    // Every analyzed file is listed, so the "first N files" note no longer applies.
    source = replaceFunction(source, 'function renderAstNotes(', "function renderAstNotes() {\n    return '';\n}\n");
    source = (0, sourceReplacement_1.replaceRequired)(source, "return blocks.join('');", 'return renderAstFileList(blocks);');
    source = (0, sourceReplacement_1.replaceRequired)(source, '  </section>`;', '  ' + '${' + JSON.stringify(astRendering_1.astPaginationScript) + '}' + '\n  </section>`;');
    source += '\n' + astRendering_1.renderAstFileList.toString() + '\n';
    return (0, astRendering_1.localizeAstLabels)(source);
};
