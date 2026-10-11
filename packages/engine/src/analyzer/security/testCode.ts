/** Directory names that hold tests, fixtures or test data. */
const TEST_DIRECTORIES = new Set(['test', 'tests', '__tests__', 'spec', 'specs', 'testdata', 'testing', 'fixtures', '__mocks__']);

/** File names that are tests by convention in the supported languages. */
const TEST_FILE_PATTERNS = [
  /_test\.(go|py|rs|cc|cpp)$/,
  /_unittest\.(cc|cpp)$/,
  /^test_.*\.py$/,
  /^conftest\.py$/,
  /(Test|Tests|IT)\.(java|kt|cs)$/,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /(Test|Tests|Spec)\.(swift|php)$/,
  /_test\.dart$/,
];

/**
 * Whether a file is test code. Findings there are still reported, but they do not lower
 * the security score: test code typically spawns processes and embeds credentials on purpose.
 */
export function isTestPath(filePath: string): boolean {
  const segments = filePath.split(/[\\/]/);
  const fileName = segments.pop() ?? '';
  return segments.some((segment) => TEST_DIRECTORIES.has(segment.toLowerCase())) ||
    TEST_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}
