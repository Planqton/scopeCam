import { S } from './00-state.js';
import { _tabHasUnsavedChanges } from './08-tabs.js';
import { _isDirty } from './16-file-ops.js';

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL MANAGER
// Verwaltet schwebende und angedockte Panels (Werkzeuge, Eigenschaften, etc.)
// ═══════════════════════════════════════════════════════════════════════════════

const PANEL_KEY = 'scopecam_panels_v4';

const PANEL_DEFAULTS = {
  tools:    { mode: 'left',  open: true,  collapsed: false, x: 20,  y: 60,  dockOrder: 0 },
  props:    { mode: 'left',  open: false, collapsed: false, x: 20,  y: 240, dockOrder: 1 },
  layers:   { mode: 'right', open: true,  collapsed: false, x: 20,  y: 60,  dockOrder: 0 },
  capture:  { mode: 'right', open: true,  collapsed: false, x: 20,  y: 260, dockOrder: 1 },
  ki:       { mode: 'float', open: false, collapsed: false, x: 200, y: 100, dockOrder: 2 },
  timeline: { mode: 'float', open: false, collapsed: false, x: 400, y: 60,  dockOrder: 3 },
  log:      { mode: 'float', open: false, collapsed: false, x: 500, y: 100, dockOrder: 4 },
  console:  { mode: 'bottom', open: false, collapsed: false, x: 20,  y: 200, dockOrder: 5 },
};

S.panelStates = {};
let zTop = 1000;

// Cache Panel-Elemente beim Start — querySelector schlägt nach el.remove() fehl.
S.panelElCache = {};
document.querySelectorAll('.panel[data-panel]').forEach(el => {
  S.panelElCache[el.dataset.panel] = el;
});

export function loadPanelStates() {
  try {
    const saved = JSON.parse(localStorage.getItem(PANEL_KEY)) || {};
    S.panelStates = {};
    for (const id in PANEL_DEFAULTS) {
      S.panelStates[id] = { ...PANEL_DEFAULTS[id], ...(saved[id] || {}) };
    }
    if (saved._activeBottomTab) _activeBottomTab = saved._activeBottomTab;
  } catch {
    S.panelStates = Object.fromEntries(
      Object.entries(PANEL_DEFAULTS).map(([k, v]) => [k, { ...v }])
    );
  }
}

export function savePanelStates() {
  try { localStorage.setItem(PANEL_KEY, JSON.stringify(S.panelStates)); } catch (_) {}
}

// Sicherheitsnetz: immer speichern wenn die Seite verlassen wird
window.addEventListener('beforeunload', e => {
  savePanelStates();
  const anyDirty = S.tabs.some(_tabHasUnsavedChanges) || _isDirty();
  if (anyDirty) { e.preventDefault(); e.returnValue = ''; }
});

function getPanelEl(id) { return S.panelElCache[id] || null; }

function updateDockClass(dockEl) {
  dockEl.classList.toggle('has-panels', dockEl.querySelector('.panel') !== null);
}

function updateAllDocks() {
  ['dockLeft','dockRight','dockBottom'].forEach(id =>
    updateDockClass(document.getElementById(id)));
  _updateBottomDockVar();
  _refreshBottomTabs();
}

function _updateBottomDockVar() {
  const hasDock = document.getElementById('dockBottom').classList.contains('has-panels');
  document.documentElement.style.setProperty('--dock-bottom-h', hasDock ? (dockWidths.bottom || 180) + 'px' : '0px');
}

let _activeBottomTab = null;

