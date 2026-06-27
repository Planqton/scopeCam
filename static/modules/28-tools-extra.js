import { S } from './00-state.js';
import { getColor, getWidth, activateTool } from './09-tools.js';
import { saveHistory, CUSTOM_PROPS } from './14-history.js';
import { refreshLayersList, getObjLabel } from './13-layers.js';
import { setStatus } from './03-status-log.js';
import { updatePropsPanel } from './12-props-panel.js';
import { updateScaleStatus } from './21-settings-ui.js';

// ── Copy / Paste / Duplicate ─────────────────────────────────────────────────
S._clipboard = null;

// Weist geklonten Objekten neue objId + remappte linkGroup-UUIDs zu
function _freshIds(cloned) {
  const gidMap = {};
  const fixObj = o => {
    o.objId = crypto.randomUUID();
    if (o.linkGroup) {
      if (!gidMap[o.linkGroup]) gidMap[o.linkGroup] = crypto.randomUUID();
      o.linkGroup = gidMap[o.linkGroup];
    }
  };
  if (typeof cloned.forEachObject === 'function') cloned.forEachObject(fixObj);
  else fixObj(cloned);
}

export function copySelected() {
  const objs = S.canvas.getActiveObjects();
  if (!objs.length) return;
  const active = S.canvas.getActiveObject();
  // fabric v6: clone() returns a Promise; signature is clone(propertiesToInclude) → Promise
  active.clone(CUSTOM_PROPS).then(cloned => {
    S._clipboard = cloned;
    setStatus(`${objs.length} Objekt${objs.length > 1 ? 'e' : ''} kopiert`);
  });
}

export function _addClonedToCanvas(cloned, label, statusMsg) {
  S.canvas.discardActiveObject();
  cloned.set({ left: cloned.left + 20, top: cloned.top + 20 });
  _freshIds(cloned);
  if (typeof cloned.forEachObject === 'function') {
    cloned.canvas = S.canvas;
    cloned.forEachObject(o => S.canvas.add(o));
    cloned.setCoords();
  } else {
    S.canvas.add(cloned);
  }
  S.canvas.setActiveObject(cloned);
  S.canvas.requestRenderAll();
  S._nextLabel = label;
  saveHistory();
  refreshLayersList();
  if (statusMsg) setStatus(statusMsg);
}

export function pasteClipboard() {
  if (!S._clipboard) return;
  // fabric v6: clone() returns a Promise; signature is clone(propertiesToInclude) → Promise
  S._clipboard.clone(CUSTOM_PROPS).then(cloned => _addClonedToCanvas(cloned, 'Einfügen', 'Eingefügt'));
}

export function duplicateSelected() {
  if (!S.canvas.getActiveObjects().length) return;
  // fabric v6: clone() returns a Promise; signature is clone(propertiesToInclude) → Promise
  S.canvas.getActiveObject().clone(CUSTOM_PROPS).then(cloned => _addClonedToCanvas(cloned, 'Dupliziert'));
}

document.getElementById('copyBtn').addEventListener('click', copySelected);
document.getElementById('pasteBtn').addEventListener('click', pasteClipboard);
document.getElementById('duplicateBtn').addEventListener('click', duplicateSelected);

