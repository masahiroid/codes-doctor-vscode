import type { Node } from '../syntax/treeSitter';
import { namedChildren, walk, withSyntaxTree } from '../syntax/treeSitter';
import type { FlowGrammar, FlowSpec } from './spec';
import { FLOW_SPECS } from './languages';
import { callArguments, calleeText, functionName } from './syntax';
import { FlowAnalysis, byLine, functionScopes } from './taint';
import type { DataFlow, FlowStep, SummaryResolver } from './taint';

/**
 * Broken object level authorization (BOLA / IDOR): a request value reaches an operation that reads
 * or changes a stored object, and the handler shows no sign of checking that the object belongs to
 * the signed-in user. Three kinds of evidence count as an ownership check:
 *
 * 1. the lookup itself is scoped to the signed-in user (`where: { id, userId: req.user.id }`);
 * 2. an `if` compares a value with the signed-in user (not with a literal) and either guards the
 *    lookup or leaves the handler when it fails;
 * 3. an authorization call (`authorize`, `Gate::allows`, `can`, ...).
 *
 * A lookup filtered by an owner field (`UserId: req.body.UserId`, `where('user_id', $owner)`) whose
 * value is not recognizably the signed-in user is neither: the owner may be filled in by middleware
 * the analysis cannot see, or forged by the client. Such endpoints get their own status.
 *
 * Converting or validating an ID is not evidence: another user's ID is a valid ID too.
 */

export const OBJECT_ACCESS = 'Object Access' as const;
export type ObjectAccess = typeof OBJECT_ACCESS;

export interface AccessOptions {
  /** Extra expressions that stand for the signed-in user (regular expressions). */
  ownerReferences?: RegExp[];
  /** Extra calls that check authorization (regular expressions matched against the callee). */
  authorizationCalls?: RegExp[];
}

interface AccessLanguage {
  /**
   * Where a client names the object to act on: any path parameter, and query or body fields whose
   * name says they are an identifier (`id`, `orderId`, `user_id`, `uuid`). An email or a search term
   * is not an object reference.
   */
  sources: RegExp;
  sinks: RegExp[];
  owner: RegExp;
  authorization: RegExp;
}

const NEVER = /(?!)/;
const RECEIVERS_THAT_ARE_NOT_STORES = '(?!(?:app|router|res|req|request|response|ctx|headers|params|query|body|map|cache|Object|Reflect|Array)\\.)';

