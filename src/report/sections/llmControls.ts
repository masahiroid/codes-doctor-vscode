const TOKEN_INPUT_MIN = 500;
const TOKEN_INPUT_MAX = 16000;
const TOKEN_INPUT_STEP = 500;

export interface LlmControlsOptions {
  /** DOM id prefix so multiple instances of these controls can coexist on one page (e.g. "llm", "ast"). */
  idPrefix: string;
  defaultTokens: number;
  enabled: boolean;
  buttonLabel: string;
}

/**
 * Shared provider/API-key/model controls + the client-side script that drives them,
 * used by both the full structural review (graphSections.ts) and the AST-only review
 * (astSection.ts). Having one implementation means a provider added here shows up in
 * both sections automatically.
 *
 * The API key is kept only in the browser's sessionStorage (cleared when the tab
 * closes), scoped per analysisId+provider, and is sent directly to this server's own
 * /api/llm/* endpoints — never to a third party, and never written into the report
 * file itself.
 */
export function buildLlmControlsHtml(options: LlmControlsOptions): string {
  const { idPrefix, defaultTokens, enabled, buttonLabel } = options;

  return `
      <div class="llm-controls" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <select id="${idPrefix}ProviderSel" style="padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9em;">
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic (Claude)</option>
        </select>
        <input id="${idPrefix}ApiKey" type="password" placeholder="API key (session only)" autocomplete="off"
          style="padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9em;width:200px;" />
        <select id="${idPrefix}ModelSel" style="padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9em;min-width:160px;">
          <option value="">— fetch models —</option>
        </select>
        <button id="${idPrefix}FetchModelsBtn" type="button" style="padding:6px 10px;">Fetch Models</button>
        <input id="${idPrefix}Tokens" type="number" min="${TOKEN_INPUT_MIN}" max="${TOKEN_INPUT_MAX}" step="${TOKEN_INPUT_STEP}" value="${defaultTokens}"
          style="width:110px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9em;" title="max_output_tokens" />
        <button id="${idPrefix}ReviewBtn" ${enabled ? '' : 'disabled'}>${buttonLabel}</button>
        <span id="${idPrefix}Status" style="color:#6b7280; font-size:0.9em;"></span>
      </div>`;
}

/**
 * Client-side script for the controls above. Expects these globals to already be
 * defined in the surrounding IIFE: `enabled`, `analysisId`, `focus`, `astOnlyMode`,
 * `resultEl`, `statusEl`, `initialStatus`, `defaultTokens`.
 */
export function buildLlmControlsScript(idPrefix: string): string {
  return `
        const providerSel = document.getElementById('${idPrefix}ProviderSel');
        const apiKeyInput = document.getElementById('${idPrefix}ApiKey');
        const modelSel = document.getElementById('${idPrefix}ModelSel');
        const fetchModelsBtn = document.getElementById('${idPrefix}FetchModelsBtn');
        const tokensInput = document.getElementById('${idPrefix}Tokens');
        const reviewBtn = document.getElementById('${idPrefix}ReviewBtn');

        function apiKeyStorageKey() {
          return 'codeDoctor.llmApiKey.' + providerSel.value;
        }

        function restoreApiKey() {
          try {
            const saved = sessionStorage.getItem(apiKeyStorageKey());
            if (saved) apiKeyInput.value = saved;
          } catch (_e) {}
        }

        if (providerSel) {
          providerSel.addEventListener('change', restoreApiKey);
          restoreApiKey();
        }

        if (apiKeyInput) {
          apiKeyInput.addEventListener('change', () => {
            try {
              if (apiKeyInput.value) {
                sessionStorage.setItem(apiKeyStorageKey(), apiKeyInput.value);
              } else {
                sessionStorage.removeItem(apiKeyStorageKey());
              }
            } catch (_e) {}
          });
        }

        async function fetchModels() {
          const provider = providerSel ? providerSel.value : 'openai';
          const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
          if (!apiKey) {
            statusEl.textContent = 'Enter an API key first';
            return;
          }
          fetchModelsBtn.disabled = true;
          statusEl.textContent = 'Fetching models...';
          try {
            const response = await fetch('/api/llm/models', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ provider, apiKey })
            });
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Failed to fetch models');
            modelSel.innerHTML = '';
            (data.models || []).forEach((m) => {
              const opt = document.createElement('option');
              opt.value = m.id;
              opt.textContent = m.label ? (m.label + ' (' + m.id + ')') : m.id;
              modelSel.appendChild(opt);
            });
            statusEl.textContent = (data.models || []).length + ' models loaded';
          } catch (err) {
            statusEl.textContent = 'Error: ' + (err instanceof Error ? err.message : String(err));
          } finally {
            fetchModelsBtn.disabled = false;
          }
        }

        if (fetchModelsBtn) {
          fetchModelsBtn.addEventListener('click', fetchModels);
        }

        async function runLlmAnalysis() {
          reviewBtn.disabled = true;
          const provider = providerSel ? providerSel.value : 'openai';
          const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
          const model = modelSel && modelSel.value ? modelSel.value : undefined;
          const maxOutputTokens = tokensInput ? parseInt(tokensInput.value, 10) : defaultTokens;

          if (!apiKey) {
            statusEl.textContent = 'Enter an API key first';
            reviewBtn.disabled = false;
            return;
          }

          statusEl.textContent = 'Running (' + provider + (model ? ', ' + model : '') + ')...';
          try {
            const response = await fetch('/api/llm/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ analysisId, focus, useCache: false, astOnlyMode, provider, apiKey, model, maxOutputTokens })
            });
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'LLM analysis failed');
            const text = data.result || '(empty result)';
            resultEl.innerHTML = typeof marked !== 'undefined' ? marked.parse(text) : text;
            statusEl.textContent = 'Done (' + provider + (model ? ', ' + model : '') + ')';
          } catch (err) {
            statusEl.textContent = 'Error';
            resultEl.textContent = err instanceof Error ? err.message : String(err);
          } finally {
            reviewBtn.disabled = false;
          }
        }

        if (enabled && reviewBtn) {
          reviewBtn.addEventListener('click', runLlmAnalysis);
        }`;
}