// ── SVG-Export ───────────────────────────────────────────────────────────────
export function exportSVG() {
  const svgData = S.canvas.toSVG();
  const blob = new Blob([svgData], { type: 'image/svg+xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'scopecam-export.svg';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus('SVG exportiert');
}
document.getElementById('exportSvgBtn').addEventListener('click', exportSVG);

// ── Alignment Tools ──────────────────────────────────────────────────────────
export function alignObjects(mode) {
  const objs = S.canvas.getActiveObjects();
  if (objs.length < 2) return;
  // getBoundingRect gibt achsenparallele Box — Delta-Ansatz funktioniert auch für rotierte Objekte:
  // obj.left += (zielBbKante - aktBbKante)
  const bbs = objs.map(o => o.getBoundingRect(true));

  switch (mode) {
    case 'left': {
      const target = Math.min(...bbs.map(b => b.left));
      objs.forEach((o, i) => o.set('left', o.left + (target - bbs[i].left)));
      break;
    }
    case 'right': {
      const target = Math.max(...bbs.map(b => b.left + b.width));
      objs.forEach((o, i) => o.set('left', o.left + (target - (bbs[i].left + bbs[i].width))));
      break;
    }
    case 'top': {
      const target = Math.min(...bbs.map(b => b.top));
      objs.forEach((o, i) => o.set('top', o.top + (target - bbs[i].top)));
      break;
    }
    case 'bottom': {
      const target = Math.max(...bbs.map(b => b.top + b.height));
      objs.forEach((o, i) => o.set('top', o.top + (target - (bbs[i].top + bbs[i].height))));
      break;
    }
    case 'centerH': {
      const target = bbs.reduce((s, b) => s + b.top + b.height / 2, 0) / bbs.length;
      objs.forEach((o, i) => o.set('top', o.top + (target - (bbs[i].top + bbs[i].height / 2))));
      break;
    }
    case 'centerV': {
      const target = bbs.reduce((s, b) => s + b.left + b.width / 2, 0) / bbs.length;
      objs.forEach((o, i) => o.set('left', o.left + (target - (bbs[i].left + bbs[i].width / 2))));
      break;
    }
    case 'distH': {
      const sorted  = [...objs].map((o, i) => ({ o, bb: bbs[i] })).sort((a, b) => a.bb.left - b.bb.left);
      const totalW  = sorted.reduce((s, e) => s + e.bb.width, 0);
      const span    = sorted[sorted.length - 1].bb.left + sorted[sorted.length - 1].bb.width - sorted[0].bb.left;
      const gap     = (span - totalW) / (sorted.length - 1);
      let x         = sorted[0].bb.left;
      sorted.forEach(({ o, bb }) => { o.set('left', o.left + (x - bb.left)); x += bb.width + gap; });
      break;
    }
    case 'distV': {
      const sorted  = [...objs].map((o, i) => ({ o, bb: bbs[i] })).sort((a, b) => a.bb.top - b.bb.top);
      const totalH  = sorted.reduce((s, e) => s + e.bb.height, 0);
      const span    = sorted[sorted.length - 1].bb.top + sorted[sorted.length - 1].bb.height - sorted[0].bb.top;
      const gap     = (span - totalH) / (sorted.length - 1);
      let y         = sorted[0].bb.top;
      sorted.forEach(({ o, bb }) => { o.set('top', o.top + (y - bb.top)); y += bb.height + gap; });
      break;
    }
  }
  objs.forEach(o => o.setCoords());
  S.canvas.requestRenderAll();
  S._nextLabel = 'Ausgerichtet';
  saveHistory();
}

document.querySelectorAll('.align-btn').forEach(btn => {
  btn.addEventListener('click', () => alignObjects(btn.dataset.align));
});

// ── Snap to Object ───────────────────────────────────────────────────────────
S._snapToObjEnabled = true; // kann per Einstellungen deaktiviert werden

export function _getSnapPoints(other) {
  const br = other.getBoundingRect(true);
  const pts = [
    { x: br.left,                    y: br.top                     },
    { x: br.left + br.width,         y: br.top                     },
    { x: br.left,                    y: br.top + br.height         },
    { x: br.left + br.width,         y: br.top + br.height         },
    { x: br.left + br.width / 2,     y: br.top                     },
    { x: br.left + br.width / 2,     y: br.top + br.height         },
    { x: br.left,                    y: br.top + br.height / 2     },
    { x: br.left + br.width,         y: br.top + br.height / 2     },
  ];
  if (other.type === 'line' && typeof other.calcLinePoints === 'function') {
    const lp = other.calcLinePoints();
    pts.push({ x: other.left + lp.x1, y: other.top + lp.y1 });
    pts.push({ x: other.left + lp.x2, y: other.top + lp.y2 });
  }
  return pts;
}

S.canvas.on('object:moving', e => {
  if (!S._snapToObjEnabled || S._snapSkipActive || S.axisLock) return;
  const obj     = e.target;
  const SNAP    = 12;
  const myBr    = obj.getBoundingRect(true);
  const myPtsX  = [myBr.left, myBr.left + myBr.width / 2, myBr.left + myBr.width];
  const myPtsY  = [myBr.top,  myBr.top  + myBr.height / 2, myBr.top  + myBr.height];

  let bestDx = SNAP + 1, bestDy = SNAP + 1;
  let snapDx = 0, snapDy = 0;

  S.canvas.getObjects().forEach(other => {
    if (other === obj || !other.visible) return;
    for (const sp of _getSnapPoints(other)) {
      for (const mx of myPtsX) {
        const dx = Math.abs(sp.x - mx);
        if (dx < bestDx) { bestDx = dx; snapDx = sp.x - mx; }
      }
      for (const my of myPtsY) {
        const dy = Math.abs(sp.y - my);
        if (dy < bestDy) { bestDy = dy; snapDy = sp.y - my; }
      }
    }
  });

  if (bestDx <= SNAP) { obj.set('left', obj.left + snapDx); _showSnapFeedback(obj.left + snapDx, obj.top + (bestDy <= SNAP ? snapDy : 0)); }
  if (bestDy <= SNAP) { obj.set('top',  obj.top  + snapDy); }
});

// ── Polyline-Tool ─────────────────────────────────────────────────────────────
S._polyPts          = [];
S._polyPreviewLine  = null;
S._polyLinkId       = null;

export function _polyCleanPreview() {
  if (S._polyPreviewLine) { S.canvas.remove(S._polyPreviewLine); S._polyPreviewLine = null; }
}

export function _polyFinish() {
  _polyCleanPreview();
  // Temporäre Segmente entfernen
  S.canvas.getObjects().filter(o => o._polyTmp).forEach(o => S.canvas.remove(o));
  if (S._polyPts.length < 2) { S._polyPts = []; S._polyLinkId = null; S.canvas.renderAll(); return; }
  const pts   = S._polyPts;
  const gid   = S._polyLinkId || crypto.randomUUID();
  const color = getColor();
  const sw    = getWidth();
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = new fabric.Line([pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y], {
      stroke: color, strokeWidth: sw, strokeUniform: true, objectCaching: false,
      selectable: true, evented: true,
    });
    seg.objId      = crypto.randomUUID();
    seg.linkGroup  = gid;
    seg.customName = `Poly Seg${i + 1}`;
    S.canvas.add(seg);
  }
  S._polyPts    = [];
  S._polyLinkId = null;
  S.canvas.requestRenderAll();
  S._nextLabel  = 'Polylinie';
  saveHistory();
  refreshLayersList();
}

// Escape beim Polyline-Tool: laufende Linie abbrechen
const _origEscHandler = document.addEventListener; // hook in keydown
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.currentTool === 'polyline') {
    _polyCleanPreview();
    S._polyPts    = [];
    S._polyLinkId = null;
    S.canvas.renderAll();
    // Tool bleibt aktiv (Escape handled by main handler deactivates it; that's fine)
  }
});

