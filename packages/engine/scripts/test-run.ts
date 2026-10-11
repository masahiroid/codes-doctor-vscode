import { v4 as uuidv4 } from 'uuid';
import { runAnalysis } from '../src/analyzer';
import { generateHTMLReport } from '../src/report/htmlBuilder';
import { getReportPath } from '../src/report/output';

async function main() {
  const args = process.argv.slice(2);
  const repoPath = args[0];

  if (!repoPath) {
    console.error('❌ Usage: ts-node scripts/test-run.ts <path-to-repo>');
    process.exit(1);
  }

  const analysisId = uuidv4();
  console.log(`\n🧪 Testing Code Doctor analyzer`);
  console.log(`   Repo: ${repoPath}`);
  console.log(`   ID: ${analysisId}\n`);

  try {
    // Run analysis
    const result = await runAnalysis(repoPath, analysisId);

    // Generate report
    const reportPath = getReportPath(analysisId);
    await generateHTMLReport(result, reportPath);

    // Print results
    console.log('\n📋 Analysis Results:');
    console.log(`   Languages: ${JSON.stringify(result.detectedLanguages)}`);
    console.log(`   Files: ${result.summary.totalFiles}`);
    console.log(`   Classes: ${result.summary.totalClasses}`);

    if (result.godClasses.length > 0) {
      console.log('\n👿 Top 5 God Classes:');
      result.godClasses.slice(0, 5).forEach((cls, idx) => {
        console.log(
          `   ${idx + 1}. ${cls.className} (${cls.filePath}) - Score: ${cls.godScore} (${cls.rank})`
        );
      });
    }

    console.log(`\n   Dependencies: ${result.callGraph.edges.length} edges`);
    console.log(`   Calls: ${result.callGraph.edges.length} edges`);

    console.log(`\n✅ Report generated: ${reportPath}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  }
}

main();
