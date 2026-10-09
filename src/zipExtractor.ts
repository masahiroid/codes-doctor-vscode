import fs from 'fs';
import path from 'path';
import { Extract } from 'unzipper';
import { createReadStream } from 'fs';

/**
 * Extract a ZIP file to a destination directory.
 * Handles nested zip root folders (strips single top-level directory if all files are inside one).
 *
 * Kept in its own module (separate from fileWalker.ts) because it's the only
 * code in the analyzer that needs the `unzipper` package — callers that only
 * need to walk/read already-extracted files (e.g. the VS Code extension,
 * which analyzes a workspace folder directly) can avoid that dependency
 * entirely by not importing this file.
 */
export async function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Create destination directory if it doesn't exist
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    createReadStream(zipPath)
      .pipe(Extract({ path: destDir }))
      .on('close', async () => {
        try {
          // Check if all files are inside a single top-level directory
          const items = fs.readdirSync(destDir);
          if (items.length === 1) {
            const singleItem = path.join(destDir, items[0]);
            const stats = fs.statSync(singleItem);

            // If the single item is a directory, move its contents up directly
            if (stats.isDirectory()) {
              const innerItems = fs.readdirSync(singleItem);
              for (const item of innerItems) {
                fs.renameSync(path.join(singleItem, item), path.join(destDir, item));
              }
              fs.rmdirSync(singleItem);
            }
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}
