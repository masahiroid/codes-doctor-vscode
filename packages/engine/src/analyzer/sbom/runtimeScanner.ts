import fs from 'node:fs';
import path from 'node:path';
import { SBOMRuntime } from '../../types';

/**
 * Runtime versions declared by the project (Node, PHP, Python, Go, container base images).
 *
 * Reads only fixed files at the project root, never executes anything, and records the
 * declared constraint verbatim with its source file and line. A constraint is not the
 * version that actually runs; it is what the project says it needs.
 */
export function scanRuntimes(repoPath: string): SBOMRuntime[] {
  const runtimes: SBOMRuntime[] = [];
  runtimes.push(...fromPackageJson(repoPath));
  runtimes.push(...fromVersionFile(repoPath, '.nvmrc', 'node'));
  runtimes.push(...fromVersionFile(repoPath, '.node-version', 'node'));
  runtimes.push(...fromComposerJson(repoPath));
  runtimes.push(...fromVersionFile(repoPath, '.python-version', 'python'));
  runtimes.push(...fromGoMod(repoPath));
  for (const file of dockerfiles(repoPath)) runtimes.push(...fromDockerfile(repoPath, file));
  return runtimes;
}

function read(repoPath: string, file: string): string | undefined {
  // Read directly rather than stat-then-read: a directory or missing file throws here.
  try {
    return fs.readFileSync(path.join(repoPath, file), 'utf-8');
  } catch {
    return undefined;
  }
}

/** 1-based line of the first line containing `needle`, or 1. */
function lineOf(text: string, needle: RegExp): number {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => needle.test(line));
  return index >= 0 ? index + 1 : 1;
}

function runtime(name: string, version: string, file: string, line: number, kind: SBOMRuntime['kind'] = 'runtime'): SBOMRuntime {
  const purl = kind === 'container'
    ? `pkg:docker/${encodeURIComponent(name).replace(/%2F/g, '/')}@${encodeURIComponent(version)}`
    : `pkg:generic/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
  return { name, version, kind, purl, source: { file, line } };
}

function parseJson(text: string | undefined): any {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function fromPackageJson(repoPath: string): SBOMRuntime[] {
  const text = read(repoPath, 'package.json');
  const json = parseJson(text);
  const node = json?.engines?.node;
  if (typeof node !== 'string' || !node.trim()) return [];
  return [runtime('node', node.trim(), 'package.json', lineOf(text!, /"node"\s*:/))];
}

function fromComposerJson(repoPath: string): SBOMRuntime[] {
  const text = read(repoPath, 'composer.json');
  const json = parseJson(text);
  const php = json?.require?.php;
  if (typeof php !== 'string' || !php.trim()) return [];
  return [runtime('php', php.trim(), 'composer.json', lineOf(text!, /"php"\s*:/))];
}

function fromVersionFile(repoPath: string, file: string, name: string): SBOMRuntime[] {
  const text = read(repoPath, file);
  if (text === undefined) return [];
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trim() && !line.trim().startsWith('#'));
  if (index < 0) return [];
  const version = lines[index].trim().replace(/^v(?=\d)/, '');
  return [runtime(name, version, file, index + 1)];
}

function fromGoMod(repoPath: string): SBOMRuntime[] {
  const text = read(repoPath, 'go.mod');
  if (text === undefined) return [];
  const result: SBOMRuntime[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/^\s*(go|toolchain)\s+(\S+)\s*$/);
    if (!match) return;
    const version = match[1] === 'toolchain' ? match[2].replace(/^go/, '') : match[2];
    result.push(runtime('go', version, 'go.mod', index + 1));
  });
  return result;
}

const DOCKERFILE_PATTERN = /^(Dockerfile|Containerfile)(\..+)?$|\.(dockerfile|containerfile)$/i;

function dockerfiles(repoPath: string): string[] {
  try {
    return fs.readdirSync(repoPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && DOCKERFILE_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/** Official images whose tag is the language runtime version. */
const RUNTIME_IMAGES: Record<string, string> = {
  node: 'node',
  php: 'php',
  python: 'python',
  golang: 'go',
  ruby: 'ruby',
  openjdk: 'java',
  'eclipse-temurin': 'java',
};

/**
 * FROM lines of a Dockerfile. Stage aliases, `scratch`, and images whose name or tag
 * uses a build argument are skipped: their value is not known without building.
 */
function fromDockerfile(repoPath: string, file: string): SBOMRuntime[] {
  const text = read(repoPath, file);
  if (text === undefined) return [];
  const stages = new Set<string>();
  const result: SBOMRuntime[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?\s*$/i);
    if (!match) return;
    const [, image, alias] = match;
    if (alias) stages.add(alias.toLowerCase());
    if (image.includes('$') || image.toLowerCase() === 'scratch' || stages.has(image.toLowerCase())) return;
    const digestAt = image.indexOf('@');
    const reference = digestAt >= 0 ? image.slice(0, digestAt) : image;
    const digest = digestAt >= 0 ? image.slice(digestAt + 1) : undefined;
    const colon = reference.lastIndexOf(':');
    const hasTag = colon > reference.lastIndexOf('/');
    const name = hasTag ? reference.slice(0, colon) : reference;
    const tag = hasTag ? reference.slice(colon + 1) : digest ? '' : 'latest';
    const version = tag && digest ? `${tag}@${digest}` : tag || digest!;
    const line1 = index + 1;
    result.push(runtime(name, version, file, line1, 'container'));
    const shortName = name.replace(/^(docker\.io\/)?(library\/)?/, '');
    const language = RUNTIME_IMAGES[shortName];
    const languageVersion = tag.match(/^v?(\d+(?:\.\d+)*)/)?.[1];
    if (language && languageVersion) result.push(runtime(language, languageVersion, file, line1));
  });
  return result;
}
