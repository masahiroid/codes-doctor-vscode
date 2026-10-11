import fs from 'node:fs';
import path from 'node:path';
import { writeLlmContext } from '../llm/context';
import type { AnalysisResult } from '../types';

/**
 * @param outputDir Base output directory. Defaults to `<cwd>/output` for the
 * server, but callers embedding CSAP elsewhere (e.g. the VS Code extension)
 * can point this at their own storage location.
 */
export function getReportPath(analysisId: string, outputDir: string = path.join(process.cwd(), 'output')): string {
  return path.join(outputDir, `${analysisId}.html`);
}

export function persistHtmlReport(result: AnalysisResult, outputPath: string, html: string): void {
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, html, 'utf-8');
  writeLlmContext(result, outputDir);
  console.log(`[OK] Report generated: ${outputPath}`);
}