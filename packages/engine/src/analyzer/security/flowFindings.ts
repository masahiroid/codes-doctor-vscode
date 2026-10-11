import type { SecurityIssue } from '../../types';
import type { DataFlow } from '../flow/taint';
import type { SinkCategory } from '../flow/spec';

/** How a confirmed flow into each kind of sink is reported. */
const FLOW_FINDINGS: Record<SinkCategory, Pick<SecurityIssue, 'type' | 'description' | 'recommendation'>> = {
  'Command Injection': {
    type: 'critical',
    description: '外部からの入力がコマンド実行に渡されています',
    recommendation: 'シェルを経由せず、引数を配列で渡し、入力を許可リストで検証してください',
  },
  'SQL Injection': {
    type: 'critical',
    description: '外部からの入力が SQL 文の組み立てに使われています',
    recommendation: 'プレースホルダー付きのクエリ（プリペアドステートメント）を使ってください',
  },
  'Code Injection': {
    type: 'critical',
    description: '外部からの入力がコードとして評価されています',
    recommendation: 'eval 等の動的評価をやめ、入力をデータとして扱ってください',
  },
  'Path Traversal': {
    type: 'high',
    description: '外部からの入力がファイルパスに使われています',
    recommendation: 'ファイル名だけを取り出し、許可したディレクトリの内側であることを確認してください',
  },
  SSRF: {
    type: 'high',
    description: '外部からの入力が接続先 URLに使われています',
    recommendation: '接続先を許可リストで制限し、内部ネットワークへの接続を禁止してください',
  },
  XSS: {
    type: 'high',
    description: '外部からの入力がエスケープされずに HTML として出力されています',
    recommendation: '出力時にエスケープするか、テンプレートエンジンの自動エスケープを使ってください',
  },
};

/** Pattern categories the flow analysis decides for the languages it supports. */
export const FLOW_CATEGORIES: ReadonlySet<string> = new Set(Object.keys(FLOW_FINDINGS));

/** Suffix for a pattern match whose input could not be traced. */
const UNTRACED_NOTE = '（入力の到達は確認できていません。要確認）';

export function flowIssues(flows: readonly DataFlow[], filePath: string): SecurityIssue[] {
  return flows.map((flow) => ({
    ...FLOW_FINDINGS[flow.category],
    category: flow.category,
    filePath,
    lineNumber: flow.sink.line,
    confidence: 'flow',
    flow: { source: flow.source, steps: flow.steps, sink: flow.sink },
  }));
}

/**
 * A pattern match in a category the flow analysis covers: dropped when a flow already
 * reports that line, otherwise kept as a low-priority lead because no untrusted input
 * was traced to it.
 */
export function reconcilePatternIssue(issue: SecurityIssue, flows: readonly DataFlow[]): SecurityIssue | null {
  if (!FLOW_CATEGORIES.has(issue.category)) return issue;
  if (flows.some((flow) => flow.category === issue.category && flow.sink.line === issue.lineNumber)) return null;
  return { ...issue, type: 'low', description: issue.description + UNTRACED_NOTE, confidence: 'pattern' };
}
