import type { Router, Request, Response } from 'express';
import { Router as createRouter } from 'express';
import type { AppConfig } from '../types';
import { analyzeLlmRequest, getSavedLlmResult, listLlmModels } from '../services/llmService';
import { analyzePathRequest } from '../services/pathAnalysis';
import { isValidAnalysisId, isValidFocus } from '../validation';

export function createApiRouter(config: AppConfig): Router {
  const router = createRouter();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  router.post('/analyze-path', async (req: Request, res: Response) => {
    try {
      const result = await analyzePathRequest(req.body?.repoPath, req.body?.language, config.paths.output);
      res.json({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Path analysis failed';
      const status = isBadRequestMessage(message) ? 400 : 500;
      console.error('[ERROR] Path analysis failed:', error);
      res.status(status).json({ success: false, error: message });
    }
  });

  router.post('/llm/models', async (req: Request, res: Response) => {
    try {
      const models = await listLlmModels(req.body?.provider, req.body?.apiKey);
      res.json({ success: true, models });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list models';
      console.error('[ERROR] Listing LLM models failed:', error);
      res.status(400).json({ success: false, error: message });
    }
  });

  router.post('/llm/analyze', async (req: Request, res: Response) => {
    try {
      const result = await analyzeLlmRequest(config, req.body || {});
      res.json({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'LLM analysis failed';
      const status = resolveLlmErrorStatus(message);
      console.error('[ERROR] LLM analysis failed:', error);
      res.status(status).json({ success: false, error: message });
    }
  });

  router.get('/llm/result/:analysisId/:focus', (req: Request, res: Response) => {
    try {
      const { analysisId, focus } = req.params;
      if (!analysisId || !focus) {
        return res.status(400).json({ success: false, error: 'analysisId and focus are required' });
      }
      if (!isValidAnalysisId(analysisId) || !isValidFocus(focus)) {
        return res.status(400).json({ success: false, error: 'analysisId or focus is invalid' });
      }

      const result = getSavedLlmResult(analysisId, focus, config.paths.output);
      if (!result) {
        return res.status(404).json({ success: false, error: 'Saved LLM result not found' });
      }

      return res.json({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load saved LLM result';
      console.error('[ERROR] Loading saved LLM result failed:', error);
      return res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}

function isBadRequestMessage(message: string): boolean {
  return [
    'repoPath is required',
    'Specified path does not exist',
    'Specified path is not a directory',
  ].includes(message);
}

function resolveLlmErrorStatus(message: string): number {
  if (
    message === 'analysisId is required' ||
    message === 'analysisId is invalid' ||
    message === 'LLM is disabled. Set CSAP_LLM_ENABLED=true' ||
    message.endsWith('is not set')
  ) {
    return 400;
  }

  if (message.startsWith('LLM context not found')) {
    return 404;
  }

  return 500;
}