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
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/(?<!\.)\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');

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

interface GitignoreScope {
  dir: string;
  patterns: Set<string>;
}

function shouldExclude(itemName: string, fullPath: string, scopes: readonly GitignoreScope[]): boolean {
  // Exclude Storybook files (used for UI component development, not production code)
  if (itemName.includes('.stories.')) {
    return true;
  }

  // Exclude TypeScript declaration files and sourcemaps (not executable source code)
  if (itemName.endsWith('.d.ts') || itemName.endsWith('.d.mts') || itemName.endsWith('.d.cts') || itemName.endsWith('.map')) {
    return true;
  }

  // Exclude minified and pre-bundled distribution files
  if (itemName.endsWith('.min.js') || itemName.endsWith('.min.cjs') || itemName.endsWith('.min.mjs') || itemName.endsWith('.min.css') || itemName.endsWith('.bundle.js')) {
    return true;
  }

  // Standard exclusions (always ignore these)
  const standardExcludes = [
    'node_modules', '.git', 'vendor', 'dist', 'dist-en', 'build', '.venv', '__pycache__',
    '.firebase', '.next', '.nuxt', '.output', 'out', 'coverage', '.cache',
    '.turbo', '.vercel', '.netlify', 'public/build', '.expo', '.expo-shared',
    'android/app/build', 'ios/build', '.gradle', 'Pods', 'DerivedData',
    '.terraform', 'target', 'bin', 'obj', '.vs', '.idea', '.vscode',
    'tmp', 'temp', '.tmp', '.DS_Store', 'thumbs.db', 'vscode-extension', 'releases',
    '.parcel-cache', '.docusaurus', '.serverless', '.svelte-kit'
  ];

  // Check standard exclusions
  if (standardExcludes.includes(itemName)) {
    return true;
  }

  // Exclude 'lib' directory if sibling 'src' directory exists (compiled output)
  if (itemName === 'lib' && fs.existsSync(path.join(path.dirname(fullPath), 'src'))) {
    return true;
  }

  // Check gitignore patterns from all applicable scopes (root down to current directory)
  for (const scope of scopes) {
    const relativePath = path.relative(scope.dir, fullPath);
    for (const pattern of scope.patterns) {
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
  }

  return false;
}

/**
 * Recursively list files in a single directory walk, bucketed by extension group.
 * Excludes standard build/dependency directories and respects .gitignore patterns.
 * Files inside each bucket keep directory-walk order.
 */
export async function listFilesByExtension<K extends string>(
  dirPath: string,
  groups: ReadonlyArray<{ id: K; extensions: readonly string[] }>
): Promise<Record<K, string[]>> {
  const buckets = Object.fromEntries(groups.map((group) => [group.id, [] as string[]])) as Record<K, string[]>;
  const groupByExtension = new Map<string, K>();
  for (const group of groups) {
    for (const extension of group.extensions) groupByExtension.set(extension, group.id);
  }

  function walkDir(currentPath: string, parentScopes: GitignoreScope[]): void {
    if (!fs.existsSync(currentPath)) {
      return;
    }

    const currentScopes = [...parentScopes];
    const gitignoreFile = path.join(currentPath, '.gitignore');
    if (fs.existsSync(gitignoreFile)) {
      const localPatterns = parseGitignore(currentPath);
      if (localPatterns.size > 0) {
        currentScopes.push({ dir: currentPath, patterns: localPatterns });
      }
    }

    for (const item of fs.readdirSync(currentPath)) {
      const fullPath = path.join(currentPath, item);
      if (shouldExclude(item, fullPath, currentScopes)) {
        continue;
      }

      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        walkDir(fullPath, currentScopes);
      } else if (stats.isFile()) {
        const group = groupByExtension.get(path.extname(item).toLowerCase());
        if (group) buckets[group].push(fullPath);
      }
    }
  }

  walkDir(dirPath, []);
  return buckets;
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
