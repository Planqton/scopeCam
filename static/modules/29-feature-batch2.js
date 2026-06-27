
// ── 1. Stream einfrieren ─────────────────────────────────────────────────────
S._streamFrozen = false;
document.getElementById('freezeBtn').addEventListener('click', () => {
  S._streamFrozen = !S._streamFrozen;
  const btn = document.getElementById('freezeBtn');
  btn.textContent = S._streamFrozen ? '▶ Fortsetzen' : '⏸ Einfrieren';
  btn.style.background = S._streamFrozen ? 'var(--clr-accent,#1bc9e9)' : '';
  btn.style.color       = S._streamFrozen ? '#000' : '';
  setStatus(S._streamFrozen ? 'Stream eingefroren' : 'Stream läuft');
});

// ── 2. Winkeleinrasten beim Zeichnen ─────────────────────────────────────────
function _snapAngle(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return { x: x2, y: y2 };
  const ang = Math.atan2(dy, dx);
  const snap45 = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
  return { x: x1 + Math.cos(snap45) * len, y: y1 + Math.sin(snap45) * len };
}

// ── 3. Visuelles Snap-Feedback ────────────────────────────────────────────────
const _sfCanvas = document.getElementById('snapFeedbackCanvas');
const _sfCtx    = _sfCanvas?.getContext('2d');
let   _sfTimer  = null;

function _showSnapFeedback(canvasX, canvasY) {
  if (!_sfCtx || !_sfCanvas) return;
  const wrapper = document.getElementById('canvasWrapper');
  const { ox, oy } = getImgOffset();
  const cssX = ox + canvasX * S.zoomLevel;
  const cssY = oy + canvasY * S.zoomLevel;
  const dpr  = window.devicePixelRatio || 1;
  const rect  = wrapper.getBoundingClientRect();

  if (_sfCanvas.width !== rect.width * dpr || _sfCanvas.height !== rect.height * dpr) {
    _sfCanvas.width  = rect.width * dpr;
    _sfCanvas.height = rect.height * dpr;
    _sfCanvas.style.width  = rect.width + 'px';
    _sfCanvas.style.height = rect.height + 'px';
  }
  _sfCtx.clearRect(0, 0, _sfCanvas.width, _sfCanvas.height);
  _sfCtx.beginPath();
  _sfCtx.arc(cssX * dpr, cssY * dpr, 6 * dpr, 0, Math.PI * 2);
  _sfCtx.strokeStyle = '#1bc9e9';
  _sfCtx.lineWidth   = 1.5 * dpr;
  _sfCtx.stroke();
  clearTimeout(_sfTimer);
  _sfTimer = setTimeout(() => _sfCtx?.clearRect(0, 0, _sfCanvas.width, _sfCanvas.height), 600);
}

S.canvas.on('mouse:up', () => { _sfCtx?.clearRect(0, 0, _sfCanvas.width, _sfCanvas.height); });

// ── 4. Zoom auf Auswahl ───────────────────────────────────────────────────────
function zoomToSelection() {
  const objs = S.canvas.getActiveObjects();
  if (!objs.length) return;
  const bbs = objs.map(o => o.getBoundingRect(true));
  const x1  = Math.min(...bbs.map(b => b.left));
  const y1  = Math.min(...bbs.map(b => b.top));
  const x2  = Math.max(...bbs.map(b => b.left + b.width));
  const y2  = Math.max(...bbs.map(b => b.top  + b.height));
  const w   = x2 - x1 || 1, h = y2 - y1 || 1;
  const wrapper = document.getElementById('canvasWrapper');
  const padding = 60;
  const newZ = Math.min(ZOOM_MAX, Math.min(
    (wrapper.offsetWidth  - padding * 2) / (w * (S.videoCanvas.offsetWidth  / S.canvas.width)),
    (wrapper.offsetHeight - padding * 2) / (h * (S.videoCanvas.offsetHeight / S.canvas.height))
  ));
  // Mittelpunkt der Selection in Canvas-Bild-Koordinaten → auf Wrapper-Mitte zentrieren
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const { ox: ox0, oy: oy0 } = getImgOffset();
  S.zoomLevel = newZ;
  // Nach setZoom den Pan neu berechnen (applyTransform wird aufgerufen)
  applyTransform();
  const { ox, oy } = getImgOffset();
  S.panX = wrapper.offsetWidth  / 2 - (ox + cx) * newZ;
  S.panY = wrapper.offsetHeight / 2 - (oy + cy) * newZ;
  applyTransform();
}
document.getElementById('zoomToSelMenu').addEventListener('click', zoomToSelection);

