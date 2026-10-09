import express, { type Express } from 'express';
import { getConfig } from '../config';
import { registerCommonMiddleware, registerErrorHandlers } from './middleware';
import { registerAppRoutes } from './routes';

export function createConfiguredApp(): Express {
  const app = express();
  const config = getConfig();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  registerCommonMiddleware(app);
  registerAppRoutes(app, config);
  registerErrorHandlers(app, config);

  return app;
}