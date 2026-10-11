import type { Express, NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config';
import { HTTP_STATUS, toMegabytes } from './httpStatus';

export function registerCommonMiddleware(app: Express): void {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
  });

  app.use((req, _res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
  });
}

export function registerErrorHandlers(app: Express, config: AppConfig): void {
  app.use((req: Request, res: Response) => {
    res.status(HTTP_STATUS.notFound).json({ success: false, error: 'Not found' });
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction): void => {
    console.error('[ERROR] Server error:', err?.message || err);

    if (err?.code === 'LIMIT_FILE_SIZE') {
      const maxSize = config.limits.maxFileSize;
      res.status(HTTP_STATUS.payloadTooLarge).json({
        success: false,
        error: `File too large. Maximum file size: ${toMegabytes(maxSize)}MB`,
      });
      return;
    }

    if (err?.code === 'LIMIT_FILE_COUNT') {
      res.status(HTTP_STATUS.badRequest).json({
        success: false,
        error: 'Too many files. Upload one file at a time.',
      });
      return;
    }

    res.status(HTTP_STATUS.internalServerError).json({
      success: false,
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err?.message : undefined,
    });
  });
}