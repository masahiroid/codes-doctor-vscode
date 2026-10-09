"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.astLabels = exports.astPaginationScript = void 0;
exports.renderAstFileList = renderAstFileList;
const policy = require('./policy');
function renderAstFileList(entries) {
    if (!entries.length)
        return '';
    const batch = CODE_DOCTOR_ENGINE_POLICY.astDisplay.filesPerBatch;
    const visible = entries.slice(0, batch).join('');
    const remaining = entries.slice(batch).join('');
    return `<div data-ast-file-list><div data-ast-visible>${visible}</div>${remaining ? `<template data-ast-pending>${remaining}</template><button type="button" data-ast-more>さらに表示（残り${entries.length - batch}ファイル）</button>` : ''}</div>`;
}
exports.astPaginationScript = `<script>
(function() {
  document.querySelectorAll('[data-ast-more]').forEach(function(button) {
    button.addEventListener('click', function() {
      const list = button.closest('[data-ast-file-list]');
      const pending = list.querySelector('[data-ast-pending]').content;
      const visible = list.querySelector('[data-ast-visible]');
      for (let count = 0; count < ${policy.astDisplay.filesPerBatch} && pending.firstElementChild; count++) {
        visible.appendChild(pending.firstElementChild);
      }
      if (!pending.childElementCount) button.remove();
      else button.textContent = 'さらに表示（残り' + pending.childElementCount + 'ファイル）';
    });
  });
})();
</script>`;
exports.astLabels = {
    'AST Structure (Readable)': 'AST構造',
    'AST Raw Data (Sampled)': 'AST生データ',
    '>Notes<': '>補足<',
    'To keep the report readable, only the first ${maxFilesPerLang} files per language are shown.': '表示は各言語の先頭${maxFilesPerLang}ファイルに限定しています。',
    'Dart uses a lightweight parser, so the structure is best-effort.': 'DartとPythonの構造表示は簡易抽出です。完全なAST解析ではありません。',
    "lines.push('File')": "lines.push('ファイル')",
    '  Imports (': '  インポート (',
    '  Classes (': '  クラス (',
    '  Functions (': '  関数 (',
    '  Namespaces (': '  名前空間 (',
    '  Uses (': '  使用宣言 (',
    '- fields: ': '- フィールド: ',
    '- properties: ': '- プロパティ: ',
    '- method: ': '- メソッド: ',
    ' more)': ' 件省略)',
    'Failed to parse AST': 'ASTの解析に失敗しました',
    'Failed to build structure': '構造の抽出に失敗しました',
    '- error: ': '- エラー: ',
    ' AST full parsing not enabled': 'の完全なAST解析は未対応です',
    '... (truncated)': '...（省略）',
};
module.exports = { renderAstFileList, astPaginationScript: exports.astPaginationScript, astLabels: exports.astLabels };
