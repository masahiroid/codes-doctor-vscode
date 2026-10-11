import path from 'node:path';
import { parseArgs } from 'node:util';

export type ReportLanguage = 'en' | 'ja';

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
}

export type Command =
  | { kind: 'analyze'; options: AnalyzeOptions }
  | { kind: 'help' }
  | { kind: 'version' };

export const DEFAULT_OUTPUT_DIR = 'codes-doctor-report';
const REPORT_LANGUAGES: readonly ReportLanguage[] = ['en', 'ja'];
const SCORE_RANGE = { min: 0, max: 100 } as const;

export const USAGE = `Usage: codes-doctor analyze [path] [options]

Analyzes a folder and writes an HTML report.

Options:
  -o, --out <dir>            Report folder (default: ./${DEFAULT_OUTPUT_DIR})
      --lang <en|ja>         Report language (default: en)
      --language <name>      Only analyze one language: auto, typescript, javascript,
                             php, dart, python, go, swift, csharp, java, kotlin,
                             rust, cpp (default: auto)
      --min-security <n>     Exit with code 1 if the security score is below n
      --min-debt <n>         Exit with code 1 if the technical debt score is below n
      --json                 Print the summary as JSON
      --verbose              Show the engine's progress log
  -h, --help                 Show this help
  -v, --version              Show the version

Exit codes: 0 success, 1 a score is below its minimum, 2 invalid usage or analysis error.`;

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
      json: { type: 'boolean' },
      verbose: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.help) return { kind: 'help' };
  if (values.version) return { kind: 'version' };

  const [command, target, ...extra] = positionals;
  if (command !== 'analyze') throw new Error(command ? `Unknown command: ${command}` : 'Missing command');
  if (extra.length > 0) throw new Error(`Unexpected argument: ${extra[0]}`);

  const reportLanguage = values.lang ?? 'en';
  if (!(REPORT_LANGUAGES as readonly string[]).includes(reportLanguage)) {
    throw new Error(`--lang must be one of: ${REPORT_LANGUAGES.join(', ')}`);
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
