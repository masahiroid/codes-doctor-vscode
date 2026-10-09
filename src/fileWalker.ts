import fs from 'fs';
import path from 'path';

/**
 * Recursively delete a directory.
 * Silently ignore if directory doesn't exist.
 */
export async function cleanupDir(dirPath: string): Promise<void> {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (error) {
    // Silently ignore errors
    console.error(`Warning: Failed to cleanup directory ${dirPath}:`, error);
  }
}

/**
 * Parse .gitignore file and return patterns to ignore
 */
function parseGitignore(repoPath: string): Set<string> {
  const gitignorePath = path.join(repoPath, '.gitignore');
  const patterns = new Set<string>();

  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (trimmed && !trimmed.startsWith('#')) {
          // Remove leading slash and trailing slash
          const pattern = trimmed.replace(/^\//, '').replace(/\/$/, '');
          patterns.add(pattern);
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read .gitignore: ${error}`);
    }
  }

  return patterns;
}

/**
 * Convert .gitignore shell pattern to regex
 * - * matches any string except /
 * - ? matches any single character except /
 * - ** matches zero or more directories
 */
function patternToRegex(pattern: string): RegExp {
  // Escape special regex characters except *, ?, and /
  let regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars
    .replace(/\\\*/g, '[^/]*')              // * becomes [^/]*
    .replace(/\\\?/g, '[^/]');              // ? becomes [^/]

  // If pattern doesn't have /, match only filename
  if (!pattern.includes('/')) {
    return new RegExp(`(^|/)${regexStr}$`);
  }

  return new RegExp(`^${regexStr}$`);
}

/**
 * Check if a name/path matches a gitignore pattern
 */
function matchesPattern(pattern: string, name: string): boolean {
  try {
    const regex = patternToRegex(pattern);
    return regex.test(name);
  } catch (error) {
    console.warn(`Warning: Invalid pattern "${pattern}": ${error}`);
    return false;
  }
}

function shouldExclude(itemName: string, fullPath: string, repoPath: string, gitignorePatterns: Set<string>): boolean {
  // Exclude Storybook files (used for UI component development, not production code)
  if (itemName.includes('.stories.')) {
    return true;
  }

  // Standard exclusions (always ignore these)
  const standardExcludes = [
    'node_modules', '.git', 'vendor', 'dist', 'build', '.venv', '__pycache__',
    '.firebase', '.next', '.nuxt', '.output', 'out', 'coverage', '.cache',
    '.turbo', '.vercel', '.netlify', 'public/build', '.expo', '.expo-shared',
    'android/app/build', 'ios/build', '.gradle', 'Pods', 'DerivedData',
    '.terraform', 'target', 'bin', 'obj', '.vs', '.idea', '.vscode',
    'tmp', 'temp', '.tmp', '.DS_Store', 'thumbs.db', 'vscode-extension'
  ];

  // Check standard exclusions
  if (standardExcludes.includes(itemName)) {
    return true;
  }

  // Check gitignore patterns
  const relativePath = path.relative(repoPath, fullPath);
  for (const pattern of gitignorePatterns) {
    // Skip negation patterns (e.g., !.vscode/extensions.json)
    if (pattern.startsWith('!')) {
      continue;
    }

    // Exact match on relative path or item name
    if (itemName === pattern || relativePath === pattern || relativePath.startsWith(pattern + '/')) {
      return true;
    }

    // Match patterns with wildcards
    if (pattern.includes('*') || pattern.includes('?')) {
      if (matchesPattern(pattern, itemName) || matchesPattern(pattern, relativePath)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Recursively list all files matching given extensions.
 * Excludes standard build/dependency directories and respects .gitignore patterns.
 */
export async function listFiles(dirPath: string, extensions: string[]): Promise<string[]> {
  const files: string[] = [];
  const gitignorePatterns = parseGitignore(dirPath);

  function walkDir(currentPath: string): void {
    if (!fs.existsSync(currentPath)) {
      return;
    }

    const items = fs.readdirSync(currentPath);

    for (const item of items) {
      const fullPath = path.join(currentPath, item);

      // Skip if excluded
      if (shouldExclude(item, fullPath, dirPath, gitignorePatterns)) {
        continue;
      }

      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        walkDir(fullPath);
      } else if (stats.isFile()) {
        const ext = path.extname(item).toLowerCase();
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  walkDir(dirPath);
  return files;
}

/**
 * Read file content as UTF-8.
 * Return empty string on error (don't throw).
 */
export async function readFileContent(filePath: string): Promise<string> {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error(`Warning: Failed to read file ${filePath}:`, error);
    return '';
  }
}
