import path from 'node:path';
import { parseArgs } from 'node:util';

export type ReportLanguage = 'en' | 'ja';

/** Mildest first. */
export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface AnalyzeOptions {
  repoPath: string;
  outputDir: string;
  reportLanguage: ReportLanguage;
  analysisLanguage: string;
  json: boolean;
  verbose: boolean;
  /** Fail (exit code 1) when a score is below this minimum. */
  minSecurity?: number;
  minTechnicalDebt?: number;
  /** Fail (exit code 1) on findings of this severity or worse. */
  failOn?: Severity;
  /** Let --fail-on pass when the dependency scan could not finish. */
  allowIncompleteScan: boolean;
}

export const CHANNELS = ['emergency', 'baseline', 'regulatory'] as const;
export const AUDIT_FORMATS = ['json', 'csv', 'xlsx'] as const;
export type AuditFormat = (typeof AUDIT_FORMATS)[number];

export interface AuditOptions {
  repoPath: string;
  outputDir: string;
  reportLanguage: ReportLanguage;
  /** Manifest URL (https: or file:). */
  rulesUrl?: string;
  /** Verified copy of the last downloaded rules; compared with the next download. */
  rulesCache?: string;
  offline: boolean;
  channels: string[];
  packs: string[];
  formats: AuditFormat[];
  evidencePath?: string;
  target?: string;
  /** Verify the evidence (read only) instead of updating it; exit code 1 when it does not pass. */
  check: boolean;
  /** Exit code 1 when an input flow or a missing ownership check is found. */
  failOnFindings: boolean;
  json: boolean;
}

export type Command =
  | { kind: 'analyze'; options: AnalyzeOptions }
  | { kind: 'audit'; options: AuditOptions }
  | { kind: 'help' }
  | { kind: 'version' };

export const DEFAULT_OUTPUT_DIR = 'codes-doctor-report';
const REPORT_LANGUAGES: readonly ReportLanguage[] = ['en', 'ja'];
const SCORE_RANGE = { min: 0, max: 100 } as const;

export const DEFAULT_AUDIT_DIR = path.join(DEFAULT_OUTPUT_DIR, 'security-audit');

export const USAGE = `Usage: codesdoctor analyze [path] [options]
       codesdoctor audit [path] [options]

Analyzes a folder and writes an HTML report.

Options:
  -o, --out <dir>            Report folder (default: ./${DEFAULT_OUTPUT_DIR})
      --lang <en|ja>         Report language (default: en)
      --language <name>      Only analyze one language: auto, typescript, javascript,
                             php, dart, python, go, swift, csharp, java, kotlin,
                             rust, cpp (default: auto)
      --min-security <n>     Exit with code 1 if the security score is below n
      --min-debt <n>         Exit with code 1 if the technical debt score is below n
      --fail-on <severity>   Exit with code 1 on security findings of this severity or
                             worse: low, medium, high, critical. Also fails if the
                             dependency scan could not finish
      --allow-incomplete-scan
                             Do not fail --fail-on because of an unfinished scan
      --json                 Print the summary as JSON
      --verbose              Show the engine's progress log
  -h, --help                 Show this help
  -v, --version              Show the version

Audit: checks a folder against distributed security rules (security-rules manifest),
writes the audit report, a management sheet (CSV, Excel) and review evidence.

Audit options:
  -o, --out <dir>            Report folder (default: ./${DEFAULT_AUDIT_DIR})
      --rules <url>          Rules manifest URL, https: or file: (default: the public
                             masahiroid/security-rules manifest)
      --rules-cache <dir>    Where the last verified rules are kept and compared with
                             the next download (default: the user cache folder)
      --offline              Use the cached rules only
      --channel <list>       Only packs of these channels: emergency, baseline,
                             regulatory (comma separated)
      --pack <list>          Only these packs (comma separated ids)
      --format <list>        Outputs: json, csv, xlsx (default: all)
      --lang <en|ja>         Sheet language (default: en)
      --evidence <file>      Create or update this evidence.json (needs --target)
      --target <name>        Service and environment the evidence is for
      --check                Do not update the evidence; exit with code 1 unless every
                             selected rule has a current pass or not-applicable review
      --fail-on-findings     Exit with code 1 when an input flow or a missing
                             ownership check is found
      --json                 Print the summary as JSON

Exit codes: 0 success, 1 a score, finding or evidence check failed, 2 invalid usage or
analysis error.`;

