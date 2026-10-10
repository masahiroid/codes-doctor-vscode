"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installReviewCopy = installReviewCopy;
exports.injectReviewCopy = injectReviewCopy;
// Runs before Markdown rendering so copied reviews preserve the original source.
function installReviewCopy() {
    if (document.getElementById('review-copy-installed'))
        return;
    const marker = document.createElement('span');
    marker.id = 'review-copy-installed';
    marker.hidden = true;
    document.body.appendChild(marker);
    const ja = document.documentElement.lang.startsWith('ja');
    const instruction = ja
        ? '以下のレポートに基づき、実際のコードを確認して改善を実装してください。まず依存抽出の正常性を確認し、再計測してください。その後、確認できた問題を優先順に修正し、既存の動作と公開インターフェースを維持してください。関連テストを実行し、変更内容・検証結果・未解決事項を報告してください。'
        : 'Based on the following report, inspect the actual code and implement improvements. First verify dependency extraction and remeasure. Then fix confirmed issues in priority order, preserving existing behavior and public interfaces. Run relevant tests and report changes, validation results, and unresolved issues.';
    const label = ja ? 'AI向けにコピー（Markdown）' : 'Copy for AI (Markdown)';
    let vscode;
    if (typeof acquireVsCodeApi === 'function')
        vscode = acquireVsCodeApi();
    for (const id of ['llmResult', 'astResult', 'llmAgentPrompt']) {
        const result = document.getElementById(id);
        const markdown = result?.getAttribute('data-md');
        if (!result || !markdown?.trim())
            continue;
        // The agent prompt is already written as instructions; prefixing another instruction would duplicate them.
        const text = id === 'llmAgentPrompt' ? markdown : instruction + '\n\n' + markdown;
        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-bottom:8px';
        const button = document.createElement('button');
        button.type = 'button';
        button.title = label;
        button.setAttribute('aria-label', label);
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        for (const [key, value] of Object.entries({ width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'aria-hidden': 'true' }))
            icon.setAttribute(key, value);
        for (const [tag, attributes] of [['rect', { x: '8', y: '8', width: '12', height: '12', rx: '2' }], ['path', { d: 'M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4' }]]) {
            const shape = document.createElementNS('http://www.w3.org/2000/svg', tag);
            for (const [key, value] of Object.entries(attributes))
                shape.setAttribute(key, value);
            icon.appendChild(shape);
        }
        button.appendChild(icon);
        button.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:6px;border:1px solid var(--border,#ccc);border-radius:6px;background:transparent;color:inherit;cursor:pointer';
        const status = document.createElement('span');
        status.setAttribute('role', 'status');
        status.style.marginLeft = '8px';
        toolbar.append(status, button);
        result.before(toolbar);
        const done = (ok) => {
            status.textContent = ok
                ? (ja ? 'コピーしました' : 'Copied')
                : (ja ? 'コピーに失敗しました。再試行してください。' : 'Copy failed. Please try again.');
        };
        if (vscode)
            window.addEventListener('message', (event) => {
                if (event.data?.type === 'reviewCopied' && event.data.id === id)
                    done(event.data.ok);
            });
        button.addEventListener('click', async () => {
            if (vscode) {
                vscode.postMessage({ type: 'copyReview', id, text });
                return;
            }
            try {
                await navigator.clipboard.writeText(text);
                done(true);
            }
            catch {
                const input = document.createElement('textarea');
                input.value = text;
                input.style.position = 'fixed';
                input.style.opacity = '0';
                document.body.appendChild(input);
                input.select();
                try {
                    done(document.execCommand('copy'));
                }
                catch {
                    done(false);
                }
                finally {
                    input.remove();
                    button.focus();
                }
            }
        });
    }
}
const reviewCopyScript = `<script>(${installReviewCopy.toString()})();</script>`;
function injectReviewCopy(html) {
    // Never search/replace source-code text displayed in escaped AST previews.
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
    const installed = scripts.find((match) => /\(function installReviewCopy\(\) \{/.test(match[1]));
    if (installed) {
        const updated = installed[0].replace(/\(function installReviewCopy\(\) \{[\s\S]*?\n\}\)\(\);/, () => '(' + installReviewCopy.toString() + ')();');
        return html.slice(0, installed.index) + updated + html.slice(installed.index + installed[0].length);
    }
    const renderer = scripts.find((match) => match[1].includes('// Render initial saved Markdown results'));
    const insertion = renderer?.index ?? html.toLowerCase().lastIndexOf('</body>');
    return insertion >= 0 ? html.slice(0, insertion) + reviewCopyScript + html.slice(insertion) : html;
}
module.exports = { installReviewCopy, injectReviewCopy };
