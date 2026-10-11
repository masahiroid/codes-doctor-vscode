import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SBOMComponent, SBOMDependency } from '../../types';

export interface PackageScanResult {
  components: SBOMComponent[];
  dependencies: SBOMDependency[];
  projectName?: string;
  projectVersion?: string;
  trivyVersion?: string;
}

/**
 * Scan package.json (direct deps) and package-lock.json (transitive deps)
 * for SBOM component/dependency data.
 */
export function scanNpmPackages(repoPath: string): PackageScanResult {
  const trivyVersion = detectTrivyVersion();
  const packageJson = readPackageJson(repoPath);

  if (!packageJson) {
    return { components: [], dependencies: [], trivyVersion };
  }

  const components = extractDirectDependencies(packageJson);
  const dependencies: SBOMDependency[] = [];
  addTransitiveDependencies(repoPath, components, dependencies);

  components.sort((a, b) => a.name.localeCompare(b.name));

  return {
    components,
    dependencies,
    projectName: packageJson.name || 'unknown',
    projectVersion: packageJson.version || 'unknown',
    trivyVersion,
  };
}

function readPackageJson(repoPath: string): any | null {
  try {
    const content = fs.readFileSync(path.join(repoPath, 'package.json'), 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function extractDirectDependencies(packageJson: any): SBOMComponent[] {
  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.optionalDependencies,
  };

  return Object.entries(allDeps).map(([name, version]) => {
    const normalizedVersion = normalizeVersion(String(version));
    return {
      name,
      version: normalizedVersion,
      type: 'library',
      purl: `pkg:npm/${name}@${normalizedVersion}`,
      isDev: packageJson.devDependencies?.[name] !== undefined,
    };
  });
}

function addTransitiveDependencies(
  repoPath: string,
  components: SBOMComponent[],
  dependencies: SBOMDependency[]
): void {
  try {
    const lockContent = fs.readFileSync(path.join(repoPath, 'package-lock.json'), 'utf-8');
    const lockJson = JSON.parse(lockContent);

    if (!lockJson.packages) return;

    for (const [depPath, depInfo] of Object.entries(lockJson.packages) as [string, any][]) {
      if (depPath === '' || !depInfo.name) continue;

      const alreadyAdded = components.some(
        (c) => c.name === depInfo.name && c.version === depInfo.version
      );
      if (alreadyAdded) continue;

      components.push({
        name: depInfo.name,
        version: depInfo.version,
        type: 'library',
        purl: `pkg:npm/${depInfo.name}@${depInfo.version}`,
        isDev: false,
        isTransitive: true,
      });

      if (depInfo.requires) {
        for (const [depName, depVersion] of Object.entries(depInfo.requires) as [string, string][]) {
          dependencies.push({
            name: depInfo.name,
            dependsOn: depName,
            version: depVersion,
          });
        }
      }
    }
  } catch {
    // Continue without lock file info
  }
}

function detectTrivyVersion(): string | undefined {
  try {
    const output = execFileSync('trivy', ['--version'], { encoding: 'utf-8' });
    const match = output.match(/Version:\s*([0-9]+\.[0-9]+\.[0-9]+)/i);
    return match?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Normalize a semver range string (e.g. "^1.2.3", "~1.2.3") to its base version.
 */
function normalizeVersion(version: string): string {
  return version.replace(/^[\^~>=<\s]+/, '').split(/\s+/)[0];
}
