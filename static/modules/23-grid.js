// ═══════════════════════════════════════════════════════════════════════════════
// RASTER
// ═══════════════════════════════════════════════════════════════════════════════

import { S } from './00-state.js';
import { getImgOffset } from './22-rulers.js';
import { setStatus } from './03-status-log.js';
import { _renderStatusKeys } from './17-shortcuts.js';
import { _refreshCoordFields } from './12-props-panel.js';
import { _savePcbLiveSettings } from './25-pcb-snap.js';

export function _arrowStep() {
  return parseFloat(localStorage.getItem('scopecam_arrow_step') || '1') || 1;
}

const GRID_KEY = 'scopecam_grid_v1';
S.gridState = { enabled: false, snap: false, size: 20, color: '#444444', opacity: 25, originX: 0, originY: 0 };

export function loadGridState() {
  try {
    const s = JSON.parse(localStorage.getItem(GRID_KEY));
    if (s) S.gridState = { ...S.gridState, ...s };
  } catch (_) {}
  applyGridState();
}

export function saveGridState() {
  try { localStorage.setItem(GRID_KEY, JSON.stringify(S.gridState)); } catch (_) {}
}

export function applyGridState() {
  document.getElementById('gridCheckmark').textContent     = S.gridState.enabled ? '✓' : '';
  document.getElementById('gridSnapCheckmark').textContent = S.gridState.snap     ? '✓' : '';
  document.getElementById('gridSizeInput').value    = S.gridState.size;
  document.getElementById('gridColorInput').value   = S.gridState.color;
  document.getElementById('gridOpacityInput').value = S.gridState.opacity;
  document.getElementById('gridOriginX').value      = S.gridState.originX || 0;
  document.getElementById('gridOriginY').value      = S.gridState.originY || 0;
  drawGrid();
  _renderStatusKeys();
}

// Raster auf separatem Canvas der den ganzen Wrapper abdeckt
export function drawGrid() {
  const gc = document.getElementById('gridCanvas');
  const wrapper = document.getElementById('canvasWrapper');
  const dpr = window.devicePixelRatio || 1;
  const w = wrapper.offsetWidth, h = wrapper.offsetHeight;
  if (gc.width !== w * dpr || gc.height !== h * dpr) {
    gc.width  = w * dpr;
    gc.height = h * dpr;
    gc.style.width  = w + 'px';
    gc.style.height = h + 'px';
  }

  const ctx = gc.getContext('2d');
  ctx.clearRect(0, 0, gc.width, gc.height);
  if (!S.gridState.enabled) return;

  const { ox, oy } = getImgOffset();
  const Z = S.zoomLevel;

  // Schrittweite: gridSize Pixel im Bild → gridSize*Z CSS-Pixel nach CSS-Scale
  // Im Canvas-Buffer: gridSize*Z*dpr Pixel (weil buffer = w*dpr, aber css transform macht Z×)
  // Wir zeichnen so, als wäre S.zoomLevel=1 (in Bild-Koordinaten), der CSS-Scale erledigt den Rest.
  const step = Math.round(S.gridState.size * dpr);
  if (step < 2) return;

  const imgPx = ox * dpr;  // Bild-Startpunkt im Buffer (unabhängig von CSS-Zoom)
  const imgPy = oy * dpr;

  const hex = S.gridState.color;
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  const alpha = S.gridState.opacity / 100;

  // Linienstärke: dpr/Z Canvas-Pixel → nach CSS-Scale(Z): 1 CSS-Pixel visual
  const lw = dpr / Math.max(Z, 1);
  // Sub-Pixel: Alpha hochsetzen damit die Linie sichtbar bleibt
  const alphaFinal = lw < 1 ? Math.min(1, alpha / lw) : alpha;
  ctx.strokeStyle = `rgba(${r},${g},${b},${alphaFinal})`;
  ctx.lineWidth = lw;

  const originPx = ((S.gridState.originX || 0) * dpr + imgPx);
  const originPy = ((S.gridState.originY || 0) * dpr + imgPy);
  const startX = ((originPx % step) + step) % step;
  const startY = ((originPy % step) + step) % step;

  ctx.beginPath();
  for (let x = startX; x <= gc.width + step; x += step) {
    const xc = Math.round(x) + 0.5;
    ctx.moveTo(xc, 0); ctx.lineTo(xc, gc.height);
  }
  for (let y = startY; y <= gc.height + step; y += step) {
    const yc = Math.round(y) + 0.5;
    ctx.moveTo(0, yc); ctx.lineTo(gc.width, yc);
  }
  ctx.stroke();
}

S.canvas.on('after:render', drawGrid);

// ── Skalierungsmodus ─────────────────────────────────────────────────────────
S._aspectLocked = false; // Proportionen immer sperren (Schloss-Button)

export function _applyAspectLock() {
  S.canvas.uniformScaling = S._aspectLocked;
  const icon = S._aspectLocked ? '🔒' : '🔓';
  const propsBtn = document.getElementById('aspectLockBtn');
  if (propsBtn) { propsBtn.textContent = icon; propsBtn.classList.toggle('locked', S._aspectLocked); }
  const cvBtn = document.getElementById('canvasAspectLock');
  if (cvBtn) { cvBtn.textContent = icon; }
}

document.getElementById('aspectLockBtn').addEventListener('click', () => {
  S._aspectLocked = !S._aspectLocked;
  _applyAspectLock();
});

