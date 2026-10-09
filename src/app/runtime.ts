import fs from 'node:fs';
import type { AppConfig } from '../config';

export function ensureRuntimeDirectories(config: AppConfig): void {
  const dirs = [config.paths.uploads, config.paths.temp, config.paths.output];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[OK] Created directory: ${dir}`);
    }
  }
}