import path from 'node:path';
import type { AnalysisResult } from '../../types';
import { isThinOrchestrationModule } from '../../analyzer/moduleClassification';
import { LANGUAGES } from '../../analyzer/languages/catalog';
import { escapeHtml, scriptJson } from '../../html';

/** Instability above this is reported as "unstable" in the report table */
const UNSTABLE_INSTABILITY_THRESHOLD = 0.8;
/** Instability at or below this is reported as "stable" */
const STABLE_INSTABILITY_THRESHOLD = 0.5;

/** Row count caps for large tables in the report */
const GOD_CLASS_TABLE_ROW_LIMIT = 30;
const MODULE_METRICS_TABLE_ROW_LIMIT = 30;

/** Histogram bin upper bounds for the God Class score distribution chart */
const GOD_SCORE_HISTOGRAM_BINS = [20, 40, 60, 80];

/** Histogram bin upper bounds (lines of code) for the file-size distribution chart */
const FILE_SIZE_HISTOGRAM_BINS = [100, 300, 500, 1000];

/** File path display truncation length in the module metrics table */
const MODULE_PATH_DISPLAY_MAX_LENGTH = 50;

/** Comma-separated list of supported language names, for the "no supported files found" banner. */
const SUPPORTED_LANGUAGE_NAMES = LANGUAGES.map((language) => language.label).join('、');

