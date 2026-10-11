/**
 * The report's design system: pastel tones on translucent surfaces, in light and dark.
 * Dark mode follows the OS (`prefers-color-scheme`), the VS Code theme when the report
 * is shown in a webview (`body.vscode-dark` / `body.vscode-light`), or the header toggle
 * (`data-theme` on `<html>`), in increasing priority.
 */

const LIGHT_TOKENS = `
  color-scheme: light;
  --bg-1: #f7f4fb; --bg-2: #eef4f9;
  --glow-1: rgba(196, 181, 253, 0.42); --glow-2: rgba(167, 219, 216, 0.38); --glow-3: rgba(251, 207, 232, 0.32);
  --surface: rgba(255, 255, 255, 0.64); --surface-strong: rgba(255, 255, 255, 0.84); --surface-border: rgba(255, 255, 255, 0.92);
  --hairline: rgba(110, 100, 150, 0.13); --well: rgba(110, 100, 150, 0.05);
  --shadow: 0 1px 2px rgba(60, 50, 100, 0.04), 0 8px 28px rgba(80, 70, 140, 0.08);
  --ink: #2e2b3b; --ink-soft: #5d5a6e; --muted: #8e8aa3;
  --lavender-ink: #6d5bc4; --sky-ink: #3f7fae; --mint-ink: #2f8a69; --butter-ink: #9a741a; --peach-ink: #b4603a; --rose-ink: #b44a66;
  --ring-hole: #fbfaff;`;

const DARK_TOKENS = `
  color-scheme: dark;
  --bg-1: #15141d; --bg-2: #1a1d29;
  --glow-1: rgba(139, 120, 230, 0.22); --glow-2: rgba(90, 170, 165, 0.16); --glow-3: rgba(220, 120, 170, 0.12);
  --surface: rgba(255, 255, 255, 0.055); --surface-strong: rgba(255, 255, 255, 0.085); --surface-border: rgba(255, 255, 255, 0.09);
  --hairline: rgba(255, 255, 255, 0.08); --well: rgba(255, 255, 255, 0.035);
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 10px 30px rgba(0, 0, 0, 0.25);
  --ink: #ecebf4; --ink-soft: #c3c0d4; --muted: #8f8ba6;
  --lavender-ink: #c6b8ff; --sky-ink: #a8d4f2; --mint-ink: #9fe0c6; --butter-ink: #f1d98f; --peach-ink: #f7c1a3; --rose-ink: #f5aec0;
  --ring-hole: #1e1d2a;`;

