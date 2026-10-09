import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@typescript-eslint/typescript-estree';
import phpParser from 'php-parser';
import type { AnalysisResult } from '../../types';
import { escapeHtml } from '../../html';
import { buildLlmControlsHtml, buildLlmControlsScript } from './llmControls';

const AST_DEFAULT_TOKENS = 4000;

/** Row/item display caps for the AST preview lists below */
const AST_PREVIEW_CONTENT_CHAR_LIMIT = 2000;
const AST_LIST_ITEM_LIMIT = 30;
const AST_CLASS_LIST_LIMIT = 20;
const AST_METHOD_LIST_LIMIT = 20;
const AST_NAMESPACE_LIST_LIMIT = 10;

export function astSection(result: AnalysisResult, savedAstResult?: string): string {
  const maxFilesPerLang = 5;
  const maxChars = 40000;
  const llmEnabled = result.config.features.llm;
  const analysisId = result.analysisId;
  const astLoadFocus = 'ast-structure-only';
  const astRunFocus = 'ast-code-review';
  const initialAstContent = savedAstResult ? escapeHtml(savedAstResult) : '未実行';
  const initialAstDataMd = savedAstResult ? escapeHtml(savedAstResult) : '';
  const initialAstStatus = savedAstResult ? 'レポート生成時の保存済み結果' : (llmEnabled ? '' : 'LLM分析は無効です。CSAP_LLM_ENABLED=true と API キーを設定してください。');

  const tsFiles = result.tsFiles.slice(0, maxFilesPerLang);
  const phpFiles = result.phpFiles.slice(0, maxFilesPerLang);
  const dartFiles = result.dartFiles.slice(0, maxFilesPerLang);
  const pythonFiles = result.pythonFiles.slice(0, maxFilesPerLang);

  if (!tsFiles.length && !phpFiles.length && !dartFiles.length && !pythonFiles.length) return '';

  const tsAstBlocks = tsFiles.map((fileInfo) => renderAstBlock(fileInfo.filePath, 'typescript', maxChars)).join('');
  const phpAstBlocks = phpFiles.map((fileInfo) => renderAstBlock(fileInfo.filePath, 'php', maxChars)).join('');
  const dartBlocks = dartFiles.map((fileInfo) => renderAstBlock(fileInfo.filePath, 'dart', maxChars)).join('');
  const pythonBlocks = pythonFiles.map((fileInfo) => renderAstBlock(fileInfo.filePath, 'python', maxChars)).join('');

  const tsStructure = tsFiles.map((fileInfo) => renderAstStructureBlock(fileInfo.filePath, 'typescript')).join('');
  const phpStructure = phpFiles.map((fileInfo) => renderAstStructureBlock(fileInfo.filePath, 'php')).join('');
  const dartStructure = dartFiles.map((fileInfo) => renderAstStructureBlock(fileInfo.filePath, 'dart')).join('');
  const pythonStructure = pythonFiles.map((fileInfo) => renderAstStructureBlock(fileInfo.filePath, 'python')).join('');

  return `
  <section id="sec-ast">
    <h2>AST Structure (Readable)</h2>
    <div class="box" style="margin-bottom: 16px; border-left-color: #8b5cf6;">
      ${buildLlmControlsHtml({
        idPrefix: 'ast',
        defaultTokens: AST_DEFAULT_TOKENS,
        enabled: llmEnabled,
        buttonLabel: 'AST解析 (再実行)',
      })}
      <div id="astStatusInit" style="display:none;">${initialAstStatus}</div>
      <div style="margin: 10px 0; color:#6b7280; font-size:0.88em;">
        AST解析は、このASTセクションに表示されている構造サンプルをもとに、責務分割や複雑度の偏りをコードレベルで評価します。結果はこのレポートに保存されます。
      </div>
      <div id="astResult" class="llm-result" data-md="${initialAstDataMd}">${initialAstContent}</div>
    </div>
    <div class="box" style="border-left-color: var(--warning)">
      <div style="font-weight: 600; margin-bottom: 6px;">Notes</div>
      <ul style="padding-left:18px; margin: 0;">
        <li>To keep the report readable, only the first ${maxFilesPerLang} files per language are shown.</li>
        <li>Dart uses a lightweight parser, so the structure is best-effort.</li>
      </ul>
    </div>
    ${tsStructure ? `<h3>TypeScript/JavaScript</h3>${tsStructure}` : ''}
    ${phpStructure ? `<h3>PHP</h3>${phpStructure}` : ''}
    ${dartStructure ? `<h3>Dart</h3>${dartStructure}` : ''}
    ${pythonStructure ? `<h3>Python</h3>${pythonStructure}` : ''}

    <h2 style="margin-top: 28px;">AST Raw Data (Sampled)</h2>
    ${tsAstBlocks ? `<h3>TypeScript/JavaScript</h3>${tsAstBlocks}` : ''}
    ${phpAstBlocks ? `<h3>PHP</h3>${phpAstBlocks}` : ''}
    ${dartBlocks ? `<h3>Dart</h3>${dartBlocks}` : ''}
    ${pythonBlocks ? `<h3>Python</h3>${pythonBlocks}` : ''}
    <script>
      (function(){
        const enabled = ${llmEnabled ? 'true' : 'false'};
        const analysisId = "${analysisId}";
        const focus = "${astRunFocus}";
        const astOnlyMode = true;
        const defaultTokens = ${AST_DEFAULT_TOKENS};
        const statusEl = document.getElementById('astStatus');
        const resultEl = document.getElementById('astResult');
        const initialStatusEl = document.getElementById('astStatusInit');
        if (statusEl && initialStatusEl) statusEl.textContent = initialStatusEl.textContent;

        async function loadSavedResult() {
          try {
            const response = await fetch('/api/llm/result/' + encodeURIComponent(analysisId) + '/' + encodeURIComponent('${astLoadFocus}'));
            if (!response.ok) return;
            const data = await response.json();
            if (!data.success || !data.result) return;
            resultEl.innerHTML = typeof marked !== 'undefined' ? marked.parse(data.result) : data.result;
            statusEl.textContent = data.createdAt ? '保存済み結果を表示' : '保存済み結果';
          } catch (_error) {}
        }

        ${buildLlmControlsScript('ast')}

        loadSavedResult();
      })();
    </script>
  </section>`;
}

