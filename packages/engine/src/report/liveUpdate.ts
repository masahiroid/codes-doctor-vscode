import fs from 'node:fs';
import { getReportPath } from './output';
import { escapeHtml } from '../html';
import { REVIEW_ELEMENT_IDS } from './reviewElements';
import type { LlmMode } from '../llm/focus';

/**
 * Write a new LLM result into an already-saved HTML report, so offline viewing shows it.
 * Both the element's `data-md` attribute (rendered as Markdown on load) and its fallback
 * text are replaced, so the result reads correctly even if the Markdown renderer fails to load.
 */
export function updateReportReview(analysisId: string, mode: LlmMode, content: string, outputDir?: string): void {
  const htmlPath = outputDir ? getReportPath(analysisId, outputDir) : getReportPath(analysisId);
  if (!fs.existsSync(htmlPath)) return;

  const divId = REVIEW_ELEMENT_IDS[mode];
  const escaped = escapeHtml(content);
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const pattern = new RegExp(`(<div id="${divId}"[^>]*?)\\s*data-md="[^"]*"([^>]*>)[\\s\\S]*?(<\\/div>)`, '');
  // A replacer function keeps `$` sequences in the content from being read as group references.
  let patched = html.replace(pattern, (_match, before: string, after: string, close: string) => `${before} data-md="${escaped}"${after}${escaped}${close}`);
  // The AST review box is hidden until its first review is saved.
  if (mode === 'ast-only') patched = patched.replace('<div id="astReview" hidden>', '<div id="astReview">');
  if (patched !== html) {
    fs.writeFileSync(htmlPath, patched, 'utf-8');
  }
}
