import type { AnalysisResult } from '../../types';
import { securitySection, technicalDebtSection } from './riskSections';
import { astSection } from './astSection';
import { circularSection, generateD3DependencyGraphSection, llmSection, mermaidSection } from './graphSections';
import { fileStatsSection, godClassSection, layerSection, moduleMetricsSection, summarySection } from './overviewSections';
import { generateSBOMSection, generateVulnerabilityScanSection } from './supplyChainSections';

/** LLM results saved before the report was (re)generated. */
export interface SavedReviews {
  review?: string;
  astReview?: string;
}

interface ReportTab {
  id: string;
  label: string;
  sections(result: AnalysisResult, saved: SavedReviews): string[];
}

const EMPTY_DEPENDENCY_GRAPH = String.raw`graph LR
  note["No data"]`;
const EMPTY_CALL_GRAPH = String.raw`graph LR
  note["No calls"]`;

/** Report tabs in display order; the first tab is shown on load. */
const REPORT_TABS: readonly ReportTab[] = [
  {
    id: 'overview',
    label: '概要・品質',
    sections: (result) => [summarySection(result), godClassSection(result), moduleMetricsSection(result), layerSection(result), fileStatsSection(result)],
  },
  {
    id: 'graphs',
    label: '依存グラフ',
    sections: (result) => [
      mermaidSection('モジュール依存グラフ', result.dependencyGraph || EMPTY_DEPENDENCY_GRAPH),
      result.callGraph?.edges?.length ? mermaidSection('関数呼び出しグラフ', result.callGraphMermaid || EMPTY_CALL_GRAPH) : '',
      generateD3DependencyGraphSection(result),
      circularSection(result),
    ],
  },
  { id: 'llm', label: 'LLM解析', sections: (result, saved) => [llmSection(result, saved.review)] },
  { id: 'ast', label: 'AST解析', sections: (result, saved) => [astSection(result, saved.astReview)] },
  { id: 'risk', label: 'リスク・セキュリティ', sections: (result) => [technicalDebtSection(result), securitySection(result)] },
  { id: 'supply', label: 'SBOM・脆弱性', sections: (result) => [generateSBOMSection(result), generateVulnerabilityScanSection(result)] },
];

export function renderTabNav(): string {
  return REPORT_TABS
    .map((tab, index) => `      <button class="tab-btn${index === 0 ? ' active' : ''}" data-tab="${tab.id}">${tab.label}</button>`)
    .join('\n');
}

export function renderTabPanels(result: AnalysisResult, saved: SavedReviews): string {
  return REPORT_TABS
    .map((tab, index) => `      <div class="tab-panel${index === 0 ? ' active' : ''}" id="tab-${tab.id}">
        ${tab.sections(result, saved).join('\n        ')}
      </div>`)
    .join('\n');
}
