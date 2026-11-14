import { csvCell } from './audit';
import type { AuditReport } from './audit';
import type { EvidenceEntry, EvidenceFile } from './evidence';
import { buildXlsx } from './xlsx';
import type { Cell, Sheet } from './xlsx';

/**
 * The management sheet for submitting an advisory check: one row per rule with the automatic result
 * and the review recorded in the evidence file. Labels are Japanese here; the English engine build
 * translates them like the rest of the engine's text.
 */

const REVIEW_LABELS: Record<string, string> = {
  pending: '未着手',
  in_progress: '対応中',
  pass: '合格',
  fail: '要対応',
  not_applicable: '対象外',
};
const MANUALLY_VERIFIED = '手動確認済み';

const ANALYSIS_LABELS: Record<string, string> = {
  flow_detected: '入力の到達あり',
  no_flow_detected: '到達なし（安全の証明ではない）',
  owner_check_missing: '所有者照合なし',
  no_owner_check_missing: '所有者照合なしの箇所なし',
  review_required: '要確認箇所あり',
  manual_check_required: '手動確認',
  no_target_files: '対象ファイルなし',
  not_evaluated: '未評価',
};

const METHOD_LABELS: Record<string, string> = {
  dataflow: 'データフロー',
  access: '認可（BOLA）',
  pattern: 'パターン',
  manual: '手動',
};

const HEADER = ['分類', 'パック', 'ルールID', '項目名', '重要度', '管理表の列', '判定方法', '自動判定', '件数', '対象ファイル・行', '点検ステータス', '是正要否', '担当者', '点検日時', '証跡', '備考'];
const WIDTHS = [28, 22, 30, 36, 10, 24, 14, 24, 8, 40, 14, 12, 16, 22, 36, 30];
const LOCATION_HEADER = ['ルールID', '項目名', 'ファイル', '行', '入力元', '到達先', '到達先のファイル'];
const SHEET_NAMES = { results: '点検結果', locations: '検出箇所' };
const NEEDS_ACTION = new Set(['flow_detected', 'owner_check_missing']);
const NO_ACTION = '不要';
const TO_CONFIRM = '要確認';

function reviewLabel(entry: EvidenceEntry | undefined, method: string): string {
  if (!entry) return REVIEW_LABELS.pending;
  if (entry.status === 'pass' && method === 'manual') return MANUALLY_VERIFIED;
  return REVIEW_LABELS[entry.status] ?? entry.status;
}

/** Whether the item needs fixing: the rule's own wording when it does, otherwise "none" or "to confirm". */
function actionLabel(rule: AuditReport['rules'][number], entry: EvidenceEntry | undefined): string {
  if (entry?.status === 'fail' || NEEDS_ACTION.has(rule.status)) return rule.actionRequired;
  if (entry?.status === 'pass' || entry?.status === 'not_applicable') return NO_ACTION;
  return TO_CONFIRM;
}

export function submissionRows(report: AuditReport, evidence?: EvidenceFile): Cell[][] {
  const entries = new Map((evidence?.results ?? []).map((entry) => [`${entry.pack_id}/${entry.rule_id}`, entry]));
  return [HEADER, ...report.rules.map((rule): Cell[] => {
    const entry = entries.get(`${rule.packId}/${rule.ruleId}`);
    // An entry for another pack version or rule content is not this rule's review.
    const current = entry && entry.pack_version === rule.packVersion && entry.rule_sha256 === rule.ruleSha256 ? entry : undefined;
    return [
      rule.category, `${rule.packId} ${rule.packVersion}`, rule.ruleId, rule.title, rule.severity, rule.excelColumn,
      METHOD_LABELS[rule.method] ?? rule.method, ANALYSIS_LABELS[rule.status] ?? rule.status, rule.candidateCount,
      rule.locations.map((location) => `${location.file}:${location.line}`).join('\n'),
      reviewLabel(current, rule.method), actionLabel(rule, current), current?.reviewer ?? '', current?.checked_at ?? '',
      (current?.evidence ?? []).join('\n'), current?.reason ?? '',
    ];
  })];
}

function locationRows(report: AuditReport): Cell[][] {
  return [LOCATION_HEADER, ...report.rules.flatMap((rule) => rule.locations.map((location): Cell[] => {
    const flow = location as { source?: string; sink?: string; sourceLine?: number; sinkFile?: string; sinkLine?: number };
    return [
      rule.ruleId, rule.title, location.file, location.line,
      flow.source ? `${flow.sourceLine ?? ''}: ${flow.source}` : '', flow.sink ?? '',
      flow.sinkFile ? `${flow.sinkFile}:${flow.sinkLine ?? ''}` : '',
    ];
  }))];
}

/** The management sheet as CSV (UTF-8 with BOM for Excel). Cells that would run as formulas are escaped. */
export function submissionCsv(report: AuditReport, evidence?: EvidenceFile): string {
  const lines = submissionRows(report, evidence).map((row) => row.map(csvCell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** The management sheet and the detected locations as an Excel workbook. */
export function submissionXlsx(report: AuditReport, evidence?: EvidenceFile): Buffer {
  // Text that starts like a formula keeps the same escape as the CSV, so a copy into another sheet stays inert.
  const inert = (rows: Cell[][]) => rows.map((row) => row.map((cell) => (typeof cell === 'string' && /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell)));
  const sheets: Sheet[] = [
    { name: SHEET_NAMES.results, rows: inert(submissionRows(report, evidence)), widths: WIDTHS },
    { name: SHEET_NAMES.locations, rows: inert(locationRows(report)), widths: [30, 36, 40, 8, 50, 50, 40] },
  ];
  return buildXlsx(sheets);
}
