import { ruleDigest } from './ruleset';
import type { SecurityPack } from './ruleset';
import type { AuditReport } from './audit';

/**
 * Review evidence (`evidence.json`) in the format of security-rules' `rules.py init-evidence` and
 * `check`: one entry per rule, bound to a target (service and environment), the pack version and
 * the rule's digest. A reviewer records the status, references to the evidence, their name and the
 * time. This tool adds `analysis` to each entry, the automatic result that backs the review; it
 * never sets a passing status itself.
 */

/** Not started, in progress, passed, action required, not applicable. Only `pass` and `not_applicable` satisfy a check. */
export const EVIDENCE_STATUSES = ['pending', 'in_progress', 'pass', 'fail', 'not_applicable'] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

/** Review evidence older than this no longer satisfies a check, as in `rules.py`. */
export const EVIDENCE_MAX_AGE_DAYS = 30;
const MAX_ANALYSIS_LOCATIONS = 50;

export interface EvidenceAnalysis {
  /** The audit status of the rule (e.g. `flow_detected`, `no_flow_detected`, `manual_check_required`). */
  status: string;
  method: string;
  candidate_count: number;
  /** `file:line` of each candidate, at most 50. */
  locations: string[];
  analyzed_at: string;
  tool: string;
  ruleset_version: string;
  fix_status?: string;
}

export interface EvidenceEntry {
  pack_id: string;
  pack_version: string;
  rule_id: string;
  rule_sha256: string;
  status: string;
  evidence: string[];
  checked_at: string;
  reviewer: string;
  reason: string;
  title?: string;
  analysis?: EvidenceAnalysis;
  /** The review this entry replaced because the rule or its pack changed; kept so the change is visible. */
  superseded?: { pack_version: string; rule_sha256: string; status: string; checked_at: string; reviewer: string };
}

export interface EvidenceFile {
  target: string;
  results: EvidenceEntry[];
  [key: string]: unknown;
}

export interface EvidenceUpdate {
  evidence: EvidenceFile;
  /** Rules with no entry before. */
  added: string[];
  /** Entries reset to `pending` because the pack version or rule content changed. */
  invalidated: string[];
  /** Entries of the selected packs whose rule no longer exists; removed. */
  removed: string[];
}

const label = (packId: string, ruleId: string) => `${packId}/${ruleId}`;
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** Read an evidence file; throws when it is not an object with a `results` array. */
export function parseEvidence(json: string): EvidenceFile {
  const data = JSON.parse(json) as unknown;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid evidence file: not an object');
  const file = data as Record<string, unknown>;
  if (!Array.isArray(file.results)) throw new Error('Invalid evidence file: "results" must be an array');
  return { ...file, target: text(file.target), results: file.results as EvidenceEntry[] };
}

function analysisOf(report: AuditReport | undefined, packId: string, ruleId: string, fixStatus: string | undefined): EvidenceAnalysis | undefined {
  const rule = report?.rules.find((item) => item.packId === packId && item.ruleId === ruleId);
  if (!report || !rule) return undefined;
  return {
    status: rule.status,
    method: rule.method,
    candidate_count: rule.candidateCount,
    locations: rule.locations.slice(0, MAX_ANALYSIS_LOCATIONS).map((location) => `${location.file}:${location.line}`),
    analyzed_at: report.generatedAt,
    tool: `${report.toolName} ${report.toolVersion}`,
    ruleset_version: report.rulesetVersion,
    ...(fixStatus ? { fix_status: fixStatus } : {}),
  };
}

/**
 * Create or update the evidence for `packs`. A review is kept while its pack version and rule digest
 * still match; otherwise the entry starts over as `pending`, with the old review under `superseded`.
 * Entries of packs not in `packs` are left as they are, so emergency and baseline reviews can be run
 * separately against one file. The automatic result of `report` is attached to each entry.
 */