function _refreshBottomTabs() {
  const dock   = document.getElementById('dockBottom');
  const tabBar = document.getElementById('dockBottomTabs');
  if (!tabBar) return;
  const panels = [...dock.querySelectorAll(':scope > .panel')];
  tabBar.innerHTML = '';
  if (!panels.length) { _activeBottomTab = null; return; }
  if (!panels.some(p => p.dataset.panel === _activeBottomTab))
    _activeBottomTab = panels[0].dataset.panel;
  panels.forEach(p => {
    const pid   = p.dataset.panel;
    const label = p.querySelector('.panel-title')?.textContent?.trim() || pid;
    const btn   = document.createElement('button');
    btn.className = 'dock-bt' + (pid === _activeBottomTab ? ' active' : '');
    btn.textContent = label;
    btn.title = label;
    btn.addEventListener('click', () => {
      _activeBottomTab = pid;
      S.panelStates._activeBottomTab = pid;
      savePanelStates();
      _refreshBottomTabs();
    });
    tabBar.appendChild(btn);
    p.classList.toggle('dock-tab-hidden', pid !== _activeBottomTab);
  });
}

S.applyPanel = function(id) {
  const el = getPanelEl(id);
  const st = S.panelStates[id];
  if (!el || !st) return;

  if (!st.open) {
    el.classList.remove('panel-visible');
    document.getElementById('panelHidden').appendChild(el);
    updateAllDocks();
    updatePanelToggles();
    return;
  }

  el.classList.add('panel-visible');
  const body = el.querySelector('.panel-body');
  body.style.display = st.collapsed ? 'none' : '';
  el.querySelector('.p-collapse').textContent = st.collapsed ? '+' : '−';

  if (st.mode === 'float') {
    document.body.appendChild(el);
    el.style.position = 'fixed';
    el.style.left   = Math.max(0, Math.min(st.x, window.innerWidth  - 200)) + 'px';
    el.style.top    = Math.max(30, Math.min(st.y, window.innerHeight - 60))  + 'px';
    el.style.zIndex = ++zTop;
    el.style.width  = st.width ? st.width + 'px' : '';
  } else {
    const dockId = st.mode === 'left' ? 'dockLeft' : st.mode === 'right' ? 'dockRight' : 'dockBottom';
    const dock   = document.getElementById(dockId);
    const others = [...dock.querySelectorAll('.panel')].filter(p => p !== el);
    const before = others.find(p => (S.panelStates[p.dataset.panel]?.dockOrder ?? 99) > st.dockOrder);
    dock.insertBefore(el, before || null);
    el.style.position = '';
    el.style.left     = '';
    el.style.top      = '';
    el.style.zIndex   = '';
    el.style.height   = '';
    el.style.maxWidth = '';
    el.style.minWidth = '';
    el.style.width    = st.mode === 'bottom' ? '' : '100%';
    el.style.flex     = '';
    if (st.mode === 'bottom') _activeBottomTab = id;
  }

  updateAllDocks();
  updatePanelToggles();
};

function updatePanelToggles() {
  document.querySelectorAll('.panel-toggle[data-panel]').forEach(item => {
    const id = item.dataset.panel;
    item.querySelector('.checkmark').textContent = (S.panelStates[id]?.open ?? false) ? '✓' : '';
  });
}

// ── Panel-Drag ─────────────────────────────────────────────────────────────
let drag = null;

function panelStartDrag(id, e) {
  if (e.target.matches('.p-btn')) return;
  e.preventDefault();
  const el = getPanelEl(id);
  const st = S.panelStates[id];
  const rect = el.getBoundingClientRect();

  drag = {
    id,
    startMX:  e.clientX,
    startMY:  e.clientY,
    origMode: st.mode,
    origX:    st.mode === 'float' ? parseFloat(el.style.left) : rect.left,
    origY:    st.mode === 'float' ? parseFloat(el.style.top)  : rect.top,
    undocked: st.mode === 'float',
  };

  if (st.mode === 'float') {
    el.style.zIndex = ++zTop;
    el.classList.add('dragging');
  }

  document.addEventListener('mousemove', onPanelDragMove);
  document.addEventListener('mouseup',   onPanelDragEnd);
}

const DRAG_THRESHOLD = 6;

