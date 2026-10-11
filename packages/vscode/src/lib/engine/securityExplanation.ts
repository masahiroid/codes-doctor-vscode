declare const CODE_DOCTOR_ENGINE_POLICY: typeof import('./policy');
export function securityExplanation(score: number, grade: string, summary: Record<'critical' | 'high' | 'medium' | 'low' | 'info', number>, totalFiles: number) {
  const total = summary.critical + summary.high + summary.medium + summary.low + summary.info;
  const title = `セキュリティスコア${score}点（グレード${grade}）: `;
  if (totalFiles === 0) return title + '解析対象ファイルがありません。安全性は評価できません。';
  if (total === 0) return title + '検出ルールに該当する指摘はありません。安全性を保証するものではありません。';
  const counts = `指摘${total}件（Critical: ${summary.critical}件、High: ${summary.high}件、Medium: ${summary.medium}件、Low: ${summary.low}件、Info: ${summary.info}件）。`;
  const action = summary.critical > 0 ? 'Criticalの指摘を優先して確認してください。' : summary.high > 0 ? 'Highの指摘を優先して確認してください。' : '各指摘の影響と対応の必要性を確認してください。';
  return title + counts + action + `静的検出による候補のため、実コードで確認が必要です。採点上限はCriticalあり${CODE_DOCTOR_ENGINE_POLICY.securityCaps.critical}点、Highあり${CODE_DOCTOR_ENGINE_POLICY.securityCaps.high}点、Mediumあり${CODE_DOCTOR_ENGINE_POLICY.securityCaps.medium}点、その他の指摘あり${CODE_DOCTOR_ENGINE_POLICY.securityCaps.other}点です。`;
}

module.exports = { securityExplanation };
