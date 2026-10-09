import { securityIgnoredRanges } from './securitySyntax';
import { replaceRequired } from './sourceReplacement';
import { securityExplanation } from './securityExplanation';

module.exports = function patch(source: string) {
    // Keep density-based scoring, but prevent large projects from hiding severe findings.
    source = replaceRequired(source, 'return Math.round(score);', `const severityCap = summary.critical > 0 ? CODE_DOCTOR_ENGINE_POLICY.securityCaps.critical : summary.high > 0 ? CODE_DOCTOR_ENGINE_POLICY.securityCaps.high : summary.medium > 0 ? CODE_DOCTOR_ENGINE_POLICY.securityCaps.medium : CODE_DOCTOR_ENGINE_POLICY.securityCaps.other;
    return Math.min(Math.round(score), severityCap);`);
    const start = source.indexOf('function generateExplanation(');
    const end = source.indexOf('function generateTopRisks(', start);
    if (start < 0 || end < 0) throw new Error('Security explanation markers missing');
    source = source.slice(0, start) + securityExplanation.toString().replace('securityExplanation', 'generateExplanation') + '\n' + source.slice(end);

  source = replaceRequired(source, "const lines = content.split('\\n');", "const lines = content.split('\\n');\n    const ignored = language === 'typescript' ? securityIgnoredRanges(content) : [];");
  source = replaceRequired(source, '// Find line number', "if (ignored.some(([start, end]) => match.index >= start && match.index < end)) continue;\n            // Find line number");
  return source + '\n' + securityIgnoredRanges.toString();
};

export {};