/** Parse command line arguments; throws a usage error message on invalid input. */
export function parseCommand(argv: string[]): Command {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      lang: { type: 'string' },
      language: { type: 'string' },
      'min-security': { type: 'string' },
      'min-debt': { type: 'string' },
      'fail-on': { type: 'string' },
      'allow-incomplete-scan': { type: 'boolean' },
      json: { type: 'boolean' },
      verbose: { type: 'boolean' },
      rules: { type: 'string' },
      'rules-cache': { type: 'string' },
      offline: { type: 'boolean' },
      channel: { type: 'string' },
      pack: { type: 'string' },
      format: { type: 'string' },
      evidence: { type: 'string' },
      target: { type: 'string' },
      check: { type: 'boolean' },
      'fail-on-findings': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.help) return { kind: 'help' };
  if (values.version) return { kind: 'version' };

  const [command, target, ...extra] = positionals;
  if (command !== 'analyze' && command !== 'audit') throw new Error(command ? `Unknown command: ${command}` : 'Missing command');
  if (extra.length > 0) throw new Error(`Unexpected argument: ${extra[0]}`);

  const reportLanguage = values.lang ?? 'en';
  if (!(REPORT_LANGUAGES as readonly string[]).includes(reportLanguage)) {
    throw new Error(`--lang must be one of: ${REPORT_LANGUAGES.join(', ')}`);
  }

  const analyzeOnly = ['language', 'min-security', 'min-debt', 'fail-on', 'allow-incomplete-scan', 'verbose'] as const;
  const auditOnly = ['rules', 'rules-cache', 'offline', 'channel', 'pack', 'format', 'evidence', 'target', 'check', 'fail-on-findings'] as const;
  const misplaced = (command === 'audit' ? analyzeOnly : auditOnly).find((name) => values[name] !== undefined);
  if (misplaced) throw new Error(`--${misplaced} is not an option of ${command}`);

  if (command === 'audit') {
    const channels = list(values.channel);
    const unknown = channels.find((channel) => !(CHANNELS as readonly string[]).includes(channel));
    if (unknown) throw new Error(`--channel must be one of: ${CHANNELS.join(', ')}`);
    const formats = values.format === undefined ? [...AUDIT_FORMATS] : list(values.format);
    const badFormat = formats.find((format) => !(AUDIT_FORMATS as readonly string[]).includes(format));
    if (badFormat || formats.length === 0) throw new Error(`--format must list: ${AUDIT_FORMATS.join(', ')}`);
    if (values.evidence !== undefined && !values.target?.trim()) throw new Error('--evidence needs --target (service and environment)');
    if (values.check && values.evidence === undefined) throw new Error('--check needs --evidence and --target');
    return {
      kind: 'audit',
      options: {
        repoPath: path.resolve(target ?? '.'),
        outputDir: path.resolve(values.out ?? DEFAULT_AUDIT_DIR),
        reportLanguage: reportLanguage as ReportLanguage,
        rulesUrl: values.rules,
        rulesCache: values['rules-cache'] === undefined ? undefined : path.resolve(values['rules-cache']),
        offline: values.offline ?? false,
        channels,
        packs: list(values.pack),
        formats: formats as AuditFormat[],
        evidencePath: values.evidence === undefined ? undefined : path.resolve(values.evidence),
        target: values.target?.trim(),
        check: values.check ?? false,
        failOnFindings: values['fail-on-findings'] ?? false,
        json: values.json ?? false,
      },
    };
  }

  const failOn = values['fail-on'];
  if (failOn !== undefined && !(SEVERITIES as readonly string[]).includes(failOn)) {
    throw new Error(`--fail-on must be one of: ${SEVERITIES.join(', ')}`);
  }

  return {
    kind: 'analyze',
    options: {
      repoPath: path.resolve(target ?? '.'),
      outputDir: path.resolve(values.out ?? DEFAULT_OUTPUT_DIR),
      reportLanguage: reportLanguage as ReportLanguage,
      analysisLanguage: values.language ?? 'auto',
      json: values.json ?? false,
      verbose: values.verbose ?? false,
      minSecurity: parseScore(values['min-security'], '--min-security'),
      minTechnicalDebt: parseScore(values['min-debt'], '--min-debt'),
      failOn: failOn as Severity | undefined,
      allowIncompleteScan: values['allow-incomplete-scan'] ?? false,
    },
  };
}

function parseScore(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const score = Number(value);
  if (!Number.isFinite(score) || score < SCORE_RANGE.min || score > SCORE_RANGE.max) {
    throw new Error(`${flag} must be a number from ${SCORE_RANGE.min} to ${SCORE_RANGE.max}`);
  }
  return score;
}

function list(value: string | undefined): string[] {
  return (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}
