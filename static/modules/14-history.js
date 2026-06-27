import { S } from './00-state.js';
import { tabById, saveTabs, applyLayerVisibilityToObjects, loadCanvasFromJSON } from './08-tabs.js';
import { refreshLayersList } from './13-layers.js';
import { setStatus } from './03-status-log.js';

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY (Undo/Redo) + AUTO-PERSISTENZ
// Jede Änderung wird in den aktiven Tab gespeichert und in localStorage persistiert.
// ═══════════════════════════════════════════════════════════════════════════════

export const CUSTOM_PROPS = ['customName', 'locked', 'layerId', 'objVisible', 'isDimension', 'dimPx', 'dimLabelOverride', 'linkGroup', 'objId', 'lockPosition', 'lockSize'];

// ── Dirty-Tracking ─────────────────────────────────────────────────────────────
let _savedHistoryIdx = -1;

export function _isDirty() { return S.historyIdx !== _savedHistoryIdx; }

export function _markSaved() {
  _savedHistoryIdx = S.historyIdx;
  const tab = tabById(S.activeTabId);
  if (tab) tab._savedHistoryIdx = S.historyIdx;
  _updateDirtyIndicator();
}

export function _updateDirtyIndicator() {
  document.querySelectorAll('.tab-item').forEach(el => {
    const tid = el.dataset.tabId;
    const tab = tabById(tid);
    if (!tab) return;
    const dirty = (tid === S.activeTabId)
      ? _isDirty()
      : (tab.historyIdx !== (tab._savedHistoryIdx ?? -1) && tab.history?.length > 0);
    let dot = el.querySelector('.tab-dirty');
    if (dirty && !dot) {
      dot = document.createElement('span');
      dot.className = 'tab-dirty';
      dot.title = 'Ungespeicherte Änderungen';
      const nameEl = el.querySelector('.tab-name');
      if (nameEl) nameEl.before(dot); else el.prepend(dot);
    } else if (!dirty && dot) {
      dot.remove();
    }
  });
}

const _TL_ICONS = {
  'Start': '🏁', 'Importiert': '📂', 'Linie': '╱', 'Pfeil': '→', 'Bemaßung': '↔',
  'Rechteck': '▭', 'Kreis': '○', 'Text': 'T', 'Freihand': '✏',
  'Gelöscht': '🗑', 'Alle gelöscht': '🗑', 'Bearbeitet': '✏', 'Verschoben': '↕',
  'Hilfslinie': '┼', 'Verknüpft': '⛓', 'Entkoppelt': '⛓',
  'Rückgängig': '↩', 'Wiederholen': '↪',
};

const MAX_HISTORY = 100;
S._kiBatchMode = false; // KI-Aktionen zu einem einzigen History-Eintrag zusammenfassen

export function saveHistory(labelArg) {
  if (S._kiBatchMode) return;
  const label = typeof labelArg === 'string' ? labelArg : (S._nextLabel || 'Bearbeitet');
  S._nextLabel = null;
  S.history    = S.history.slice(0, S.historyIdx + 1);
  const json = JSON.stringify(S.canvas.toJSON(CUSTOM_PROPS));
  const now  = new Date();
  S.history.push({
    json,
    label,
    time: now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  });
  if (S.history.length > MAX_HISTORY) S.history = S.history.slice(S.history.length - MAX_HISTORY);
  S.historyIdx = S.history.length - 1;

  const tab = tabById(S.activeTabId);
  if (tab) {
    tab.canvasJSON  = json;
    tab.history     = S.history;
    tab.historyIdx  = S.historyIdx;
    saveTabs();
  }
  refreshTimeline();
  _updateDirtyIndicator();
}

export function restoreHistory(idx) {
  const entry = S.history[idx];
  if (!entry) return;
  // fabric v6: loadFromJSON returns a Promise (2nd arg is now reviver, not callback)
  S.canvas.loadFromJSON(entry.json).then(() => {
    applyLayerVisibilityToObjects();
    S.canvas.renderAll();
    refreshLayersList();
  });
  S.historyIdx = idx;
  const tab = tabById(S.activeTabId);
  if (tab) { tab.canvasJSON = entry.json; tab.historyIdx = idx; saveTabs(); }
  refreshTimeline();
  _updateDirtyIndicator();
}

function deleteHistoryEntry(i) {
  const tab = tabById(S.activeTabId);
  if (!tab || S.history.length <= 1) return;
  S.history.splice(i, 1);
  if (S.historyIdx >= S.history.length) S.historyIdx = S.history.length - 1;
  else if (S.historyIdx > i) S.historyIdx--;
  tab.history    = S.history;
  tab.historyIdx = S.historyIdx;
  restoreHistory(S.historyIdx);
}

export function refreshTimeline() {
  const list = document.getElementById('timelineList');
  if (!list) return;
  list.innerHTML = '';
  // Neueste oben
  for (let i = S.history.length - 1; i >= 0; i--) {
    const e   = S.history[i];
    const row = document.createElement('div');
    row.className = 'tl-entry' + (i === S.historyIdx ? ' tl-current' : '') + (i > S.historyIdx ? ' tl-future' : '');
    const icon = _TL_ICONS[e.label] || '●';
    row.innerHTML = `<span class="tl-icon">${icon}</span><span class="tl-label">${e.label}</span><span class="tl-time">${e.time}</span><button class="tl-del" title="Eintrag löschen">×</button>`;
    row.dataset.idx = i;
    row.addEventListener('click', () => restoreHistory(i));
    row.querySelector('.tl-del').addEventListener('click', e => { e.stopPropagation(); deleteHistoryEntry(i); });
    list.appendChild(row);
  }
  // Aktuelle Zeile in Sicht scrollen
  const cur = list.querySelector('.tl-current');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}

document.getElementById('undoBtn').addEventListener('click', () => {
  if (S.historyIdx > 0) { restoreHistory(--S.historyIdx); setStatus('↩ Rückgängig'); }
});
document.getElementById('redoBtn').addEventListener('click', () => {
  if (S.historyIdx < S.history.length - 1) { restoreHistory(++S.historyIdx); setStatus('↪ Wiederholen'); }
});

S.canvas.on('path:created', () => { S._nextLabel = 'Freihand'; saveHistory(); refreshLayersList(); });


