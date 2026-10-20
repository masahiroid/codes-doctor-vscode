// This function is serialized into reports and must not depend on Node modules.
export function installTableFilter() {
  const containers = document.querySelectorAll<HTMLElement>('[data-table-filter]');
  const ja = document.documentElement.lang.startsWith('ja');

  containers.forEach((container) => {
    if (container.dataset.codeDoctorFilterInstalled) return;
    container.dataset.codeDoctorFilterInstalled = 'true';

    const checkboxes = [...container.querySelectorAll<HTMLInputElement>('input[data-filter-severity]')];
    const btnAll = container.querySelector<HTMLButtonElement>('[data-filter-action="all"]');
    const btnNone = container.querySelector<HTMLButtonElement>('[data-filter-action="none"]');
    const rows = [...container.querySelectorAll<HTMLTableRowElement>('tbody tr[data-severity]')];
    const expandBtn = container.querySelector<HTMLButtonElement>('[data-table-expand]');
    const emptyNotice = container.querySelector<HTMLElement>('[data-table-empty]');
    const limit = parseInt(container.getAttribute('data-table-limit') || '40', 10);
    let expanded = false;

    function getActiveSeverities(): Set<string> {
      const active = new Set<string>();
      checkboxes.forEach((cb) => {
        if (cb.checked) active.add(cb.getAttribute('data-filter-severity') || '');
      });
      return active;
    }

    function update() {
      const active = getActiveSeverities();
      let matchingCount = 0;

      rows.forEach((row) => {
        const sev = row.getAttribute('data-severity') || '';
        const isMatch = active.has(sev);
        if (!isMatch) {
          row.style.display = 'none';
        } else {
          matchingCount++;
          if (!expanded && matchingCount > limit) {
            row.style.display = 'none';
          } else {
            row.style.display = '';
          }
        }
      });

      if (emptyNotice) {
        emptyNotice.style.display = matchingCount === 0 ? '' : 'none';
      }

      if (expandBtn) {
        if (matchingCount > limit) {
          expandBtn.style.display = '';
          if (!expanded) {
            const remaining = matchingCount - limit;
            expandBtn.textContent = ja
              ? '\u5168\u4ef6\u8868\u793a\uff08\u4ed6 ' + remaining + ' \u4ef6\u3092\u8868\u793a\uff09'
              : 'Show all (' + remaining + ' more)';
          } else {
            expandBtn.textContent = ja
              ? '\u6298\u308a\u305f\u305f\u3080\uff08' + limit + '\u4ef6\u306e\u307f\u8868\u793a\uff09'
              : 'Show fewer (show first ' + limit + ')';
          }
        } else {
          expandBtn.style.display = 'none';
        }
      }
    }

    checkboxes.forEach((cb) => {
      cb.addEventListener('change', update);
    });

    if (btnAll) {
      btnAll.addEventListener('click', () => {
        checkboxes.forEach((cb) => {
          if (!cb.disabled) cb.checked = true;
        });
        update();
      });
    }

    if (btnNone) {
      btnNone.addEventListener('click', () => {
        checkboxes.forEach((cb) => {
          cb.checked = false;
        });
        update();
      });
    }

    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        expanded = !expanded;
        update();
      });
    }

    update();
  });
}

export const TABLE_FILTER_SCRIPT_ID = 'code-doctor-table-filter';

export function injectTableFilter(html: string): string {
  const installedScript = new RegExp('<script\\b[^>]*\\bid=["\']' + TABLE_FILTER_SCRIPT_ID + '["\'][^>]*>[\\s\\S]*?<\\/script\\s*>\\n?', 'gi');
  html = html.replace(installedScript, '');
  if (!/data-table-filter/.test(html)) return html;
  const script = `<script id="${TABLE_FILTER_SCRIPT_ID}">(${installTableFilter.toString()})();</script>`;
  const closingBody = html.toLowerCase().lastIndexOf('</body>');
  return closingBody >= 0
    ? html.slice(0, closingBody) + script + '\n' + html.slice(closingBody)
    : html;
}

