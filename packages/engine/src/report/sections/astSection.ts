import fs from 'node:fs';
import path from 'node:path';
import type { AnalysisResult, LanguageFileMap, ParsedFile } from '../../types';
import { escapeHtml } from '../../html';
import { panel } from '../ui';
import { LANGUAGES, LanguageId } from '../../analyzer/languages/catalog';
import { AST_FILES_PER_BATCH } from './ast/limits';
import { parsePhpAst, parseTypeScriptAst } from './ast/parsers';
import { buildTypeScriptStructure } from './ast/typescriptStructure';
import { buildPhpStructure } from './ast/phpStructure';
import { buildLightweightStructure } from './ast/lightweightStructure';

type AstLanguageId = Extract<(typeof LANGUAGES)[number], { parser: 'ast' }>['id'];

/** Readable structure of one parsed file, per language. */
const STRUCTURE_BUILDERS: { [K in LanguageId]: (file: LanguageFileMap[K][number]) => string } = {
  typescript: (file) => buildTypeScriptStructure(readSource(file.filePath)),
  php: (file) => buildPhpStructure(readSource(file.filePath), file.filePath),
  dart: (file) => buildLightweightStructure(file, 'クラス'),
  python: (file) => buildLightweightStructure(file, 'クラス'),
  go: (file) => buildLightweightStructure(file, '構造体'),
  swift: (file) => buildLightweightStructure(file, '型'),
  csharp: (file) => buildLightweightStructure(file, '型'),
  java: (file) => buildLightweightStructure(file, '型'),
  kotlin: (file) => buildLightweightStructure(file, '型'),
  rust: (file) => buildLightweightStructure(file, '構造体'),
  cpp: (file) => buildLightweightStructure(file, '型'),
};

/** Full-AST languages expose their real parse tree in the raw data view. */
const RAW_AST_PARSERS: Record<AstLanguageId, (content: string, filePath: string) => unknown> = {
  typescript: (content) => parseTypeScriptAst(content),
  php: parsePhpAst,
};

interface LanguageBlocks {
  label: string;
  lightweight: boolean;
  structure: string;
  raw: string;
}

const MAX_RAW_SOURCE_BYTES = 50 * 1024;
const MAX_RAW_OUTPUT_CHARS = 50 * 1024;

export function astSection(result: AnalysisResult, savedAstResult?: string): string {
  const languages = LANGUAGES.map((language): LanguageBlocks | null => {
    const files: readonly ParsedFile[] = result.files[language.id];
    if (files.length === 0) return null;
    const buildStructure = STRUCTURE_BUILDERS[language.id] as (file: ParsedFile) => string;
    return {
      label: language.label,
      lightweight: language.parser === 'lightweight',
      structure: joinAstBlocks(files.map((file) => renderStructureBlock(file, buildStructure))),
      raw: joinAstBlocks(files.map((file) => renderRawBlock(file.filePath, language.id, language.label))),
    };
  }).filter((blocks): blocks is LanguageBlocks => blocks !== null);

  if (languages.length === 0) return '';

  return `
  <section id="sec-ast">
    <h2>AST構造</h2>
    ${renderAstReviewBox(savedAstResult)}
    ${languages.map(renderStructureHeading).join('\n    ')}

  </section>
  <section>
    <h2>AST生データ</h2>
    ${languages.map((language) => panel(language.raw, { title: language.label })).join('\n    ')}
    ${AST_PAGINATION_SCRIPT}
  </section>`;
}

/**
 * A language's per-file blocks: the first batch is visible and the rest wait in a
 * `<template>` until "Show more" is clicked, so large repositories stay responsive.
 */
function joinAstBlocks(blocks: string[]): string {
  if (!blocks.length) return '';
  const visible = blocks.slice(0, AST_FILES_PER_BATCH).join('');
  const remaining = blocks.slice(AST_FILES_PER_BATCH).join('');
  const more = remaining
    ? `<template data-ast-pending>${remaining}</template><button type="button" class="btn" data-ast-more>さらに表示（残り${blocks.length - AST_FILES_PER_BATCH}ファイル）</button>`
    : '';
  return `<div data-ast-file-list><div data-ast-visible>${visible}</div>${more}</div>`;
}

const AST_PAGINATION_SCRIPT = `<script>
(function() {
  document.querySelectorAll('[data-ast-more]').forEach(function(button) {
    button.addEventListener('click', function() {
      const list = button.closest('[data-ast-file-list]');
      const pending = list.querySelector('[data-ast-pending]').content;
      const visible = list.querySelector('[data-ast-visible]');
      for (let count = 0; count < ${AST_FILES_PER_BATCH} && pending.firstElementChild; count++) {
        visible.appendChild(pending.firstElementChild);
      }
      if (!pending.childElementCount) button.remove();
      else button.textContent = 'さらに表示（残り' + pending.childElementCount + 'ファイル）';
    });
  });
})();
</script>`;

function renderStructureHeading(language: LanguageBlocks): string {
  const note = language.lightweight ? `<p class="muted gap-bottom">${language.label}の構造表示は簡易抽出です。完全なAST解析ではありません。</p>` : '';
  return panel(note + language.structure, { title: language.label });
}

/**
 * The AST-only LLM review. Until a review exists the box stays hidden; saving a
 * review into the report reveals it (see report/liveUpdate.ts).
 */
function renderAstReviewBox(savedAstResult?: string): string {
  if (!savedAstResult) {
    return '<div id="astReview" hidden><div class="panel glass"><h3>AST専用LLMレビュー</h3><div id="astResult" class="llm-result" data-md=""></div></div></div>';
  }
  const escaped = escapeHtml(savedAstResult);
  return `<div id="astReview"><div class="panel glass"><h3>AST専用LLMレビュー</h3><div id="astResult" class="llm-result" data-md="${escaped}">${escaped}</div></div></div>`;
}

function renderStructureBlock(file: ParsedFile, buildStructure: (file: ParsedFile) => string): string {
  let structure: string;
  try {
    structure = buildStructure(file);
  } catch (error) {
    structure = `- エラー: ${error instanceof Error ? error.message : '構造の抽出に失敗しました'}`;
  }
  return renderDetails(file.filePath, structure);
}

function renderRawBlock(filePath: string, language: LanguageId, label: string): string {
  let astOutput: string;
  try {
    const content = readSource(filePath);
    if (content.length > MAX_RAW_SOURCE_BYTES) {
      astOutput = JSON.stringify(
        {
          filePath,
          note: `${label}（省略）: ファイルサイズ超過`,
          size: content.length,
        },
        null,
        2
      );
      return renderDetails(filePath, astOutput);
    }
    const parseRaw = (RAW_AST_PARSERS as Partial<Record<LanguageId, (content: string, filePath: string) => unknown>>)[language];
    const raw = parseRaw
      ? parseRaw(content, filePath)
      : { note: `${label}の完全なAST解析は未対応です`, filePath, preview: content };
    astOutput = JSON.stringify(raw, null, 2);
    if (astOutput.length > MAX_RAW_OUTPUT_CHARS) {
      astOutput = `${astOutput.slice(0, MAX_RAW_OUTPUT_CHARS)}\n\n// （省略）`;
    }
  } catch (error) {
    astOutput = JSON.stringify({ filePath, error: error instanceof Error ? error.message : 'ASTの解析に失敗しました' }, null, 2);
  }

  return renderDetails(filePath, astOutput);
}

function renderDetails(filePath: string, body: string): string {
  return `
  <details class="file">
    <summary>${escapeHtml(path.basename(filePath))}</summary>
    <pre>${escapeHtml(body)}</pre>
  </details>`;
}

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}