function renderAstBlock(filePath: string, lang: 'typescript' | 'php' | 'dart' | 'python', maxChars: number): string {
  let astOutput = '';

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (lang === 'typescript') {
      const ast = parse(content, {
        jsx: true,
        loc: true,
        range: true,
        ecmaVersion: 'latest',
        sourceType: 'module',
      });
      astOutput = JSON.stringify(ast, null, 2);
    } else if (lang === 'php') {
      const parser: any = new (phpParser as any).Engine({
        parser: { php7: true, extractDoc: false },
        ast: { withPositions: true },
      });
      const ast = parser.parseCode(content, filePath);
      astOutput = JSON.stringify(ast, null, 2);
    } else {
      astOutput = JSON.stringify({
        note: `${lang === 'dart' ? 'Dart' : 'Python'} AST full parsing not enabled`,
        filePath,
        preview: content.slice(0, AST_PREVIEW_CONTENT_CHAR_LIMIT),
      }, null, 2);
    }
  } catch (error) {
    astOutput = JSON.stringify({
      filePath,
      error: error instanceof Error ? error.message : 'Failed to parse AST',
    }, null, 2);
  }

  if (astOutput.length > maxChars) {
    astOutput = `${astOutput.slice(0, maxChars)}\n... (truncated)`;
  }

  return `
  <details style="margin: 10px 0;">
    <summary style="cursor: pointer; font-weight: 600;">${path.basename(filePath)}</summary>
    <pre style="white-space: pre-wrap; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-top: 8px; overflow-x: auto; font-size: 0.95em;">${escapeHtml(astOutput)}</pre>
  </details>`;
}

function renderAstStructureBlock(filePath: string, lang: 'typescript' | 'php' | 'dart' | 'python'): string {
  let structure = '';

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (lang === 'typescript') {
      structure = buildTypeScriptStructure(content);
    } else if (lang === 'php') {
      structure = buildPhpStructure(content, filePath);
    } else if (lang === 'dart') {
      structure = buildDartStructure(content);
    } else {
      structure = buildPythonStructure(content);
    }
  } catch (error) {
    structure = `- error: ${error instanceof Error ? error.message : 'Failed to build structure'}`;
  }

  return `
  <details style="margin: 10px 0;">
    <summary style="cursor: pointer; font-weight: 600;">${path.basename(filePath)}</summary>
    <pre style="white-space: pre-wrap; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-top: 8px; overflow-x: auto; font-size: 0.95em;">${escapeHtml(structure)}</pre>
  </details>`;
}

