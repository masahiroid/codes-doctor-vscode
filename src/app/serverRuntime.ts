import { createConfiguredApp } from './factory';
import { ensureRuntimeDirectories } from './runtime';
import { getConfig } from '../config';
import { toMegabytes } from './httpStatus';

const DEFAULT_PORT = 3000;
const BANNER_WIDTH = 60;

export function startServer(): void {
  const app = createConfiguredApp();
  const config = getConfig();
  const port = process.env.PORT || DEFAULT_PORT;
  const environment = process.env.NODE_ENV || 'development';

  ensureRuntimeDirectories(config);

  app.listen(port, () => {
    console.log('='.repeat(BANNER_WIDTH));
    console.log('[Code Doctor] コード構造監査レポート');
    console.log('='.repeat(BANNER_WIDTH));
    console.log(`Server running at: http://localhost:${port}`);
    console.log(`Environment: ${environment}`);
    console.log(`Max upload size: ${toMegabytes(config.limits.maxFileSize)}MB`);
    console.log(`Output directory: ${config.paths.output}`);
    console.log('='.repeat(BANNER_WIDTH));
    console.log('Ready to analyze codebases!\n');
  });
}