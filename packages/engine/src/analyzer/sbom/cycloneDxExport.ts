import { randomUUID } from 'node:crypto';
import { SBOM } from '../../types';

const CYCLONEDX_SPEC_VERSION = '1.4';
const TOOL_VERSION = '1.0';

/**
 * Export SBOM to CycloneDX JSON format.
 */
export function exportSBOMAsJson(sbom: SBOM): string {
  const cycloneDx = {
    bomFormat: 'CycloneDX',
    specVersion: CYCLONEDX_SPEC_VERSION,
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: sbom.metadata.timestamp,
      tools: [
        {
          vendor: 'Code Doctor',
          name: 'Code Doctor Structural Analyzer',
          version: TOOL_VERSION,
        },
      ],
      component: sbom.metadata.projectName
        ? {
            type: 'application',
            name: sbom.metadata.projectName,
            version: sbom.metadata.projectVersion,
          }
        : undefined,
    },
    components: sbom.components.map((comp) => ({
      type: comp.type,
      name: comp.name,
      version: comp.version,
      purl: comp.purl,
      scope: comp.isDev ? 'excluded' : 'required',
    })),
  };

  return JSON.stringify(cycloneDx, null, 2);
}
