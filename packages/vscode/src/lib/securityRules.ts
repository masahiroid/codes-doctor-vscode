import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_MANIFEST_URL = 'https://raw.githubusercontent.com/masahiroid/security-rules/main/dist/manifest.json';
export const MANIFEST_FILE = 'manifest.json';

const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const MAX_PATTERN_LENGTH = 500;
export const SCAN_LIMITS = Object.freeze({ maxFileBytes: 1024 * 1024, maxPerRulePerFile: 200, maxTotalCandidates: 5000 });
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;
// A quantified group that itself contains a quantifier, e.g. (a+)+. Rules arrive over the network
// and run on the extension host thread, so patterns that can backtrack catastrophically are refused.
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,\d*\})/;

export type RuleSeverity = 'error' | 'warning';
export type PackChannel = 'baseline' | 'emergency' | 'regulatory';

export interface SecurityRule {
  id: string;
  title: string;
  category: string;
  message: string;
  severity: RuleSeverity;
  targetLanguages: string[];
  pattern?: string;
  /** Deterministic detection (`detect: { type: taint, ... }`), run by the engine's data-flow analysis. */
  detect?: unknown;
  owaspCategory?: string;
  sourceUrls: string[];
  checkSteps: string[];
  excelColumn: string;
  actionRequired: string;
}

export interface PackEntry {
  id: string;
  version: string;
  channel: PackChannel;
  mandatory: boolean;
  file: string;
  sha256: string;
}

export interface Manifest {
  version: string;
  description: string;
  packs: PackEntry[];
}

export interface SecurityPack {
  id: string;
  version: string;
  description: string;
  channel: PackChannel;
  mandatory: boolean;
  publishedAt?: string;
  advisoryPublishedAt?: string;
  sha256: string;
  rules: SecurityRule[];
}

export interface LoadedRuleset {
  manifest: Manifest;
  packs: SecurityPack[];
  source: 'network' | 'cache';
  files: Record<string, string>;
}

/** The engine functions this module needs; injected so the module stays testable without the bundle. */
export interface FlowEngine {
  compileTaintRule(id: string, detect: unknown): TaintRule;
  analyzeTaintRules(rules: TaintRule[], language: string, filePath: string, content: string): Promise<Array<FlowResult[] | null>>;
  taintRuleCovers(rule: TaintRule, language: string): boolean;
  isTestPath(filePath: string): boolean;
}
export type TaintRule = { id: string; languages: ReadonlySet<string> };
export interface FlowResult {
  category: string;
  source: { line: number; code: string };
  steps: Array<{ line: number; code: string }>;
  sink: { line: number; code: string };
  function?: string;
}

export interface CompiledRule {
  pack: SecurityPack;
  rule: SecurityRule;
  regex?: RegExp;
  taint?: TaintRule;
}

export interface Candidate {
  packId: string;
  ruleId: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  /** Present when the candidate is a data flow from untrusted input, not a pattern match. */
  flow?: FlowResult;
}

function fail(message: string): never {
  throw new Error(message);
}

function str(value: unknown, field: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fail(`Invalid ruleset: "${field}" must be a non-empty string`);
}

function strings(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    fail(`Invalid ruleset: "${field}" must be an array of non-empty strings`);
  }
  return value as string[];
}

function record(value: unknown, field: string): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : fail(`Invalid ruleset: "${field}" must be an object`);
}

function channel(value: unknown, field: string): PackChannel {
  return value === 'baseline' || value === 'emergency' || value === 'regulatory' ? value : fail(`Invalid ruleset: "${field}" has an unknown channel`);
}

