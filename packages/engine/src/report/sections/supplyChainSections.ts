import type { AnalysisResult } from '../../types';
import { escapeHtml } from '../../html';
import { badge, countCard, filterableTable, notice, panel, section, severityTone, stat, table } from '../ui';

const SBOM_COMPONENT_TABLE_ROW_LIMIT = 50;
const VULNERABILITY_TABLE_ROW_LIMIT = 60;

const VULN_SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  moderate: 2,
  low: 3,
};
const NVD_DETAIL_URL = 'https://nvd.nist.gov/vuln/detail/';
const CVE_PATTERN = /CVE-\d{4}-\d{4,7}/i;

const EXTERNAL_LINK_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

type Vulnerability = NonNullable<AnalysisResult['vulnerabilityScan']>['vulnerabilities'][number];

function cveLink(id: string, url: string): string {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${EXTERNAL_LINK_ICON} ${escapeHtml(id)}</a>`;
}

/** A CVE identifier, linked to the scanner's advisory or to NVD. */
function formatCve(vulnerability: Vulnerability): string {
  const cveId = vulnerability.cveId || '';
  if (cveId && vulnerability.url) return cveLink(cveId, vulnerability.url);
  const match = CVE_PATTERN.exec(vulnerability.title ?? '');
  if (match) return cveLink(match[0].toUpperCase(), NVD_DETAIL_URL + match[0].toUpperCase());
  return cveId ? `<span class="muted">${escapeHtml(cveId)}</span>` : '<span class="muted">-</span>';
}

function dependencyKind(component: NonNullable<AnalysisResult['sbom']>['components'][number]): string {
  if (component.isDev) return badge('Dev', 'butter');
  return component.isTransitive ? badge('推移的', 'sky') : badge('直接', 'mint');
}

export function generateSBOMSection(result: AnalysisResult): string {
  if (!result.sbom?.components.length) return '';
  const { components, metadata } = result.sbom;
  const total = components.length;
  const direct = components.filter((component) => !component.isTransitive).length;
  const transitive = components.filter((component) => component.isTransitive).length;
  const dev = components.filter((component) => component.isDev).length;
  const hidden = Math.max(0, total - SBOM_COMPONENT_TABLE_ROW_LIMIT);
  const rows = components.slice(0, SBOM_COMPONENT_TABLE_ROW_LIMIT).map((component) => `<tr>
    <td><code>${escapeHtml(component.name)}</code></td>
    <td class="mono muted">${escapeHtml(component.version)}</td>
    <td class="muted">${escapeHtml(component.type)}</td>
    <td>${dependencyKind(component)}</td>
  </tr>`);
  const toolVersion = metadata.toolVersion ? ' v' + metadata.toolVersion : '';
  const trivyVersion = metadata.trivyVersion ? 'v' + metadata.trivyVersion : '未検出';
  const about = `<p>SBOM は依存関係の一覧です。ソフトウェア名・バージョンを含めて監査し、脆弱性管理に活用できます。<br>
      生成ツール: ${escapeHtml(metadata.toolName || 'Codes Doctor')}${escapeHtml(toolVersion)} / 形式: ${escapeHtml(result.sbom.format)} ${escapeHtml(result.sbom.version)}<br>
      Trivyバージョン: ${escapeHtml(trivyVersion)}</p>`;

  return section('SBOM (Software Bill of Materials)', `
    <div class="stats panel glass">
      ${stat('総依存関係', total)}
      ${stat('直接依存', direct, { tone: 'mint' })}
      ${stat('推移的依存', transitive, { tone: 'sky' })}
      ${stat('開発依存', dev, { tone: 'butter' })}
    </div>
    ${panel(table(['パッケージ名', 'バージョン', 'タイプ', '依存の種類'], rows, { more: hidden > 0 ? '他 ' + hidden + ' 件を除外表示' : undefined }), { title: '依存関係一覧' })}
    ${notice('mint', 'SBOM の説明', about)}`);
}

export function generateVulnerabilityScanSection(result: AnalysisResult): string {
  const scan = result.vulnerabilityScan;
  if (!scan) return '';

  const status = scan.totalVulnerabilities > 0
    ? notice('rose', `${scan.totalVulnerabilities}件の脆弱性が検出されました`, `<p>修正可能パッケージ: ${scan.fixable}件 / Source: ${escapeHtml(scan.source)}</p>`)
    : notice('mint', '脆弱性は検出されませんでした', `<p>Source: ${escapeHtml(scan.source)}</p>`);
  const sortedVulns = [...scan.vulnerabilities].sort((a, b) => {
    const diff = (VULN_SEVERITY_ORDER[a.severity] ?? 99) - (VULN_SEVERITY_ORDER[b.severity] ?? 99);
    if (diff !== 0) return diff;
    return a.packageName.localeCompare(b.packageName);
  });

  const vulnCounts: Record<string, number> = { critical: 0, high: 0, moderate: 0, low: 0 };
  for (const v of sortedVulns) {
    vulnCounts[v.severity] = (vulnCounts[v.severity] || 0) + 1;
  }

  const rows = sortedVulns.map((vulnerability, index) => {
    const isHidden = index >= VULNERABILITY_TABLE_ROW_LIMIT;
    const hideAttr = isHidden ? ' style="display:none;"' : '';
    return `<tr data-severity="${escapeHtml(vulnerability.severity)}"${hideAttr}>
      <td><code>${escapeHtml(vulnerability.packageName)}</code></td>
      <td class="mono muted">${escapeHtml(vulnerability.currentVersion || vulnerability.affectedRange || '-')}</td>
      <td class="mono">${escapeHtml(vulnerability.fixedVersions || (vulnerability.fixable ? '利用可能' : '-'))}</td>
      <td>${formatCve(vulnerability)}</td>
      <td>${badge(vulnerability.severity, severityTone(vulnerability.severity), { upper: true })}</td>
    </tr>`;
  });
  const scanner = scan.source === 'trivy' ? 'Trivy を使用して脆弱性をスキャンしています。' : 'npm audit を使用して脆弱性をスキャンしています。';
  const about = `<p>${scanner}<br>CVE ID は脆弱性データベース（NVD、Aqua Security等）にリンクしており、クリックすると詳細情報が表示されます。</p>`;

  const tablePanel = rows.length
    ? panel(
        filterableTable(['パッケージ', '現在のバージョン', '修正バージョン', 'CVE ID', '重大度'], rows, {
          filterId: 'dependency-vulnerabilities',
          limit: VULNERABILITY_TABLE_ROW_LIMIT,
          severities: [
            { id: 'critical', label: 'Critical', count: vulnCounts.critical, tone: 'rose' },
            { id: 'high', label: 'High', count: vulnCounts.high, tone: 'peach' },
            { id: 'moderate', label: 'Moderate', count: vulnCounts.moderate, tone: 'butter' },
            { id: 'low', label: 'Low', count: vulnCounts.low, tone: 'sky' },
          ],
        }),
        { title: '脆弱性の詳細' }
      )
    : '';

  return section('脆弱性スキャン', `
    ${countCard('重要度別分布', [
      { label: 'Critical', count: scan.critical, tone: 'rose' },
      { label: 'High', count: scan.high, tone: 'peach' },
      { label: 'Moderate', count: scan.moderate, tone: 'butter' },
      { label: 'Low', count: scan.low, tone: 'sky' },
    ], { empty: '既知の脆弱性なし' })}
    ${status}
    ${tablePanel}
    ${notice('sky', '脆弱性スキャンについて', about)}`);
}