// ── Kalibrierungs-Assistent ──────────────────────────────────────────────────
S._calPts = null; // {x1,y1,x2,y2} nach dem Zeichnen

export function _openCalibrateModal() {
  const modal = document.getElementById('calibrateModal');
  modal.style.display = 'flex';
  document.getElementById('calibrateHint').textContent = 'Ziehe eine Linie über eine bekannte Strecke auf dem Canvas.';
  document.getElementById('calibrateInputRow').style.display = 'none';
  document.getElementById('calibrateOkBtn').style.display    = 'none';
  document.getElementById('calibrateMm').value = '';
  S._calPts = null;
}

document.getElementById('calibrateCancelBtn').addEventListener('click', () => {
  document.getElementById('calibrateModal').style.display = 'none';
  if (S.currentTool === 'calibrate') activateTool('select');
});

document.getElementById('calibrateOkBtn').addEventListener('click', () => {
  const mm  = parseFloat(document.getElementById('calibrateMm').value);
  if (!mm || !S._calPts) return;
  const dx  = S._calPts.x2 - S._calPts.x1;
  const dy  = S._calPts.y2 - S._calPts.y1;
  const px  = Math.sqrt(dx * dx + dy * dy);
  S.settings.scale_px_per_mm = px / mm;
  document.getElementById('scalePxMm').value = S.settings.scale_px_per_mm.toFixed(4);
  updateScaleStatus();
  document.getElementById('calibrateModal').style.display = 'none';
  activateTool('select');
  setStatus(`Kalibriert: ${S.settings.scale_px_per_mm.toFixed(2)} px/mm`);
});
