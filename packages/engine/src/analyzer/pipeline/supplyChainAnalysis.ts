import { generateSBOM } from '../sbom';
import { scanVulnerabilities } from '../vulnerability';
import type { AnalysisResult } from '../../types';

export interface SupplyChainAnalysisResult {
  sbom: NonNullable<AnalysisResult['sbom']>;
  vulnerabilityScan: NonNullable<AnalysisResult['vulnerabilityScan']>;
}

export async function runSupplyChainAnalysis(repoPath: string): Promise<SupplyChainAnalysisResult> {
  console.log('\n[Step 14] Generating SBOM...');
  const sbom = generateSBOM(repoPath);
  console.log(`   [OK] SBOM generated with ${sbom.components.length} components`);
  console.log(`   - Direct dependencies: ${sbom.components.filter((component) => !component.isTransitive).length}`);
  console.log(`   - Transitive dependencies: ${sbom.components.filter((component) => component.isTransitive).length}`);

  console.log('\n[Step 15] Scanning for vulnerabilities...');
  const vulnerabilityScan = await scanVulnerabilities(repoPath);
  console.log('   [OK] Vulnerability scan completed');
  console.log(`   - Total vulnerabilities: ${vulnerabilityScan.totalVulnerabilities}`);
  console.log(
    `   - Critical: ${vulnerabilityScan.critical}, High: ${vulnerabilityScan.high}, Moderate: ${vulnerabilityScan.moderate}`
  );
  console.log(`   - Fixable packages: ${vulnerabilityScan.fixable}`);

  return { sbom, vulnerabilityScan };
}