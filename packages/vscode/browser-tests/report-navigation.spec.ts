import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { analyzeWorkspace } = require('../lib/analyzer');
const { injectReviewCopy } = require('../lib/reportCopy');
const { injectReportTabs } = require('../lib/reportTabs');

for (const language of ['en', 'ja'] as const) {
  test(`${language}: real report retains all tabs after copy upgrade of AST source examples`, async ({ page }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-browser-tabs-'));
    const repo = path.join(root, 'repo');
    const output = path.join(root, 'output');
    fs.mkdirSync(repo); fs.mkdirSync(output);
    // Place the script-looking source in the pending AST batch, matching the reported failure.
    for (let index = 0; index < 25; index++) {
      fs.writeFileSync(path.join(repo, `file-${String(index).padStart(2, '0')}.js`), index === 24
        ? "const sourceExample = '<script>(function installReviewCopy() {\\n// old version\\n})();</script>';"
        : `class Example${index} { run() { return ${index}; } }`);
    }
    try {
      const report = await analyzeWorkspace(repo, 'javascript', output, language);
      const original = fs.readFileSync(report.reportPath, 'utf8');
      const legacyCorrupted = original.replace(/\(function installReviewCopy\(\) \{[\s\S]*?\n\}\)\(\);/, () => '(' + require('../lib/reportCopy').installReviewCopy.toString() + ')();');
      const opens = legacyCorrupted.match(/<template data-ast-pending>/g)?.length ?? 0;
      const closes = legacyCorrupted.match(/<\/template>/g)?.length ?? 0;
      expect(opens).toBeGreaterThan(closes); // Prove the original upgrade damages real generated HTML.
      const enhanced = require('../lib/webviewSecurity').secureWebviewHtml(injectReportTabs(injectReviewCopy(original)), 'https://webview.invalid');
      fs.writeFileSync(report.reportPath, enhanced);
      await page.route('https://**', route => route.abort());
      await page.goto(pathToFileURL(report.reportPath).href);
      await expect(page).toHaveTitle(/^Codes Doctor —/);
      await expect(page.locator('h1')).toHaveText('Codes Doctor');
      expect(await page.locator('script[src]').count()).toBe(0);
      await expect(page.locator('#tabNav')).toHaveAttribute('data-code-doctor-tabs-installed', 'true');
      await expect(page.locator('#code-doctor-report-tabs')).toHaveCount(1);
      for (const tab of ['graphs', 'llm', 'ast', 'risk', 'supply', 'overview']) {
        await page.locator(`#tabNav [data-tab="${tab}"]`).click();
        await expect(page.locator(`#tab-${tab}`)).toBeVisible();
        if (tab === 'graphs') await expect(page.locator('#tab-graphs .mermaid svg').first()).toBeVisible();
        await expect(page.locator('.tab-panel.active')).toHaveCount(1);
      }
      const mathSvg = await page.evaluate(async () => {
        const mermaid = (window as any).mermaid;
        return (await mermaid.render('katex-compatibility', 'flowchart LR\n A["$$x^2$$"] --> B')).svg;
      });
      expect(mathSvg).toContain('<math');
      await page.locator('#tabNav [data-tab="ast"]').click();
      const more = page.locator('[data-ast-more]').first();
      await expect(more).toBeVisible();
      await more.click();
      await expect(page.locator('[data-ast-visible]').first().locator('details')).toHaveCount(25);
      await expect(page.locator('#tab-risk')).toHaveCount(1);
      await expect(page.locator('#tab-supply')).toHaveCount(1);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}

test('Markdown keeps formatting and removes active HTML in bundled and upgraded reports', async ({ page }) => {
  const { upgradeReportLibraries } = require('../lib/reports/libraries');
  const html = upgradeReportLibraries('<html><head><script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script></head><body><div id="result"></div></body></html>');
  await page.setContent(html);
  const result = await page.evaluate(() => {
    const marked = (window as any).marked;
    return marked.parse('**Safe**\n\n<img src=x onerror="window.attacked=true"><script>window.attacked=true</script><a href="javascript:alert(1)">link</a><svg onload="alert(1)"></svg>');
  });
  expect(result).toContain('<strong>Safe</strong>');
  expect(result).not.toMatch(/onerror|<script|javascript:|<svg/i);
});

test('webview CSP permits bundled scripts and rejects injected event handlers', async ({ page }) => {
  const { secureWebviewHtml } = require('../lib/webviewSecurity');
  await page.setContent(secureWebviewHtml('<html><head></head><body><script>window.allowed = true</script><button onclick="window.attacked = true">Click</button></body></html>', 'https://webview.invalid'));
  await page.locator('button').click();
  expect(await page.evaluate(() => (window as any).allowed)).toBe(true);
  expect(await page.evaluate(() => (window as any).attacked)).toBeUndefined();
});
