declare const Chart: { defaults: { font: { family: string; size: number }; color: string; borderColor: string; plugins: { legend: { labels: { usePointStyle: boolean } } } } } | undefined;

/** Key under which the header toggle remembers the chosen theme (`light` or `dark`). */
export const THEME_STORAGE_KEY = 'codes-doctor-theme';

/**
 * Runs in <head> before anything renders: applies a remembered light/dark choice so the
 * page does not flash. Serialized into the report; must not use outer variables.
 */
export function applySavedTheme() {
  try {
    const saved = localStorage.getItem('codes-doctor-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch { /* Storage is unavailable in some webviews; the OS or VS Code theme applies. */ }
}

/**
 * Runs first in <body>: exposes the palette resolved for the current theme as
 * `window.CodesDoctorPalette` (tone colors with an alpha helper, ink, muted, hairline)
 * and styles Chart.js to match. Charts read colors from here, never hard-code them.
 */
export function installPalette() {
  const style = getComputedStyle(document.body);
  const read = (name: string) => style.getPropertyValue('--' + name).trim();
  const tones = ['lavender', 'sky', 'mint', 'butter', 'peach', 'rose'];
  const palette: Record<string, unknown> = {};
  for (const tone of tones) palette[tone] = read(tone);
  for (const name of ['ink', 'ink-soft', 'muted', 'hairline', 'ring-hole', 'font', 'mono']) palette[name] = read(name);
  palette.alpha = (tone: string, alpha: number) => {
    const hex = String(palette[tone] || tone).replace('#', '');
    const value = parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex, 16);
    return 'rgba(' + ((value >> 16) & 255) + ',' + ((value >> 8) & 255) + ',' + (value & 255) + ',' + alpha + ')';
  };
  palette.dark = style.getPropertyValue('color-scheme').trim() === 'dark';
  (window as unknown as { CodesDoctorPalette: unknown }).CodesDoctorPalette = palette;
  if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = String(palette.font);
    Chart.defaults.font.size = 12;
    Chart.defaults.color = String(palette.muted);
    Chart.defaults.borderColor = String(palette.hairline);
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
  }
}

/** The header button: cycles system → light → dark and reloads so charts redraw in the new palette. */
export function installThemeToggle() {
  const button = document.getElementById('themeToggle');
  if (!button) return;
  const ja = document.documentElement.lang.startsWith('ja');
  const labels: Record<string, string> = ja
    ? { system: '表示: 自動', light: '表示: ライト', dark: '表示: ダーク' }
    : { system: 'Theme: Auto', light: 'Theme: Light', dark: 'Theme: Dark' };
  const current = document.documentElement.dataset.theme || 'system';
  button.textContent = labels[current];
  button.addEventListener('click', () => {
    const next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
    try {
      if (next === 'system') localStorage.removeItem('codes-doctor-theme');
      else localStorage.setItem('codes-doctor-theme', next);
    } catch { /* Without storage the choice lasts for this view only. */ }
    if (next === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    location.reload();
  });
}

/** Light-theme colors, used if the palette script did not run (e.g. a script error earlier). */
const FALLBACK_PALETTE = {
  lavender: '#b8a6f0', sky: '#9ccbea', mint: '#a3dcc5', butter: '#f2dc9b', peach: '#f6c3a8', rose: '#f2a9ba',
  ink: '#2e2b3b', 'ink-soft': '#5d5a6e', muted: '#8e8aa3', hairline: 'rgba(110, 100, 150, 0.13)', 'ring-hole': '#fbfaff',
  font: 'sans-serif', mono: 'monospace',
};

/** Script statement that declares `palette` for a chart: the live palette, or the light fallback. */
export function paletteDeclaration(): string {
  return `const palette = (typeof window !== 'undefined' && window.CodesDoctorPalette) || Object.assign(${JSON.stringify(FALLBACK_PALETTE)}, {
    alpha: function(tone, alpha) { var hex = (this[tone] || tone).replace('#', ''); var v = parseInt(hex, 16); return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + alpha + ')'; }
  });`;
}
