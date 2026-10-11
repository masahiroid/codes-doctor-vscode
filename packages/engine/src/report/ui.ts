import { escapeHtml } from '../html';

/**
 * Small HTML building blocks shared by every report section. Colors are never written
 * here: components take a tone, and the stylesheet (theme.ts) maps tones to the light
 * or dark palette.
 */
export type Tone = 'lavender' | 'sky' | 'mint' | 'butter' | 'peach' | 'rose';

const SEVERITY_TONES: Record<string, Tone> = {
  critical: 'rose', high: 'peach', medium: 'butter', moderate: 'butter', low: 'sky', info: 'lavender',
};
const GRADE_TONES: Record<string, Tone> = { A: 'mint', B: 'sky', C: 'butter', D: 'peach', F: 'rose' };

/** Scores at or above these thresholds read as good / fair; anything lower as poor. */
const SCORE_TONE_THRESHOLDS = { good: 80, fair: 60 } as const;

export function severityTone(severity: string): Tone {
  return SEVERITY_TONES[severity.toLowerCase()] ?? 'lavender';
}

export function gradeTone(grade: string): Tone {
  return GRADE_TONES[grade.toUpperCase()] ?? 'lavender';
}

export function scoreTone(score: number): Tone {
  if (score >= SCORE_TONE_THRESHOLDS.good) return 'mint';
  if (score >= SCORE_TONE_THRESHOLDS.fair) return 'butter';
  return 'rose';
}

export function badge(text: string, tone: Tone, options: { upper?: boolean; title?: string } = {}): string {
  const title = options.title ? ` title="${escapeHtml(options.title)}"` : '';
  return `<span class="badge tone-${tone}${options.upper ? ' upper' : ''}"${title}>${text}</span>`;
}

/** A horizontal score bar (0–100) with its number. */
export function meter(value: number, tone: Tone): string {
  const width = Math.max(0, Math.min(100, value));
  return `<div class="meter tone-${tone}"><span class="track"><i style="width:${width}%"></i></span><b>${value}</b></div>`;
}

export function stat(label: string, value: string | number, options: { suffix?: string; tone?: Tone } = {}): string {
  const tone = options.tone ? ` tone-${options.tone}` : '';
  return `<div class="stat${tone}"><div class="k">${label}</div><div class="v">${value}${options.suffix ? `<small>${options.suffix}</small>` : ''}</div></div>`;
}

export interface ScoreCardOptions {
  label: string;
  /** Null when there was nothing to score. */
  score: number | null;
  grade: string;
  headline: string;
  note?: string;
  tone: Tone;
}

/** A score shown as a ring, with its grade, a one-line verdict and a note. */
export function scoreCard(options: ScoreCardOptions): string {
  const pct = options.score ?? 0;
  return `<div class="score glass tone-${options.tone}">
    <div class="ring" style="--pct:${pct}"><div><span class="num">${options.score ?? 'N/A'}</span><span class="of">/ 100</span></div></div>
    <div>
      <div class="label">${options.label}</div>
      <div class="headline">${options.headline}</div>
      ${options.score === null ? '' : badge(`Grade ${options.grade}`, gradeTone(options.grade))}
      ${options.note ? `<div class="note">${options.note}</div>` : ''}
    </div>
  </div>`;
}

export interface StackPart {
  label: string;
  count: number;
  tone: Tone;
}

/** A card with a total and a stacked bar of its parts, e.g. findings by severity. */
export function countCard(title: string, parts: StackPart[], options: { total?: number; empty?: string } = {}): string {
  const total = options.total ?? parts.reduce((sum, part) => sum + part.count, 0);
  const shown = parts.filter((part) => part.count > 0);
  const bar = total > 0
    ? shown.map((part) => `<span class="tone-${part.tone}" style="width:${(part.count / total) * 100}%"></span>`).join('')
    : '';
  const legend = shown.length
    ? shown.map((part) => `<span class="tone-${part.tone}"><i class="dot"></i>${part.label} ${part.count}</span>`).join('')
    : `<span class="tone-mint"><i class="dot"></i>${options.empty ?? '0'}</span>`;
  return `<div class="count-card panel glass">
    <div class="row"><span class="name">${title}</span><span class="total">${total}</span></div>
    <div class="stack">${bar}</div>
    <div class="legend">${legend}</div>
  </div>`;
}

export function notice(tone: Tone, title: string, body: string): string {
  return `<div class="notice tone-${tone}"><div class="title">${title}</div>${body}</div>`;
}

export function panel(body: string, options: { title?: string; sub?: string; className?: string } = {}): string {
  return `<div class="panel glass${options.className ? ` ${options.className}` : ''}">
    ${options.title ? `<h3>${options.title}</h3>` : ''}${options.sub ? `<div class="sub">${options.sub}</div>` : ''}
    ${body}
  </div>`;
}

export function section(title: string, body: string, id?: string): string {
  return `
  <section${id ? ` id="${id}"` : ''}>
    <h2>${title}</h2>
    ${body}
  </section>`;
}

/** A table: `headers` may mark numeric columns with a leading `#` (right-aligned). */
export function table(headers: string[], rows: string[], options: { more?: string } = {}): string {
  const head = headers.map((header) => header.startsWith('#') ? `<th class="num">${header.slice(1)}</th>` : `<th>${header}</th>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>${options.more ? `<div class="more">${options.more}</div>` : ''}`;
}

/** A name with a monospace path under it, for table cells. */
export function nameWithPath(name: string, filePath: string): string {
  return `<div class="cell-main">${escapeHtml(name)}</div><div class="cell-sub">${escapeHtml(filePath)}</div>`;
}

export interface HistogramBin {
  label: string;
  count: number;
  tone: Tone;
}

/** A static column chart: no script, so it renders the same in every viewer and in print. */
export function histogram(bins: HistogramBin[]): string {
  const max = Math.max(1, ...bins.map((bin) => bin.count));
  return `<div class="histogram">${bins.map((bin) => `<div class="tone-${bin.tone}"><span class="n">${bin.count}</span><span class="col" style="height:${(bin.count / max) * 100}%"></span><span class="l">${bin.label}</span></div>`).join('')}</div>`;
}

export function bulletList(items: readonly string[]): string {
  return '<ul class="list">' + items.map((item) => '<li>' + item + '</li>').join('') + '</ul>';
}