// ── 5. Hover-Highlight im Objekt-Manager ──────────────────────────────────────
let _hoverHighlightObj = null;
function _flashObject(obj, on) {
  if (!obj || !obj.visible) return;
  if (on) {
    _hoverHighlightObj = { obj, origOpacity: obj.opacity };
    obj.set('opacity', 0.45);
    S.canvas.requestRenderAll();
    _hoverHighlightObj.timer = setTimeout(() => {
      if (_hoverHighlightObj?.obj === obj) {
        obj.set('opacity', _hoverHighlightObj.origOpacity ?? 1);
        S.canvas.requestRenderAll();
        _hoverHighlightObj = null;
      }
    }, 300);
  } else if (_hoverHighlightObj?.obj === obj) {
    clearTimeout(_hoverHighlightObj.timer);
    obj.set('opacity', _hoverHighlightObj.origOpacity ?? 1);
    S.canvas.requestRenderAll();
    _hoverHighlightObj = null;
  }
}

// ── 6. PCB-Farb-Presets ───────────────────────────────────────────────────────
document.querySelectorAll('.pcb-pre').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('colorPicker').value = btn.dataset.color;
    document.getElementById('colorPicker').dispatchEvent(new Event('input'));
  });
});

// ── 7. Trace-Gesamtlänge ──────────────────────────────────────────────────────
function _updateTraceLength() {
  const objs = S.canvas.getActiveObjects();
  if (objs.length < 2) { document.getElementById('statusTraceLen').textContent = ''; return; }
  // Alle müssen Linien mit gleichem linkGroup sein
  const gid = objs[0].linkGroup;
  if (!gid || !objs.every(o => o.type === 'line' && o.linkGroup === gid)) {
    document.getElementById('statusTraceLen').textContent = ''; return;
  }
  let total = 0;
  objs.forEach(o => {
    const p = o.calcLinePoints();
    const dx = p.x2 - p.x1, dy = p.y2 - p.y1;
    total += Math.sqrt(dx * dx + dy * dy);
  });
  const label = S.settings.scale_px_per_mm > 0
    ? (total / S.settings.scale_px_per_mm).toFixed(2) + ' mm'
    : Math.round(total) + ' px';
  document.getElementById('statusTraceLen').textContent = '∑ ' + label;
}
S.canvas.on('selection:created', _updateTraceLength);
S.canvas.on('selection:updated', _updateTraceLength);
S.canvas.on('selection:cleared', () => { document.getElementById('statusTraceLen').textContent = ''; });

// ── 8. Grid-Origin ────────────────────────────────────────────────────────────
let _gridOriginPickMode = false;

document.getElementById('gridOriginX').addEventListener('change', e => {
  S.gridState.originX = parseInt(e.target.value) || 0; saveGridState(); drawGrid();
});
document.getElementById('gridOriginY').addEventListener('change', e => {
  S.gridState.originY = parseInt(e.target.value) || 0; saveGridState(); drawGrid();
});
document.getElementById('gridOriginPickBtn').addEventListener('click', () => {
  _gridOriginPickMode = true;
  setStatus('Klick auf Canvas setzt Grid-Ursprung');
  document.getElementById('gridOriginPickBtn').style.background = 'var(--clr-accent,#1bc9e9)';
  document.getElementById('gridOriginPickBtn').style.color = '#000';
});