export function updateEvidence(packs: SecurityPack[], existing: EvidenceFile | undefined, target: string, report?: AuditReport): EvidenceUpdate {
  if (!target.trim()) throw new Error('An evidence target (service and environment) is required');
  if (existing && existing.target && existing.target !== target) {
    throw new Error(`The evidence file is for "${existing.target}", not "${target}"`);
  }
  const selected = new Set(packs.map((pack) => pack.id));
  const previous = new Map<string, EvidenceEntry>();
  for (const entry of existing?.results ?? []) {
    if (entry && typeof entry === 'object') previous.set(label(text(entry.pack_id), text(entry.rule_id)), entry);
  }
  const added: string[] = [];
  const invalidated: string[] = [];
  const results: EvidenceEntry[] = [];
  for (const pack of packs) {
    for (const rule of pack.rules) {
      const key = label(pack.id, rule.id);
      const digest = ruleDigest(rule);
      const old = previous.get(key);
      previous.delete(key);
      const analysis = analysisOf(report, pack.id, rule.id, rule.fixStatus);
      const current = old && old.pack_version === pack.version && old.rule_sha256 === digest;
      if (current) {
        results.push({ ...old, title: rule.title, ...(analysis ? { analysis } : {}) });
        continue;
      }
      if (old) invalidated.push(key);
      else added.push(key);
      const reviewed = old && text(old.status) !== '' && text(old.status) !== 'pending';
      results.push({
        pack_id: pack.id,
        pack_version: pack.version,
        rule_id: rule.id,
        rule_sha256: digest,
        status: 'pending',
        evidence: [],
        checked_at: '',
        reviewer: '',
        reason: '',
        title: rule.title,
        ...(analysis ? { analysis } : {}),
        ...(old && reviewed ? {
          superseded: { pack_version: text(old.pack_version), rule_sha256: text(old.rule_sha256), status: text(old.status), checked_at: text(old.checked_at), reviewer: text(old.reviewer) },
        } : {}),
      });
    }
  }
  const removed: string[] = [];
  for (const [key, entry] of previous) {
    if (selected.has(text(entry.pack_id))) removed.push(key);
    else results.push(entry);
  }
  const { results: _ignored, target: _target, ...rest } = existing ?? { results: [], target };
  return { evidence: { ...rest, target, results }, added, invalidated, removed };
}

export interface EvidenceCheck {
  /** Reasons the evidence does not satisfy the packs; empty when it does. Same rules as `rules.py check`. */
  failures: string[];
  /**
   * Passing reviews the current analysis disagrees with: a data flow or a missing ownership check
   * was found where the item is marked `pass`. Not failures (a reviewer may have judged the finding),
   * but they should be looked at again.
   */
  warnings: string[];
}

function parseTime(value: unknown): number | undefined {
  // An offset (Z or ±hh:mm) is required, as Python's fromisoformat with tzinfo is.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : time;
}

/** Whether the evidence satisfies every rule of `packs` for `target`, as `rules.py check` decides it. */
export function checkEvidence(packs: SecurityPack[], evidence: EvidenceFile, target: string, now = new Date(), report?: AuditReport): EvidenceCheck {
  if (!target.trim() || evidence.target !== target) return { failures: ['evidence target mismatch'], warnings: [] };
  if (!Array.isArray(evidence.results)) return { failures: ['results must be an array'], warnings: [] };
  const failures: string[] = [];
  const warnings: string[] = [];
  const index = new Map<string, EvidenceEntry>();
  for (const item of evidence.results) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      failures.push('invalid evidence entry');
      continue;
    }
    const key = label(text(item.pack_id), text(item.rule_id));
    if (index.has(key)) failures.push(`duplicate evidence: ${key}`);
    index.set(key, item);
  }
  for (const pack of packs) {
    for (const rule of pack.rules) {
      const key = label(pack.id, rule.id);
      const item = index.get(key);
      if (!item || item.pack_version !== pack.version || item.rule_sha256 !== ruleDigest(rule)) {
        failures.push(`${key}: missing or outdated evidence`);
        continue;
      }
      if (item.status !== 'pass' && item.status !== 'not_applicable') {
        failures.push(`${key}: review incomplete (${String(item.status)})`);
        continue;
      }
      const links = item.evidence as unknown;
      if (!Array.isArray(links) || links.length === 0 || !links.every((link) => typeof link === 'string' && link.trim())) {
        failures.push(`${key}: evidence references required`);
      }
      if (!text(item.reviewer).trim()) failures.push(`${key}: reviewer required`);
      if (item.status === 'not_applicable' && !text(item.reason).trim()) failures.push(`${key}: non-applicability reason required`);
      const checked = parseTime(item.checked_at);
      if (checked === undefined || checked > now.getTime() || now.getTime() - checked > EVIDENCE_MAX_AGE_DAYS * 86400000) {
        failures.push(`${key}: checked_at must be within the last ${EVIDENCE_MAX_AGE_DAYS} days with timezone`);
      }
      const found = report?.rules.find((entry) => entry.packId === pack.id && entry.ruleId === rule.id);
      if (item.status === 'pass' && found && (found.status === 'flow_detected' || found.status === 'owner_check_missing')) {
        warnings.push(`${key}: marked pass, but the analysis found ${found.candidateCount} (${found.status})`);
      }
    }
  }
  return { failures, warnings };
}