function onPanelDragMove(e) {
  if (!drag) return;
  const dx = e.clientX - drag.startMX;
  const dy = e.clientY - drag.startMY;

  // Erst nach DRAG_THRESHOLD px aus dem Dock lösen
  if (!drag.undocked) {
    if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
    drag.undocked = true;
    const el = getPanelEl(drag.id);
    const st = S.panelStates[drag.id];
    st.mode = 'float';
    st.x    = drag.origX;
    st.y    = drag.origY;
    S.applyPanel(drag.id);
    el.style.zIndex = ++zTop;
    el.classList.add('dragging');
  }

  const el = getPanelEl(drag.id);
  el.style.left = (drag.origX + dx) + 'px';
  el.style.top  = (drag.origY + dy) + 'px';

  const vw = window.innerWidth, vh = window.innerHeight;
  const LR = 100;
  const dockBotRect = document.getElementById('dockBottom').getBoundingClientRect();
  const botTop = dockBotRect.height > 0 ? dockBotRect.top : vh - 60;
  const nearBottom = e.clientY >= botTop;
  const nearLeft   = e.clientX < LR && !nearBottom;
  const nearRight  = e.clientX > vw - LR && !nearBottom;
  document.getElementById('dockLeft').classList.toggle('drop-active',   nearLeft);
  document.getElementById('dockRight').classList.toggle('drop-active',  nearRight);
  document.getElementById('dockBottom').classList.toggle('drop-active', nearBottom);
}

function onPanelDragEnd(e) {
  if (!drag) return;
  document.removeEventListener('mousemove', onPanelDragMove);
  document.removeEventListener('mouseup',   onPanelDragEnd);

  if (!drag.undocked) {
    // Nur Klick, kein Drag → Panel bleibt wo es ist
    drag = null;
    return;
  }

  const el  = getPanelEl(drag.id);
  const st  = S.panelStates[drag.id];
  const vw  = window.innerWidth, vh = window.innerHeight;
  const LR  = 100;
  const dockBotRect2 = document.getElementById('dockBottom').getBoundingClientRect();
  const botTop2 = dockBotRect2.height > 0 ? dockBotRect2.top : vh - 60;
  el.classList.remove('dragging');

  if (e.clientY >= botTop2) {
    st.mode = 'bottom';
    st.dockOrder = document.getElementById('dockBottom').querySelectorAll('.panel').length;
  } else if (e.clientX < LR) {
    st.mode = 'left';
    st.dockOrder = document.getElementById('dockLeft').querySelectorAll('.panel').length;
  } else if (e.clientX > vw - LR) {
    st.mode = 'right';
    st.dockOrder = document.getElementById('dockRight').querySelectorAll('.panel').length;
  } else {
    st.mode = 'float';
    st.x = parseFloat(el.style.left);
    st.y = parseFloat(el.style.top);
  }

  S.applyPanel(drag.id);
  ['dockLeft','dockRight','dockBottom'].forEach(id =>
    document.getElementById(id).classList.remove('drop-active'));
  savePanelStates();
  drag = null;
}

// ── Panel-Toggles (Menü) ──────────────────────────────────────────────────
document.querySelectorAll('.panel-toggle[data-panel]').forEach(item => {
  item.addEventListener('click', e => {
    e.stopPropagation();
    const id = item.dataset.panel;
    const st = S.panelStates[id];
    st.open = !st.open;
    if (st.open && st.mode === 'float' && !st.x) { st.x = 120; st.y = 80; }
    S.applyPanel(id);
    savePanelStates();
  });
});

// ── Panel-Header-Events (Collapse, Close, Drag) ───────────────────────────
document.querySelectorAll('.panel').forEach(el => {
  const id = el.dataset.panel;
  el.querySelector('.p-close').addEventListener('click', () => {
    S.panelStates[id].open = false;
    S.applyPanel(id);
    savePanelStates();
  });
  el.querySelector('.p-collapse').addEventListener('click', () => {
    S.panelStates[id].collapsed = !S.panelStates[id].collapsed;
    S.applyPanel(id);
    savePanelStates();
  });
  el.querySelector('.panel-header').addEventListener('mousedown', e => panelStartDrag(id, e));
  el.addEventListener('mousedown', () => {
    if (S.panelStates[id].mode === 'float') {
      el.style.zIndex = ++zTop;
      // x/y aus aktuellem DOM übernehmen falls Panel gerade platziert wurde
      S.panelStates[id].x = parseFloat(el.style.left) || S.panelStates[id].x;
      S.panelStates[id].y = parseFloat(el.style.top)  || S.panelStates[id].y;
      savePanelStates();
    }
  });
  // Resize-Handle für schwebende Panels
  addPanelResizeHandle(el, id);
});

