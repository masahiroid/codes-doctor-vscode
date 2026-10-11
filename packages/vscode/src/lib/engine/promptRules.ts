export const actionRules = [
  'Keep the existing report sections and summary format.',
  'Within each priority action or refactoring proposal, include the exact target, evidence, code inspection steps, conditional implementation instructions, and acceptance checks.',
  'Write actions so a coding agent can execute them: inspect the actual code first, implement only confirmed issues, preserve public behavior and interfaces, run relevant tests, and report changes and remaining uncertainties.',
  'Do not invent file names, symbols, test commands, or confirmed defects. If evidence is incomplete, state what must be verified before changing code.',
  'When dependency extraction appears empty or unreliable, prioritize validating extraction and remeasurement before dependency-driven refactoring.',
].join('\n');

module.exports = { actionRules };