const JAVASCRIPT_ACCESS: AccessLanguage = {
  sources: /\b(?:req|request|ctx)\.params\b|\b(?:req|request|ctx)\.(?:query|body|request\.body)\.(?:\w*(?:Id|ID|_id|Uuid|UUID|_uuid)|id|uuid)\b|\b(?:req|request|ctx)\.(?:query|body|request\.body)\[\s*['"`](?:\w*(?:Id|ID|_id|Uuid|UUID|_uuid)|id|uuid)['"`]\s*\]/,
  sinks: [
    /(?:^|\.)(?:findById|findByPk|findOne|findOneBy|findOneOrFail|findOneByOrFail|findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|findAll|findMany|find|findBy|getById|fetchById|findByIdAndUpdate|findByIdAndDelete|findByIdAndRemove|findOneAndUpdate|findOneAndDelete|findOneAndRemove|findOneAndReplace|updateOne|updateMany|deleteOne|deleteMany|destroy|upsert)$/,
    new RegExp(`^${RECEIVERS_THAT_ARE_NOT_STORES}[\\w$.]+\\.(?:update|delete|remove)$`),
    /(?:^|\.)(?:query|execute|raw|prepare)$/,
  ],
  owner: /\b(?:req|request)\.(?:user|session|auth)\b|\bres\.locals\.(?:user|session)\b|\bctx\.(?:state\.user|session)\b|\b\w*(?:current_?user|auth_?user|logged_?in_?user|session_?user|signed_?in_?user)\w*\b/i,
  authorization: /(?:^|\.)(?:authorize\w*|can|cannot|ability\.can|enforce|checkOwner\w*|assertOwner\w*|verifyOwner\w*|ensureOwner\w*|isOwner\w*|requireOwner\w*|checkAccess|assertCan|permit\w*)$/i,
};

const PHP_ACCESS: AccessLanguage = {
  sources: /\$_(?:GET|POST|REQUEST)\[\s*['"](?:\w*(?:Id|ID|_id|Uuid|_uuid)|id|uuid)['"]\s*\]|\$request->route\(|\$request->(?:input|get|query|post)\(\s*['"](?:\w*(?:Id|ID|_id|Uuid|_uuid)|id|uuid)['"]/,
  sinks: [
    /(?:->|::)(?:find|findOrFail|findOrNew|findMany|findBy|findOneBy|where|whereKey|whereIn|firstWhere|destroy)$/,
    /^(?:mysqli_query|mysqli_real_query|mysqli_multi_query|pg_query|pg_query_params|pg_execute|sqlite_query|mysqli_stmt_bind_param)$/,
    // Prepared statements: the ID is bound, not written into the query.
    /(?:->|::)(?:bind_param|bindParam|bindValue|execute)$/,
    /(?:->|::)(?:query|exec|prepare|select|statement|raw|whereRaw|selectRaw)$/,
  ],
  owner: /\$_SESSION\b|\bauth\(\)|\bAuth::|\$request->user\(\)|\$this->user\b|\bsession\(|\bSession::|\$\w*(?:current_?user|auth_?user|logged_?in_?user|session_?user)\w*|\b\w*current_?user\w*\(/i,
  authorization: /(?:^|->|::)(?:authorize\w*|can|cannot|allows|denies|check|inspect)$|^Gate::|^\$this->authorize$/i,
};

const ACCESS_LANGUAGES: Partial<Record<FlowGrammar, AccessLanguage>> = {
  javascript: JAVASCRIPT_ACCESS,
  typescript: JAVASCRIPT_ACCESS,
  tsx: JAVASCRIPT_ACCESS,
  php: PHP_ACCESS,
};

export const accessSupported = (grammar: FlowGrammar) => grammar in ACCESS_LANGUAGES;

const union = (base: RegExp, extra: RegExp[] = []) => (extra.length === 0 ? base : new RegExp([base, ...extra].map((pattern) => `(?:${pattern.source})`).join('|'), 'i'));

/**
 * The taint spec for object access: the request values a client uses to choose an object (not
 * headers, cookies or server variables), lookups as sinks, and no sanitizers or validation guards,
 * because a converted or validated ID is still an ID.
 */
export function accessSpec(grammar: FlowGrammar): FlowSpec<ObjectAccess> | undefined {
  const language = ACCESS_LANGUAGES[grammar];
  if (!language) return undefined;
  const base = FLOW_SPECS[grammar];
  return {
    ...base,
    sources: language.sources,
    sanitizers: NEVER,
    quoteSanitizers: undefined,
    guards: undefined,
    sinks: language.sinks.map((callee) => ({ category: OBJECT_ACCESS, callee })),
    sinkAssignments: [],
    sinkStatements: [],
  };
}

export type EndpointStatus = 'owner_check_missing' | 'owner_field_unverified' | 'owner_checked' | 'no_object_access';

/** A function that reads request input, and what the access analysis concluded about it. */
export interface AccessEndpoint {
  function?: string;
  line: number;
  /** `GET /orders/:id` when the handler is registered inline (`router.get('/orders/:id', ...)`). */
  route?: string;
  status: EndpointStatus;
  /** The line that counts as the ownership check, for `owner_checked`. */
  evidence?: FlowStep;
  /** Object lookups reached by request input without an ownership check. */
  findings: DataFlow<ObjectAccess>[];
}

const COMPARISON = new Set(['==', '===', '!=', '!==', '<>']);
/**
 * A filter on an owner column and the value it is compared with: `UserId: x`, `user_id = x`,
 * `where('user_id', x)`, `'owner_id' => x`.
 */
const OWNER_FIELD = /\b(?:user_?id|owner_?id|account_?id|customer_?id|tenant_?id|author(?:_?id)?|created_?by)\b['"`]?\s*(?::|=(?!=)|,|=>)\s*([^,}\)\];\n]+)/gi;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LITERAL = /^(?:['"`][^'"`]*['"`]|\d+|true|false|null|undefined)$/;

function line(node: Node, lines: string[]): FlowStep {
  const row = node.startPosition.row + 1;
  return { line: row, code: (lines[row - 1] ?? '').trim().slice(0, 160) };
}

/** Names inside a function that hold the signed-in user, directly or through assignments. */
function ownerNames(spec: FlowSpec<string>, scope: Node, owner: RegExp): Set<string> {
  const names = new Set<string>();
  const mentions = (node: Node | null) => {
    if (!node) return false;
    if (owner.test(node.text)) return true;
    let found = false;
    walk(node, (current) => {
      if (found) return false;
      if (spec.identifierTypes.has(current.type) && names.has(current.text)) found = true;
      return !found;
    });
    return found;
  };
  for (let changed = true; changed;) {
    changed = false;
    walk(scope, (node) => {
      if (node !== scope && spec.functionTypes.has(node.type)) return false;
      const assignment = spec.assignment(node);
      if (!assignment?.targets || !mentions(assignment.value)) return true;
      walk(assignment.targets, (target) => {
        if (spec.identifierTypes.has(target.type) && !names.has(target.text)) {
          names.add(target.text);
          changed = true;
        }
        return true;
      });
      return true;
    });
  }
  return names;
}

/** The ownership evidence in a function, or undefined when there is none. */
function ownershipEvidence(spec: FlowSpec<string>, scope: Node, lines: string[], owner: RegExp, authorization: RegExp): FlowStep | undefined {
  const names = ownerNames(spec, scope, owner);
  const isOwner = (node: Node) => {
    if (owner.test(node.text)) return true;
    let found = false;
    walk(node, (current) => {
      if (spec.identifierTypes.has(current.type) && names.has(current.text)) found = true;
      return !found;
    });
    return found;
  };
  let evidence: FlowStep | undefined;
  walk(scope, (node) => {
    if (evidence) return false;
    if (node !== scope && spec.functionTypes.has(node.type)) return false;
    if (spec.callTypes.has(node.type) && authorization.test(calleeText(node))) {
      evidence = line(node, lines);
      return false;
    }
    if (node.type === 'if_statement') {
      const condition = node.childForFieldName('condition');
      let compares = false;
      if (condition) {
        walk(condition, (current) => {
          if (compares) return false;
          const operator = current.childForFieldName('operator')?.text ?? '';
          if (current.type === 'binary_expression' && COMPARISON.has(operator)) {
            const [left, right] = namedChildren(current);
            // A comparison with the signed-in user on one side and something else than a literal on the other.
            if (left && right && ((isOwner(left) && !LITERAL.test(right.text.trim())) || (isOwner(right) && !LITERAL.test(left.text.trim())))) compares = true;
          }
          return !compares;
        });
      }
      if (compares) evidence = line(node, lines);
    }
    return true;
  });
  return evidence;
}

/** The whole call chain a call belongs to: `Order::where('id', $id)->where('user_id', auth()->id())->first()`. */
function outermostChain(node: Node, callTypes: ReadonlySet<string>): Node {
  let current = node;
  while (current.parent && (callTypes.has(current.parent.type) || /member|scoped_call|subscript|arguments|^argument$/.test(current.parent.type))) {
    if (current.parent.type === 'arguments' || current.parent.type === 'argument') break;
    current = current.parent;
  }
  return current;
}

/** `GET /orders/:id` for a handler passed inline to `app.get('/orders/:id', ...)`. */
function routeOf(scope: Node): string | undefined {
  const args = scope.parent;
  const call = args?.parent;
  if (!args || !call || args.type !== 'arguments' || call.type !== 'call_expression') return undefined;
  const callee = call.childForFieldName('function')?.text ?? '';
  const method = /^(?:app|router|\w+Router|server)\.(get|post|put|patch|delete|all)$/i.exec(callee)?.[1];
  const path = namedChildren(args)[0];
  if (!method || !path || !/string/.test(path.type)) return undefined;
  return `${method.toUpperCase()} ${path.text.replace(/^['"`]|['"`]$/g, '')}`;
}

/**
 * Classify the request-reading functions of one parsed file. `flows` are the object-access flows the
 * taint analysis found in it (with calls into other files already followed).
 */
export function accessEndpoints(grammar: FlowGrammar, root: Node, content: string, flows: readonly DataFlow<ObjectAccess>[], options: AccessOptions = {}): AccessEndpoint[] {
  const language = ACCESS_LANGUAGES[grammar];
  const spec = accessSpec(grammar);
  if (!language || !spec) return [];
  const owner = union(language.owner, options.ownerReferences);
  const authorization = union(language.authorization, options.authorizationCalls);
  const lines = content.split('\n');
  const scopes: Node[] = [root];
  walk(root, (node) => {
    if (node !== root && spec.functionTypes.has(node.type)) scopes.push(node);
    return true;
  });
  // A flow belongs to the innermost function around the line it is reported at.
  const owning = (flow: DataFlow<ObjectAccess>) => {
    const at = (flow.entry ?? flow.sink).line - 1;
    return scopes.filter((scope) => scope.startPosition.row <= at && scope.endPosition.row >= at)
      .sort((a, b) => (a.endIndex - a.startIndex) - (b.endIndex - b.startIndex))[0];
  };
  const readsRequest = (scope: Node) => {
    let found = false;
    walk(scope, (node) => {
      if (found) return false;
      if (node !== scope && spec.functionTypes.has(node.type)) return false;
      if (spec.sources.test(node.text) && !namedChildren(node).some((child) => spec.sources.test(child.text))) found = true;
      return !found;
    });
    return found;
  };
  /**
   * The part of a lookup that selects the object: the filter, not the values written. For a call
   * that has a `where:` option (Sequelize) that option; otherwise its first argument (MongoDB, Prisma,
   * `findById`). For a PHP builder chain, the chain without the values given to `update`, `insert`,
   * `fill` or `create`. Callbacks (`.then((result) => ...)`) never count. A lookup in another file
   * is judged by its line.
   */
  const lookupText = (flow: DataFlow<ObjectAccess>) => {
    if (flow.sink.file) return flow.sink.code;
    let text = flow.sink.code;
    const withoutFunctions = (node: Node) => {
      let result = node.text;
      walk(node, (inner) => {
        if (inner === node || !spec.functionTypes.has(inner.type)) return true;
        result = result.replace(inner.text, '');
        return false;
      });
      return result;
    };
    walk(root, (node) => {
      if (node.startPosition.row + 1 !== flow.sink.line || !spec.callTypes.has(node.type)) return true;
      if (!language.sinks.some((sink) => sink.test(calleeText(node)))) return true;
      if (grammar === 'php') {
        const chain = outermostChain(node, spec.callTypes);
        text = withoutFunctions(chain);
        walk(chain, (inner) => {
          if (spec.callTypes.has(inner.type) && /(?:->|::)(?:update|insert|fill|forceFill|create|save|upsert)$/.test(calleeText(inner))) {
            const args = inner.childForFieldName('arguments');
            if (args) text = text.replace(args.text, '()');
          }
          return true;
        });
      } else {
        const args = callArguments(node);
        const filter = args.find((arg) => /\bwhere\s*:/.test(arg.text)) ?? args[0];
        text = filter ? withoutFunctions(filter) : '';
      }
      return false;
    });
    return text;
  };
  const scopedToOwner = (flow: DataFlow<ObjectAccess>) => owner.test(lookupText(flow));
  /**
   * Whether the lookup also filters on an owner column with a value that is not the requested ID.
   * In `WHERE user_id = $id` the column is the object's own key, so it does not count.
   */
  const filteredByOwnerField = (flow: DataFlow<ObjectAccess>) => {
    const assigned = [flow.source, ...flow.steps].map((step) => step.code);
    // The value that selects the object: the flow's own input, or a variable assigned from it.
    const isRequestedId = (value: string) => {
      if (flow.source.expression && value.replace(/\s+/g, '').includes(flow.source.expression.replace(/\s+/g, ''))) return true;
      const name = /^\$?[A-Za-z_]\w*/.exec(value.trim().replace(/^[^$\w]+/, ''))?.[0];
      if (!name || spec.sources.test(value)) return false;
      const assignment = new RegExp(`(?:^|[\\s,{(])${escapeRegExp(name)}\\b[^=]*=(?!=)`);
      return assigned.some((code) => assignment.test(code));
    };
    for (const match of lookupText(flow).matchAll(OWNER_FIELD)) {
      if (!isRequestedId(match[1])) return true;
    }
    return false;
  };

  const endpoints: AccessEndpoint[] = [];
  for (const scope of scopes) {
    const mine = flows.filter((flow) => owning(flow) === scope);
    if (mine.length === 0 && (scope === root || !readsRequest(scope))) continue;
    const unscoped = mine.filter((flow) => !scopedToOwner(flow));
    const evidence = unscoped.length > 0 ? ownershipEvidence(spec, scope, lines, owner, authorization) : undefined;
    const unfiltered = unscoped.filter((flow) => !filteredByOwnerField(flow));
    const status: EndpointStatus = mine.length === 0
      ? 'no_object_access'
      : unscoped.length === 0 || evidence
        ? 'owner_checked'
        : unfiltered.length > 0 ? 'owner_check_missing' : 'owner_field_unverified';
    const endpoint: AccessEndpoint = { line: scope.startPosition.row + 1, status, findings: status === 'owner_check_missing' ? unfiltered : [] };
    const name = scope === root ? undefined : functionName(scope);
    if (name) endpoint.function = name;
    const route = scope === root ? undefined : routeOf(scope);
    if (route) endpoint.route = route;
    if (status === 'owner_checked') endpoint.evidence = evidence ?? { line: mine[0].sink.line, code: mine[0].sink.code, ...(mine[0].sink.file ? { file: mine[0].sink.file } : {}) };
    endpoints.push(endpoint);
  }
  return endpoints;
}

/**
 * Access endpoints of one file. With a resolver (from a project index built with `accessSpec`),
 * lookups in other files called from a handler are followed.
 */
export async function analyzeAccess(grammar: FlowGrammar, content: string, options: AccessOptions = {}, resolve?: SummaryResolver): Promise<AccessEndpoint[]> {
  const spec = accessSpec(grammar);
  if (!spec) return [];
  return withSyntaxTree(grammar, content, (tree) => {
    const analysis = new FlowAnalysis(spec, content, resolve);
    const functions = functionScopes(spec, tree.rootNode);
    analysis.summarize(functions);
    for (const scope of [tree.rootNode, ...functions]) analysis.analyzeScope(scope);
    return accessEndpoints(grammar, tree.rootNode, content, [...analysis.flows.values()].sort(byLine), options);
  });
}