export function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function parseManifest(text: string): Manifest {
  const data = record(JSON.parse(text), 'manifest');
  if (!Array.isArray(data.packs) || data.packs.length === 0) fail('Invalid ruleset: manifest has no packs');
  const packs = data.packs.map((raw, index): PackEntry => {
    const entry = record(raw, `packs[${index}]`);
    const file = str(entry.file, `packs[${index}].file`);
    const sha256 = str(entry.sha256, `packs[${index}].sha256`);
    // The file name is joined onto the manifest URL and the cache directory; it must stay a plain name.
    if (!SAFE_FILE_NAME.test(file) || file === MANIFEST_FILE) fail(`Invalid ruleset: unsafe pack file name "${file}"`);
    if (!/^[0-9a-f]{64}$/.test(sha256)) fail(`Invalid ruleset: malformed sha256 for "${file}"`);
    return {
      id: str(entry.id, `packs[${index}].id`),
      version: str(entry.version, `packs[${index}].version`),
      channel: channel(entry.channel, `packs[${index}].channel`),
      mandatory: entry.mandatory === true,
      file,
      sha256,
    };
  });
  return { version: str(data.version, 'version'), description: typeof data.description === 'string' ? data.description : '', packs };
}

function parseRule(raw: unknown, index: number): SecurityRule {
  const rule = record(raw, `rules[${index}]`);
  const id = str(rule.id, `rules[${index}].id`);
  const severity = rule.severity === 'error' || rule.severity === 'warning' ? rule.severity : fail(`Invalid ruleset: rule "${id}" has an unknown severity`);
  const excel = record(rule.excel_mapping, `${id}.excel_mapping`);
  return {
    id,
    title: str(rule.title, `${id}.title`),
    category: str(rule.category, `${id}.category`),
    message: str(rule.message, `${id}.message`),
    severity,
    targetLanguages: strings(rule.target_languages, `${id}.target_languages`),
    pattern: rule.pattern === undefined ? undefined : str(rule.pattern, `${id}.pattern`),
    detect: rule.detect,
    owaspCategory: typeof rule.owasp_category === 'string' ? rule.owasp_category : undefined,
    sourceUrls: strings(rule.source_urls, `${id}.source_urls`).filter((url) => url.startsWith('https://')),
    checkSteps: strings(rule.check_steps, `${id}.check_steps`),
    excelColumn: str(excel.column, `${id}.excel_mapping.column`),
    actionRequired: str(excel.action_required, `${id}.excel_mapping.action_required`),
  };
}

