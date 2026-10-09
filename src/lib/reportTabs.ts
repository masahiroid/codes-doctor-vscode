declare const mermaid: { run(options: { querySelector: string }): Promise<unknown> | void };
// This function is serialized into reports and must not depend on Node modules.
export function installReportTabs() {
  const nav = document.getElementById('tabNav');
  if (!nav || nav.dataset.codeDoctorTabsInstalled) return;
  nav.dataset.codeDoctorTabsInstalled = 'true';
  const buttons = [...nav.querySelectorAll<HTMLButtonElement>('.tab-btn')];
  const panels = [...document.querySelectorAll<HTMLElement>('.tab-panel')];
  const defaultTab = buttons.find((button) => button.classList.contains('active'))?.getAttribute('data-tab') || buttons[0]?.getAttribute('data-tab');
  const storageKey = 'csap-tab-' + (document.body.dataset.analysisId || document.title);
  let mermaidRendered = false;
  function activateTab(tabId: string | null | undefined) {
    if (!tabId || !buttons.some((button) => button.getAttribute('data-tab') === tabId) || !panels.some((panel) => panel.id === 'tab-' + tabId)) return;
    buttons.forEach((button) => button.classList.toggle('active', button.getAttribute('data-tab') === tabId));
    panels.forEach((panel) => panel.classList.toggle('active', panel.id === 'tab-' + tabId));
    try { sessionStorage.setItem(storageKey, tabId); } catch { /* Storage is optional in local files and webviews. */ }
    if (tabId === 'graphs' && !mermaidRendered && typeof mermaid !== 'undefined') {
      try {
        Promise.resolve(mermaid.run({ querySelector: '#tab-graphs .mermaid' })).catch(() => {});
        mermaidRendered = true;
      } catch { /* Diagram failures must not disable navigation. */ }
    }
  }
  nav.addEventListener('click', (event: MouseEvent) => {
    const button = (event.target as Element | null)?.closest?.('.tab-btn');
    if (button && nav.contains(button)) activateTab(button.getAttribute('data-tab'));
  });
  let saved: string | null | undefined;
  try { saved = sessionStorage.getItem(storageKey); } catch { /* Use the default tab when storage is unavailable. */ }
  activateTab(buttons.some((button) => button.getAttribute('data-tab') === saved) ? saved : defaultTab);
}

export const TAB_SCRIPT_ID = 'code-doctor-report-tabs';
export const legacyTabScript = /\(function\(\)\s*\{\s*const nav = document\.getElementById\('tabNav'\);[\s\S]*?\}\)\(\);/;
export function injectReportTabs(html: string) {
  const installedScript = new RegExp('<script\\b[^>]*\\bid=["\']' + TAB_SCRIPT_ID + '["\'][^>]*>[\\s\\S]*?<\\/script\\s*>\\n?', 'gi');
  html = html.replace(installedScript, '');
  if (!/id=["']tabNav["']/.test(html)) return html;
  const legacyAnalysisId = /const storageKey = ['"]csap-tab-([^'"]+)['"]/.exec(html)?.[1];
  let upgraded = html.replace(legacyTabScript, '');
  if (legacyAnalysisId && !/<body\b[^>]*\bdata-analysis-id=/.test(upgraded)) {
    const escaped = legacyAnalysisId.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    upgraded = upgraded.replace(/<body\b/i, () => `<body data-analysis-id="${escaped}"`);
  }
  const script = `<script id="${TAB_SCRIPT_ID}">(${installReportTabs.toString()})();</script>`;
  const closingBody = upgraded.toLowerCase().lastIndexOf('</body>');
  return closingBody >= 0
    ? upgraded.slice(0, closingBody) + script + '\n' + upgraded.slice(closingBody)
    : upgraded;
}
module.exports = { installReportTabs, injectReportTabs, TAB_SCRIPT_ID, legacyTabScript };
