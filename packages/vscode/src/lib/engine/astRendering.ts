declare const CODE_DOCTOR_ENGINE_POLICY: typeof import('./policy');
const policy = require('./policy');

export function renderAstFileList(entries: string[]) {
  if (!entries.length) return '';
  const batch = CODE_DOCTOR_ENGINE_POLICY.astDisplay.filesPerBatch;
  const visible = entries.slice(0, batch).join('');
  const remaining = entries.slice(batch).join('');
  return `<div data-ast-file-list><div data-ast-visible>${visible}</div>${remaining ? `<template data-ast-pending>${remaining}</template><button type="button" data-ast-more>さらに表示（残り${entries.length - batch}ファイル）</button>` : ''}</div>`;
}

export const astPaginationScript = `<script>
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

/** Japanese labels for the engine's English AST section and structure outlines. */
export const astLabels = {
  'AST Structure (Readable)': 'AST構造',
  'AST Raw Data (Sampled)': 'AST生データ',
  "['File']": "['ファイル']",
  "heading: 'Imports'": "heading: 'インポート'",
  "heading: 'Namespaces'": "heading: '名前空間'",
  "heading: 'Uses'": "heading: '使用宣言'",
  "heading: 'Functions'": "heading: '関数'",
  "heading: 'Classes'": "heading: 'クラス'",
  "'Classes')": "'クラス')",
  "'Structs')": "'構造体')",
  "'Types')": "'型')",
  "label: 'fields'": "label: 'フィールド'",
  "label: 'properties'": "label: 'プロパティ'",
  '- method: ': '- メソッド: ',
  ' more)': ' 件省略)',
  'Failed to parse AST': 'ASTの解析に失敗しました',
  'Failed to build structure': '構造の抽出に失敗しました',
  '- error: ': '- エラー: ',
  ' AST full parsing not enabled': 'の完全なAST解析は未対応です',
  '... (truncated)': '...（省略）',
};

/** Apply `astLabels` to any compiled AST-section module. */
export function localizeAstLabels(source: string): string {
  for (const [from, to] of Object.entries(astLabels)) source = source.split(from).join(to);
  return source;
}

module.exports = { renderAstFileList, astPaginationScript, astLabels, localizeAstLabels };
