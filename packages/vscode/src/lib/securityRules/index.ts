/** Security rule sets: the pure modules (no VS Code API), re-exported for tests and tools. */
import * as ruleset from './ruleset';
import * as scan from './scan';
import * as audit from './audit';
import * as presentation from './presentation';

module.exports = { ...ruleset, ...scan, ...audit, escapeMarkdown: presentation.escapeMarkdown };
