import { createConfiguredApp } from './factory';
import { ensureRuntimeDirectories } from './runtime';
import { getConfig } from '../config';

export function startServer(): void {
  const app = createConfiguredApp();
  const config = getConfig();
  const port = process.env.PORT || 3000;
  const environment = process.env.NODE_ENV || 'development';

  ensureRuntimeDirectories(config);

  app.listen(port, () => {
    console.log('='.repeat(60));
    console.log('[Code Doctor] コード構造監査レポート');
    console.log('='.repeat(60));
    console.log(`Server running at: http://localhost:${port}`);
    console.log(`Environment: ${environment}`);
    console.log(`Max upload size: ${Math.round(config.limits.maxFileSize / 1024 / 1024)}MB`);
    console.log(`Output directory: ${config.paths.output}`);
    console.log('='.repeat(60));
    console.log('Ready to analyze codebases!\n');
  });
}