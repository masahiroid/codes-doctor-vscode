import { loadEngine } from '../engine';

/**
 * The security rules modules live in the engine (packages/engine/src/securityRules), shared with
 * the CLI. They are pure and language-independent, so the Japanese build serves them; it is loaded
 * on first use, not when the extension activates.
 */
export type * from '../../../vendor/csap/securityRules';
export type SecurityRulesModule = typeof import('../../../vendor/csap/securityRules');

let loaded: SecurityRulesModule | undefined;
export const rulesModule = (): SecurityRulesModule => (loaded ??= loadEngine('ja').securityRules);
