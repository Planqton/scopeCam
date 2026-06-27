import { S } from './00-state.js';
import { savePanelStates } from './02-panels.js';

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS-LEISTE
// ═══════════════════════════════════════════════════════════════════════════════

let _statusTimer = null;
export function setStatus(msg, durationMs = 9000) {
  const el = document.getElementById('statusAction');
  if (!el) return;
  clearTimeout(_statusTimer);
  el.textContent = msg;
  el.classList.remove('sa-fade');
  el.classList.add('sa-visible');
  _statusTimer = setTimeout(() => {
    el.classList.add('sa-fade');
    el.addEventListener('transitionend', () => {
      el.classList.remove('sa-visible', 'sa-fade');
    }, { once: true });
  }, durationMs);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOG PANEL
// ═══════════════════════════════════════════════════════════════════════════════
export function scopeLog(msg, level = 'info') {
  const list = document.getElementById('logList');
  if (!list) { console.log('[LOG]', msg); return; }
  const now  = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const row  = document.createElement('div');
  row.className = `log-row log-${level}`;
  row.textContent = `[${now}] ${msg}`;
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
  // Panel öffnen falls geschlossen
  const state = S.panelStates['log'];
  if (state && !state.open) { state.open = true; S.applyPanel('log'); savePanelStates(); }
}
document.addEventListener('click', e => {
  if (e.target.id === 'logClearBtn') document.getElementById('logList').innerHTML = '';
});