export function summarySection(result: AnalysisResult): string {
  const critical = result.godClasses.filter((godClass) => godClass.rank === 'critical').length;
  const noSupportedFiles = result.summary.totalFiles === 0;
  const techDebtScore = result.technicalDebt?.overallScore || 0;
  const techDebtGrade = result.technicalDebt?.grade || 'N/A';
  const techDebtCritical = result.technicalDebt?.issues?.critical || 0;
  const techDebtHigh = result.technicalDebt?.issues?.high || 0;
  const techDebtIssues = techDebtCritical + techDebtHigh;
  const securityScore = result.securityScore?.overallScore || 0;
  const securityGrade = result.securityScore?.grade || 'N/A';
  const securityCritical = result.securityScore?.summary?.critical || 0;
  const securityHigh = result.securityScore?.summary?.high || 0;
  const securityIssues = securityCritical + securityHigh;
  const sbomVulnCritical = result.vulnerabilityScan?.critical || 0;
  const sbomVulnHigh = result.vulnerabilityScan?.high || 0;
  const sbomVulnIssues = sbomVulnCritical + sbomVulnHigh;

  const noFilesBanner = noSupportedFiles
    ? `
    <div class="box" style="border-left-color: #dc2626; background: #fef2f2; margin-bottom: 20px;">
      <div style="font-weight: 600; margin-bottom: 6px; color: #991b1b;">対応言語のファイルが見つかりませんでした</div>
      <div style="color: #7f1d1d;">
        このワークスペースには、現在対応している言語（${SUPPORTED_LANGUAGE_NAMES}）のファイルがありませんでした。
        以下のスコアは「問題なし」ではなく「解析対象がなかった」ことを示しています。未対応の言語を使用している可能性があります。
      </div>
    </div>`
    : '';

  const techDebtScoreDisplay = noSupportedFiles ? 'N/A' : `${techDebtScore}/100`;
  const techDebtGradeDisplay = noSupportedFiles ? '—' : `Grade: ${techDebtGrade}`;
  const securityScoreDisplay = noSupportedFiles ? 'N/A' : `${securityScore}/100`;
  const securityGradeDisplay = noSupportedFiles ? '—' : `Grade: ${securityGrade}`;

  return `
  <section>
    <h2>概要</h2>
    ${noFilesBanner}
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
      <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; text-align: center;">
        <div style="color: #6b7280; font-size: 0.9em; margin-bottom: 8px;">総ファイル数</div>
        <div style="font-size: 2.5em; font-weight: bold; color: #1f2937;">${result.summary.totalFiles}</div>
      </div>
      <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; text-align: center;">
        <div style="color: #6b7280; font-size: 0.9em; margin-bottom: 8px;">総クラス数</div>
        <div style="font-size: 2.5em; font-weight: bold; color: #1f2937;">${result.summary.totalClasses}</div>
      </div>
      <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; text-align: center;">
        <div style="color: #6b7280; font-size: 0.9em; margin-bottom: 8px;">クリティカル</div>
        <div style="font-size: 2.5em; font-weight: bold; color: #dc2626;">${critical}</div>
      </div>
      <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; text-align: center;">
        <div style="color: #6b7280; font-size: 0.9em; margin-bottom: 8px;">平均 GOD スコア</div>
        <div style="font-size: 2.5em; font-weight: bold; color: #1f2937;">${result.summary.avgGodScore}</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 25px; color: white; text-align: center;">
        <div style="color: rgba(255,255,255,0.9); font-size: 0.9em; margin-bottom: 8px;">技術負債スコア</div>
        <div style="font-size: 2.5em; font-weight: bold;">${techDebtScoreDisplay}</div>
        <div style="font-size: 1.5em; margin-top: -10px;">${techDebtGradeDisplay}</div>
      </div>
      <div style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); border-radius: 8px; padding: 25px; color: white; text-align: center;">
        <div style="color: rgba(255,255,255,0.9); font-size: 0.9em; margin-bottom: 8px;">検出課題 (TECH DEBT)</div>
        <div style="font-size: 2.5em; font-weight: bold;">${techDebtIssues}</div>
        <div style="font-size: 1.05em; margin-top: 5px;">Critical ${techDebtCritical} / High ${techDebtHigh}</div>
      </div>
      <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 8px; padding: 25px; color: white; text-align: center;">
        <div style="color: rgba(255,255,255,0.9); font-size: 0.9em; margin-bottom: 8px;">セキュリティスコア</div>
        <div style="font-size: 2.5em; font-weight: bold;">${securityScoreDisplay}</div>
        <div style="font-size: 1.5em; margin-top: -10px;">${securityGradeDisplay}</div>
      </div>
      <div style="background: linear-gradient(135deg, #30cfd0 0%, #330867 100%); border-radius: 8px; padding: 25px; color: white; text-align: center;">
        <div style="color: rgba(255,255,255,0.9); font-size: 0.9em; margin-bottom: 8px;">セキュリティ課題</div>
        <div style="font-size: 2.5em; font-weight: bold;">${securityIssues}</div>
        <div style="font-size: 1.05em; margin-top: 5px;">Critical ${securityCritical} / High ${securityHigh}</div>
      </div>
      <div style="background: linear-gradient(135deg, #ef4444 0%, #f97316 100%); border-radius: 8px; padding: 25px; color: white; text-align: center;">
        <div style="color: rgba(255,255,255,0.9); font-size: 0.9em; margin-bottom: 8px;">SBOM 脆弱性 (Critical+High)</div>
        <div style="font-size: 2.5em; font-weight: bold;">${sbomVulnIssues}</div>
        <div style="font-size: 1.05em; margin-top: 5px;">Critical ${sbomVulnCritical} / High ${sbomVulnHigh}</div>
      </div>
    </div>
  </section>`;
}

