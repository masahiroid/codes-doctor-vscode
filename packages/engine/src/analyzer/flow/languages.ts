import type { FlowGrammar, FlowSpec } from './spec';
import type { Node } from '../syntax/treeSitter';
import { namedChildren } from '../syntax/treeSitter';

const set = (...values: string[]): ReadonlySet<string> => new Set(values);

/** `left = right` style nodes, by field names. */
function fields(node: Node, target: string, value: string, compound = false) {
  return { targets: node.childForFieldName(target), value: node.childForFieldName(value), compound };
}

/** A declarator whose value is either a `value` field or its last named child. */
function declarator(node: Node) {
  const name = node.childForFieldName('name');
  const value = node.childForFieldName('value') ?? namedChildren(node).filter((child) => child !== name && child.type !== 'type_annotation').pop() ?? null;
  return { targets: name, value: value === name ? null : value, compound: false };
}

/** Assignment shapes shared by the C-family and JavaScript grammars. */
function cFamilyAssignment(node: Node) {
  if (node.type === 'assignment_expression') return fields(node, 'left', 'right');
  if (node.type === 'augmented_assignment_expression') return fields(node, 'left', 'right', true);
  return null;
}

const COMMAND = 'Command Injection' as const;
const SQL = 'SQL Injection' as const;
const CODE = 'Code Injection' as const;
const PATH = 'Path Traversal' as const;
const SSRF = 'SSRF' as const;
const XSS = 'XSS' as const;

/**
 * SQL call names across drivers; only the query string (first argument) is checked.
 * Lowercase `exec` is left out: it is far more often a process call than SQL.
 */
const SQL_METHODS = /(?:^|\.)(execute|executemany|executescript|query|queryRow|QueryRow|Query|raw|prepare|Prepare|executeQuery|executeUpdate|prepareStatement|createQuery|createNativeQuery|ExecuteReader|ExecuteNonQuery|ExecuteScalar|FromSqlRaw|ExecuteSqlRaw|mysqli_query|pg_query|sqlite_query)$/;

/** database/sql and GORM: exported names only, and the `…Context` forms take the query second. */
const GO_SQL_METHODS = /\.(?:Query|QueryRow|Exec|Prepare|Raw)$/;
const GO_SQL_CONTEXT_METHODS = /\.(?:QueryContext|QueryRowContext|ExecContext|PrepareContext)$/;

