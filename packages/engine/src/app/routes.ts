import type { Express } from 'express';
import uploadRouter from '../upload';
import type { AppConfig } from '../config';
import { createApiRouter } from '../routes/api';
import { createReportsRouter } from '../routes/reports';
import { renderHomePage } from '../web/pages';

export function registerAppRoutes(app: Express, config: AppConfig): void {
  app.get('/', (_req, res) => {
    res.send(renderHomePage());
  });

  app.use('/api', uploadRouter);
  app.use('/api', createApiRouter(config));
  app.use('/reports', createReportsRouter(config));
}