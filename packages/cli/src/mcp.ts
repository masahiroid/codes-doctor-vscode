import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';

type Engine = typeof import('../vendor/csap-en');
type AnalysisResult = import('../vendor/csap-en/types').AnalysisResult;
type SecurityIssue = import('../vendor/csap-en/types').SecurityIssue;

/**
 * Codes Doctor as an MCP (Model Context Protocol) server over stdio: newline-delimited JSON-RPC 2.0.
 * The tools return facts from the AST and data-flow analysis (files, lines, traced paths), so an
 * agent can fix and verify code from them. Only folders inside the server's root are analyzed, the
 * source never leaves the machine, and stdout carries protocol messages only.
 */

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;
const ANALYSIS_LANGUAGES = ['auto', 'typescript', 'javascript', 'php', 'dart', 'python', 'go', 'swift', 'csharp', 'java', 'kotlin', 'rust', 'cpp'];
const RANKS = ['low', 'medium', 'high', 'critical'] as const;
const SEVERITY_ORDER = ['info', 'low', 'medium', 'high', 'critical'] as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const TOP_ITEMS = 10;

const ERROR = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 } as const;

/** A tool argument problem, reported to the client as a tool error (not a protocol error). */
class ToolInputError extends Error {}

const pathProperty = { type: 'string', description: 'Folder to analyze, relative to the server root (default: the root)' };
const refreshProperty = { type: 'boolean', description: 'Analyze again instead of using the result of an earlier call' };
const limitProperty = { type: 'integer', minimum: 1, maximum: MAX_LIMIT, description: `Maximum items to return (default ${DEFAULT_LIMIT})` };

