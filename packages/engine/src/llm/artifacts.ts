import fs from 'node:fs';
import { getAstOnlyLlmContextPath, getLlmContextPath, getLlmResultPath } from './context';
import { LLM_FOCUS, LlmMode } from './focus';
import { isValidAnalysisId } from '../validation';

/** A saved LLM result, as written next to the report. */
export interface LlmResultPayload {
  analysisId: string;
  focus: string;
  mode: LlmMode;
  provider: string;
  model: string;
  result: string;
  createdAt: string;
}

/** The analysis context the LLM reads; AST-only runs read the smaller AST sample. */
export function readLlmContext(analysisId: string, mode: LlmMode, outputDir: string): unknown {
  const contextPath = mode === 'ast-only'
    ? getAstOnlyLlmContextPath(analysisId, outputDir)
    : getLlmContextPath(analysisId, outputDir);
  if (!fs.existsSync(contextPath)) {
    throw new Error(`LLM context not found (mode: ${mode === 'ast-only' ? 'ast-only' : 'full'}). Re-run analysis.`);
  }
  return JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
}

export function readLlmResult(analysisId: string, focus: string, outputDir?: string): Partial<LlmResultPayload> | null {
  if (!isValidAnalysisId(analysisId)) {
    throw new Error('analysisId is invalid');
  }
  const resultPath = outputDir ? getLlmResultPath(analysisId, focus, outputDir) : getLlmResultPath(analysisId, focus);
  if (!fs.existsSync(resultPath)) return null;
  return JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
}

export function writeLlmResult(payload: LlmResultPayload, outputDir: string): void {
  const resultPath = getLlmResultPath(payload.analysisId, payload.focus, outputDir);
  fs.writeFileSync(resultPath, JSON.stringify(payload, null, 2), 'utf-8');
}

/** Saved review texts to embed when a report is (re)generated; unreadable results are skipped. */
export function readSavedReviews(analysisId: string, outputDir: string): { review?: string; astReview?: string } {
  const text = (focus: string) => {
    try {
      const result = readLlmResult(analysisId, focus, outputDir)?.result;
      return typeof result === 'string' ? result : undefined;
    } catch {
      return undefined;
    }
  };
  return { review: text(LLM_FOCUS.review), astReview: text(LLM_FOCUS.astOnly) };
}
