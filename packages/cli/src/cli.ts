import fs from 'node:fs';
import path from 'node:path';
import { AnalyzeOptions, parseCommand, USAGE } from './options';
import { formatSummary, summarize } from './summary';

type Engine = typeof import('../vendor/csap-en');

const EXIT = { ok: 0, thresholdFailed: 1, error: 2 } as const;
const VERSION: string = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;

/** The engine build for the report language: vendor/csap is Japanese, vendor/csap-en English. */
function loadEngine(language: AnalyzeOptions['reportLanguage']): Engine {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(path.join(__dirname, '..', 'vendor', language === 'ja' ? 'csap' : 'csap-en'));
}

/** Run the engine with its progress log silenced unless verbose output was requested. */
async function quietly<T>(verbose: boolean, work: () => Promise<T>): Promise<T> {
  if (verbose) return work();
  const { log, warn } = console;
  console.log = () => {};
  console.warn = () => {};
  try {
    return await work();
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

async function analyze(options: AnalyzeOptions): Promise<number> {
  const engine = loadEngine(options.reportLanguage);
  fs.mkdirSync(options.outputDir, { recursive: true });
  const analysis = await quietly(options.verbose, () =>
    engine.analyzeRepository(options.repoPath, options.analysisLanguage, options.outputDir, { generatorVersion: `cli ${VERSION}` })
  );
  const summary = summarize(analysis.result, analysis.reportPath, options);
  process.stdout.write((options.json ? JSON.stringify(summary, null, 2) : formatSummary(summary)) + '\n');
  return summary.failures.length > 0 ? EXIT.thresholdFailed : EXIT.ok;
}

export async function main(argv: string[]): Promise<number> {
  let command;
  try {
    command = parseCommand(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}\n`);
    return EXIT.error;
  }
  if (command.kind === 'help') {
    process.stdout.write(USAGE + '\n');
    return EXIT.ok;
  }
  if (command.kind === 'version') {
    process.stdout.write(VERSION + '\n');
    return EXIT.ok;
  }
  try {
    return await analyze(command.options);
  } catch (error) {
    process.stderr.write(`codes-doctor: ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT.error;
  }
}
