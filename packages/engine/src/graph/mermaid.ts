import path from 'path';

interface FileWithDeps {
  filePath: string;
  dependencies?: string[];
  imports?: string[];
}

/** Caps rendered Mermaid diagram size for readability/performance */
const MAX_DEPENDENCY_EDGES = 50;

/** Node.js built-in modules, excluded from the internal dependency graph */
const NODE_BUILTIN_MODULES = [
  'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns',
  'events', 'fs', 'http', 'https', 'net', 'os', 'path', 'querystring',
  'readline', 'stream', 'string_decoder', 'timers', 'tls', 'tty', 'url',
  'util', 'v8', 'vm', 'zlib',
];

/**
 * Build a dependency graph (Mermaid format) from internal file dependencies.
 */
export function buildDependencyGraph(fileInfoList: FileWithDeps[]): string {
  // Create a map of all files by various possible names
  const fileMap = new Map<string, string>();
  const fileBasenames = new Map<string, string[]>();
  
  for (const file of fileInfoList) {
    const basename = path.basename(file.filePath, path.extname(file.filePath));
    const fullPath = file.filePath;
    
    // Store by basename
    fileMap.set(basename, fullPath);
    
    // Store by full relative path (from project root)
    const parts = fullPath.split(path.sep);
    for (let i = 0; i < parts.length; i++) {
      const partialPath = parts.slice(i).join('/');
      const partialBasename = path.basename(partialPath, path.extname(partialPath));
      if (!fileBasenames.has(partialBasename)) {
        fileBasenames.set(partialBasename, []);
      }
      fileBasenames.get(partialBasename)!.push(basename);
    }
  }

  const edges: string[] = [];
  const edgeSet = new Set<string>();

  for (const file of fileInfoList) {
    const fromBasename = path.basename(file.filePath, path.extname(file.filePath));

    const deps = file.dependencies ?? file.imports ?? [];
    for (const dep of deps) {
      // Skip external dependencies
      if (isExternalDependency(dep)) {
        continue;
      }

      // Try to resolve the dependency to a local file
      const toBasename = resolveDependency(dep, fileMap, fileBasenames);

      if (toBasename && fromBasename !== toBasename && edges.length < MAX_DEPENDENCY_EDGES) {
        const edgeKey = `${fromBasename} --> ${toBasename}`;
        if (!edgeSet.has(edgeKey)) {
          edges.push(`  ${sanitizeNodeName(fromBasename)} --> ${sanitizeNodeName(toBasename)}`);
          edgeSet.add(edgeKey);
        }
      }
    }
  }

  if (edges.length === 0) {
    return 'graph LR\n  note["No internal dependencies detected"]';
  }

  return `graph LR\n${edges.join('\n')}`;
}

/**
 * Check if a dependency is external (node_modules, built-in, etc.)
 */
function isExternalDependency(dep: string): boolean {
  // Skip node_modules
  if (dep.includes('node_modules') || dep.startsWith('@types/')) {
    return true;
  }

  if (NODE_BUILTIN_MODULES.includes(dep)) {
    return true;
  }

  // Skip npm packages (no relative path)
  if (!dep.startsWith('.') && !dep.startsWith('/')) {
    return true;
  }

  return false;
}

/**
 * Resolve a dependency string to a file basename.
 */
function resolveDependency(
  dep: string,
  fileMap: Map<string, string>,
  fileBasenames: Map<string, string[]>
): string | null {
  // Clean up the dependency path
  let cleanedDep = dep;
  
  // Remove leading ./ or ../
  cleanedDep = cleanedDep.replace(/^(\.\.?\/)+/, '');
  
  // Remove file extension if present
  cleanedDep = cleanedDep.replace(/\.(ts|tsx|js|jsx|php|dart|py)$/, '');
  
  // Get basename
  const basename = path.basename(cleanedDep);
  
  // Try exact match first
  if (fileMap.has(basename)) {
    return basename;
  }
  
  // Try partial match
  if (fileBasenames.has(basename)) {
    const matches = fileBasenames.get(basename)!;
    if (matches.length > 0) {
      return matches[0];
    }
  }
  
  // Try matching the last segment of the path
  const segments = cleanedDep.split('/');
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    if (fileMap.has(segment)) {
      return segment;
    }
  }
  
  return null;
}

/**
 * Build a class hierarchy diagram (Mermaid format).
 */
export function buildClassHierarchyGraph(classInfoList: {
  name: string;
  filePath: string;
}[]): string {
  // Group classes by file
  const fileMap = new Map<string, string[]>();

  for (const classInfo of classInfoList) {
    const fileName = path.basename(classInfo.filePath, path.extname(classInfo.filePath));
    if (!fileMap.has(fileName)) {
      fileMap.set(fileName, []);
    }
    fileMap.get(fileName)!.push(classInfo.name);
  }

  if (fileMap.size === 0) {
    return 'graph TD\n  note["No classes found"]';
  }

  const lines: string[] = ['graph TD'];

  for (const [fileName, classes] of fileMap.entries()) {
    lines.push(`  subgraph ${sanitizeNodeName(fileName)}`);
    for (const className of classes) {
      lines.push(`    ${className}`);
    }
    lines.push('  end');
  }

  return lines.join('\n');
}

/**
 * Sanitize node name for Mermaid.
 */
function sanitizeNodeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}
