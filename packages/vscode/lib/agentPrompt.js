"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDeterministicAiAgentPrompt = buildDeterministicAiAgentPrompt;
/**
 * Builds a deterministic, structured task prompt for AI coding agents
 * (GitHub Copilot, Claude Code, Antigravity, Cursor, Codex) directly from the
 * static analysis data, without invoking any LLM API.
 */
function buildDeterministicAiAgentPrompt(ref, lang = 'en') {
    if (!ref || !ref.result) {
        return '';
    }
    const res = ref.result;
    const isJa = lang === 'ja';
    const sections = [];
    if (isJa) {
        sections.push('# Codes Doctor — 技術的負債とリファクタリング作業指示書（AIエージェント用）\n');
        sections.push('以下の静的解析結果に基づき、実際のソースコードを点検してリファクタリングおよび問題解消を実装してください。\n');
        sections.push('## 1. 解析サマリー');
        sections.push(`- 対象ファイル数: ${res.summary.totalFiles}`);
        if (res.technicalDebt) {
            sections.push(`- 技術的負債スコア: ${res.technicalDebt.overallScore}/100 (判定: ${res.technicalDebt.grade})`);
        }
        if (res.securityScore) {
            sections.push(`- セキュリティスコア: ${res.securityScore.overallScore}/100 (判定: ${res.securityScore.grade})`);
        }
        const godClasses = (res.godClasses || []).slice(0, 8);
        if (godClasses.length > 0) {
            sections.push('\n## 2. 優先リファクタリング対象: 肥大化クラス（God Classes）');
            sections.push('以下のクラスは責務が集中し保守性が著しく低下しています。単一責任の原則（SRP）に従い、責務ごとにクラス・ドメインサービスへ適切に分割してください。既存の公開インターフェースや呼び出し元の動作は壊さないように維持してください。\n');
            godClasses.forEach((gc, idx) => {
                sections.push(`${idx + 1}. **${gc.className}** (\`${gc.filePath}\`)\n` +
                    `   - 指標: God Score = ${gc.godScore} (${gc.rank}), 行数: ${gc.lineCount}, メソッド数: ${gc.methodCount}, プロパティ数: ${gc.propertyCount}, インポート数: ${gc.importCount}\n` +
                    `   - 対応方針: 関連メソッド群を独立したモジュールへ抽出し、委譲またはDIで連携させてください。`);
            });
        }
        const cycles = (res.circularDependencies || []).slice(0, 6);
        if (cycles.length > 0) {
            sections.push('\n## 3. 循環依存の解消対象（Circular Dependencies）');
            sections.push('以下のインポート循環ループを解消してください。共有インターフェースや型定義の別ファイル抽出、または依存性逆転（DIP）を適用してください。\n');
            cycles.forEach((c, idx) => {
                sections.push(`${idx + 1}. \`${(c.cycle || []).join(' -> ')}\``);
            });
        }
        const issues = (res.securityScore?.issues || []).filter((i) => i.type !== 'info' && !i.inTest).slice(0, 8);
        if (issues.length > 0) {
            sections.push('\n## 4. 優先セキュリティ指摘（データフロー・構文パターン）');
            issues.forEach((iss, idx) => {
                const flowTag = iss.confidence === 'flow' ? '[追跡フロー確認済み]' : '[パターン候補]';
                const flowDetail = iss.flow
                    ? ` (入力元: L${iss.flow.source.line} -> 到達先: L${iss.flow.sink.line})`
                    : '';
                sections.push(`${idx + 1}. ${flowTag} **[${iss.type.toUpperCase()}] ${iss.category}**\n` +
                    `   - 箇所: \`${iss.filePath}:${iss.lineNumber}\`${flowDetail}\n` +
                    `   - 内容: ${iss.description}\n` +
                    `   - 推奨対策: ${iss.recommendation}`);
            });
        }
        sections.push('\n## 5. 実装ルール（エージェントへの指示）');
        sections.push('1. **後方互換性の維持**: 公開APIやテストケースの既存の挙動を変えずにリファクタリングしてください。');
        sections.push('2. **段階的な変更**: 1クラスまたは1モジュールずつ着実にリファクタリングを行ってください。');
        sections.push('3. **テスト検証**: 変更を行うごとにテストスイートを実行し、デグレがないことを確認してください。');
        sections.push('4. **報告**: 変更したファイル一覧、実施した構造改善、テスト結果を簡潔に報告してください。');
    }
    else {
        sections.push('# Codes Doctor — Technical Debt & Refactoring Instructions for AI Agent\n');
        sections.push('Based on the following deterministic static analysis findings, inspect the actual codebase and implement targeted refactoring and improvements.\n');
        sections.push('## 1. Analysis Overview');
        sections.push(`- Analyzed Files: ${res.summary.totalFiles}`);
        if (res.technicalDebt) {
            sections.push(`- Technical Debt Score: ${res.technicalDebt.overallScore}/100 (Grade: ${res.technicalDebt.grade})`);
        }
        if (res.securityScore) {
            sections.push(`- Security Score: ${res.securityScore.overallScore}/100 (Grade: ${res.securityScore.grade})`);
        }
        const godClasses = (res.godClasses || []).slice(0, 8);
        if (godClasses.length > 0) {
            sections.push('\n## 2. Priority Refactoring Targets: God Classes');
            sections.push('The following monolithic classes have accumulated excessive responsibilities. Decompose them into focused domain classes/services while keeping public interfaces and caller behavior intact.\n');
            godClasses.forEach((gc, idx) => {
                sections.push(`${idx + 1}. **${gc.className}** (\`${gc.filePath}\`)\n` +
                    `   - Metrics: God Score = ${gc.godScore} (${gc.rank}), Lines = ${gc.lineCount}, Methods = ${gc.methodCount}, Properties = ${gc.propertyCount}, Imports = ${gc.importCount}\n` +
                    `   - Action: Apply the Single Responsibility Principle (SRP) to extract cohesive method clusters into helper services.`);
            });
        }
        const cycles = (res.circularDependencies || []).slice(0, 6);
        if (cycles.length > 0) {
            sections.push('\n## 3. Circular Dependencies to Decouple');
            sections.push('Break the following import cycles by extracting shared interfaces/types or applying dependency inversion.\n');
            cycles.forEach((c, idx) => {
                sections.push(`${idx + 1}. \`${(c.cycle || []).join(' -> ')}\``);
            });
        }
        const issues = (res.securityScore?.issues || []).filter((i) => i.type !== 'info' && !i.inTest).slice(0, 8);
        if (issues.length > 0) {
            sections.push('\n## 4. Key Security Findings');
            issues.forEach((iss, idx) => {
                const flowTag = iss.confidence === 'flow' ? '[TRACED FLOW]' : '[PATTERN]';
                const flowDetail = iss.flow
                    ? ` (Source: L${iss.flow.source.line} -> Sink: L${iss.flow.sink.line})`
                    : '';
                sections.push(`${idx + 1}. ${flowTag} **[${iss.type.toUpperCase()}] ${iss.category}**\n` +
                    `   - Location: \`${iss.filePath}:${iss.lineNumber}\`${flowDetail}\n` +
                    `   - Issue: ${iss.description}\n` +
                    `   - Recommendation: ${iss.recommendation}`);
            });
        }
        sections.push('\n## 5. Execution Rules for AI Agent');
        sections.push('1. **Preserve Compatibility**: Keep existing public APIs and behavioral contracts intact.');
        sections.push('2. **Iterative Refactoring**: Refactor one monolithic class or circular dependency at a time.');
        sections.push('3. **Test Verification**: Run the project test suite after changes to ensure no regressions.');
        sections.push('4. **Summary**: Report changed files, architectural improvements, and test verification results.');
    }
    return sections.join('\n');
}
module.exports = {
    buildDeterministicAiAgentPrompt,
};
