import { listFiles } from '../fileWalker';
import { DetectionResult } from '../types';

type PrimaryLanguage = DetectionResult['primaryLanguage'];

/** Share of total files a language must reach to be called the sole primary language */
const MIXED_LANGUAGE_THRESHOLD = 0.7;

/**
 * Detect programming languages present in a repository directory.
 */
export async function detectLanguages(repoPath: string): Promise<DetectionResult> {
  // List all TypeScript and JavaScript files
  const tsFiles = await listFiles(repoPath, ['.ts', '.tsx']);
  const jsFiles = await listFiles(repoPath, ['.js', '.jsx']);
  const phpFiles = await listFiles(repoPath, ['.php']);
  const dartFiles = await listFiles(repoPath, ['.dart']);
  const pythonFiles = await listFiles(repoPath, ['.py']);

  const tsCount = tsFiles.length;
  const jsCount = jsFiles.length;
  const phpCount = phpFiles.length;
  const dartCount = dartFiles.length;
  const pythonCount = pythonFiles.length;

  const counts: Array<{ lang: Exclude<PrimaryLanguage, 'mixed' | 'unknown'>; count: number }> = [
    { lang: 'typescript', count: tsCount },
    { lang: 'javascript', count: jsCount },
    { lang: 'php', count: phpCount },
    { lang: 'dart', count: dartCount },
    { lang: 'python', count: pythonCount },
  ];

  const primaryLanguage = determinePrimaryLanguage(counts);

  return {
    hasTypeScript: tsCount > 0,
    hasJavaScript: jsCount > 0,
    hasPHP: phpCount > 0,
    hasDart: dartCount > 0,
    hasPython: pythonCount > 0,
    fileCount: {
      ts: tsCount,
      js: jsCount,
      php: phpCount,
      dart: dartCount,
      python: pythonCount,
      total: tsCount + jsCount + phpCount + dartCount + pythonCount,
    },
    primaryLanguage,
  };
}

function determinePrimaryLanguage(
  counts: Array<{ lang: Exclude<PrimaryLanguage, 'mixed' | 'unknown'>; count: number }>
): PrimaryLanguage {
  const totals = counts.reduce((sum, c) => sum + c.count, 0);
  if (totals === 0) return 'unknown';

  const nonZero = counts.filter((c) => c.count > 0);
  if (nonZero.length === 1) return nonZero[0].lang;

  const ranked = [...counts].sort((a, b) => b.count - a.count);
  const top = ranked[0];
  const ratio = top.count / totals;
  return ratio >= MIXED_LANGUAGE_THRESHOLD ? top.lang : 'mixed';
}
