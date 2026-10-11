import { LlmContext, AstOnlyLlmContext } from '../context';

/**
 * Rules shared by every review system prompt, so each recommended action is
 * concrete enough for a person or a coding agent to verify and carry out.
 */
const ACTION_RULES = [
  'Keep the existing report sections and summary format.',
  'Within each priority action or refactoring proposal, include the exact target, evidence, code inspection steps, conditional implementation instructions, and acceptance checks.',
  'Write actions so a coding agent can execute them: inspect the actual code first, implement only confirmed issues, preserve public behavior and interfaces, run relevant tests, and report changes and remaining uncertainties.',
  'Do not invent file names, symbols, test commands, or confirmed defects. If evidence is incomplete, state what must be verified before changing code.',
  'When dependency extraction appears empty or unreliable, prioritize validating extraction and remeasurement before dependency-driven refactoring.',
].join('\n');

export function buildFullAnalysisSystemPrompt(): string {
  return 'You are a senior software architect. Explain structural analysis results clearly and concisely.' + '\n' + ACTION_RULES;
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

// Kept free of Japanese literals on purpose: the English engine build only swaps "in Japanese" for
// "in English", so no per-fragment translation entries are needed for this prompt.
export function buildAgentPromptSystemPrompt(): string {
  return [
    'You are a senior software architect who writes task instructions for AI coding agents',
    '(such as Claude Code, Cursor, GitHub Copilot agent mode, or Codex).',
    'Your output is not a report for humans: it is the prompt itself, which the user will paste into the agent unchanged.',
  ].join(' ');
}

export function buildAgentPromptUserPrompt(context: LlmContext): string {
  return [
    'You are given a codebase structural analysis summary in JSON.',
    'Turn it into a single prompt that an AI coding agent can execute against this repository.',
    '',
    'Output rules:',
    '- Output only the prompt, as Markdown. No preamble, no closing remarks, and do not wrap the whole output in a code fence.',
    '- Address the agent directly in the imperative ("Inspect...", "Split...").',
    '- Write the entire prompt in Japanese.',
    '',
    'Required structure:',
    '1. Goal: one or two sentences on what this refactoring pass should achieve and why, citing the key numbers.',
    '2. Context: repository name, primary language, and the 3-6 metrics that justify the work (God Score, fan-in/fan-out, instability, cycle length, method/line counts).',
    '3. Tasks: at most 5, in priority order. For each task give:',
    '   - Target: exact file paths, modules, classes, or functions, taken only from the JSON.',
    '   - Evidence: the metric values that make this a problem.',
    '   - Inspect first: what the agent must read and confirm in the actual code before changing anything.',
    '   - Change: the concrete refactoring to apply if the problem is confirmed (extract, split, invert a dependency, break a cycle, ...).',
    '   - Do not change: interfaces, behavior, or files that must stay as they are.',
    '   - Done when: verifiable acceptance checks (tests pass, the cycle is gone, the class no longer holds responsibility X, ...).',
    '4. Leave as-is: items the analysis flags but that should not be touched, each with a one-line reason (e.g. natural entry points, thin orchestration modules, shared foundations).',
    '5. Global constraints: inspect before editing; work one task at a time with a separate commit per task; preserve public APIs and existing behavior; run the existing tests after each task; if a task\'s evidence does not hold in the actual code, skip it and say why instead of forcing a change.',
    '6. Final report: tell the agent to finish by listing, per task, what it changed, how it verified it, and anything left unresolved.',
    '',
    'Grounding rules:',
    '- Never invent file names, symbols, test commands, or defects that are not in the JSON. If something must be confirmed, phrase it as an inspection step.',
    '- Do not invent a test command; tell the agent to find and use the project\'s existing one.',
    '- A module with instability=1.00 but fanIn=0, lineCount<=80, and fanOut<=3 is a lightweight entry point, not a refactoring target.',
    '- Treat moduleMetrics.naturalEntrypoints as false-positive exclusions and moduleMetrics.reviewTargets as the main candidates.',
    '- If dependency data looks empty or unreliable, make the first task "verify dependency extraction and re-run the analysis" instead of dependency-driven refactoring.',
    '- If nothing warrants change, say so in the Goal and produce only the Leave as-is and Final report sections.',
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
  ].join('\n') + '\n' + ACTION_RULES;
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