// ── Dock-Breite (resize) ──────────────────────────────────────────────────
const DOCK_WIDTH_KEY = 'scopecam_dock_widths';
let dockWidths = { left: 200, right: 200, bottom: 180 };

function loadDockWidths() {
  try {
    const s = JSON.parse(localStorage.getItem(DOCK_WIDTH_KEY));
    if (s) dockWidths = { ...dockWidths, ...s };
  } catch (_) {}
}

function saveDockWidths() {
  localStorage.setItem(DOCK_WIDTH_KEY, JSON.stringify(dockWidths));
}

function applyDockWidths() {
  document.getElementById('dockLeft').style.width    = dockWidths.left   + 'px';
  document.getElementById('dockRight').style.width   = dockWidths.right  + 'px';
  document.getElementById('dockBottom').style.height = dockWidths.bottom + 'px';
  _updateBottomDockVar();
}

function setupDockResizeHandles() {
  // Links + Rechts (horizontaler Resize)
  ['left', 'right'].forEach(side => {
    const dock   = document.getElementById(side === 'left' ? 'dockLeft' : 'dockRight');
    const handle = document.createElement('div');
    handle.className = 'dock-resize-handle';
    dock.appendChild(handle);

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = dockWidths[side];
      handle.classList.add('resizing');

      const onMove = e => {
        const dx = e.clientX - startX;
        dockWidths[side] = Math.max(120, Math.min(600, side === 'left' ? startW + dx : startW - dx));
        applyDockWidths();
      };
      const onUp = () => {
        handle.classList.remove('resizing');
        saveDockWidths();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  });

  // Unten (vertikaler Resize)
  const bottomDock = document.getElementById('dockBottom');
  const handleH    = document.createElement('div');
  handleH.className = 'dock-resize-handle-h';
  bottomDock.appendChild(handleH);

  handleH.addEventListener('mousedown', e => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = dockWidths.bottom;
    handleH.classList.add('resizing');

    const onMove = e => {
      dockWidths.bottom = Math.max(60, Math.min(500, startH - (e.clientY - startY)));
      applyDockWidths();
    };
    const onUp = () => {
      handleH.classList.remove('resizing');
      saveDockWidths();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

// ── Floating-Panel-Resize-Handle ──────────────────────────────────────────
function addPanelResizeHandle(el, id) {
  const handle = document.createElement('div');
  handle.className = 'panel-resize-handle';
  el.appendChild(handle);

  handle.addEventListener('mousedown', e => {
    const st = S.panelStates[id];
    if (st.mode !== 'float' && st.mode !== 'bottom') return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = el.offsetWidth;
    handle.classList.add('resizing');

    const onMove = e => {
      const nw = Math.max(160, Math.min(600, startW + (e.clientX - startX)));
      el.style.width = nw + 'px';
      if (st.mode === 'bottom') st.width = nw;
    };
    const onUp = () => {
      handle.classList.remove('resizing');
      st.width = el.offsetWidth;
      savePanelStates();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

// Panel-Layout initialisieren
loadDockWidths();
applyDockWidths();
setupDockResizeHandles();
loadPanelStates();
const _wantedBottomTab = _activeBottomTab; // vor applyPanel sichern — _refreshBottomTabs überschreibt es
Object.keys(S.panelStates).forEach(id => S.applyPanel(id));
// Nach allen Panels: gewünschten Tab wiederherstellen (erst jetzt sind alle Panels im Dock)
if (_wantedBottomTab) { _activeBottomTab = _wantedBottomTab; _refreshBottomTabs(); }