export function godClassSection(result: AnalysisResult): string {
  if (!result.godClasses.length) {
    return '<section><h2>God クラス ランキング</h2><div class="box">God クラスが見つかりません</div></section>';
  }

  const chartData = scriptJson(result.godClasses.map((godClass) => godClass.godScore));
  return `
  <section>
    <h2>God クラス ランキング</h2>
    <table>
      <thead><tr><th>#</th><th>クラス名</th><th>ファイル</th><th>メソッド</th><th>行数</th><th>インポート</th><th>スコア</th><th>ランク</th></tr></thead>
      <tbody>
        ${result.godClasses.slice(0, GOD_CLASS_TABLE_ROW_LIMIT).map((godClass, index) => `<tr>
          <td>${index + 1}</td><td><strong>${escapeHtml(godClass.className)}</strong></td><td>${escapeHtml(path.basename(godClass.filePath))}</td><td>${godClass.methodCount}</td><td>${godClass.lineCount}</td><td>${godClass.importCount}</td><td>${godClass.godScore}</td><td>${godClass.rank}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="box">
      <h3>God Class スコア分布</h3>
      <canvas id="godClassHistogramChart" height="120"></canvas>
    </div>
    <script>
      (function(){
        const classes = ${chartData};
        const bins = ${scriptJson(GOD_SCORE_HISTOGRAM_BINS)};
        const ranges = bins.map((upper, i) => (i === 0 ? '0' : bins[i - 1] + 1) + '-' + upper).concat((bins[bins.length - 1] + 1) + '-100');
        const counts = new Array(bins.length + 1).fill(0);
        classes.forEach(score => {
          const idx = bins.findIndex(upper => score <= upper);
          counts[idx === -1 ? bins.length : idx]++;
        });
        new Chart(document.getElementById('godClassHistogramChart'), {
          type: 'bar',
          data: { labels: ranges, datasets: [{ data: counts, backgroundColor: 'rgba(59,130,246,.7)' }] },
          options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        });
      })();
    </script>
  </section>`;
}

export function moduleMetricsSection(result: AnalysisResult): string {
  if (!result.moduleMetrics?.length) {
    return '<section><h2>モジュール結合度メトリクス</h2><div class="box">モジュールメトリクス情報がありません</div></section>';
  }

  const unstableCount = result.moduleMetrics.filter(
    (metric) => metric.instability > UNSTABLE_INSTABILITY_THRESHOLD && !isThinOrchestrationModule(metric)
  ).length;
  const thinOrchestrationCount = result.moduleMetrics.filter((metric) => isThinOrchestrationModule(metric)).length;
  const stableCount = result.moduleMetrics.filter((metric) => metric.instability <= STABLE_INSTABILITY_THRESHOLD).length;
  const avgStructural = result.moduleMetrics.reduce((sum, metric) => sum + metric.structuralScore, 0) / result.moduleMetrics.length;
  const bubble = scriptJson(result.moduleMetrics.map((metric) => {
    const pathPart = metric.filePath.includes('/') ? metric.filePath.split('/').slice(-2).join('/') : metric.filePath;
    // r = file size (lineCount), centrality is passed through for per-point color
    return { x: metric.fanOut, y: metric.fanIn, r: Math.max(3, Math.min(20, metric.lineCount / 30)), centrality: metric.centrality, label: `${metric.moduleName} (${pathPart})` };
  }));

  return `
  <section>
    <h2>モジュール結合度メトリクス</h2>
    <div class="cards">
      <div class="card"><div class="label">総モジュール数</div><div class="value">${result.moduleMetrics.length}</div></div>
      <div class="card"><div class="label">不安定モジュール</div><div class="value" style="color:var(--warning)">${unstableCount}</div></div>
      <div class="card"><div class="label">軽量入口モジュール</div><div class="value" style="color:#4f46e5">${thinOrchestrationCount}</div></div>
      <div class="card"><div class="label">安定モジュール</div><div class="value" style="color:var(--success)">${stableCount}</div></div>
      <div class="card"><div class="label">平均構造スコア</div><div class="value">${avgStructural.toFixed(1)}</div></div>
    </div>
    <div class="box" style="border-left-color:#4f46e5; margin-top: 14px;">
      <h3>評価の見方</h3>
      <ul style="padding-left:18px; margin-top:8px;">
        <li>軽量入口: 起動点・エントリーポイント・薄い中継モジュールです。Instability が高くても、それだけで悪い設計とは限りません。</li>
        <li>不安定: 依存先が多く変更の影響を受けやすい候補です。ただし、入口モジュールでは自然な場合があります。</li>
        <li>本当に注意すべきなのは、行数が多い、fan-out が高い、構造スコアが低い、呼び出しや依存が集中しているモジュールです。</li>
        <li>詳細な判断は下の構造レビューで、モジュール依存グラフ・関数呼び出しグラフ・God Class 分布をまとめて解釈します。</li>
      </ul>
    </div>
    <table>
      <thead><tr><th>モジュール</th><th>Fan-in</th><th>Fan-out</th><th>Centrality</th><th>Instability</th><th title="fan-in(参照数)・ファイルサイズ・安定性・中心性の合成値。&#10;エントリーポイントやサポートファイルは自然に低くなります。">構造スコア ⓘ</th><th>評価</th></tr></thead>
      <tbody>
        ${result.moduleMetrics.slice(0, MODULE_METRICS_TABLE_ROW_LIMIT).map((metric) => renderModuleMetricRow(metric)).join('')}
      </tbody>
    </table>
    <div class="box">
      <h3>可視化</h3>
      <div style="font-size:0.85em; color:#6b7280; margin-bottom:8px;">
        <strong>X軸</strong>: Fan-out（このモジュールが依存しているモジュール数）&nbsp;&#124;&nbsp;
        <strong>Y軸</strong>: Fan-in（このモジュールに依存しているモジュール数）&nbsp;&#124;&nbsp;
        <strong>円の大きさ</strong>: ファイルサイズ（行数）&nbsp;&#124;&nbsp;
        <strong>色の濃さ</strong>: 中心性（Centrality）&mdash; グラフ上の結節点の度合い
      </div>
      <canvas id="moduleMetricsChart" height="130"></canvas>
    </div>
    <script>
      (function(){
        const data = ${bubble};
        const bgColors = data.map(function(d) {
          const alpha = (0.15 + Math.min(d.centrality, 1) * 0.7).toFixed(2);
          return 'rgba(59,130,246,' + alpha + ')';
        });
        new Chart(document.getElementById('moduleMetricsChart'), {
          type: 'bubble',
          data: { datasets: [{ data, backgroundColor: bgColors }] },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              x: {
                beginAtZero: true,
                title: { display: true, text: 'Fan-out（依存出口数）', color: '#6b7280', font: { size: 11 } }
              },
              y: {
                beginAtZero: true,
                title: { display: true, text: 'Fan-in（依存入口数）', color: '#6b7280', font: { size: 11 } }
              }
            }
          }
        });
      })();
    </script>
  </section>`;
}

export function layerSection(result: AnalysisResult): string {
  if (!result.layerHeatmap?.layers?.length) return '';
  const layers = scriptJson(result.layerHeatmap.layers.map((layer) => escapeHtml(layer.name)));
  const matrix = scriptJson(result.layerHeatmap.matrix);
  return `
  <section>
    <h2>アーキテクチャレイヤー分析</h2>
    <table>
      <thead><tr><th>レイヤー名</th><th>ファイル数</th><th>クラス数</th><th>平均複雑度</th><th>依存先</th></tr></thead>
      <tbody>${result.layerHeatmap.layers.map((layer) => `<tr><td>${escapeHtml(layer.name)}</td><td>${layer.fileCount}</td><td>${layer.classCount}</td><td>${layer.avgComplexity}</td><td>${escapeHtml(layer.dependencies.join(', ') || 'なし')}</td></tr>`).join('')}</tbody>
    </table>
    <div class="box"><h3>レイヤー依存ヒートマップ</h3><div id="layer-heatmap"></div></div>
    <script>
      (function(){
        const layers = ${layers};
        const matrix = ${matrix};
        const maxValue = Math.max(...matrix.flat(), 1);
        let html = '<table style="border-collapse:collapse;width:auto">';
        html += '<tr><th></th>' + layers.map(layer => '<th style="padding:4px">' + layer + '</th>').join('') + '</tr>';
        for (let i = 0; i < layers.length; i += 1) {
          html += '<tr><th style="padding:4px">' + layers[i] + '</th>';
          for (let j = 0; j < layers.length; j += 1) {
            const value = matrix[i][j];
            const alpha = 0.2 + (value / maxValue) * 0.8;
            const bg = value > 0 ? 'rgba(59,130,246,' + alpha + ')' : '#f3f4f6';
            html += '<td style="width:34px;height:30px;text-align:center;border:1px solid #e5e7eb;background:' + bg + '">' + (value || '') + '</td>';
          }
          html += '</tr>';
        }
        html += '</table>';
        document.getElementById('layer-heatmap').innerHTML = html;
      })();
    </script>
  </section>`;
}

export function fileStatsSection(result: AnalysisResult): string {
  const files = LANGUAGES.flatMap((language) =>
    result.files[language.id].map((fileInfo) => ({
      name: path.basename(fileInfo.filePath),
      lang: language.label,
      classes: fileInfo.classes.length,
      lineCount: fileInfo.lineCount,
    }))
  );
  if (files.length === 0) return '';

  const chartData = scriptJson(files.map((fileInfo) => fileInfo.lineCount));

  return `
  <section>
    <h2>ファイル統計</h2>
    <table>
      <thead><tr><th>ファイル名</th><th>言語</th><th>クラス数</th><th>行数</th></tr></thead>
      <tbody>${files.map((fileInfo) => `<tr><td>${escapeHtml(fileInfo.name)}</td><td>${fileInfo.lang}</td><td>${fileInfo.classes}</td><td>${fileInfo.lineCount}</td></tr>`).join('')}</tbody>
    </table>
    <div class="box"><h3>ファイルサイズ分布</h3><canvas id="fileSizeDistributionChart" height="120"></canvas></div>
    <script>
      (function(){
        const lines = ${chartData};
        const binBounds = ${scriptJson(FILE_SIZE_HISTOGRAM_BINS)};
        const labels = binBounds.map((upper, i) => (i === 0 ? '0' : binBounds[i - 1] + 1) + '-' + upper).concat((binBounds[binBounds.length - 1] + 1) + '+');
        const bins = new Array(binBounds.length + 1).fill(0);
        lines.forEach(value => {
          const idx = binBounds.findIndex(upper => value <= upper);
          bins[idx === -1 ? binBounds.length : idx]++;
        });
        new Chart(document.getElementById('fileSizeDistributionChart'), {
          type: 'bar', data: { labels, datasets:[{ data: bins, backgroundColor:'rgba(59,130,246,.7)' }] },
          options: { responsive: true, plugins: { legend: { display:false } } }
        });
      })();
    </script>
  </section>`;
}

function renderModuleMetricRow(metric: AnalysisResult['moduleMetrics'][number]): string {
  const { label, color } = getInstabilityBadge(metric);
  const displayPath = metric.filePath.length > MODULE_PATH_DISPLAY_MAX_LENGTH
    ? '...' + metric.filePath.slice(-(MODULE_PATH_DISPLAY_MAX_LENGTH - 3))
    : metric.filePath;
  const badge = `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:0.8em;font-weight:600;white-space:nowrap;background:${color.bg};color:${color.fg}">${label}</span>`;
  return `<tr><td><strong>${escapeHtml(metric.moduleName)}</strong><br><code style="font-size:0.85em;color:#666">${escapeHtml(displayPath)}</code></td><td>${metric.fanIn}</td><td>${metric.fanOut}</td><td>${metric.centrality.toFixed(2)}</td><td>${metric.instability.toFixed(2)}</td><td>${metric.structuralScore.toFixed(1)}</td><td style="white-space:nowrap">${badge}</td></tr>`;
}

function getInstabilityBadge(metric: AnalysisResult['moduleMetrics'][number]): { label: string; color: { bg: string; fg: string } } {
  if (isThinOrchestrationModule(metric)) return { label: '入口', color: { bg: '#ede9fe', fg: '#5b21b6' } };
  if (metric.instability > UNSTABLE_INSTABILITY_THRESHOLD) return { label: '不安定', color: { bg: '#fee2e2', fg: '#991b1b' } };
  if (metric.instability > STABLE_INSTABILITY_THRESHOLD) return { label: '普通', color: { bg: '#fef3c7', fg: '#92400e' } };
  return { label: '安定', color: { bg: '#d1fae5', fg: '#065f46' } };
}

