import { S } from './00-state.js';
import { CUSTOM_PROPS, saveHistory, refreshTimeline, restoreHistory } from './14-history.js';
import { stopCameraStream, applyDevice } from './05-video.js';
import { syncCanvasSize } from './07-canvas-layout.js';
import { loadLayersFromTab, refreshLayersList } from './13-layers.js';
import { _updateSaveBtn } from './16-file-ops.js';
import { setStatus } from './03-status-log.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TAB MANAGER
// Jeder Tab hat eigene Canvas-Annotationen + optionalen Snapshot als Hintergrund.
// Kamera-Tabs (backgroundDataUrl = null) nutzen den Live-Stream oder Demo-Modus.
// Snapshot-Tabs zeigen ein eingefrorenes Standbild als Hintergrund.
// Persistenz: Alle Tabs + aktiver Tab werden in localStorage gespeichert.
// ═══════════════════════════════════════════════════════════════════════════════

const TAB_KEY        = 'scopecam_tabs_v1';
const TAB_ACTIVE_KEY = 'scopecam_tab_active_v1';

S.tabs        = [];
S.activeTabId = null;

export function tabById(id)  { return S.tabs.find(t => t.id === id) || null; }
function newTabId()   { return 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5); }

export function saveTabs() {
  try {
    localStorage.setItem(TAB_KEY, JSON.stringify(S.tabs));
    localStorage.setItem(TAB_ACTIVE_KEY, S.activeTabId || '');
  } catch (e) {
    // localStorage voll (z.B. viele Snapshots) — Metadaten ohne Bilddaten retten
    try {
      const slim = S.tabs.map(t => ({ ...t, backgroundDataUrl: t.backgroundDataUrl ? '[gespeichert]' : null }));
      localStorage.setItem(TAB_KEY, JSON.stringify(slim));
    } catch (_) {}
    console.warn('localStorage voll:', e);
  }
}

export function loadTabsFromStorage() {
  try {
    const raw = JSON.parse(localStorage.getItem(TAB_KEY));
    if (Array.isArray(raw) && raw.length > 0) {
      S.tabs = raw;
      S.activeTabId = localStorage.getItem(TAB_ACTIVE_KEY) || raw[0].id;
      if (!tabById(S.activeTabId)) S.activeTabId = raw[0].id;
      return true;
    }
  } catch (_) {}
  return false;
}

export function createTab(name, backgroundDataUrl = null, canvasJSON = null) {
  const defaultLayers = [{ id: 'default', name: 'Standard', visible: true, collapsed: false }];
  const tab = { id: newTabId(), name, backgroundDataUrl, canvasJSON, layers: defaultLayers };
  S.tabs.push(tab);
  return tab;
}

export function getCurrentTabCanvasJSON() {
  return JSON.stringify(S.canvas.toJSON(CUSTOM_PROPS));
}

export function _applyObjLocks(o) {
  o.lockMovementX = !!(o.lockPosition);
  o.lockMovementY = !!(o.lockPosition);
  o.lockScalingX  = !!(o.lockSize);
  o.lockScalingY  = !!(o.lockSize);
  // lockPosition/lockSize lassen Objekt auswählbar — nur der volle `locked`-Flag deaktiviert Auswahl
  if (!o.locked && o.visible) {
    o.selectable = S.currentTool === 'select';
    o.evented    = o.selectable;
  }
}

export function applyLayerVisibilityToObjects() {
  S.canvas.forEachObject(o => {
    const layer      = S.layers.find(l => l.id === (o.layerId || 'default'));
    const lv         = layer ? layer.visible : true;
    o.visible        = lv && (o.objVisible !== false);
    o.selectable     = o.visible && (S.currentTool === 'select') && !o.locked;
    o.evented        = o.selectable;
    _applyObjLocks(o);
  });
}

export function loadCanvasFromJSON(json) {
  if (!json) {
    S.canvas.clear();
    S.canvas.renderAll();
    refreshLayersList();
    return;
  }
  // fabric v6: loadFromJSON returns a Promise (2nd arg is now reviver, not callback)
  S.canvas.loadFromJSON(typeof json === 'string' ? JSON.parse(json) : json).then(() => {
    applyLayerVisibilityToObjects();
    S.canvas.renderAll();
    refreshLayersList();
  });
}