export const REPORT_STYLES = `
  :root {
    --lavender: #b8a6f0; --sky: #9ccbea; --mint: #a3dcc5; --butter: #f2dc9b; --peach: #f6c3a8; --rose: #f2a9ba;
    --radius-lg: 14px; --radius-md: 10px; --radius-sm: 6px;
    --font: "Inter", "Hiragino Sans", "Noto Sans JP", -apple-system, "Segoe UI", sans-serif;
    --mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    ${LIGHT_TOKENS}
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${DARK_TOKENS} } }
  body.vscode-dark, body.vscode-high-contrast:not(.vscode-high-contrast-light) { ${DARK_TOKENS} }
  body.vscode-light, body.vscode-high-contrast-light { ${LIGHT_TOKENS} }
  :root[data-theme="dark"], :root[data-theme="dark"] body { ${DARK_TOKENS} }
  :root[data-theme="light"], :root[data-theme="light"] body { ${LIGHT_TOKENS} }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    min-height: 100%;
    background:
      radial-gradient(900px 520px at 8% -10%, var(--glow-1), transparent 70%),
      radial-gradient(800px 500px at 100% 10%, var(--glow-2), transparent 70%),
      radial-gradient(700px 480px at 60% 110%, var(--glow-3), transparent 70%),
      linear-gradient(160deg, var(--bg-1), var(--bg-2));
    background-color: var(--bg-1);
  }
  body {
    font-family: var(--font); color: var(--ink); line-height: 1.65; font-size: 15px;
    -webkit-font-smoothing: antialiased; font-feature-settings: "palt", "tnum";
  }
  a { color: var(--sky-ink); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code, pre, .mono { font-family: var(--mono); }
  code { font-size: 0.85em; background: var(--well); border: 1px solid var(--hairline); padding: 1px 6px; border-radius: 5px; }
  ul.list { padding-left: 1.2em; display: grid; gap: 4px; }

  .shell { max-width: 1240px; margin: 0 auto; padding: 28px 28px 48px; }
  .glass {
    background: var(--surface); border: 1px solid var(--surface-border); border-radius: var(--radius-lg);
    box-shadow: var(--shadow); backdrop-filter: blur(18px) saturate(140%); -webkit-backdrop-filter: blur(18px) saturate(140%);
  }

  /* Header and tabs */
  .report-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 22px; flex-wrap: wrap; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand-mark { width: 42px; height: 42px; border-radius: var(--radius-md); display: grid; place-items: center; flex: none;
    background: linear-gradient(140deg, var(--lavender), var(--sky)); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.5); }
  .brand-mark svg { width: 34px; height: 34px; color: #fff; }
  .brand h1 { font-size: 1.15rem; font-weight: 650; letter-spacing: 0.01em; line-height: 1.3; }
  .brand p { font-size: 0.82rem; color: var(--muted); }
  .chips { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
  .chip { font-size: 0.78rem; color: var(--ink-soft); padding: 5px 11px; border-radius: var(--radius-sm); background: var(--surface-strong); border: 1px solid var(--hairline); }
  .chip b { font-weight: 600; color: var(--ink); }
  .theme-toggle { font: inherit; font-size: 0.78rem; color: var(--ink-soft); padding: 5px 11px; border-radius: var(--radius-sm); cursor: pointer;
    background: var(--surface-strong); border: 1px solid var(--hairline); }
  .theme-toggle:hover { color: var(--ink); }

  .tab-nav { display: flex; flex-wrap: wrap; gap: 4px; padding: 5px; margin: 16px 0 26px; width: fit-content; max-width: 100%;
    border-radius: var(--radius-md); position: sticky; top: 10px; z-index: 50; }
  .tab-btn { border: 0; background: transparent; color: var(--ink-soft); font: inherit; font-size: 0.86rem; padding: 8px 16px;
    border-radius: var(--radius-sm); cursor: pointer; transition: background .2s, color .2s; }
  .tab-btn:hover { color: var(--ink); background: var(--surface-strong); }
  .tab-btn.active { color: var(--ink); font-weight: 600; background: var(--surface-strong); box-shadow: 0 1px 2px rgba(60,50,100,0.08), inset 0 0 0 1px var(--hairline); }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; animation: rise .25s ease-out; }
  @keyframes rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

  /* Sections */
  section { margin-bottom: 30px; }
  h2 { font-size: 1.02rem; font-weight: 650; margin: 0 0 14px 2px; display: flex; align-items: center; gap: 10px; }
  h2::before { content: ""; width: 4px; height: 1.05em; border-radius: 2px; background: linear-gradient(var(--lavender), var(--sky)); }
  h3 { font-size: 0.95rem; font-weight: 600; margin-bottom: 4px; }
  h4 { font-size: 0.9rem; font-weight: 600; }
  .sub, .muted { color: var(--muted); font-size: 0.82rem; }
  .sub { margin-bottom: 14px; }
  .panel { padding: 20px 22px; margin-bottom: 18px; }
  .panel > :last-child { margin-bottom: 0; }
  .panel-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
  .gap-top { margin-top: 16px; }
  .gap-bottom { margin-bottom: 10px; }
  .grid { display: grid; gap: 18px; margin-bottom: 18px; }
  .grid > .panel { margin-bottom: 0; }
  .grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .grid-wide { grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); align-items: start; }
  .grid-auto { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  @media (max-width: 900px) { .grid-2, .grid-3, .grid-wide { grid-template-columns: 1fr; } }

  /* Tones: set --tone and --tone-ink on any element */
  .tone-lavender { --tone: var(--lavender); --tone-ink: var(--lavender-ink); }
  .tone-sky { --tone: var(--sky); --tone-ink: var(--sky-ink); }
  .tone-mint { --tone: var(--mint); --tone-ink: var(--mint-ink); }
  .tone-butter { --tone: var(--butter); --tone-ink: var(--butter-ink); }
  .tone-peach { --tone: var(--peach); --tone-ink: var(--peach-ink); }
  .tone-rose { --tone: var(--rose); --tone-ink: var(--rose-ink); }

  /* Score card with ring */
  .score { padding: 22px 24px; display: flex; align-items: center; gap: 22px; position: relative; overflow: hidden; }
  .score::after { content: ""; position: absolute; right: -40px; bottom: -60px; width: 180px; height: 180px; border-radius: 50%;
    background: var(--tone); opacity: 0.2; filter: blur(30px); pointer-events: none; }
  .ring { width: 112px; height: 112px; flex: none; border-radius: 50%; display: grid; place-items: center;
    background: conic-gradient(var(--tone) calc(var(--pct) * 1%), var(--hairline) 0); }
  .ring > div { width: 90px; height: 90px; border-radius: 50%; background: var(--ring-hole); display: grid; place-items: center; align-content: center; }
  .ring .num { font-size: 1.85rem; font-weight: 650; line-height: 1; }
  .ring .of { font-size: 0.7rem; color: var(--muted); }
  .score .label { font-size: 0.82rem; color: var(--muted); }
  .score .headline { font-size: 1.05rem; font-weight: 600; margin: 2px 0 8px; }
  .score .note { margin-top: 10px; font-size: 0.82rem; color: var(--ink-soft); }

  /* Stats */
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 14px 18px; }
  .stats.panel { align-content: center; }
  .stat .k { font-size: 0.76rem; color: var(--muted); }
  .stat .v { font-size: 1.55rem; font-weight: 650; line-height: 1.25; color: var(--tone-ink, var(--ink)); }
  .stat .v small { font-size: 0.75rem; color: var(--muted); font-weight: 500; margin-left: 4px; }

  /* Badges, meters, stacked bars */
  .badge { display: inline-flex; align-items: center; gap: 6px; font-size: 0.74rem; font-weight: 600; padding: 2px 9px; border-radius: 5px; white-space: nowrap;
    background: color-mix(in srgb, var(--tone, var(--lavender)) 34%, transparent); color: var(--tone-ink, var(--lavender-ink)); }
  .badge.upper { text-transform: uppercase; letter-spacing: 0.03em; }
  .meter { display: flex; align-items: center; gap: 10px; }
  .flow-path { list-style: none; margin: 8px 0 0; padding: 0 0 0 10px; border-left: 2px solid var(--hairline); font-size: 0.78rem; }
  .flow-path li { margin: 3px 0; color: var(--ink-soft); }
  .flow-path .k { display: inline-block; min-width: 3.2em; color: var(--muted); }
  .flow-path code { white-space: pre-wrap; word-break: break-all; }
  .meter .track { display: block; width: 88px; height: 6px; border-radius: 999px; background: var(--hairline); overflow: hidden; flex: none; }
  .meter i { display: block; height: 100%; border-radius: 999px; background: var(--tone); }
  .meter b { font-weight: 600; min-width: 26px; text-align: right; }
  .stack { display: flex; height: 8px; border-radius: 999px; overflow: hidden; margin: 12px 0 8px; background: var(--hairline); }
  .stack span { display: block; background: var(--tone); }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 0.76rem; color: var(--muted); }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; vertical-align: 1px; background: var(--tone); }
  .count-card .row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .count-card .name { font-size: 0.86rem; color: var(--ink-soft); }
  .count-card .total { font-size: 1.5rem; font-weight: 650; }

  /* Notices */
  .notice { border-radius: var(--radius-md); padding: 14px 16px; margin-bottom: 14px; border: 1px solid color-mix(in srgb, var(--tone) 50%, transparent);
    background: color-mix(in srgb, var(--tone) 16%, transparent); }
  .notice .title { font-weight: 600; color: var(--tone-ink); margin-bottom: 4px; }
  .notice p, .notice li { font-size: 0.88rem; color: var(--ink-soft); }

  /* Tables */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
  th { text-align: left; font-weight: 500; color: var(--muted); font-size: 0.74rem; letter-spacing: 0.04em; padding: 0 10px 8px; white-space: nowrap; }
  td { padding: 10px; border-top: 1px solid var(--hairline); vertical-align: top; }
  tbody tr:hover td { background: var(--well); }
  td:first-child, th:first-child { padding-left: 4px; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .cell-main { font-weight: 600; overflow-wrap: anywhere; }
  td .meter .track { width: 56px; }
  .cell-sub { font-family: var(--mono); font-size: 0.76rem; color: var(--muted); word-break: break-all; }
  .more { margin-top: 10px; font-size: 0.8rem; color: var(--muted); text-align: center; }

  /* Charts and diagrams */
  .chart { position: relative; }
  .diagram { padding: 16px; overflow: auto; min-height: 220px; }
  .diagram .mermaid { display: flex; justify-content: center; }
  .toolbar { display: flex; gap: 6px; justify-content: flex-end; margin-bottom: 8px; }
  .btn { font: inherit; font-size: 0.8rem; padding: 5px 12px; border-radius: var(--radius-sm); cursor: pointer; color: var(--ink-soft);
    background: var(--surface-strong); border: 1px solid var(--hairline); }
  .btn:hover { color: var(--ink); }
  .heatmap { border-collapse: separate; border-spacing: 3px; width: auto; }
  .heatmap th { padding: 4px 6px; font-size: 0.72rem; }
  .heatmap td { width: 38px; height: 32px; text-align: center; border: 0; border-radius: 5px; font-size: 0.78rem; padding: 0; }
  .histogram { display: flex; align-items: flex-end; gap: 12px; height: 170px; padding: 8px 4px 0; }
  .histogram > div { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 8px; height: 100%; }
  .histogram .col { width: 100%; min-height: 3px; border-radius: 6px 6px 3px 3px; background: linear-gradient(180deg, var(--tone), color-mix(in srgb, var(--tone) 45%, transparent)); }
  .histogram .n { font-size: 0.78rem; font-weight: 600; }
  .histogram .l { font-size: 0.7rem; color: var(--muted); }

  /* LLM output and AST */
  .llm-result { background: var(--well); border: 1px solid var(--hairline); border-radius: var(--radius-md); padding: 14px 16px; min-height: 100px; line-height: 1.75; }
  .llm-result p { margin: 0 0 10px; }
  .llm-result ul, .llm-result ol { padding-left: 20px; margin: 0 0 10px; }
  .llm-result h1, .llm-result h2, .llm-result h3 { margin: 14px 0 6px; font-size: 1rem; }
  .llm-result h2::before { display: none; }
  .llm-result pre { background: var(--well); padding: 10px 12px; border-radius: var(--radius-sm); overflow-x: auto; }
  .llm-result pre code { background: none; border: 0; padding: 0; }
  .llm-result.empty { color: var(--muted); min-height: 0; }
  details.file { border-top: 1px solid var(--hairline); padding: 8px 2px; }
  details.file summary { cursor: pointer; font-weight: 600; font-size: 0.86rem; }
  details.file pre { white-space: pre-wrap; background: var(--well); border: 1px solid var(--hairline); border-radius: var(--radius-sm);
    padding: 12px; margin-top: 8px; font-size: 0.8rem; line-height: 1.55; overflow-x: auto; }
  [data-ast-more] { margin-top: 10px; }

  footer { margin-top: 10px; padding: 14px 4px; color: var(--muted); font-size: 0.78rem; text-align: center; }

  @media print {
    html, body { background: #fff !important; }
    .glass { backdrop-filter: none; box-shadow: none; border-color: #ddd; }
    .tab-nav, .theme-toggle { display: none !important; }
    .tab-panel { display: block !important; }
    .panel, table, tr, .score { break-inside: avoid; }
  }
`;
