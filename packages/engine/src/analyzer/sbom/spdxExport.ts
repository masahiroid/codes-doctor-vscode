import { randomUUID } from 'node:crypto';
import { SBOM } from '../../types';

const SPDX_VERSION = 'SPDX-2.3';
const SPDX_DATA_LICENSE = 'CC0-1.0';
const SPDX_TOOL_NAME = 'CodeDoctor-1.0';
/** SHA-1-shaped placeholder; a real verification code would hash the package's files */
const SPDX_UNVERIFIED_PACKAGE_CODE = '0000000000000000000000000000000000000000 ()';

/**
 * Export SBOM to SPDX tag-value format (simplified: no file-level analysis).
 */
export function exportSBOMAsSDPX(sbom: SBOM): string {
  const lines: string[] = [
    `SPDXVersion: ${SPDX_VERSION}`,
    `DataLicense: ${SPDX_DATA_LICENSE}`,
    'SPDXID: SPDXRef-DOCUMENT',
    `DocumentName: ${sbom.metadata.projectName || 'Project'}`,
    `DocumentNamespace: https://csap/${randomUUID()}`,
    `Creator: Tool: ${SPDX_TOOL_NAME}`,
    `Created: ${sbom.metadata.timestamp}`,
    '',
    `PackageName: ${sbom.metadata.projectName || 'unknown'}`,
    'SPDXID: SPDXRef-Package',
    'PackageDownloadLocation: NOASSERTION',
    'FilesAnalyzed: false',
    `PackageVerificationCode: ${SPDX_UNVERIFIED_PACKAGE_CODE}`,
    '',
  ];

  sbom.components.forEach((comp, index) => {
    lines.push(`PackageName: ${comp.name}`);
    lines.push(`SPDXID: SPDXRef-Package-${index}`);
    lines.push(`PackageVersion: ${comp.version}`);
    lines.push(`PackageDownloadLocation: ${comp.purl || 'NOASSERTION'}`);
    lines.push('FilesAnalyzed: false');
    lines.push(`PackageVerificationCode: ${SPDX_UNVERIFIED_PACKAGE_CODE}`);
    lines.push('');
  });

  return lines.join('\n');
}
