// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY (Undo/Redo) + AUTO-PERSISTENZ
// Jede Änderung wird in den aktiven Tab gespeichert und in localStorage persistiert.
// ═══════════════════════════════════════════════════════════════════════════════

const CUSTOM_PROPS = ['customName', 'locked', 'layerId', 'objVisible', 'isDimension', 'dimPx', 'dimLabelOverride', 'linkGroup', 'objId', 'lockPosition', 'lockSize'];

const _TL_ICONS = {
  'Start': '🏁', 'Importiert': '📂', 'Linie': '╱', 'Pfeil': '→', 'Bemaßung': '↔',
  'Rechteck': '▭', 'Kreis': '○', 'Text': 'T', 'Freihand': '✏',
  'Gelöscht': '🗑', 'Alle gelöscht': '🗑', 'Bearbeitet': '✏', 'Verschoben': '↕',
  'Hilfslinie': '┼', 'Verknüpft': '⛓', 'Entkoppelt': '⛓',
  'Rückgängig': '↩', 'Wiederholen': '↪',
};

const MAX_HISTORY = 100;
S._kiBatchMode = false; // KI-Aktionen zu einem einzigen History-Eintrag zusammenfassen

function saveHistory(labelArg) {
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

function restoreHistory(idx) {
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

function refreshTimeline() {
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