S.canvas.on('mouse:down', opt => {
  if (!_gridOriginPickMode) return;
  const p = S.canvas.getPointer(opt.e);
  S.gridState.originX = Math.round(p.x);
  S.gridState.originY = Math.round(p.y);
  document.getElementById('gridOriginX').value = S.gridState.originX;
  document.getElementById('gridOriginY').value = S.gridState.originY;
  saveGridState(); drawGrid();
  _gridOriginPickMode = false;
  document.getElementById('gridOriginPickBtn').style.background = '';
  document.getElementById('gridOriginPickBtn').style.color = '';
  setStatus('Grid-Ursprung gesetzt');
});

// ── 9. Schnellmessung ─────────────────────────────────────────────────────────
S._measurePt1 = null;
S._measureOverlay = document.getElementById('measureOverlay');

function _measureShow(x1, y1, x2, y2, screenX, screenY) {
  const dx = x2 - x1, dy = y2 - y1;
  const px = Math.sqrt(dx * dx + dy * dy);
  const label = S.settings.scale_px_per_mm > 0
    ? (px / S.settings.scale_px_per_mm).toFixed(2) + ' mm  (' + Math.round(px) + ' px)'
    : Math.round(px) + ' px';
  S._measureOverlay.textContent = '⇔ ' + label;
  S._measureOverlay.style.left = (screenX + 14) + 'px';
  S._measureOverlay.style.top  = (screenY - 10) + 'px';
  S._measureOverlay.style.display = 'block';
}

// ── 10. Callout-Tool ──────────────────────────────────────────────────────────
S._calloutAnchor = null;
S._calloutPreviewLine = null;

function _calloutClean() {
  if (S._calloutPreviewLine) { S.canvas.remove(S._calloutPreviewLine); S._calloutPreviewLine = null; }
}

// ── 11. Komponent-Bibliothek ──────────────────────────────────────────────────
const COMPLIB_KEY = 'scopecam_complib_v1';
let _compLib = [];
try { _compLib = JSON.parse(localStorage.getItem(COMPLIB_KEY) || '[]'); } catch (_) {}

function _saveCompLib() {
  try { localStorage.setItem(COMPLIB_KEY, JSON.stringify(_compLib)); } catch (_) {}
}

function _renderCompLib() {
  const list = document.getElementById('compLibList');
  list.innerHTML = '';
  if (!_compLib.length) {
    list.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--clr-txt-dim,#aaa);text-align:center">Leer — Objekte auswählen und speichern</div>';
    return;
  }
  _compLib.forEach((entry, idx) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;padding:6px 8px;gap:6px;border-bottom:1px solid var(--clr-border,#333)';
    const name = document.createElement('span');
    name.textContent = entry.name;
    name.style.cssText = 'flex:1;font-size:13px';
    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Einfügen';
    loadBtn.style.cssText = 'padding:2px 8px;border-radius:3px;border:1px solid var(--clr-border,#444);background:var(--clr-hover,#2a2a2a);color:inherit;cursor:pointer;font-size:11px';
    loadBtn.addEventListener('click', () => {
      fabric.util.enlivenObjects(entry.objects, objs => {
        const gidMap = {};
        objs.forEach(o => {
          o.objId = crypto.randomUUID();
          if (o.linkGroup) {
            if (!gidMap[o.linkGroup]) gidMap[o.linkGroup] = crypto.randomUUID();
            o.linkGroup = gidMap[o.linkGroup];
          }
          o.left += 30; o.top += 30;
          S.canvas.add(o);
        });
        S.canvas.requestRenderAll();
        S._nextLabel = `Bibliothek: ${entry.name}`;
        saveHistory();
        refreshLayersList();
        setStatus(`"${entry.name}" eingefügt`);
      });
    });
    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.style.cssText = 'padding:2px 6px;border-radius:3px;border:1px solid var(--clr-border,#444);background:transparent;color:var(--clr-muted,#888);cursor:pointer;font-size:11px';
    delBtn.addEventListener('click', () => { _compLib.splice(idx, 1); _saveCompLib(); _renderCompLib(); });
    row.append(name, loadBtn, delBtn);
    list.appendChild(row);
  });
}

