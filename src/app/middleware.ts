import type { Express, NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config';

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
    res.status(404).json({ success: false, error: 'Not found' });
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction): void => {
    console.error('[ERROR] Server error:', err?.message || err);

    if (err?.code === 'LIMIT_FILE_SIZE') {
      const maxSize = config.limits.maxFileSize;
      res.status(413).json({
        success: false,
        error: `File too large. Maximum file size: ${Math.round(maxSize / 1024 / 1024)}MB`,
      });
      return;
    }

    if (err?.code === 'LIMIT_FILE_COUNT') {
      res.status(400).json({
        success: false,
        error: 'Too many files. Upload one file at a time.',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err?.message : undefined,
    });
  });
}