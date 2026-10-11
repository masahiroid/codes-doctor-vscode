import { SBOM } from '../types';
import { scanNpmPackages } from './sbom/packageJsonScanner';

const SBOM_SCHEMA_VERSION = '1.0';
const SBOM_FORMAT = 'CycloneDX';
const SBOM_TOOL_NAME = 'Code Doctor SBOM Generator';
const SBOM_TOOL_VERSION = '1.0';

/**
 * Generate Software Bill of Materials (SBOM) in CycloneDX format.
 */
export function generateSBOM(repoPath: string): SBOM {
  const scanResult = scanNpmPackages(repoPath);

  return {
    version: SBOM_SCHEMA_VERSION,
    format: SBOM_FORMAT,
    components: scanResult.components,
    dependencies: scanResult.dependencies,
    metadata: {
      timestamp: new Date().toISOString(),
      projectName: scanResult.projectName,
      projectVersion: scanResult.projectVersion,
      toolName: SBOM_TOOL_NAME,
      toolVersion: SBOM_TOOL_VERSION,
      trivyVersion: scanResult.trivyVersion,
    },
  };
}

/**
 * Calculate component statistics.
 */
export function calculateComponentStats(sbom: SBOM): {
  totalComponents: number;
  directDependencies: number;
  transitiveDependencies: number;
  devDependencies: number;
  outdatedComponents: number;
} {
  const directDeps = sbom.components.filter((c) => !c.isTransitive).length;
  const transitiveDeps = sbom.components.filter((c) => c.isTransitive).length;
  const devDeps = sbom.components.filter((c) => c.isDev).length;

  return {
    totalComponents: sbom.components.length,
    directDependencies: directDeps,
    transitiveDependencies: transitiveDeps,
    devDependencies: devDeps,
    outdatedComponents: 0, // Would require checking against registry
  };
}

export { exportSBOMAsJson } from './sbom/cycloneDxExport';
export { exportSBOMAsSDPX } from './sbom/spdxExport';
