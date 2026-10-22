import type { Node } from '../syntax/treeSitter';
import { namedChildren, walk } from '../syntax/treeSitter';
import type { FlowSpec } from './spec';
import { callArguments, calleeText, normalize } from './syntax';

/** A stretch of the file where an expression is known to be validated. */
export interface GuardRegion {
  start: number;
  end: number;
  texts: Set<string>;
}

/** Whether `node` is an expression validated by a guard that covers its position. */
export function isValidated(guards: readonly GuardRegion[], node: Node): boolean {
  if (guards.length === 0) return false;
  const text = normalize(node.text);
  return guards.some((guard) => node.startIndex >= guard.start && node.endIndex <= guard.end && guard.texts.has(text));
}

/** Expressions a condition validates when it is true (`positive`) and when it is false (`negative`). */
function validatedBy(spec: FlowSpec<string>, condition: Node | null): { positive: string[]; negative: string[] } {
  const none = { positive: [], negative: [] };
  const guards = spec.guards;
  if (!condition || !guards) return none;
  if (condition.type === 'parenthesized_expression') return validatedBy(spec, namedChildren(condition)[0] ?? null);
  const operator = condition.childForFieldName('operator')?.text;
  if (guards.notTypes.has(condition.type) && operator === '!') {
    const inner = validatedBy(spec, condition.childForFieldName('argument') ?? namedChildren(condition).at(-1) ?? null);
    return { positive: inner.negative, negative: inner.positive };
  }
  if (condition.type === 'binary_expression' && (operator === '&&' || operator === 'and')) {
    const parts = namedChildren(condition).map((part) => validatedBy(spec, part));
    return { positive: parts.flatMap((part) => part.positive), negative: [] };
  }
  if (condition.type === 'binary_expression' && (operator === '||' || operator === 'or')) {
    const parts = namedChildren(condition).map((part) => validatedBy(spec, part));
    return { positive: [], negative: parts.flatMap((part) => part.negative) };
  }
  if (!spec.callTypes.has(condition.type)) return none;
  const callee = calleeText(condition);
  const args = callArguments(condition);
  const validated = guards.validators
    .filter((validator) => validator.callee.test(callee))
    .filter((validator) => !validator.requires || validator.requires.text.test((args[validator.requires.argument]?.text ?? '').trim()))
    .map((validator) => args[validator.argument])
    .filter((arg): arg is Node => Boolean(arg))
    .map((arg) => normalize(arg.text));
  return { positive: validated, negative: [] };
}

/** Whether a branch always leaves the enclosing block: its last statement returns, exits or throws. */
function exits(spec: FlowSpec<string>, body: Node | null): boolean {
  const guards = spec.guards;
  if (!body || !guards) return false;
  const last = (body.namedChildCount > 0 && !guards.exitTypes.has(body.type) ? namedChildren(body).filter((child) => !/comment/.test(child.type)).at(-1) : body) ?? null;
  if (!last) return false;
  if (guards.exitTypes.has(last.type)) return true;
  const expression = last.type === 'expression_statement' ? namedChildren(last)[0] : null;
  if (!expression) return false;
  if (/^throw/.test(expression.type)) return true;
  return Boolean(guards.exitCalls && spec.callTypes.has(expression.type) && guards.exitCalls.test(calleeText(expression)));
}

export function collectGuards(spec: FlowSpec<string>, scope: Node): GuardRegion[] {
  const guards = spec.guards;
  if (!guards) return [];
  const regions: GuardRegion[] = [];
  const add = (node: Node | null | undefined, start: number, end: number, texts: string[]) => {
    if (node !== null && texts.length > 0 && end > start) regions.push({ start, end, texts: new Set(texts) });
  };
  walk(scope, (node) => {
    if (node !== scope && spec.functionTypes.has(node.type)) return false;
    if (!guards.ifTypes.has(node.type)) return true;
    const { positive, negative } = validatedBy(spec, node.childForFieldName('condition'));
    const body = node.childForFieldName('consequence') ?? node.childForFieldName('body');
    const alternative = node.childForFieldName('alternative');
    if (body) add(body, body.startIndex, body.endIndex, positive);
    if (alternative) add(alternative, alternative.startIndex, alternative.endIndex, negative);
    // Guard clause: `if (!valid($x)) { exit; }` validates $x for the rest of the block.
    if (!alternative && exits(spec, body) && node.parent) add(node.parent, node.endIndex, node.parent.endIndex, negative);
    return true;
  });
  return regions;
}
