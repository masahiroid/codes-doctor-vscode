import type { AnalysisResult } from '../../types';

const SBOM_COMPONENT_TABLE_ROW_LIMIT = 50;
const VULNERABILITY_TABLE_ROW_LIMIT = 60;

export function generateSBOMSection(result: AnalysisResult): string {
  if (!result.sbom || !result.sbom.components.length) return '';
  const total = result.sbom.components.length;
  const direct = result.sbom.components.filter((component) => !component.isTransitive).length;
  const transitive = result.sbom.components.filter((component) => component.isTransitive).length;
  const dev = result.sbom.components.filter((component) => component.isDev).length;
  const hidden = Math.max(0, total - SBOM_COMPONENT_TABLE_ROW_LIMIT);
  return `
  <section>
    <h2>SBOM (Software Bill of Materials)</h2>
    <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 6px; text-align: center;">
          <div style="font-size: 1.8em; font-weight: bold;">${total}</div>
          <div style="font-size: 0.85em; opacity: 0.9;">総依存関係</div>
        </div>
        <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 15px; border-radius: 6px; text-align: center;">
          <div style="font-size: 1.8em; font-weight: bold;">${direct}</div>
          <div style="font-size: 0.85em; opacity: 0.9;">直接依存</div>
        </div>
        <div style="background: linear-gradient(135deg, #0ea5e9 0%, #22d3ee 100%); color: white; padding: 15px; border-radius: 6px; text-align: center;">
          <div style="font-size: 1.8em; font-weight: bold;">${transitive}</div>
          <div style="font-size: 0.85em; opacity: 0.9;">推移的依存</div>
        </div>
        <div style="background: linear-gradient(135deg, #22c55e 0%, #06d6a0 100%); color: white; padding: 15px; border-radius: 6px; text-align: center;">
          <div style="font-size: 1.8em; font-weight: bold;">${dev}</div>
          <div style="font-size: 0.85em; opacity: 0.9;">開発依存</div>
        </div>
      </div>

      <h3 style="margin-top: 20px; margin-bottom: 15px; color: #374151;">依存関係一覧</h3>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
          <thead>
            <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">パッケージ名</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">バージョン</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">タイプ</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">種別</th>
            </tr>
          </thead>
          <tbody>
            ${result.sbom.components.slice(0, SBOM_COMPONENT_TABLE_ROW_LIMIT).map((component) => `<tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; color: #1f2937;"><code style="background: #f3f4f6; padding: 3px 6px; border-radius: 3px; font-size: 0.85em;">${component.name}</code></td>
              <td style="padding: 12px; color: #6b7280; font-family: monospace;">${component.version}</td>
              <td style="padding: 12px; color: #6b7280;">${component.type}</td>
              <td style="padding: 12px; text-align: center;">${component.isDev
                ? '<span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 3px; font-size: 0.8em;">Dev</span>'
                : `<span style="background: ${component.isTransitive ? '#dbeafe' : '#d1fae5'}; color: ${component.isTransitive ? '#1e40af' : '#065f46'}; padding: 4px 8px; border-radius: 3px; font-size: 0.8em;">${component.isTransitive ? '推移的' : '直接'}</span>`}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${hidden > 0 ? `<p style="margin-top: 15px; color: #6b7280; text-align: center; font-size: 0.9em;">他 ${hidden} 件を除外表示</p>` : ''}
      </div>

      <div style="margin-top: 20px; padding: 15px; background: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 4px;">
        <div style="font-weight: 600; color: #15803d; margin-bottom: 8px;">SBOMについて</div>
        <p style="margin: 0; font-size: 0.9em; color: #166534; line-height: 1.6;">
          SBOM は依存関係の一覧です。ソフトウェア名・バージョンを含めて監査し、脆弱性管理に活用できます。<br>
          生成ツール: ${result.sbom.metadata.toolName || 'Code Doctor'} ${result.sbom.metadata.toolVersion ? `v${result.sbom.metadata.toolVersion}` : ''} / 形式: ${result.sbom.format} ${result.sbom.version}<br>
          Trivyバージョン: ${result.sbom.metadata.trivyVersion ? `v${result.sbom.metadata.trivyVersion}` : '未検出'}
        </p>
      </div>
    </div>
  </section>`;
}

export function generateVulnerabilityScanSection(result: AnalysisResult): string {
  const scan = result.vulnerabilityScan;
  if (!scan) return '';

  const sevStyle = (severity: string): string => {
    switch (severity) {
      case 'critical': return 'background:#dc2626;color:#fff;';
      case 'high': return 'background:#d97706;color:#fff;';
      case 'medium': return 'background:#2563eb;color:#fff;';
      case 'low': return 'background:#059669;color:#fff;';
      default: return 'background:#6b7280;color:#fff;';
    }
  };

  const formatCVE = (v: any): string => {
    const cveId = v.cveId || '';
    const url = v.url || '';
    if (cveId && url) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
        ${cveId}
      </a>`;
    } else if (cveId) {
      const cvePattern = /CVE-\d{4}-\d{4,7}/gi;
      const match = v.title.match(cvePattern);
      if (match && match.length > 0) {
        const cveUpper = match[0].toUpperCase();
        return `<a href="https://nvd.nist.gov/vuln/detail/${cveUpper}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          ${cveUpper}
        </a>`;
      }
      return `<span style="color: #6b7280;">${cveId}</span>`;
    }
    return '<span style="color: #9ca3af;">-</span>';
  };

  return `
  <section>
    <h2>脆弱性スキャン</h2>
    <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px;">
        <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 15px; border-radius: 6px; text-align: center;"><div style="font-size: 1.8em; font-weight: bold;">${scan.critical}</div><div style="font-size: 0.85em; opacity: 0.9;">Critical</div></div>
        <div style="background: linear-gradient(135deg, #f97316 0%, #d97706 100%); color: white; padding: 15px; border-radius: 6px; text-align: center;"><div style="font-size: 1.8em; font-weight: bold;">${scan.high}</div><div style="font-size: 0.85em; opacity: 0.9;">High</div></div>
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 15px; border-radius: 6px; text-align: center;"><div style="font-size: 1.8em; font-weight: bold;">${scan.moderate}</div><div style="font-size: 0.85em; opacity: 0.9;">Moderate</div></div>
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px; border-radius: 6px; text-align: center;"><div style="font-size: 1.8em; font-weight: bold;">${scan.low}</div><div style="font-size: 0.85em; opacity: 0.9;">Low</div></div>
      </div>

      <div style="padding: 15px; background: ${scan.totalVulnerabilities > 0 ? '#fef2f2' : '#f0fdf4'}; border-left: 4px solid ${scan.totalVulnerabilities > 0 ? '#dc2626' : '#16a34a'}; border-radius: 4px; margin-bottom: 20px;">
        <div style="font-weight: 600; color: ${scan.totalVulnerabilities > 0 ? '#991b1b' : '#166534'}; margin-bottom: 5px;">${scan.totalVulnerabilities > 0 ? `${scan.totalVulnerabilities}件の脆弱性が検出されました` : '脆弱性は検出されませんでした'}</div>
        <p style="margin: 0; font-size: 0.9em; color: ${scan.totalVulnerabilities > 0 ? '#7f1d1d' : '#166534'}; line-height: 1.6;">Critical: ${scan.critical}件, High: ${scan.high}件, Moderate: ${scan.moderate}件, Low: ${scan.low}件<br>修正可能パッケージ: ${scan.fixable}件 / Source: ${scan.source}</p>
      </div>

      ${scan.vulnerabilities.length ? `<h3 style="margin-top: 20px; margin-bottom: 15px; color: #374151;">脆弱性の詳細</h3>
      <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85em;">
        <thead>
          <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
            <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">パッケージ</th>
            <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">現在のバージョン</th>
            <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">修正バージョン</th>
            <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">CVE ID</th>
            <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">重大度</th>
          </tr>
        </thead>
        <tbody>
          ${scan.vulnerabilities.slice(0, VULNERABILITY_TABLE_ROW_LIMIT).map((v) => `<tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px; color: #1f2937;"><code style="background: #f3f4f6; padding: 3px 6px; border-radius: 3px; font-size: 0.9em;">${v.packageName}</code></td>
            <td style="padding: 12px; color: #6b7280; font-family: monospace; font-size: 0.9em;">${v.currentVersion || v.affectedRange || '-'}</td>
            <td style="padding: 12px; color: #059669; font-family: monospace; font-size: 0.9em; font-weight: 500;">${v.fixedVersions || (v.fixable ? '利用可能' : '-')}</td>
            <td style="padding: 12px; color: #1f2937; white-space: nowrap;">${formatCVE(v)}</td>
            <td style="padding: 12px; text-align: center;"><span style="${sevStyle(v.severity)} padding: 4px 8px; border-radius: 3px; font-size: 0.8em; font-weight: 600;">${v.severity.toUpperCase()}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>` : ''}

      <div style="margin-top: 20px; padding: 15px; background: #eff6ff; border-left: 4px solid #2563eb; border-radius: 4px;">
        <div style="font-weight: 600; color: #1e40af; margin-bottom: 8px;">脆弱性スキャンについて</div>
        <p style="margin: 0; font-size: 0.9em; color: #1e3a8a; line-height: 1.6;">${scan.source === 'trivy' ? 'Trivy を使用して脆弱性をスキャンしています。' : 'npm audit を使用して脆弱性をスキャンしています。'}<br>CVE ID は脆弱性データベース（NVD、Aqua Security等）にリンクしており、クリックすると詳細情報が表示されます。</p>
      </div>
    </div>
  </section>`;
}