// Canvas-Lock-Button: Position nach jedem Render aktualisieren
function _updateCanvasLockBtn() {
  const btn = document.getElementById('canvasAspectLock');
  if (!btn) return;
  const obj = S.canvas.getActiveObject();
  if (!obj) { btn.style.display = 'none'; return; }
  // getBoundingRect gibt Koordinaten relativ zum Canvas-Element (px).
  // Das Canvas-Element liegt bei (ox,oy) innerhalb von #canvasWrapper.
  // → left/top des Buttons = S.canvas-Offset + Objekt-Koordinaten
  const br  = obj.getBoundingRect(true);
  const { ox, oy } = getImgOffset();
  btn.style.display = 'block';
  btn.style.left = (ox + br.left + br.width)  + 'px';
  btn.style.top  = (oy + br.top  + br.height) + 'px';
}
S.canvas.on('after:render',      _updateCanvasLockBtn);
S.canvas.on('selection:created', _updateCanvasLockBtn);
S.canvas.on('selection:updated', _updateCanvasLockBtn);
S.canvas.on('selection:cleared', () => { const b = document.getElementById('canvasAspectLock'); if (b) b.style.display = 'none'; });

document.getElementById('canvasAspectLock').addEventListener('click', e => {
  e.stopPropagation();
  S._aspectLocked = !S._aspectLocked;
  _applyAspectLock();
});

// ── object:scaling: Constraints + Snap (via scaleX/Y — Fabric-nativ) ─────────
S.canvas.on('object:scaling', e => {
  const obj = e.target;

  if (S._aspectLocked) {
    // Schloss aktiv → immer proportional (über S.canvas.uniformScaling)
    S.canvas.uniformScaling = true;
  } else if (e.e?.shiftKey) {
    // Shift (ohne Schloss) → quadratisch / gleiche Seiten
    S.canvas.uniformScaling = false;
    const side = Math.max(obj.width * obj.scaleX, obj.height * obj.scaleY);
    obj.scaleX = side / obj.width;
    obj.scaleY = side / obj.height;
  } else {
    // Frei
    S.canvas.uniformScaling = false;
  }

  // Raster-Snap
  if (S.gridState.snap && S.gridState.enabled && !S._snapSkipActive && !S.axisLock) {
    const step = S.gridState.size;
    const shiftSq = !S._aspectLocked && e.e?.shiftKey;
    if (shiftSq) {
      const side = Math.max(obj.width * obj.scaleX, obj.height * obj.scaleY);
      const snapped = Math.max(step, Math.round(side / step) * step);
      obj.scaleX = snapped / obj.width;
      obj.scaleY = snapped / obj.height;
    } else {
      const w = Math.max(step, Math.round(obj.width  * obj.scaleX / step) * step);
      const h = Math.max(step, Math.round(obj.height * obj.scaleY / step) * step);
      obj.scaleX = w / obj.width;
      obj.scaleY = h / obj.height;
    }
  }

  // Hilfslinien-Snap
  if (S.guidesSnap && !S._snapSkipActive && !S.axisLock) {
    const SNAP = 8, l = obj.left, t = obj.top;
    const w = obj.width * obj.scaleX, h = obj.height * obj.scaleY;
    for (const y of S.guideLines.h) {
      if (Math.abs(t + h - y) < SNAP) { obj.scaleY = Math.max(0.01, (y - t) / obj.height); break; }
    }
    for (const x of S.guideLines.v) {
      if (Math.abs(l + w - x) < SNAP) { obj.scaleX = Math.max(0.01, (x - l) / obj.width);  break; }
    }
  }

  _refreshCoordFields(obj);
});

// Snap to Grid beim Verschieben + Skalieren
S.canvas.on('object:moving', e => {
  if (!S.gridState.snap || !S.gridState.enabled) return;
  if (S._snapSkipActive || S.axisLock) return;
  const obj = e.target, step = S.gridState.size;
  obj.set({ left: Math.round(obj.left / step) * step, top: Math.round(obj.top / step) * step });
});

// Menü-Events
document.getElementById('gridToggleMenu').addEventListener('click', () => {
  S.gridState.enabled = !S.gridState.enabled;
  saveGridState(); applyGridState();
});
document.getElementById('gridSnapMenu').addEventListener('click', () => {
  S.gridState.snap = !S.gridState.snap;
  saveGridState(); applyGridState();
});
document.getElementById('pcbLiveSnapMenu').addEventListener('click', e => {
  if (e.target.closest('.menu-submenu') || e.target.closest('.sub-arrow')) return;
  S.pcbLiveSnapEnabled = !S.pcbLiveSnapEnabled;
  document.getElementById('pcbLiveSnapCheckmark').textContent = S.pcbLiveSnapEnabled ? '✓' : '';
  _savePcbLiveSettings();
});
document.getElementById('gridSizeInput').addEventListener('input', e => {
  S.gridState.size = Math.max(4, Math.min(200, parseInt(e.target.value)||20));
  saveGridState(); drawGrid();
});
document.getElementById('gridColorInput').addEventListener('input', e => {
  S.gridState.color = e.target.value;
  saveGridState(); drawGrid();
});
document.getElementById('gridOpacityInput').addEventListener('input', e => {
  S.gridState.opacity = parseInt(e.target.value)||25;
  saveGridState(); drawGrid();
});

// Ctrl+' Shortcut
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === "'") {
    e.preventDefault();
    S.gridState.enabled = !S.gridState.enabled;
    saveGridState(); applyGridState();
  }
});

// Submenu offen lassen beim Klick auf Inputs
document.getElementById('gridSettingsSubmenu').addEventListener('click', e => e.stopPropagation());


