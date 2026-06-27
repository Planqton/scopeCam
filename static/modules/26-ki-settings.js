// ═══════════════════════════════════════════════════════════════════════════════
// KI-EINSTELLUNGEN
// ═══════════════════════════════════════════════════════════════════════════════

const KI_STORAGE_KEY = 'scopecam_ki_v1';

const KI_PROVIDERS = {
  openai: {
    label:    'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    modelsPath: '/models',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
    parseModels: (data) => (data.data || [])
      .map(m => m.id)
      .filter(id => /^gpt-|^o[0-9]/.test(id))
      .sort(),
  },
  anthropic: {
    label:    'Anthropic',
    endpoint: 'https://api.anthropic.com',
    modelsPath: '/v1/models',
    authHeader: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    parseModels: (data) => (data.data || []).map(m => m.id).sort(),
  },
  google: {
    label:      'Google',
    endpoint:   'https://generativelanguage.googleapis.com/v1beta',
    // Modell-Listing über OpenAI-compat (Bearer-Auth, funktioniert im Browser)
    modelsPath: '/openai/models',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
    parseModels: (data) => (data.data || [])
      .map(m => m.id)
      .filter(id => /gemini/i.test(id))
      .sort(),
    nativeApi: true,  // LLM-Calls gehen über native generateContent API
  },
};

let kiSettings = { endpoint: '', apiKey: '', model: '', provider: '', template: '', thinking: false, thinkingBudget: 8000 };

function loadKiSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KI_STORAGE_KEY));
    if (s) kiSettings = { ...kiSettings, ...s };
  } catch (_) {}
}

function saveKiSettings() {
  try { localStorage.setItem(KI_STORAGE_KEY, JSON.stringify(kiSettings)); } catch (_) {}
}

function detectKiProvider(endpoint) {
  if (!endpoint) return null;
  if (endpoint.includes('openai.com'))               return 'openai';
  if (endpoint.includes('anthropic.com'))            return 'anthropic';
  if (endpoint.includes('googleapis.com'))           return 'google';
  return 'custom';
}

function populateKiSettings() {
  document.getElementById('kiEndpoint').value     = kiSettings.endpoint || '';
  document.getElementById('kiApiKey').value       = kiSettings.apiKey   || '';
  document.getElementById('kiTemplate').value     = kiSettings.template || '';
  document.getElementById('kiThinkingEnabled').checked = !!kiSettings.thinking;
  document.getElementById('kiThinkingBudget').value    = kiSettings.thinkingBudget || 8000;
  _updateThinkingVisibility(detectKiProvider(kiSettings.endpoint) || kiSettings.provider);
  // Preset-Buttons markieren
  const prov = detectKiProvider(kiSettings.endpoint);
  document.querySelectorAll('.ki-preset-btn').forEach(b => {
    b.classList.toggle('ki-preset-active', b.dataset.provider === prov);
  });
  // Modell-Dropdown befüllen falls gespeichert
  if (kiSettings.model) {
    const sel = document.getElementById('kiModel');
    sel.innerHTML = `<option value="${kiSettings.model}">${kiSettings.model}</option>`;
    sel.value = kiSettings.model;
    sel.disabled = false;
  }
  updateKiPanel();
}

async function loadKiModels() {
  const endpoint = document.getElementById('kiEndpoint').value.trim().replace(/\/$/, '');
  const apiKey   = document.getElementById('kiApiKey').value.trim();
  const status   = document.getElementById('kiLoadStatus');
  const sel      = document.getElementById('kiModel');

  if (!endpoint) { status.textContent = '⚠ Kein Endpunkt'; return; }

  const prov   = detectKiProvider(endpoint);
  const config = KI_PROVIDERS[prov];

  status.textContent = '⏳ Lade…';
  sel.disabled = true;
  sel.innerHTML = '<option value="">Lade…</option>';

  try {
    const modelsUrl = config
      ? endpoint + config.modelsPath
      : endpoint + '/models';

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey && config) Object.assign(headers, config.authHeader(apiKey));
    else if (apiKey)      headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(modelsUrl, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    let models = config
      ? config.parseModels(data)
      : (data.data || data.models || []).map(m => m.id || m).sort();

    if (!models.length) throw new Error('Keine Modelle gefunden');

    sel.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
    if (kiSettings.model && models.includes(kiSettings.model)) sel.value = kiSettings.model;
    sel.disabled = false;
    status.textContent = `✓ ${models.length} Modelle`;
  } catch (e) {
    status.textContent = `✗ ${e.message}`;
    sel.innerHTML = '<option value="">Fehler beim Laden</option>';
  }
}

