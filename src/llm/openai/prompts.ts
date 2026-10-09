import { LlmContext, AstOnlyLlmContext } from '../context';

export function buildFullAnalysisSystemPrompt(): string {
  return 'You are a senior software architect. Explain structural analysis results clearly and concisely.';
}

export function buildFullAnalysisPrompt(context: LlmContext, focus: string): string {
  return [
    'You are given a codebase structural analysis summary in JSON.',
    'Your job is to judge whether the current structure is acceptable, risky, or clearly problematic.',
    'Do not merely restate metrics. Interpret them like an experienced architect reviewing a saved report.',
    '',
    'Provide output in Japanese with the following sections:',
    '1) 総合判断:',
    '   - この構造は「このままで良い」「注意は必要だが許容範囲」「まずいので優先改善」のどれか',
    '   - 理由を2-4文で簡潔に述べる',
    '2) モジュール依存グラフの読み解き:',
    '   - 依存が集中している箇所',
    '   - 高instabilityでも自然なモジュール',
    '   - 本当に危険な依存の偏り',
    '   - 「いま問題ないのか / まずいのか」を明言する',
    '3) 関数呼び出しグラフの読み解き:',
    '   - 呼び出し集中ノードの意味',
    '   - オーケストレーションか、責務過多かを判定',
    '   - 必要ならコード確認ベースで、どの関数群を切るべきか示す',
    '4) God Class スコア分布の読み解き:',
    '   - 分布として危険かどうか',
    '   - 上位クラスが放置可能か、分割すべきか',
    '   - methodCount / lineCount / godScore を根拠に判断',
    '5) 優先アクション:',
    '   - 優先度1-3',
    '   - 対象ファイル/モジュール/クラス',
    '   - 何がまずいのか',
    '   - どう直すと良いか',
    '   - 放置してもよい項目は「現状維持」と明記',
    '6) 保存用要約:',
    '   - レポートを後で見返しても分かるように、3-6行で結論を要約',
    '',
    'Rules:',
    '- instability=1.00 でも、fanIn=0 かつ lineCount<=80 かつ fanOut<=3 のモジュールは、まず「軽量入口」と判断する',
    '- 「軽量入口」は、依存の入口や起動点として自然かどうかを説明する',
    '- moduleMetrics.naturalEntrypoints は問題候補ではなく、誤検知除外候補として扱う',
    '- fan-in が高く fan-out が低い sharedFoundationModules は、共有基盤として妥当かを評価する',
    '- moduleMetrics.reviewTargets を、本当に改善判断が必要な候補として優先評価する',
    '- callGraph.topCallers / topCallees / dependencyGraph.topDependents / circularDependencies / godClasses.top を必ず参照する',
    '- 数字を引用して、このままでよいのか、まずいのかを明言する',
    '- 少なくとも5件の具体名を挙げる',
    '- 可能なら、モジュールとGod Classの関係も述べる',
    '- 推測は避け、根拠がなければ「不明」と書く',
    '',
    `Analysis focus: ${focus}`,
    '',
    'JSON:',
    JSON.stringify(context),
  ].join('\n');
}

export function buildAstOnlySystemPrompt(): string {
  return [
    'You are a principal code reviewer analyzing AST-based code structure.',
    'Return your answer in Japanese.',
    '',
    'Core rules:',
    '- Base conclusions on concrete AST evidence (file/class/function names and numbers).',
    '- Do not invent symbols that are not in the input data.',
    '- Prefer practical refactoring actions over abstract advice.',
    '',
    'Classification guardrails:',
    '- classes=[] AND functions=[] means pure type/interface/constant file.',
    '- Such files are low-risk by default and MUST NOT be labeled as God Class.',
    '- complexity score = lineCount + (fanIn+fanOut)*2 for code files, and 0 for pure-type files.',
    '- complexity score is not cyclomatic complexity; use cyclomaticComplexity field when present.',
  ].join('\n');
}

/**
 * Build prompt for AST-only LLM analysis.
 * Focuses on deep code structure inspection from sampled files.
 */
export function buildAstOnlyPrompt(context: AstOnlyLlmContext, focus: string): string {
  return [
    '==== AST-Only Structural Review ====',
    '',
    `Repository: ${context.repoName}`,
    `Primary Language: ${context.primaryLanguage}`,
    `Analysis Date: ${context.analyzedAt}`,
    '',
    'Sampling (sorted by complexity desc):',
    `- TypeScript/JavaScript: ${context.astData.typescript.sampledCount} sampled from ${context.astData.typescript.totalCount} total`,
    `- PHP: ${context.astData.php.sampledCount} sampled from ${context.astData.php.totalCount} total`,
    `- Dart: ${context.astData.dart.sampledCount} sampled from ${context.astData.dart.totalCount} total`,
    '',
    'Focus:',
    focus || 'Identify code quality issues, design pattern violations, and refactoring opportunities',
    '',
    'Output format (keep concise):',
    '1) 重大問題トップ3 (深刻度順)',
    '2) 複雑度の高い実装要素 (ファイル/クラス/関数)',
    '3) 具体的リファクタリング提案 (優先度付き)',
    '4) 判断に不足している情報',
    '',
    'Rules:',
    '- ファイル名・クラス名・関数名を必ず明記する',
    '- 数値根拠（lineCount/methods/complexity/cyclomaticComplexity）を添える',
    '- classes=[] かつ functions=[] は型定義ファイルとして扱い、God Class扱いしない',
    '- complexity は結合度加重スコアであり、サイクロマティック複雑度ではない',
    '',
    '==== AST Data ====',
    JSON.stringify(context, null, 2),
  ].join('\n');
}
