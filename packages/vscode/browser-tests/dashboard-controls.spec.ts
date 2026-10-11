import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { createDashboardController } = require('../lib/dashboard/controller');
const { secureWebviewHtml } = require('../lib/webviewSecurity');

for (const language of ['en', 'ja']) {
  test(`${language}: extracted dashboard controls send validated messages under CSP`, async ({ page }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-controls-'));
    const settings: Record<string, unknown> = { displayLanguage: language, llmModel: 'saved-model' };
    const vscode = {
      workspace: {
        getConfiguration: () => ({ get: (key: string, fallback: unknown) => settings[key] ?? fallback, inspect: (key: string) => ({ globalValue: settings[key] }) }),
        onDidChangeConfiguration: () => ({ dispose() {} }),
      },
    };
    const dashboard = createDashboardController(vscode, { globalStorageUri: { fsPath: root } });
    try {
      await page.evaluate(() => {
        const host = window as unknown as { messages: unknown[]; acquireVsCodeApi: () => unknown };
        host.messages = [];
        host.acquireVsCodeApi = () => ({ postMessage: (message: unknown) => host.messages.push(message) });
      });
      await page.setContent(secureWebviewHtml(dashboard.buildHtml(), 'https://webview.invalid'));
      await page.locator('#analysisLanguage').selectOption('typescript');
      await page.locator('#llmModel').selectOption('saved-model');
      await page.locator('#llmMaxOutputTokens').fill('25000');
      await page.locator('[data-action="fetchModels"]').click();
      await page.locator('[data-action="runLlmAnalysis"]').click();
      await page.locator('[data-action="setApiKey"]').click();
      await page.locator('[data-command]').click();
      const messages = await page.evaluate(() => (window as unknown as { messages: unknown[] }).messages);
      expect(messages).toEqual([
        { type: 'setSetting', key: 'analysisLanguage', value: 'typescript' },
        { type: 'setLlmModel', value: 'saved-model' },
        { type: 'setLlmMaxOutputTokens', value: 25000 },
        { type: 'fetchModels' }, { type: 'runLlmAnalysis' },
        { type: 'command', command: 'codeDoctor.setLlmApiKey' },
        { type: 'command', command: 'codeDoctor.analyzeCurrentWorkspace' },
      ]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}