function _updateThinkingVisibility(providerName) {
  const show = providerName === 'anthropic' || providerName === 'google';
  const sec  = document.getElementById('kiThinkingSection');
  if (sec) sec.style.display = show ? '' : 'none';
}

// Event-Listener KI-Tab
document.querySelectorAll('.ki-preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const prov = KI_PROVIDERS[btn.dataset.provider];
    if (prov) document.getElementById('kiEndpoint').value = prov.endpoint;
    document.querySelectorAll('.ki-preset-btn').forEach(b =>
      b.classList.toggle('ki-preset-active', b === btn));
    _updateThinkingVisibility(btn.dataset.provider);
  });
});

document.getElementById('kiEndpoint').addEventListener('input', e => {
  _updateThinkingVisibility(detectKiProvider(e.target.value));
});

document.getElementById('kiLoadModelsBtn').addEventListener('click', loadKiModels);

async function testKiConnection() {
  const endpoint = document.getElementById('kiEndpoint').value.trim().replace(/\/$/, '');
  const apiKey   = document.getElementById('kiApiKey').value.trim();
  const model    = document.getElementById('kiModel').value;
  const status   = document.getElementById('kiTestStatus');

  if (!endpoint || !model) { status.textContent = '⚠ Endpunkt + Modell nötig'; status.style.color = 'var(--clr-muted)'; return; }

  status.textContent = '⏳ Teste…';
  status.style.color = 'var(--clr-muted)';

  const prov   = detectKiProvider(endpoint);
  const config = KI_PROVIDERS[prov];
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey && config) Object.assign(headers, config.authHeader(apiKey));
  else if (apiKey)       headers['Authorization'] = `Bearer ${apiKey}`;

  // Anthropic braucht anderen Endpunkt + Body
  const isAnthropic = prov === 'anthropic';
  const url  = isAnthropic ? endpoint + '/v1/messages' : endpoint + '/chat/completions';
  const body = isAnthropic
    ? { model, max_tokens: 8, messages: [{ role: 'user', content: 'Hi' }] }
    : { model, max_tokens: 8, messages: [{ role: 'user', content: 'Hi' }] };

  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    status.textContent = '✓ Verbindung OK';
    status.style.color = '#4caf50';
  } catch (e) {
    status.textContent = `✗ ${e.message}`;
    status.style.color = '#e05050';
  }
}

document.getElementById('kiTestBtn').addEventListener('click', testKiConnection);

document.getElementById('kiSaveBtn').addEventListener('click', () => {
  kiSettings.endpoint       = document.getElementById('kiEndpoint').value.trim().replace(/\/$/, '');
  kiSettings.apiKey         = document.getElementById('kiApiKey').value.trim();
  kiSettings.model          = document.getElementById('kiModel').value;
  kiSettings.template       = document.getElementById('kiTemplate').value;
  kiSettings.provider       = detectKiProvider(kiSettings.endpoint) || 'custom';
  kiSettings.thinking       = document.getElementById('kiThinkingEnabled').checked;
  kiSettings.thinkingBudget = parseInt(document.getElementById('kiThinkingBudget').value) || 8000;
  saveKiSettings();
  updateKiPanel();
  closeSettings();
});

document.getElementById('kiOpenSettingsLink').addEventListener('click', e => {
  e.preventDefault();
  openSettings();
  // Zu KI-Tab wechseln
  document.querySelectorAll('.sp-tab').forEach(t => t.classList.remove('sp-tab-active'));
  document.querySelectorAll('.sp-tab-pane').forEach(p => p.classList.add('sp-hidden'));
  document.querySelector('[data-sp-tab="ki"]').classList.add('sp-tab-active');
  document.getElementById('spPaneKi').classList.remove('sp-hidden');
});

