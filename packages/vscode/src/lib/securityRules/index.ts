/** Security rule sets: the pure modules (no VS Code API), re-exported for tests and tools. */
import { rulesModule } from './rules';
import * as presentation from './presentation';

module.exports = { ...rulesModule(), escapeMarkdown: presentation.escapeMarkdown };