document.getElementById('compLibBtn').addEventListener('click', () => {
  _renderCompLib();
  document.getElementById('compLibModal').style.display = 'flex';
});
document.getElementById('compLibCloseBtn').addEventListener('click', () => {
  document.getElementById('compLibModal').style.display = 'none';
});
document.getElementById('compLibSaveBtn').addEventListener('click', () => {
  const name = document.getElementById('compLibName').value.trim();
  if (!name) { setStatus('Bitte Namen eingeben'); return; }
  const objs = S.canvas.getActiveObjects();
  if (!objs.length) { setStatus('Bitte Objekte auswählen'); return; }
  const serialized = objs.map(o => o.toObject(CUSTOM_PROPS));
  _compLib.push({ name, objects: serialized, created: Date.now() });
  _saveCompLib();
  document.getElementById('compLibName').value = '';
  _renderCompLib();
  setStatus(`"${name}" in Bibliothek gespeichert`);
});

// ── 12. Batch-Umbenennen ──────────────────────────────────────────────────────
function _applyBatchRename() {
  const pattern = document.getElementById('batchRenamePattern').value;
  const objs    = S.canvas.getActiveObjects();
  if (!pattern || !objs.length) return;
  objs.forEach((o, i) => {
    const letter = String.fromCharCode(65 + i % 26);
    o.customName = pattern
      .replace(/%d/g, i + 1)
      .replace(/%D/g, letter)
      .replace(/%n/g, o.customName || getObjLabel(o));
  });
  S.canvas.requestRenderAll();
  S._nextLabel = 'Batch-Umbenennung';
  saveHistory();
  refreshLayersList();
  document.getElementById('batchRenameModal').style.display = 'none';
}

function _updateBatchPreview() {
  const pattern = document.getElementById('batchRenamePattern').value;
  const objs    = S.canvas.getActiveObjects();
  if (!pattern || !objs.length) { document.getElementById('batchRenamePreview').textContent = ''; return; }
  const examples = objs.slice(0, 3).map((o, i) => {
    const letter = String.fromCharCode(65 + i % 26);
    return pattern.replace(/%d/g, i+1).replace(/%D/g, letter).replace(/%n/g, o.customName || getObjLabel(o));
  });
  document.getElementById('batchRenamePreview').textContent = 'Vorschau: ' + examples.join(', ') + (objs.length > 3 ? ', …' : '');
}

document.getElementById('batchRenameBtn').addEventListener('click', () => {
  const objs = S.canvas.getActiveObjects();
  if (!objs.length) { setStatus('Bitte zuerst Objekte auswählen'); return; }
  document.getElementById('batchRenamePattern').value = '';
  document.getElementById('batchRenamePreview').textContent = '';
  document.getElementById('batchRenameModal').style.display = 'flex';
  document.getElementById('batchRenamePattern').focus();
});
document.getElementById('batchRenamePattern').addEventListener('input', _updateBatchPreview);
document.getElementById('batchRenameOkBtn').addEventListener('click', _applyBatchRename);
document.getElementById('batchRenameCancelBtn').addEventListener('click', () => {
  document.getElementById('batchRenameModal').style.display = 'none';
});
document.getElementById('batchRenamePattern').addEventListener('keydown', e => {
  if (e.key === 'Enter') _applyBatchRename();
  if (e.key === 'Escape') document.getElementById('batchRenameModal').style.display = 'none';
});