export function switchToTab(id) {
  // Aktuellen Tab-Canvas + Ebenen speichern
  if (S.activeTabId) {
    const cur = tabById(S.activeTabId);
    if (cur) {
      cur.canvasJSON = getCurrentTabCanvasJSON();
      cur.layers     = JSON.parse(JSON.stringify(S.layers));
    }
  }

  S.activeTabId = id;
  const tab = tabById(id);
  if (!tab) return;

  S.currentSavePath = tab.savePath || null;
  _updateSaveBtn();
  loadLayersFromTab(tab);

  // Hintergrund setzen
  if (tab.backgroundDataUrl && tab.backgroundDataUrl !== '[gespeichert]') {
    stopCameraStream();
    loadSnapshotBackground(tab.backgroundDataUrl);
  } else if (!tab.backgroundDataUrl) {
    applyDevice();
  }

  // Canvas laden + History aus Tab wiederherstellen
  if (tab.history && tab.history.length > 0) {
    S.history    = tab.history;
    S.historyIdx = tab.historyIdx ?? S.history.length - 1;
    loadCanvasFromJSON(S.history[S.historyIdx]?.json || tab.canvasJSON);
    refreshTimeline();
  } else {
    S.history    = [];
    S.historyIdx = -1;
    loadCanvasFromJSON(tab.canvasJSON);
    saveHistory('Start');
  }

  saveTabs();
  renderTabBar();
}

function _openDefaultTab() {
  const tab = createTab('Kamera');
  switchToTab(tab.id);
}

export function _tabHasUnsavedChanges(tab) {
  if (!tab) return false;
  const savedIdx = tab._savedHistoryIdx ?? -1;
  const curIdx   = tab.id === S.activeTabId ? S.historyIdx : (tab.historyIdx ?? -1);
  return curIdx !== savedIdx && (tab.history?.length > 0 || tab.id === S.activeTabId);
}

function closeTab(id) {
  const idx = S.tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  const tab = S.tabs[idx];

  if (_tabHasUnsavedChanges(tab)) {
    const name = tab.label || 'Dieser Tab';
    if (!confirm(`"${name}" hat ungespeicherte Änderungen.\nTrotzdem schließen?`)) return;
  }

  if (S.activeTabId === id) {
    if (S.tabs.length > 1) {
      const newIdx = idx === 0 ? 1 : idx - 1;
      switchToTab(S.tabs[newIdx].id);
    }
  }

  S.tabs = S.tabs.filter(t => t.id !== id);
  saveTabs();
  renderTabBar();

  if (S.tabs.length === 0) _openDefaultTab();
}

export function renderTabBar() {
  const list = document.getElementById('tabList');
  list.innerHTML = '';

  S.tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab-item' + (tab.id === S.activeTabId ? ' tab-active' : '')
                              + (tab.backgroundDataUrl   ? ' tab-snapshot' : '');
    el.dataset.tabId = tab.id;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'tab-icon';
    if (tab.backgroundDataUrl) {
      // Statisches Bild / Snapshot
      iconSpan.innerHTML = '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="2.5" width="12" height="9" rx="1"/><circle cx="7" cy="7" r="2.2"/><path d="M4.5 2.5l.8-1.5h3.4l.8 1.5"/></svg>';
    } else {
      // Live-Kamera / Demo
      iconSpan.innerHTML = '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="9" height="8" rx="1.2"/><path d="M10 6l3-2v6l-3-2V6z"/></svg>';
    }

    const nameSpan = document.createElement('span');
    nameSpan.className   = 'tab-name';
    nameSpan.textContent = tab.name;
    nameSpan.title       = 'Doppelklick zum Umbenennen';

    nameSpan.addEventListener('dblclick', e => {
      e.stopPropagation();
      const input     = document.createElement('input');
      input.type      = 'text';
      input.className = 'tab-name-input';
      input.value     = tab.name;
      nameSpan.replaceWith(input);
      input.focus();
      input.select();
      const done = () => {
        tab.name          = input.value.trim() || tab.name;
        nameSpan.textContent = tab.name;
        input.replaceWith(nameSpan);
        saveTabs();
        renderTabBar();
      };
      input.addEventListener('blur',   done);
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter')  done();
        if (ev.key === 'Escape') input.replaceWith(nameSpan);
      });
    });

    el.addEventListener('click', () => { if (tab.id !== S.activeTabId) switchToTab(tab.id); });

    el.appendChild(iconSpan);
    el.appendChild(nameSpan);

    const closeBtn       = document.createElement('button');
    closeBtn.className   = 'tab-close';
    closeBtn.textContent = '×';
    closeBtn.title       = 'Tab schließen';
    closeBtn.addEventListener('click', ev => { ev.stopPropagation(); closeTab(tab.id); });
    el.appendChild(closeBtn);

    list.appendChild(el);
  });
}

// Neuer leerer Tab (Kamera-Tab)
document.getElementById('tabAddBtn').addEventListener('click', () => {
  if (S.activeTabId) {
    const cur = tabById(S.activeTabId);
    if (cur) cur.canvasJSON = getCurrentTabCanvasJSON();
  }
  const newTab = createTab('Tab ' + (S.tabs.length + 1));
  switchToTab(newTab.id);
});

export function loadSnapshotBackground(dataUrl) {
  const img   = new Image();
  img.onload  = () => {
    S.videoCanvas.width  = img.naturalWidth;
    S.videoCanvas.height = img.naturalHeight;
    S.videoCtx.drawImage(img, 0, 0);
    syncCanvasSize();
  };
  img.src = dataUrl;
}