// The hash is checked against the downloaded bytes before anything is parsed.
export function parsePack(bytes: Uint8Array, entry: PackEntry): SecurityPack {
  if (sha256Hex(bytes) !== entry.sha256) fail(`Checksum mismatch for ${entry.file}: the file does not match the manifest`);
  const data = record(JSON.parse(Buffer.from(bytes).toString('utf8')), entry.file);
  if (data.id !== entry.id || data.version !== entry.version) fail(`Pack ${entry.file} does not match its manifest entry`);
  if (!Array.isArray(data.rules) || data.rules.length === 0) fail(`Pack ${entry.file} has no rules`);
  return {
    id: entry.id,
    version: entry.version,
    description: typeof data.description === 'string' ? data.description : '',
    channel: entry.channel,
    mandatory: entry.mandatory,
    publishedAt: typeof data.published_at === 'string' ? data.published_at : undefined,
    advisoryPublishedAt: typeof data.advisory_published_at === 'string' ? data.advisory_published_at : undefined,
    sha256: entry.sha256,
    rules: data.rules.map(parseRule),
  };
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  url?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export async function fetchBytes(url: string, fetchImpl: FetchLike = fetch as FetchLike, timeoutMs = 15000): Promise<Uint8Array> {
  // A file: URL reads a local or shared-drive copy (closed networks, testing rules before publishing).
  if (new URL(url).protocol === 'file:') {
    const bytes = await fs.readFile(fileURLToPath(url));
    if (bytes.length > MAX_DOWNLOAD_BYTES) fail(`File is too large: ${url}`);
    return new Uint8Array(bytes);
  }
  if (new URL(url).protocol !== 'https:') fail(`Refusing to download rules over a URL that is neither HTTPS nor file:: ${url}`);
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) fail(`Download failed (${response.status}): ${url}`);
  if (response.url && new URL(response.url).protocol !== 'https:') fail(`Download was redirected to a non-HTTPS URL: ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_DOWNLOAD_BYTES) fail(`Download is too large: ${url}`);
  return bytes;
}

export async function downloadRuleset(manifestUrl: string, fetchImpl?: FetchLike): Promise<LoadedRuleset> {
  const manifestBytes = await fetchBytes(manifestUrl, fetchImpl);
  const manifestText = Buffer.from(manifestBytes).toString('utf8');
  const manifest = parseManifest(manifestText);
  const files: Record<string, string> = { [MANIFEST_FILE]: manifestText };
  const packs: SecurityPack[] = [];
  for (const entry of manifest.packs) {
    const bytes = await fetchBytes(new URL(entry.file, manifestUrl).toString(), fetchImpl);
    packs.push(parsePack(bytes, entry));
    files[entry.file] = Buffer.from(bytes).toString('utf8');
  }
  return { manifest, packs, source: 'network', files };
}

export async function writeRulesetCache(cacheDir: string, ruleset: LoadedRuleset): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });
  // The manifest goes last, so an interrupted write never leaves a manifest pointing at missing packs.
  const names = Object.keys(ruleset.files).sort((a, b) => Number(a === MANIFEST_FILE) - Number(b === MANIFEST_FILE));
  for (const name of names) {
    const target = path.join(cacheDir, name);
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, ruleset.files[name], 'utf8');
    await fs.rename(temp, target);
  }
}

// The cache is re-verified against its manifest, so a hand-edited file is rejected rather than trusted.
export async function readRulesetCache(cacheDir: string): Promise<LoadedRuleset> {
  const manifestText = await fs.readFile(path.join(cacheDir, MANIFEST_FILE), 'utf8');
  const manifest = parseManifest(manifestText);
  const files: Record<string, string> = { [MANIFEST_FILE]: manifestText };
  const packs: SecurityPack[] = [];
  for (const entry of manifest.packs) {
    const bytes = await fs.readFile(path.join(cacheDir, entry.file));
    packs.push(parsePack(bytes, entry));
    files[entry.file] = bytes.toString('utf8');
  }
  return { manifest, packs, source: 'cache', files };
}

export function compileRules(packs: SecurityPack[], engine?: FlowEngine): { compiled: CompiledRule[]; invalid: Array<{ packId: string; ruleId: string; reason: string }> } {
  const compiled: CompiledRule[] = [];
  const invalid: Array<{ packId: string; ruleId: string; reason: string }> = [];
  for (const pack of packs) {
    for (const rule of pack.rules) {
      // A rule with a deterministic detector uses it instead of its pattern.
      if (rule.detect !== undefined) {
        try {
          if (!engine) throw new Error('the analysis engine is not available');
          compiled.push({ pack, rule, taint: engine.compileTaintRule(rule.id, rule.detect) });
        } catch (error) {
          invalid.push({ packId: pack.id, ruleId: rule.id, reason: error instanceof Error ? error.message : String(error) });
        }
        continue;
      }
      if (rule.pattern === undefined) {
        compiled.push({ pack, rule });
        continue;
      }
      const reason = rule.pattern.length > MAX_PATTERN_LENGTH
        ? 'pattern is too long'
        : NESTED_QUANTIFIER.test(rule.pattern)
          ? 'pattern has nested quantifiers and could backtrack catastrophically'
          : undefined;
      if (reason) {
        invalid.push({ packId: pack.id, ruleId: rule.id, reason });
        continue;
      }
      try {
        compiled.push({ pack, rule, regex: new RegExp(rule.pattern, 'g') });
      } catch (error) {
        invalid.push({ packId: pack.id, ruleId: rule.id, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { compiled, invalid };
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.json': 'json',
  '.php': 'php',
};

export function languageForFile(fileName: string): string | undefined {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.d.ts') || lower.endsWith('.min.js') || lower.endsWith('.bundle.js')) return undefined;
  return LANGUAGE_BY_EXTENSION[path.extname(lower)];
}

export const SCAN_GLOB = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,json,php}';
/** Source files no security rule can analyze yet; counted so the panel can say they were not checked. */
export const UNSUPPORTED_SOURCE_GLOB = '**/*.{py,go,java,kt,kts,rb,cs,rs,swift,dart,c,cc,cpp,h,hpp,scala}';
export const SCAN_EXCLUDE_GLOB = '**/{node_modules,.git,dist,dist-en,out,build,coverage,vendor,.venv,.codes-doctor}/**';

export function scanText(text: string, language: string, rules: CompiledRule[], limits = SCAN_LIMITS): Candidate[] {
  const candidates: Candidate[] = [];
  let lineStarts: number[] | undefined;
  const position = (offset: number) => {
    if (!lineStarts) {
      lineStarts = [0];
      for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) lineStarts.push(index + 1);
    }
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStarts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return { line: low, column: offset - lineStarts[low] };
  };

  for (const { pack, rule, regex } of rules) {
    if (!regex || !rule.targetLanguages.includes(language)) continue;
    regex.lastIndex = 0;
    let count = 0;
    for (let match = regex.exec(text); match && count < limits.maxPerRulePerFile; match = regex.exec(text)) {
      if (match[0].length === 0) regex.lastIndex++;
      const start = position(match.index);
      const end = position(match.index + Math.max(match[0].length, 1));
      candidates.push({ packId: pack.id, ruleId: rule.id, startLine: start.line, startColumn: start.column, endLine: end.line, endColumn: end.column });
      count++;
    }
  }
  return candidates;
}

/** Pattern matches plus data flows for the rules that have a detector. */
export async function scanFile(text: string, language: string, filePath: string, rules: CompiledRule[], engine?: FlowEngine): Promise<Candidate[]> {
  const candidates = scanText(text, language, rules);
  if (!engine) return candidates;
  const flowRules = rules.filter((item): item is CompiledRule & { taint: TaintRule } => item.taint !== undefined);
  if (flowRules.length === 0) return candidates;
  let results: Array<FlowResult[] | null> = [];
  try {
    // One parse of the file serves every rule.
    results = await engine.analyzeTaintRules(flowRules.map((item) => item.taint), language, filePath, text);
  } catch {
    // A file the parser cannot read yields no flows; the pattern pass above still ran.
  }
  for (const [index, { pack, rule }] of flowRules.entries()) {
    for (const flow of results[index] ?? []) {
      const line = Math.max(flow.sink.line - 1, 0);
      const lineText = text.split('\n', line + 1)[line] ?? '';
      const indent = lineText.length - lineText.trimStart().length;
      candidates.push({ packId: pack.id, ruleId: rule.id, startLine: line, startColumn: indent, endLine: line, endColumn: Math.max(lineText.length, indent + 1), flow });
    }
  }
  return candidates;
}

export interface FileCandidates {
  file: string;
  candidates: Candidate[];
}

export interface AuditContext {
  generatedAt: string;
  toolName: string;
  toolVersion: string;
  workspace: string;
  rulesetVersion: string;
  /** Manifest URL the rules came from, so the report shows which ruleset decided it. */
  rulesSource?: string;
  source: 'network' | 'cache';
  scannedFiles: number;
  skippedFiles: number;
  testFilesExcluded: number;
  /** Files scanned per analysis language, so a data-flow rule can tell "no flow" from "nothing to analyze". */
  filesByLanguage: Record<string, number>;
  /** Source files in languages no rule here can analyze; they were not scanned. */
  unsupportedFiles: number;
}

export function buildAuditReport(
  packs: SecurityPack[],
  results: FileCandidates[],
  invalid: Array<{ packId: string; ruleId: string; reason: string }>,
  context: AuditContext,
  compiled: CompiledRule[] = [],
  engine?: Pick<FlowEngine, 'taintRuleCovers'>
) {
  const coveredFiles = (packId: string, ruleId: string) => {
    const taint = compiled.find((item) => item.pack.id === packId && item.rule.id === ruleId)?.taint;
    if (!taint || !engine) return 0;
    return Object.entries(context.filesByLanguage).reduce((sum, [language, count]) => sum + (engine.taintRuleCovers(taint, language) ? count : 0), 0);
  };
  const rules = packs.flatMap((pack) => pack.rules.map((rule) => {
    const locations = results.flatMap(({ file, candidates }) =>
      candidates.filter((c) => c.packId === pack.id && c.ruleId === rule.id).map((c) => ({
        file,
        line: c.startLine + 1,
        ...(c.flow ? { sourceLine: c.flow.source.line, source: c.flow.source.code, sink: c.flow.sink.code } : {}),
      }))
    );
    const method = rule.detect !== undefined ? 'dataflow' as const : rule.pattern !== undefined ? 'pattern' as const : 'manual' as const;
    const failed = invalid.some((item) => item.packId === pack.id && item.ruleId === rule.id);
    const analyzedFiles = method === 'dataflow' ? coveredFiles(pack.id, rule.id) : undefined;
    return {
      packId: pack.id,
      packVersion: pack.version,
      channel: pack.channel,
      ruleId: rule.id,
      title: rule.title,
      severity: rule.severity,
      owaspCategory: rule.owaspCategory ?? '',
      excelColumn: rule.excelColumn,
      actionRequired: rule.actionRequired,
      verification: 'manual' as const,
      method,
      // A data flow is input reaching the operation; a regex hit only marks code to look at.
      // Neither "no flow" nor "no hit" proves the item safe: the analysis stays within one file.
      status: failed
        ? 'not_evaluated' as const
        : method === 'dataflow'
          ? (locations.length > 0 ? 'flow_detected' as const : analyzedFiles === 0 ? 'no_target_files' as const : 'no_flow_detected' as const)
          : locations.length > 0 ? 'review_required' as const : 'manual_check_required' as const,
      candidateCount: locations.length,
      ...(analyzedFiles === undefined ? {} : { analyzedFiles }),
      locations,
      sourceUrls: rule.sourceUrls,
      checkSteps: rule.checkSteps,
    };
  }));
  return {
    ...context,
    compliance: 'unverified' as const,
    note: 'Data flows show untrusted input reaching a dangerous operation within one file. Pattern matches are review candidates only. Neither an empty data-flow result nor no match establishes compliance; every item still needs a manual check and evidence.',
    packs: packs.map(({ id, version, channel, mandatory, sha256, publishedAt, advisoryPublishedAt }) => ({ id, version, channel, mandatory, sha256, publishedAt, advisoryPublishedAt })),
    invalidRules: invalid,
    rules,
  };
}

export type AuditReport = ReturnType<typeof buildAuditReport>;

// Spreadsheet applications run cells that start with these characters as formulas.
function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function auditReportToCsv(report: AuditReport): string {
  const header = ['pack_id', 'pack_version', 'channel', 'rule_id', 'title', 'severity', 'owasp_category', 'excel_column', 'action_required', 'method', 'status', 'candidate_count', 'locations', 'source_urls'];
  const lines = report.rules.map((rule) => [
    rule.packId, rule.packVersion, rule.channel, rule.ruleId, rule.title, rule.severity, rule.owaspCategory, rule.excelColumn, rule.actionRequired,
    rule.method, rule.status, rule.candidateCount, rule.locations.map((l) => `${l.file}:${l.line}`).join('; '), rule.sourceUrls.join(' '),
  ].map(csvCell).join(','));
  // The BOM lets Excel open the Japanese text as UTF-8.
  return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`;
}

export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()<>#+!|~&-]/g, '\\$&');
}

module.exports = {
  DEFAULT_MANIFEST_URL, MANIFEST_FILE, SCAN_LIMITS, SCAN_GLOB, SCAN_EXCLUDE_GLOB, UNSUPPORTED_SOURCE_GLOB,
  sha256Hex, parseManifest, parsePack, fetchBytes, downloadRuleset, writeRulesetCache, readRulesetCache,
  compileRules, languageForFile, scanText, scanFile, buildAuditReport, auditReportToCsv, escapeMarkdown,
};
