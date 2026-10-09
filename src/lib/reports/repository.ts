import fs from 'node:fs';
import path from 'node:path';
import { REPORT_STORAGE } from '../settingsSchema';

export function getReportLanguage(reportPath: string | undefined) {
  try {
    return /<html\b[^>]*\blang=["']ja(?:-JP)?["']/i.test(fs.readFileSync(reportPath || '', 'utf-8')) ? 'ja' : 'en';
  } catch {
    return 'en';
  }
}

export function getDefaultOutputDir(context: Pick<import('vscode').ExtensionContext, 'globalStorageUri'>) {
  return path.join(context.globalStorageUri.fsPath, REPORT_STORAGE.directory);
}

/**
 * List previously run LLM review results for one analysis, newest first. Each result
 * was written by analyzeLlmRequest() (via runLlmAnalysis above) to
 * <outputDir>/<analysisId>.llm-<focus>.json — see csap-main's src/llm/context.ts
 * (getLlmResultPath) and src/services/llmService.ts for the payload shape.
 * @param {string} analysisId
 * @param {string} outputDir Must match the outputDir used for analyzeWorkspace.
 * @returns {Array<{ focus: string, mode?: string, provider?: string, model?: string, createdAt?: string }>}
 */
export function listLlmResults(analysisId: string, outputDir: string) {
  if (!analysisId || !outputDir) return [];

  let entries;
  try {
    entries = fs.readdirSync(outputDir);
  } catch {
    return [];
  }

  const prefix = `${analysisId}.llm-`;
  const results: import('../types').LlmHistoryEntry[] = [];

  for (const entry of entries) {
    if (!entry.startsWith(prefix) || !entry.endsWith('.json')) continue;
    const focus = entry.slice(prefix.length, -'.json'.length);
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(path.join(outputDir, entry), 'utf-8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const payload = parsed as Record<string, unknown>;
      results.push({
        focus,
        mode: typeof payload.mode === 'string' ? payload.mode : undefined,
        provider: typeof payload.provider === 'string' ? payload.provider : undefined,
        model: typeof payload.model === 'string' ? payload.model : undefined,
        createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : undefined,
      });
    } catch {
      // Skip unreadable/corrupt result files rather than failing the whole list.
    }
  }

  results.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return results;
}

/**
 * List past analysis reports found under outputDir, newest first. Each report is
 * <analysisId>.html alongside <analysisId>.llm-context.json (written by csap-main's
 * writeLlmContext() — see src/llm/context.ts), which carries the repo name and
 * analyzed-at timestamp used here without having to scrape the report HTML.
 * @param {string} outputDir
 * @returns {Array<{ analysisId: string, reportPath: string, repoName?: string, analyzedAt?: string, mtimeMs: number }>}
 */
export function listReports(outputDir: string) {
  if (!outputDir) return [];

  let entries;
  try {
    entries = fs.readdirSync(outputDir);
  } catch {
    return [];
  }

  const reports: import('../types').ReportEntry[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.html')) continue;
    const analysisId = entry.slice(0, -'.html'.length);
    const reportPath = path.join(outputDir, entry);

    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(reportPath).mtimeMs;
    } catch {
      continue;
    }

    let repoName;
    let analyzedAt;
    try {
      const contextPath = path.join(outputDir, `${analysisId}.llm-context.json`);
      const parsed: unknown = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const context = parsed as Record<string, unknown>;
        repoName = typeof context.repoName === 'string' ? context.repoName : undefined;
        analyzedAt = typeof context.analyzedAt === 'string' ? context.analyzedAt : undefined;
      }
    } catch {
      // No LLM context file (e.g. LLM feature was off for that run) — the list still
      // shows the report by its id and file mtime.
    }

    reports.push({ analysisId, reportPath, repoName, analyzedAt, mtimeMs });
  }

  reports.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return reports;
}


module.exports = { getReportLanguage, getDefaultOutputDir, listLlmResults, listReports };