function buildTypeScriptStructure(content: string): string {
  const ast = parse(content, {
    jsx: true,
    loc: true,
    range: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  });

  const imports: string[] = [];
  const classes: Array<{ name: string; methods: string[]; fields: number }> = [];
  const functions: string[] = [];

  for (const node of ast.body || []) {
    if (node.type === 'ImportDeclaration' && node.source) {
      imports.push(String((node.source as any).value));
    }

    if (node.type === 'ClassDeclaration' && node.id) {
      const className = (node.id as any).name;
      const methods: string[] = [];
      let fields = 0;
      const body = (node as any).body?.body || [];
      for (const member of body) {
        if (member.type === 'MethodDefinition') {
          const methodName = (member.key as any).name || (member.key as any).value;
          if (methodName) methods.push(String(methodName));
        } else if (member.type === 'PropertyDefinition') {
          fields += 1;
        }
      }
      classes.push({ name: className, methods, fields });
    }

    if (node.type === 'FunctionDeclaration' && (node as any).id) {
      functions.push(String((node as any).id.name));
    }
  }

  const lines: string[] = [];
  lines.push('File');
  lines.push(`  Imports (${imports.length})`);
  imports.slice(0, AST_LIST_ITEM_LIMIT).forEach((imp) => lines.push(`    - ${imp}`));
  if (imports.length > AST_LIST_ITEM_LIMIT) lines.push(`    ... (${imports.length - AST_LIST_ITEM_LIMIT} more)`);

  lines.push(`  Classes (${classes.length})`);
  for (const cls of classes.slice(0, AST_CLASS_LIST_LIMIT)) {
    lines.push(`    - ${cls.name}`);
    if (cls.fields > 0) lines.push(`      - fields: ${cls.fields}`);
    cls.methods.slice(0, AST_METHOD_LIST_LIMIT).forEach((methodName) => lines.push(`      - method: ${methodName}()`));
    if (cls.methods.length > AST_METHOD_LIST_LIMIT) lines.push(`      ... (${cls.methods.length - AST_METHOD_LIST_LIMIT} more)`);
  }
  if (classes.length > AST_CLASS_LIST_LIMIT) lines.push(`    ... (${classes.length - AST_CLASS_LIST_LIMIT} more)`);

  lines.push(`  Functions (${functions.length})`);
  functions.slice(0, AST_LIST_ITEM_LIMIT).forEach((functionName) => lines.push(`    - ${functionName}()`));
  if (functions.length > AST_LIST_ITEM_LIMIT) lines.push(`    ... (${functions.length - AST_LIST_ITEM_LIMIT} more)`);

  return lines.join('\n');
}

function buildPhpStructure(content: string, filePath: string): string {
  const parser: any = new (phpParser as any).Engine({
    parser: { php7: true, extractDoc: false },
    ast: { withPositions: true },
  });
  const ast = parser.parseCode(content, filePath);

  const namespaces = new Set<string>();
  const uses: string[] = [];
  const classes: Array<{ name: string; methods: string[]; properties: number }> = [];
  const functions: string[] = [];
  let currentClass: { name: string; methods: string[]; properties: number } | null = null;

  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (node.kind === 'namespace') {
      if (node.name?.name) namespaces.add(String(node.name.name));
      else if (node.name?.parts) namespaces.add(node.name.parts.join('\\'));
    }

    if (node.kind === 'useitem' && node.name) {
      if (node.name.name) uses.push(String(node.name.name));
      else if (node.name.parts) uses.push(node.name.parts.join('\\'));
    }

    if (node.kind === 'class') {
      const name = node.name?.name || node.name;
      currentClass = { name: String(name || 'Anonymous'), methods: [], properties: 0 };
      classes.push(currentClass);
    }

    if (node.kind === 'method' && currentClass) {
      const name = node.name?.name || node.name;
      if (name) currentClass.methods.push(String(name));
    }

    if (node.kind === 'property' && currentClass) {
      currentClass.properties += Array.isArray(node.properties) ? node.properties.length : 1;
    }

    if (node.kind === 'function') {
      const name = node.name?.name || node.name;
      if (name) functions.push(String(name));
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
      walk(node[key]);
    }

    if (node.kind === 'class') currentClass = null;
  };

  walk(ast);

  const lines: string[] = [];
  lines.push('File');
  lines.push(`  Namespaces (${namespaces.size})`);
  Array.from(namespaces).slice(0, AST_NAMESPACE_LIST_LIMIT).forEach((namespaceValue) => lines.push(`    - ${namespaceValue}`));
  lines.push(`  Uses (${uses.length})`);
  uses.slice(0, AST_LIST_ITEM_LIMIT).forEach((useValue) => lines.push(`    - ${useValue}`));
  if (uses.length > AST_LIST_ITEM_LIMIT) lines.push(`    ... (${uses.length - AST_LIST_ITEM_LIMIT} more)`);

  lines.push(`  Classes (${classes.length})`);
  for (const cls of classes.slice(0, AST_CLASS_LIST_LIMIT)) {
    lines.push(`    - ${cls.name}`);
    if (cls.properties > 0) lines.push(`      - properties: ${cls.properties}`);
    cls.methods.slice(0, AST_METHOD_LIST_LIMIT).forEach((methodName) => lines.push(`      - method: ${methodName}()`));
    if (cls.methods.length > AST_METHOD_LIST_LIMIT) lines.push(`      ... (${cls.methods.length - AST_METHOD_LIST_LIMIT} more)`);
  }
  if (classes.length > AST_CLASS_LIST_LIMIT) lines.push(`    ... (${classes.length - AST_CLASS_LIST_LIMIT} more)`);

  lines.push(`  Functions (${functions.length})`);
  functions.slice(0, AST_LIST_ITEM_LIMIT).forEach((functionName) => lines.push(`    - ${functionName}()`));
  if (functions.length > AST_LIST_ITEM_LIMIT) lines.push(`    ... (${functions.length - AST_LIST_ITEM_LIMIT} more)`);

  return lines.join('\n');
}

