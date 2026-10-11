import fs from 'node:fs';
import path from 'node:path';
import type { AnalysisResult, LanguageFileMap, ParsedFile } from '../../types';
import { escapeHtml } from '../../html';
import { LANGUAGES, LanguageId } from '../../analyzer/languages/catalog';
import { AST_SECTION_LIMITS } from './ast/limits';
import { parsePhpAst, parseTypeScriptAst } from './ast/parsers';
import { buildTypeScriptStructure } from './ast/typescriptStructure';
import { buildPhpStructure } from './ast/phpStructure';
import { buildLightweightStructure } from './ast/lightweightStructure';

export { AST_SECTION_LIMITS } from './ast/limits';

type AstLanguageId = Extract<(typeof LANGUAGES)[number], { parser: 'ast' }>['id'];

/** Readable structure of one parsed file, per language. */
const STRUCTURE_BUILDERS: { [K in LanguageId]: (file: LanguageFileMap[K][number]) => string } = {
  typescript: (file) => buildTypeScriptStructure(readSource(file.filePath)),
  php: (file) => buildPhpStructure(readSource(file.filePath), file.filePath),
  dart: (file) => buildLightweightStructure(file, 'Classes'),
  python: (file) => buildLightweightStructure(file, 'Classes'),
  go: (file) => buildLightweightStructure(file, 'Structs'),
  swift: (file) => buildLightweightStructure(file, 'Types'),
  csharp: (file) => buildLightweightStructure(file, 'Types'),
  java: (file) => buildLightweightStructure(file, 'Types'),
  kotlin: (file) => buildLightweightStructure(file, 'Types'),
  rust: (file) => buildLightweightStructure(file, 'Structs'),
  cpp: (file) => buildLightweightStructure(file, 'Types'),
};

/** Full-AST languages expose their real parse tree in the raw data view. */
const RAW_AST_PARSERS: Record<AstLanguageId, (content: string, filePath: string) => unknown> = {
  typescript: (content) => parseTypeScriptAst(content),
  php: parsePhpAst,
};

const DETAILS_PRE_STYLE =
  'white-space: pre-wrap; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-top: 8px; overflow-x: auto; font-size: 0.95em;';

interface LanguageBlocks {
  label: string;
  lightweight: boolean;
  structure: string;
  raw: string;
}

export function astSection(result: AnalysisResult, savedAstResult?: string): string {
  const languages = LANGUAGES.map((language): LanguageBlocks | null => {
    const files: readonly ParsedFile[] = result.files[language.id].slice(0, AST_SECTION_LIMITS.filesPerLanguage);
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
    <h2>AST Structure (Readable)</h2>
${renderAstReviewBox(savedAstResult)}
${renderAstNotes()}
    ${languages.map(renderStructureHeading).join('\n    ')}

    <h2 style="margin-top: 28px;">AST Raw Data (Sampled)</h2>
    ${languages.map((language) => `<h3>${language.label}</h3>${language.raw}`).join('\n    ')}
  </section>`;
}

/** Combine a language's per-file blocks; hosts that show every file may paginate here. */
function joinAstBlocks(blocks: string[]): string {
  return blocks.join('');
}

function renderStructureHeading(language: LanguageBlocks): string {
  const note = language.lightweight ? `<p>${language.label}の構造表示は簡易抽出です。完全なAST解析ではありません。</p>` : '';
  return `<h3>${language.label}</h3>${note}${language.structure}`;
}

function renderAstReviewBox(savedAstResult?: string): string {
  const content = savedAstResult
    ? escapeHtml(savedAstResult)
    : '未実行。VS Code拡張のダッシュボードパネルから「Run LLM Review」を実行してください。';
  const dataMd = savedAstResult ? escapeHtml(savedAstResult) : '';
  const status = savedAstResult ? 'レポート生成時の保存済み結果' : '';
  return `    <div class="box" style="margin-bottom: 16px; border-left-color: #8b5cf6;">
      <div style="margin: 0 0 10px 0; color:#6b7280; font-size:0.88em;">
        AST解析は、このASTセクションに表示されている構造サンプルをもとに、責務分割や複雑度の偏りをコードレベルで評価します。設定と再実行は VS Code拡張のダッシュボードパネルから行います。
      </div>
      ${status ? `<div style="color:#6b7280; font-size:0.9em; margin-bottom:8px;">${status}</div>` : ''}
      <div id="astResult" class="llm-result" data-md="${dataMd}">${content}</div>
    </div>`;
}

function renderAstNotes(): string {
  return `    <div class="box" style="border-left-color: var(--warning)">
      <div style="font-weight: 600; margin-bottom: 6px;">Notes</div>
      <ul style="padding-left:18px; margin: 0;">
        <li>To keep the report readable, only the first ${AST_SECTION_LIMITS.filesPerLanguage} files per language are shown.</li>
      </ul>
    </div>`;
}

function renderStructureBlock(file: ParsedFile, buildStructure: (file: ParsedFile) => string): string {
  let structure: string;
  try {
    structure = buildStructure(file);
  } catch (error) {
    structure = `- error: ${error instanceof Error ? error.message : 'Failed to build structure'}`;
  }
  return renderDetails(file.filePath, structure);
}

function renderRawBlock(filePath: string, language: LanguageId, label: string): string {
  let astOutput: string;
  try {
    const content = readSource(filePath);
    const parseRaw = (RAW_AST_PARSERS as Partial<Record<LanguageId, (content: string, filePath: string) => unknown>>)[language];
    const raw = parseRaw
      ? parseRaw(content, filePath)
      : { note: `${label} AST full parsing not enabled`, filePath, preview: content.slice(0, AST_SECTION_LIMITS.sourcePreviewChars) };
    astOutput = JSON.stringify(raw, null, 2);
  } catch (error) {
    astOutput = JSON.stringify({ filePath, error: error instanceof Error ? error.message : 'Failed to parse AST' }, null, 2);
  }

  if (astOutput.length > AST_SECTION_LIMITS.rawAstChars) {
    astOutput = `${astOutput.slice(0, AST_SECTION_LIMITS.rawAstChars)}\n... (truncated)`;
  }
  return renderDetails(filePath, astOutput);
}

function renderDetails(filePath: string, body: string): string {
  return `
  <details style="margin: 10px 0;">
    <summary style="cursor: pointer; font-weight: 600;">${escapeHtml(path.basename(filePath))}</summary>
    <pre style="${DETAILS_PRE_STYLE}">${escapeHtml(body)}</pre>
  </details>`;
}

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}