export const TOOLS = [
  {
    name: 'analyze',
    title: 'Analyze code health and security',
    description: 'Static analysis of a folder: technical debt and security scores, security findings by severity, God Classes, circular dependencies and dependency vulnerabilities. Deterministic (AST and data flow); the source stays on this machine. Later calls reuse the result until refresh is set.',
    inputSchema: {
      type: 'object',
      properties: {
        path: pathProperty,
        language: { type: 'string', enum: ANALYSIS_LANGUAGES, description: 'Only analyze one language (default: auto)' },
        refresh: refreshProperty,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_taint_flow',
    title: 'Get traced data flows of security findings',
    description: 'Security findings where untrusted input was traced to a dangerous call: the source, each step and the sink, with file, line and code. Findings that only matched a code pattern are included when include_pattern is set. Test code is excluded unless include_tests is set.',
    inputSchema: {
      type: 'object',
      properties: {
        path: pathProperty,
        file: { type: 'string', description: 'Only findings in this file (relative to the analyzed folder)' },
        category: { type: 'string', description: 'Only this category, e.g. "SQL Injection" (case insensitive)' },
        min_severity: { type: 'string', enum: [...SEVERITY_ORDER], description: 'Only this severity or worse (default: low)' },
        include_pattern: { type: 'boolean', description: 'Also return findings without a traced flow' },
        include_tests: { type: 'boolean', description: 'Also return findings in test code' },
        limit: limitProperty,
        refresh: refreshProperty,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_god_classes',
    title: 'Get God Classes',
    description: 'Oversized classes to refactor, highest score first, with methods, lines, imports, properties, complexity and the reasons they were flagged.',
    inputSchema: {
      type: 'object',
      properties: {
        path: pathProperty,
        min_rank: { type: 'string', enum: [...RANKS], description: 'Only this rank or worse (default: low)' },
        limit: limitProperty,
        refresh: refreshProperty,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
] as const;

interface JsonRpcMessage {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

type Args = Record<string, unknown>;

export interface McpServerOptions {
  /** Only folders inside this one can be analyzed. */
  root: string;
  engine: Engine;
  version: string;
  input: Readable;
  output: Writable;
  /** Where the engine's progress log goes (never stdout). */
  log?: (line: string) => void;
}

function relative(root: string, file: string): string {
  const rel = path.relative(root, file);
  return (rel === '' ? '.' : rel).split(path.sep).join('/');
}

function stringArg(args: Args, name: string): string | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ToolInputError(`${name} must be a string`);
  return value;
}

function booleanArg(args: Args, name: string): boolean {
  const value = args[name];
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new ToolInputError(`${name} must be a boolean`);
  return value;
}

function enumArg<T extends string>(args: Args, name: string, allowed: readonly T[]): T | undefined {
  const value = stringArg(args, name);
  if (value !== undefined && !(allowed as readonly string[]).includes(value)) throw new ToolInputError(`${name} must be one of: ${allowed.join(', ')}`);
  return value as T | undefined;
}

function limitArg(args: Args): number {
  const value = args.limit;
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_LIMIT) throw new ToolInputError(`limit must be an integer from 1 to ${MAX_LIMIT}`);
  return value;
}

const flowOf = (issue: SecurityIssue) => issue.confidence === 'flow' && issue.flow !== undefined;

export class McpServer {
  private readonly root: string;
  private readonly cache = new Map<string, Promise<AnalysisResult>>();

  constructor(private readonly options: McpServerOptions) {
    this.root = fs.realpathSync(path.resolve(options.root));
  }

  /** Serve until the input ends. Messages are handled one at a time, in order. */
  async serve(): Promise<void> {
    const lines = readline.createInterface({ input: this.options.input, crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      const reply = await this.handleLine(line);
      if (reply !== undefined) this.options.output.write(`${JSON.stringify(reply)}\n`);
    }
  }

  /** The reply to one line of input, or undefined for a notification. */
  async handleLine(line: string): Promise<unknown> {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return this.error(null, ERROR.parse, 'Parse error');
    }
    if (Array.isArray(message)) {
      if (message.length === 0) return this.error(null, ERROR.invalidRequest, 'Empty batch');
      const replies = (await Promise.all(message.map((item) => this.handle(item)))).filter((reply) => reply !== undefined);
      return replies.length > 0 ? replies : undefined;
    }
    return this.handle(message);
  }

  private async handle(raw: unknown): Promise<unknown> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return this.error(null, ERROR.invalidRequest, 'Invalid request');
    const message = raw as JsonRpcMessage;
    const id = message.id;
    const isRequest = typeof id === 'string' || typeof id === 'number';
    if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      // Responses from the client (we send no requests) and malformed notifications are ignored.
      return isRequest && message.method !== undefined ? this.error(id, ERROR.invalidRequest, 'Invalid request') : undefined;
    }
    if (!isRequest) {
      return undefined;
    }
    const params = (message.params && typeof message.params === 'object' && !Array.isArray(message.params) ? message.params : {}) as Args;
    try {
      switch (message.method) {
        case 'initialize':
          return this.result(id, this.initialize(params));
        case 'ping':
          return this.result(id, {});
        case 'tools/list':
          return this.result(id, { tools: TOOLS });
        case 'tools/call':
          return this.result(id, await this.callTool(params));
        default:
          return this.error(id, ERROR.methodNotFound, `Method not found: ${message.method}`);
      }
    } catch (error) {
      if (error instanceof ProtocolError) return this.error(id, error.code, error.message);
      return this.error(id, ERROR.internal, error instanceof Error ? error.message : String(error));
    }
  }

  private initialize(params: Args) {
    const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
    const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
    return {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'codes-doctor', title: 'Codes Doctor', version: this.options.version },
      instructions: `Static analysis of code under ${this.root}. Call analyze first, then get_taint_flow for the traced path of each security finding and get_god_classes for refactoring targets. Results come from AST and data-flow analysis; "no flow found" is not proof of safety. Paths are relative to the root.`,
    };
  }

  private async callTool(params: Args) {
    const name = params.name;
    if (typeof name !== 'string') throw new ProtocolError(ERROR.invalidParams, 'Missing tool name');
    if (!TOOLS.some((tool) => tool.name === name)) throw new ProtocolError(ERROR.invalidParams, `Unknown tool: ${name}`);
    const args = (params.arguments ?? {}) as Args;
    if (typeof args !== 'object' || Array.isArray(args)) throw new ProtocolError(ERROR.invalidParams, 'arguments must be an object');
    try {
      const known = new Set(Object.keys(TOOLS.find((tool) => tool.name === name)!.inputSchema.properties));
      const unknown = Object.keys(args).find((key) => !known.has(key));
      if (unknown) throw new ToolInputError(`Unknown argument: ${unknown}`);
      const data = name === 'analyze' ? await this.analyze(args) : name === 'get_taint_flow' ? await this.taintFlows(args) : await this.godClasses(args);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data };
    } catch (error) {
      // Failures of the tool itself go back as a result the model can read and correct.
      return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true };
    }
  }

  /** Resolve `path` inside the root; symbolic links cannot lead outside it. */
  resolveFolder(requested: string | undefined): string {
    const candidate = path.resolve(this.root, requested ?? '.');
    let real: string;
    try {
      real = fs.realpathSync(candidate);
    } catch {
      throw new ToolInputError(`Folder not found: ${requested ?? '.'}`);
    }
    if (real !== this.root && !real.startsWith(this.root + path.sep)) throw new ToolInputError(`Outside the server root: ${requested}`);
    if (!fs.statSync(real).isDirectory()) throw new ToolInputError(`Not a folder: ${requested}`);
    return real;
  }

  private async load(args: Args): Promise<{ folder: string; result: AnalysisResult }> {
    const folder = this.resolveFolder(stringArg(args, 'path'));
    const language = enumArg(args, 'language', ANALYSIS_LANGUAGES) ?? 'auto';
    const key = `${folder}\0${language}`;
    if (booleanArg(args, 'refresh')) this.cache.delete(key);
    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.runAnalysis(folder, language);
      this.cache.set(key, pending);
      pending.catch(() => this.cache.delete(key));
    }
    return { folder, result: await pending };
  }

  private async runAnalysis(folder: string, language: string): Promise<AnalysisResult> {
    const log = this.options.log ?? (() => {});
    const saved = { log: console.log, info: console.info, warn: console.warn, debug: console.debug };
    // The engine logs progress with console.*; stdout belongs to the protocol.
    const toLog = (...items: unknown[]) => log(items.map(String).join(' '));
    console.log = toLog;
    console.info = toLog;
    console.warn = toLog;
    console.debug = toLog;
    try {
      return await this.options.engine.runAnalysis(folder, randomUUID(), language as never);
    } finally {
      Object.assign(console, saved);
    }
  }

  private async analyze(args: Args) {
    const { folder, result } = await this.load(args);
    const security = result.securityScore;
    const counted = (security?.issues ?? []).filter((issue) => !issue.inTest);
    const empty = result.summary.totalFiles === 0;
    const vulnerabilities = result.vulnerabilityScan;
    return {
      path: relative(this.root, folder),
      analyzedAt: result.analyzedAt,
      languages: Object.keys(result.files ?? {}).filter((language) => ((result.files as unknown as Record<string, unknown[]>)[language] ?? []).length > 0),
      summary: result.summary,
      technicalDebt: empty || !result.technicalDebt ? null : { score: result.technicalDebt.overallScore, grade: result.technicalDebt.grade },
      security: empty || !security ? null : {
        score: security.overallScore,
        grade: security.grade,
        counts: security.summary,
        tracedFlows: counted.filter(flowOf).length,
        patternMatches: counted.filter((issue) => !flowOf(issue)).length,
        inTests: (security.issues ?? []).length - counted.length,
        topRisks: security.topRisks,
      },
      godClasses: {
        total: result.godClasses.length,
        byRank: Object.fromEntries(RANKS.map((rank) => [rank, result.godClasses.filter((item) => item.rank === rank).length])),
        top: [...result.godClasses].sort((a, b) => b.godScore - a.godScore).slice(0, TOP_ITEMS).map((item) => ({ className: item.className, file: relative(folder, path.resolve(folder, item.filePath)), godScore: item.godScore, rank: item.rank })),
      },
      circularDependencies: { total: result.circularDependencies.length, cycles: result.circularDependencies.slice(0, TOP_ITEMS) },
      dependencies: vulnerabilities ? {
        critical: vulnerabilities.critical,
        high: vulnerabilities.high,
        moderate: vulnerabilities.moderate,
        low: vulnerabilities.low,
        incomplete: vulnerabilities.incomplete === true,
      } : null,
      next: 'get_taint_flow returns the traced path of each security finding; get_god_classes returns the refactoring targets.',
    };
  }

  private async taintFlows(args: Args) {
    const file = stringArg(args, 'file');
    const category = stringArg(args, 'category')?.toLowerCase();
    const minSeverity = enumArg(args, 'min_severity', SEVERITY_ORDER) ?? 'low';
    const includePattern = booleanArg(args, 'include_pattern');
    const includeTests = booleanArg(args, 'include_tests');
    const limit = limitArg(args);
    const { folder, result } = await this.load(args);
    const threshold = SEVERITY_ORDER.indexOf(minSeverity);
    const wantedFile = file === undefined ? undefined : relative(folder, path.resolve(folder, file));
    const matches = (result.securityScore?.issues ?? []).filter((issue) =>
      (includePattern || flowOf(issue))
      && (includeTests || !issue.inTest)
      && SEVERITY_ORDER.indexOf(issue.type) >= threshold
      && (category === undefined || issue.category.toLowerCase() === category)
      && (wantedFile === undefined || relative(folder, path.resolve(folder, issue.filePath)) === wantedFile));
    matches.sort((a, b) => SEVERITY_ORDER.indexOf(b.type) - SEVERITY_ORDER.indexOf(a.type)
      || a.filePath.localeCompare(b.filePath) || (a.lineNumber ?? 0) - (b.lineNumber ?? 0));
    return {
      path: relative(this.root, folder),
      total: matches.length,
      truncated: matches.length > limit,
      findings: matches.slice(0, limit).map((issue) => ({
        severity: issue.type,
        category: issue.category,
        file: relative(folder, path.resolve(folder, issue.filePath)),
        line: issue.lineNumber ?? null,
        description: issue.description,
        recommendation: issue.recommendation,
        confidence: flowOf(issue) ? 'flow' : 'pattern',
        ...(issue.inTest ? { inTest: true } : {}),
        ...(issue.flow ? { flow: issue.flow } : issue.codeSnippet ? { code: issue.codeSnippet } : {}),
      })),
    };
  }

  private async godClasses(args: Args) {
    const minRank = enumArg(args, 'min_rank', RANKS) ?? 'low';
    const limit = limitArg(args);
    const { folder, result } = await this.load(args);
    const matches = result.godClasses
      .filter((item) => RANKS.indexOf(item.rank) >= RANKS.indexOf(minRank))
      .sort((a, b) => b.godScore - a.godScore);
    return {
      path: relative(this.root, folder),
      total: matches.length,
      truncated: matches.length > limit,
      godClasses: matches.slice(0, limit).map((item) => ({
        className: item.className,
        file: relative(folder, path.resolve(folder, item.filePath)),
        godScore: item.godScore,
        rank: item.rank,
        methods: item.methodCount,
        lines: item.lineCount,
        imports: item.importCount,
        properties: item.propertyCount,
        ...(item.cyclomaticComplexity !== undefined ? { cyclomaticComplexity: item.cyclomaticComplexity } : {}),
        warnings: item.warnings,
      })),
    };
  }

  private result(id: unknown, result: unknown) {
    return { jsonrpc: '2.0', id, result };
  }

  private error(id: unknown, code: number, message: string) {
    return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
  }
}

class ProtocolError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}
