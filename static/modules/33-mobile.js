// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE UI
// ═══════════════════════════════════════════════════════════════════════════════

function _isMobile() { return window.innerWidth <= 768; }

// ── Werkzeug-Buttons sync ──────────────────────────────────────────────────
function _updateMobTools(tool) {
  document.querySelectorAll('.mob-tool').forEach(btn => {
    btn.classList.toggle('mob-active', btn.dataset.tool === tool);
  });
}

document.querySelectorAll('.mob-tool').forEach(btn => {
  btn.addEventListener('click', () => activateTool(btn.dataset.tool));
});

// ── Action Sheet ───────────────────────────────────────────────────────────
function _openMobSheet()  {
  document.getElementById('mobSheet').classList.add('mob-open');
  document.getElementById('mobSheetBg').classList.add('mob-open');
}
function _closeMobSheet() {
  document.getElementById('mobSheet').classList.remove('mob-open');
  document.getElementById('mobSheetBg').classList.remove('mob-open');
}

document.getElementById('mobMenuBtn').addEventListener('click', _openMobSheet);
document.getElementById('mobSheetBg').addEventListener('click', _closeMobSheet);

function _mobBtn(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', () => { _closeMobSheet(); fn(); });
}

document.getElementById('mobSaveBtn').addEventListener('click', () => saveProject());

// KI-Button in der Top-Bar
document.getElementById('mobKiBtn').addEventListener('click', () => {
  const st = S.panelStates['ki'];
  st.open = !st.open;
  applyPanel('ki');
  savePanelStates();
});

_mobBtn('mob_save',        () => saveProject());
_mobBtn('mob_saveAs',      () => saveProjectAs());
_mobBtn('mob_open',        () => openFileManager('open'));
_mobBtn('mob_export',      () => document.getElementById('exportBtn').click());
_mobBtn('mob_fm',          () => openFileManager('browse'));
_mobBtn('mob_undo',        () => { if (S.historyIdx > 0) restoreHistory(S.historyIdx - 1); });
_mobBtn('mob_redo',        () => { if (S.historyIdx < S.history.length - 1) restoreHistory(S.historyIdx + 1); });
_mobBtn('mob_delete',      () => { const o = S.canvas.getActiveObject(); if (o) { S.canvas.remove(o); saveHistory('Gelöscht'); }});
_mobBtn('mob_clearAll',    () => { S.canvas.clear(); saveHistory('Alle gelöscht'); });
_mobBtn('mob_ki',          () => { S.panelStates['ki'].open = !S.panelStates['ki'].open; applyPanel('ki'); savePanelStates(); });
_mobBtn('mob_timeline',    () => { S.panelStates['timeline'].open = !S.panelStates['timeline'].open; applyPanel('timeline'); savePanelStates(); });
_mobBtn('mob_settings',    () => document.getElementById('openSettingsPage').click());

// ── Mobile Panel Overlays ──────────────────────────────────────────────────
// applyPanel patchen: auf Mobile → Panel als Vollbild-Overlay
const _applyPanelOrig = applyPanel;
applyPanel = function(id) {
  _applyPanelOrig(id);
  if (!_isMobile()) return;
  const el = S.panelElCache[id];
  if (!el) return;
  const st = S.panelStates[id];
  if (st && st.open) {
    document.body.appendChild(el);
    // Inline-Styles entfernen damit CSS-Klasse greift
    el.removeAttribute('style');
    el.classList.add('panel-visible', 'mob-overlay');
  } else {
    el.classList.remove('mob-overlay');
    document.getElementById('panelHidden').appendChild(el);
  }
};

// Panel über Zurück-Geste / Tipp auf Header schließen
document.addEventListener('click', e => {
  if (!_isMobile()) return;
  const closeBtn = e.target.closest('.p-close');
  if (closeBtn) {
    const panel = closeBtn.closest('.panel[data-panel]');
    if (panel) panel.classList.remove('mob-overlay');
  }
});

// ── Pinch-Zoom & Two-Finger-Pan ────────────────────────────────────────────
(function() {
  const wrapper = document.getElementById('canvasWrapper');
  let _t0 = null;

  wrapper.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const a = e.touches[0], b = e.touches[1];
      _t0 = {
        dist:  Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
        midX:  (a.clientX + b.clientX) / 2,
        midY:  (a.clientY + b.clientY) / 2,
        zoom:  S.zoomLevel,
        panX:  S.panX,
        panY:  S.panY,
      };
    } else {
      _t0 = null;
    }
  }, { passive: false });

  wrapper.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && _t0) {
      e.preventDefault();
      const a = e.touches[0], b = e.touches[1];
      const dist  = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const scale = dist / _t0.dist;
      const midX  = (a.clientX + b.clientX) / 2;
      const midY  = (a.clientY + b.clientY) / 2;
      S.zoomLevel = Math.max(0.1, Math.min(5, _t0.zoom * scale));
      S.panX = _t0.panX + (midX - _t0.midX);
      S.panY = _t0.panY + (midY - _t0.midY);
      applyTransform();
    }
  }, { passive: false });

  wrapper.addEventListener('touchend',   () => { _t0 = null; }, { passive: true });
  wrapper.addEventListener('touchcancel',() => { _t0 = null; }, { passive: true });
})();

// ── Top-Bar Undo/Redo ──────────────────────────────────────────────────────
document.getElementById('mobUndoBtn').addEventListener('click', () => {
  if (S.historyIdx > 0) restoreHistory(S.historyIdx - 1);
});
document.getElementById('mobRedoBtn').addEventListener('click', () => {
  if (S.historyIdx < S.history.length - 1) restoreHistory(S.historyIdx + 1);
});

init();

// Auto-Speichern alle 2 Minuten wenn dirty und Pfad gesetzt
setInterval(() => {
  if (S.currentSavePath && _isDirty()) {
    saveProject().then(() => setStatus('Auto-gespeichert'));
  }
}, 2 * 60 * 1000);
