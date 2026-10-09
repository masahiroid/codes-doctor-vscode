import fs from 'node:fs';
import puppeteer from 'puppeteer';

/**
 * Renders an already-generated HTML report to PDF via a headless browser.
 * Kept separate from report/output.ts so that callers which don't need PDF
 * export (e.g. the VS Code extension) don't have to depend on puppeteer,
 * which bundles a full Chromium binary.
 */
export async function generatePDFReport(htmlPath: string, pdfPath: string): Promise<void> {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      margin: { top: '16px', right: '16px', bottom: '16px', left: '16px' },
      printBackground: true,
      preferCSSPageSize: false,
    });
    console.log(`[OK] PDF report generated: ${pdfPath}`);
  } catch (error) {
    console.error(`[ERROR] Failed to generate PDF: ${error}`);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
