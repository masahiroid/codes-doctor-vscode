import type { Router, Request, Response } from 'express';
import { Router as createRouter } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { runAnalysis } from '../analyzer';
import { type AppConfig } from '../types';
import { toAnalysisLanguage } from '../analyzer/languages/catalog';
import { generateHTMLReport } from '../report/htmlBuilder';
import { getReportPath } from '../report/output';
import { generatePDFReport } from '../report/pdfOutput';
import { renderAnalysisErrorPage, renderReportNotFoundPage } from '../web/pages';
import { isValidAnalysisId } from '../validation';
import { HTTP_STATUS } from '../app/httpStatus';

export function createReportsRouter(config: AppConfig): Router {
  const router = createRouter();

  router.get('/:analysisId', (req: Request, res: Response) => {
    const { analysisId } = req.params;
    if (!isValidAnalysisId(analysisId)) {
      res.status(HTTP_STATUS.badRequest).send(renderReportNotFoundPage(analysisId));
      return;
    }
    let language;
    try {
      language = toAnalysisLanguage(req.query.language);
    } catch (error) {
      res.status(HTTP_STATUS.badRequest).send(renderAnalysisErrorPage(error instanceof Error ? error.message : 'Invalid language'));
      return;
    }
    const reportPath = getReportPath(analysisId, config.paths.output);

    if (!fs.existsSync(reportPath)) {
      const extractedPath = path.join(config.paths.temp, analysisId);
      if (fs.existsSync(extractedPath)) {
        console.log(`\n⏳ Report not found, running analysis for ${analysisId}...`);
        console.log(`   Language mode: ${language}`);

        runAnalysis(extractedPath, analysisId, language)
          .then((result) => generateHTMLReport(result, reportPath))
          .then(() => {
            const html = fs.readFileSync(reportPath, 'utf-8');
            res.send(html);
          })
          .catch((error) => {
            console.error('[ERROR] Analysis failed:', error);
            res.status(HTTP_STATUS.internalServerError).send(renderAnalysisErrorPage(error instanceof Error ? error.message : 'Unknown error'));
          });
        return;
      }

      res.status(HTTP_STATUS.notFound).send(renderReportNotFoundPage(analysisId));
      return;
    }

    const html = fs.readFileSync(reportPath, 'utf-8');
    res.send(html);
  });

  router.get('/:analysisId/pdf', async (req: Request, res: Response) => {
    try {
      const { analysisId } = req.params;
      if (!isValidAnalysisId(analysisId)) {
        res.status(HTTP_STATUS.badRequest).json({ success: false, error: 'analysisId is invalid' });
        return;
      }
      const htmlPath = getReportPath(analysisId, config.paths.output);
      const pdfPath = htmlPath.replace(/\.html$/, '.pdf');

      if (!fs.existsSync(htmlPath)) {
        res.status(HTTP_STATUS.notFound).json({ success: false, error: 'Report not found' });
        return;
      }

      await generatePDFReport(htmlPath, pdfPath);

      res.download(pdfPath, `code-doctor-report-${analysisId}.pdf`);
    } catch (error) {
      console.error('[ERROR] PDF generation failed:', error);
      res.status(HTTP_STATUS.internalServerError).json({
        success: false,
        error: error instanceof Error ? error.message : 'PDF generation failed',
      });
    }
  });

  return router;
}