/** A regular expression literal anchored at both ends, e.g. `/^\d+$/` or `'/^[a-z]+$/i'`. */
const ANCHORED_PATTERN = /^['"`]?\/\^[\s\S]*\$\/[a-zA-Z]*['"`]?$/;

const JAVASCRIPT: FlowSpec = {
  functionTypes: set('function_declaration', 'function_expression', 'arrow_function', 'method_definition', 'generator_function_declaration'),
  identifierTypes: set('identifier', 'shorthand_property_identifier_pattern'),
  assignment: (node) => (node.type === 'variable_declarator' ? fields(node, 'name', 'value') : cFamilyAssignment(node)),
  callTypes: set('call_expression', 'new_expression'),
  sources: /\b(?:req|request)\.(?:query|body|params|headers|cookies|files)\b|\bctx\.(?:query|params|request\.body)\b|\bprocess\.argv\b|\blocation\.(?:search|hash|href)\b|\bdocument\.(?:cookie|URL|referrer)\b|\bURLSearchParams\b/,
  sanitizers: /^(?:parseInt|parseFloat|Number|Boolean|encodeURIComponent|encodeURI|escape\w*|DOMPurify\.sanitize|validator\.\w+|path\.basename|(?:\w+\.)*(?:hash|md5|sha1|sha256|sha512)|md5|sha1|sha256)$/,
  guards: {
    ifTypes: set('if_statement'),
    exitTypes: set('return_statement', 'throw_statement', 'continue_statement', 'break_statement'),
    notTypes: set('unary_expression'),
    validators: [
      { callee: /^(?:Number\.(?:isInteger|isSafeInteger|isFinite)|isFinite|validator\.is(?:Int|Numeric|UUID|Email|IP|Alphanumeric|Alpha|MongoId|Hexadecimal)|isUUID|uuidValidate)$/, argument: 0 },
      // /^\d+$/.test(x)
      { callee: /^\/\^[\s\S]*\$\/[a-z]*\.test$/, argument: 0 },
      // ALLOWED_HOSTS.includes(x): an allowlist held in a constant.
      { callee: /^[A-Z][A-Z0-9_]+\.(?:includes|has)$/, argument: 0 },
    ],
  },
  sinks: [
    { category: COMMAND, callee: /(?:^|\.)(?:exec|execSync|spawn|spawnSync|execFile|execFileSync|fork)$/ },
    { category: CODE, callee: /^(?:eval|Function|new Function|setTimeout|setInterval|vm\.runIn\w+)$/, argument: 0 },
    { category: SQL, callee: SQL_METHODS, argument: 0 },
    { category: PATH, callee: /(?:^|\.)(?:readFile|readFileSync|createReadStream|writeFile|writeFileSync|unlink|unlinkSync|sendFile|open|openSync)$/, argument: 0 },
    { category: SSRF, callee: /^(?:fetch|axios(?:\.(?:get|post|put|delete|request))?|https?\.(?:get|request)|got|request)$/, argument: 0 },
    { category: XSS, callee: /^(?:document\.write|document\.writeln|res\.send|res\.write|res\.end)$/, argument: 0 },
  ],
  sinkAssignments: [{ category: XSS, target: /\.(?:innerHTML|outerHTML)$/ }],
};

const PHP: FlowSpec = {
  functionTypes: set('function_definition', 'method_declaration', 'anonymous_function', 'arrow_function'),
  identifierTypes: set('variable_name'),
  assignment(node) {
    if (node.type === 'assignment_expression') return fields(node, 'left', 'right');
    if (node.type === 'augmented_assignment_expression') return fields(node, 'left', 'right', true);
    return null;
  },
  callTypes: set('function_call_expression', 'member_call_expression', 'scoped_call_expression', 'include_expression', 'require_expression', 'include_once_expression', 'require_once_expression'),
  sources: /\$_(?:GET|POST|REQUEST|COOKIE|FILES|SERVER)\b|\$request->(?:input|get|query|post|all)\(|\bfile_get_contents\('php:\/\/input'\)/,
  sanitizers: /^(?:intval|floatval|boolval|escapeshellarg|escapeshellcmd|htmlspecialchars|htmlentities|strip_tags|basename|filter_var|\$?\w+->quote|md5|sha1|hash|crc32|password_hash)$/,
  quoteSanitizers: /^(?:mysqli_real_escape_string|mysql_real_escape_string|addslashes|pg_escape_string|sqlite_escape_string|SQLite3::escapeString|\$?\w+->(?:real_escape_string|escapeString))$/,
  guards: {
    ifTypes: set('if_statement'),
    exitTypes: set('return_statement', 'exit_statement', 'continue_statement', 'break_statement'),
    exitCalls: /^(?:die|exit)$/,
    notTypes: set('unary_op_expression'),
    validators: [
      { callee: /^(?:is_numeric|is_int|is_integer|is_float|ctype_digit|ctype_alnum|ctype_alpha|ctype_xdigit)$/, argument: 0 },
      { callee: /^preg_match$/, argument: 1, requires: { argument: 0, text: ANCHORED_PATTERN } },
      { callee: /^filter_var$/, argument: 0, requires: { argument: 1, text: /FILTER_VALIDATE_/ } },
      // in_array($x, $allowed, true): strict allowlist membership.
      { callee: /^in_array$/, argument: 0, requires: { argument: 2, text: /^true$/i } },
    ],
  },
  sinks: [
    { category: COMMAND, callee: /^(?:system|exec|shell_exec|passthru|popen|proc_open|pcntl_exec)$/, argument: 0 },
    { category: CODE, callee: /^(?:eval|assert|create_function|preg_replace)$/, argument: 0 },
    // Procedural drivers take the connection first and the query second; pg_query also has a query-only form.
    { category: SQL, callee: /^(?:mysqli_query|mysqli_real_query|mysqli_multi_query|pg_query|pg_send_query|sqlite_query)$/ },
    { category: SQL, callee: SQL_METHODS, argument: 0 },
    // PDO, mysqli objects and Laravel's query builder: `$pdo->query(...)`, `DB::select(...)`, `->whereRaw(...)`.
    { category: SQL, callee: /(?:->|::)(?:query|exec|prepare|select|statement|unprepared|raw|whereRaw|orWhereRaw|selectRaw|orderByRaw|havingRaw|groupByRaw)$/, argument: 0 },
    { category: PATH, callee: /^(?:include|require|include_once|require_once|fopen|file_get_contents|readfile|file|unlink)$/, argument: 0 },
    { category: SSRF, callee: /^(?:curl_init|fsockopen)$/, argument: 0 },
  ],
  sinkStatements: [{ category: XSS, type: 'echo_statement' }],
};

const PYTHON: FlowSpec = {
  functionTypes: set('function_definition', 'lambda'),
  identifierTypes: set('identifier'),
  assignment(node) {
    if (node.type === 'assignment') return fields(node, 'left', 'right');
    if (node.type === 'augmented_assignment') return fields(node, 'left', 'right', true);
    return null;
  },
  callTypes: set('call'),
  sources: /\brequest\.(?:args|form|values|json|data|files|cookies|headers|GET|POST|body|query_params|path_params|get_json)\b|\binput\(|\bsys\.argv\b/,
  sanitizers: /^(?:int|float|bool|shlex\.quote|html\.escape|escape|bleach\.clean|os\.path\.basename|secure_filename|werkzeug\.utils\.secure_filename)$/,
  sinks: [
    { category: COMMAND, callee: /^(?:os\.system|os\.popen|subprocess\.(?:run|call|check_call|check_output|Popen|getoutput|getstatusoutput)|commands\.getoutput)$/, argument: 0 },
    { category: CODE, callee: /^(?:eval|exec|compile)$/, argument: 0 },
    { category: SQL, callee: SQL_METHODS, argument: 0 },
    { category: PATH, callee: /^(?:open|send_file|send_from_directory|os\.remove|shutil\.rmtree)$/, argument: 0 },
    { category: SSRF, callee: /^(?:requests\.(?:get|post|put|delete|request|head)|urlopen|urllib\.request\.urlopen|httpx\.(?:get|post))$/, argument: 0 },
    { category: XSS, callee: /^(?:HttpResponse|make_response|Markup|render_template_string)$/, argument: 0 },
  ],
};

const GO: FlowSpec = {
  functionTypes: set('function_declaration', 'method_declaration', 'func_literal'),
  identifierTypes: set('identifier'),
  assignment(node) {
    if (node.type === 'short_var_declaration') return fields(node, 'left', 'right');
    if (node.type === 'assignment_statement') return fields(node, 'left', 'right', node.childForFieldName('operator')?.text !== '=');
    if (node.type === 'var_spec') return fields(node, 'name', 'value');
    return null;
  },
  callTypes: set('call_expression'),
  sources: /\.URL\.Query\(\)|\.URL\.(?:Path|RawQuery)\b|\.(?:FormValue|PostFormValue|PathValue|Cookie)\(|\.(?:Form|PostForm)\.Get\(|\.Header\.Get\(|\bos\.Args\b|\bmux\.Vars\(|\bc\.(?:Query|Param|PostForm|DefaultQuery)\(/,
  sanitizers: /^(?:strconv\.\w+|filepath\.Base|path\.Base|html\.EscapeString|template\.HTMLEscapeString|url\.QueryEscape|url\.PathEscape)$/,
  sinks: [
    { category: COMMAND, callee: /^exec\.Command(?:Context)?$/ },
    { category: SQL, callee: GO_SQL_METHODS, argument: 0 },
    { category: SQL, callee: GO_SQL_CONTEXT_METHODS, argument: 1 },
    { category: PATH, callee: /^(?:os\.(?:Open|OpenFile|ReadFile|Remove|RemoveAll|Create)|ioutil\.ReadFile|http\.ServeFile)$/ },
    { category: SSRF, callee: /^http\.(?:Get|Post|Head)$/, argument: 0 },
    { category: XSS, callee: /^template\.(?:HTML|JS|URL)$/, argument: 0 },
  ],
};

const JAVA: FlowSpec = {
  functionTypes: set('method_declaration', 'constructor_declaration', 'lambda_expression'),
  identifierTypes: set('identifier'),
  assignment: (node) => (node.type === 'variable_declarator' ? fields(node, 'name', 'value') : node.type === 'assignment_expression' ? fields(node, 'left', 'right', node.childForFieldName('operator')?.text !== '=') : null),
  callTypes: set('method_invocation', 'object_creation_expression'),
  sources: /\.getParameter(?:Values|Map)?\(|\.getHeader\(|\.getQueryString\(|\.getCookies\(|\.getInputStream\(|\.getReader\(|\.getPathInfo\(/,
  sanitizers: /(?:^|\.)(?:parseInt|parseLong|valueOf|encodeForHTML|encodeForSQL|escapeHtml\w*|getName)$/,
  sinks: [
    { category: COMMAND, callee: /(?:Runtime\.getRuntime\(\)\.exec|new ProcessBuilder)$/ },
    { category: SQL, callee: SQL_METHODS, argument: 0 },
    { category: PATH, callee: /^(?:new File|new FileInputStream|new FileReader|Paths\.get|Path\.of|Files\.\w+)$/, argument: 0 },
    { category: SSRF, callee: /^new URL$/, argument: 0 },
    { category: XSS, callee: /getWriter\(\)\.(?:print|println|write)$/, argument: 0 },
  ],
};

const CSHARP: FlowSpec = {
  functionTypes: set('method_declaration', 'constructor_declaration', 'local_function_statement', 'lambda_expression'),
  identifierTypes: set('identifier'),
  assignment: (node) => (node.type === 'variable_declarator' ? declarator(node) : node.type === 'assignment_expression' ? fields(node, 'left', 'right', node.childForFieldName('operator')?.text !== '=') : null),
  callTypes: set('invocation_expression', 'object_creation_expression'),
  sources: /\bRequest\.(?:Query|Form|Headers|Cookies|Body|QueryString|RouteValues)\b|\bConsole\.ReadLine\(|\bEnvironment\.GetCommandLineArgs\(/,
  sanitizers: /(?:^|\.)(?:Parse|TryParse|HtmlEncode|UrlEncode|GetFileName)$/,
  sinks: [
    { category: COMMAND, callee: /^(?:Process\.Start|new ProcessStartInfo)$/ },
    { category: SQL, callee: /^(?:new SqlCommand|new SqliteCommand|new NpgsqlCommand|.*\.(?:ExecuteSqlRaw|FromSqlRaw|ExecuteSqlCommand))$/, argument: 0 },
    { category: PATH, callee: /^(?:File\.\w+|new FileStream|new StreamReader)$/, argument: 0 },
    { category: SSRF, callee: /\.(?:GetAsync|GetStringAsync|PostAsync|SendAsync)$/, argument: 0 },
  ],
};

const RUST: FlowSpec = {
  functionTypes: set('function_item', 'closure_expression'),
  identifierTypes: set('identifier'),
  assignment(node) {
    if (node.type === 'let_declaration') return fields(node, 'pattern', 'value');
    if (node.type === 'assignment_expression') return fields(node, 'left', 'right');
    if (node.type === 'compound_assignment_expr') return fields(node, 'left', 'right', true);
    return null;
  },
  callTypes: set('call_expression', 'macro_invocation'),
  sources: /\b(?:std::)?env::args\(|\bstdin\(\)|\bread_line\(/,
  sanitizers: /(?:^|::|\.)(?:parse|file_name)$/,
  sinks: [
    { category: COMMAND, callee: /(?:^|::)Command::new$|\.arg$|\.args$/ },
    { category: SQL, callee: /(?:^|::|\.)(?:query|execute|query_as)$/, argument: 0 },
    { category: PATH, callee: /(?:^|::)(?:File::open|File::create|fs::read_to_string|fs::read|fs::remove_file)$/, argument: 0 },
    { category: SSRF, callee: /(?:^|::)(?:reqwest::get|get)$/, argument: 0 },
  ],
};

const CPP: FlowSpec = {
  functionTypes: set('function_definition', 'lambda_expression'),
  identifierTypes: set('identifier'),
  assignment(node) {
    if (node.type === 'init_declarator') return fields(node, 'declarator', 'value');
    if (node.type === 'assignment_expression') return fields(node, 'left', 'right', node.childForFieldName('operator')?.text !== '=');
    return null;
  },
  callTypes: set('call_expression'),
  sources: /\bargv\b|\bgetenv\(|\bstd::cin\b|\bfgets\(|\bscanf\(|\bgets\(/,
  sanitizers: /(?:^|::)(?:stoi|stol|atoi|atol|strtol)$/,
  sinks: [
    { category: COMMAND, callee: /^(?:std::)?(?:system|popen|_popen|execl|execlp|execv|execvp|execve)$/, argument: 0 },
    { category: SQL, callee: /^(?:sqlite3_exec|mysql_query|PQexec)$/, argument: 1 },
    { category: PATH, callee: /^(?:std::)?(?:fopen|ifstream|ofstream|remove|open)$/, argument: 0 },
  ],
};

/** Flow rules per grammar. TypeScript and TSX share the JavaScript rules. */
export const FLOW_SPECS: Record<FlowGrammar, FlowSpec> = {
  javascript: JAVASCRIPT,
  typescript: JAVASCRIPT,
  tsx: JAVASCRIPT,
  php: PHP,
  python: PYTHON,
  go: GO,
  java: JAVA,
  csharp: CSHARP,
  rust: RUST,
  cpp: CPP,
};
