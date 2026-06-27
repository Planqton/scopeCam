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
let _kiBatchMode = false; // KI-Aktionen zu einem einzigen History-Eintrag zusammenfassen

function saveHistory(labelArg) {
  if (_kiBatchMode) return;
  const label = typeof labelArg === 'string' ? labelArg : (_nextLabel || 'Bearbeitet');
  _nextLabel = null;
  history    = history.slice(0, historyIdx + 1);
  const json = JSON.stringify(canvas.toJSON(CUSTOM_PROPS));
  const now  = new Date();
  history.push({
    json,
    label,
    time: now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  });
  if (history.length > MAX_HISTORY) history = history.slice(history.length - MAX_HISTORY);
  historyIdx = history.length - 1;

  const tab = tabById(activeTabId);
  if (tab) {
    tab.canvasJSON  = json;
    tab.history     = history;
    tab.historyIdx  = historyIdx;
    saveTabs();
  }
  refreshTimeline();
  _updateDirtyIndicator();
}

function restoreHistory(idx) {
  const entry = history[idx];
  if (!entry) return;
  canvas.loadFromJSON(entry.json, () => {
    applyLayerVisibilityToObjects();
    canvas.renderAll();
    refreshLayersList();
  });
  historyIdx = idx;
  const tab = tabById(activeTabId);
  if (tab) { tab.canvasJSON = entry.json; tab.historyIdx = idx; saveTabs(); }
  refreshTimeline();
  _updateDirtyIndicator();
}

function deleteHistoryEntry(i) {
  const tab = tabById(activeTabId);
  if (!tab || history.length <= 1) return;
  history.splice(i, 1);
  if (historyIdx >= history.length) historyIdx = history.length - 1;
  else if (historyIdx > i) historyIdx--;
  tab.history    = history;
  tab.historyIdx = historyIdx;
  restoreHistory(historyIdx);
}

function refreshTimeline() {
  const list = document.getElementById('timelineList');
  if (!list) return;
  list.innerHTML = '';
  // Neueste oben
  for (let i = history.length - 1; i >= 0; i--) {
    const e   = history[i];
    const row = document.createElement('div');
    row.className = 'tl-entry' + (i === historyIdx ? ' tl-current' : '') + (i > historyIdx ? ' tl-future' : '');
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
  if (historyIdx > 0) { restoreHistory(--historyIdx); setStatus('↩ Rückgängig'); }
});
document.getElementById('redoBtn').addEventListener('click', () => {
  if (historyIdx < history.length - 1) { restoreHistory(++historyIdx); setStatus('↪ Wiederholen'); }
});

canvas.on('path:created', () => { _nextLabel = 'Freihand'; saveHistory(); refreshLayersList(); });


