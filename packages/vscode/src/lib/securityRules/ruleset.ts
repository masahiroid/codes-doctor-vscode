import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Downloading, verifying and caching distributed rule packs (manifest + SHA-256-checked pack files). */

export const DEFAULT_MANIFEST_URL = 'https://raw.githubusercontent.com/masahiroid/security-rules/main/dist/manifest.json';
export const MANIFEST_FILE = 'manifest.json';

const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

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

module.exports = { DEFAULT_MANIFEST_URL, MANIFEST_FILE, sha256Hex, parseManifest, parsePack, fetchBytes, downloadRuleset, writeRulesetCache, readRulesetCache };