function buildDartStructure(content: string): string {
  const imports: string[] = [];
  const classes: Array<{ name: string; methods: string[] }> = [];
  const functions: string[] = [];

  const importRegex = /^\s*(import|export|part)\s+['"]([^'"]+)['"]/gm;
  let match: RegExpExecArray | null = null;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[2]);
  }

  const classRegex = /\b(class|mixin|extension|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  while ((match = classRegex.exec(content)) !== null) {
    const name = match[2];
    classes.push({ name, methods: [] });
  }

  const functionRegex = /(?:^|\n)\s*(?:@[A-Za-z0-9_().,\s]+)?\s*(?:[A-Za-z_<>{}\[\]?]+\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:async\s*)?(?:=>|\{)/g;
  while ((match = functionRegex.exec(content)) !== null) {
    const name = match[1];
    if (!name || ['if', 'for', 'while', 'switch', 'catch', 'return', 'new'].includes(name)) {
      continue;
    }
    functions.push(name);
  }

  const lines: string[] = [];
  lines.push('File');
  lines.push(`  Imports (${imports.length})`);
  imports.slice(0, AST_LIST_ITEM_LIMIT).forEach((imp) => lines.push(`    - ${imp}`));
  if (imports.length > AST_LIST_ITEM_LIMIT) lines.push(`    ... (${imports.length - AST_LIST_ITEM_LIMIT} more)`);

  lines.push(`  Classes (${classes.length})`);
  classes.slice(0, AST_LIST_ITEM_LIMIT).forEach((cls) => lines.push(`    - ${cls.name}`));
  if (classes.length > AST_LIST_ITEM_LIMIT) lines.push(`    ... (${classes.length - AST_LIST_ITEM_LIMIT} more)`);

  lines.push(`  Functions (${functions.length})`);
  functions.slice(0, AST_LIST_ITEM_LIMIT).forEach((functionName) => lines.push(`    - ${functionName}()`));
  if (functions.length > AST_LIST_ITEM_LIMIT) lines.push(`    ... (${functions.length - AST_LIST_ITEM_LIMIT} more)`);

  return lines.join('\n');
}

function buildPythonStructure(content: string): string {
  const imports: string[] = [];
  const classes: Array<{ name: string }> = [];
  const functions: string[] = [];

  const importRegex = /^(?:import\s+([A-Za-z0-9_.]+)|from\s+([A-Za-z0-9_.]+)\s+import\b)/gm;
  let match: RegExpExecArray | null = null;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1] || match[2]);
  }

  const classRegex = /^class\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  while ((match = classRegex.exec(content)) !== null) {
    classes.push({ name: match[1] });
  }

  const functionRegex = /^(?:\s*)(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm;
  while ((match = functionRegex.exec(content)) !== null) {
    functions.push(match[1]);
  }

  const lines: string[] = [];
  lines.push('File');
  lines.push(`  Imports (${imports.length})`);
  imports.slice(0, AST_LIST_ITEM_LIMIT).forEach((imp) => lines.push(`    - ${imp}`));
  if (imports.length > AST_LIST_ITEM_LIMIT) lines.push(`    ... (${imports.length - AST_LIST_ITEM_LIMIT} more)`);

  lines.push(`  Classes (${classes.length})`);
  classes.slice(0, AST_LIST_ITEM_LIMIT).forEach((cls) => lines.push(`    - ${cls.name}`));
  if (classes.length > AST_LIST_ITEM_LIMIT) lines.push(`    ... (${classes.length - AST_LIST_ITEM_LIMIT} more)`);

  lines.push(`  Functions (${functions.length})`);
  functions.slice(0, AST_LIST_ITEM_LIMIT).forEach((functionName) => lines.push(`    - ${functionName}()`));
  if (functions.length > AST_LIST_ITEM_LIMIT) lines.push(`    ... (${functions.length - AST_LIST_ITEM_LIMIT} more)`);

  return lines.join('\n');
}

