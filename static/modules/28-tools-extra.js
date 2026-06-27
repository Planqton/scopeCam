// ── Copy / Paste / Duplicate ─────────────────────────────────────────────────
let _clipboard = null;

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

function copySelected() {
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;
  const active = canvas.getActiveObject();
  active.clone(cloned => {
    _clipboard = cloned;
    setStatus(`${objs.length} Objekt${objs.length > 1 ? 'e' : ''} kopiert`);
  }, CUSTOM_PROPS);
}

function _addClonedToCanvas(cloned, label, statusMsg) {
  canvas.discardActiveObject();
  cloned.set({ left: cloned.left + 20, top: cloned.top + 20 });
  _freshIds(cloned);
  if (typeof cloned.forEachObject === 'function') {
    cloned.canvas = canvas;
    cloned.forEachObject(o => canvas.add(o));
    cloned.setCoords();
  } else {
    canvas.add(cloned);
  }
  canvas.setActiveObject(cloned);
  canvas.requestRenderAll();
  _nextLabel = label;
  saveHistory();
  refreshLayersList();
  if (statusMsg) setStatus(statusMsg);
}

function pasteClipboard() {
  if (!_clipboard) return;
  _clipboard.clone(cloned => _addClonedToCanvas(cloned, 'Einfügen', 'Eingefügt'), CUSTOM_PROPS);
}

function duplicateSelected() {
  if (!canvas.getActiveObjects().length) return;
  canvas.getActiveObject().clone(cloned => _addClonedToCanvas(cloned, 'Dupliziert'), CUSTOM_PROPS);
}

document.getElementById('copyBtn').addEventListener('click', copySelected);
document.getElementById('pasteBtn').addEventListener('click', pasteClipboard);
document.getElementById('duplicateBtn').addEventListener('click', duplicateSelected);

// ── SVG-Export ───────────────────────────────────────────────────────────────
function exportSVG() {
  const svgData = canvas.toSVG();
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
function alignObjects(mode) {
  const objs = canvas.getActiveObjects();
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
  canvas.requestRenderAll();
  _nextLabel = 'Ausgerichtet';
  saveHistory();
}

document.querySelectorAll('.align-btn').forEach(btn => {
  btn.addEventListener('click', () => alignObjects(btn.dataset.align));
});

// ── Snap to Object ───────────────────────────────────────────────────────────
let _snapToObjEnabled = true; // kann per Einstellungen deaktiviert werden

function _getSnapPoints(other) {
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

canvas.on('object:moving', e => {
  if (!_snapToObjEnabled || _snapSkipActive || axisLock) return;
  const obj     = e.target;
  const SNAP    = 12;
  const myBr    = obj.getBoundingRect(true);
  const myPtsX  = [myBr.left, myBr.left + myBr.width / 2, myBr.left + myBr.width];
  const myPtsY  = [myBr.top,  myBr.top  + myBr.height / 2, myBr.top  + myBr.height];

  let bestDx = SNAP + 1, bestDy = SNAP + 1;
  let snapDx = 0, snapDy = 0;

  canvas.getObjects().forEach(other => {
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
let _polyPts          = [];
let _polyPreviewLine  = null;
let _polyLinkId       = null;

function _polyCleanPreview() {
  if (_polyPreviewLine) { canvas.remove(_polyPreviewLine); _polyPreviewLine = null; }
}

function _polyFinish() {
  _polyCleanPreview();
  // Temporäre Segmente entfernen
  canvas.getObjects().filter(o => o._polyTmp).forEach(o => canvas.remove(o));
  if (_polyPts.length < 2) { _polyPts = []; _polyLinkId = null; canvas.renderAll(); return; }
  const pts   = _polyPts;
  const gid   = _polyLinkId || crypto.randomUUID();
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
    canvas.add(seg);
  }
  _polyPts    = [];
  _polyLinkId = null;
  canvas.requestRenderAll();
  _nextLabel  = 'Polylinie';
  saveHistory();
  refreshLayersList();
}

// Escape beim Polyline-Tool: laufende Linie abbrechen
const _origEscHandler = document.addEventListener; // hook in keydown
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && currentTool === 'polyline') {
    _polyCleanPreview();
    _polyPts    = [];
    _polyLinkId = null;
    canvas.renderAll();
    // Tool bleibt aktiv (Escape handled by main handler deactivates it; that's fine)
  }
});

// ── Kalibrierungs-Assistent ──────────────────────────────────────────────────
let _calPts = null; // {x1,y1,x2,y2} nach dem Zeichnen

function _openCalibrateModal() {
  const modal = document.getElementById('calibrateModal');
  modal.style.display = 'flex';
  document.getElementById('calibrateHint').textContent = 'Ziehe eine Linie über eine bekannte Strecke auf dem Canvas.';
  document.getElementById('calibrateInputRow').style.display = 'none';
  document.getElementById('calibrateOkBtn').style.display    = 'none';
  document.getElementById('calibrateMm').value = '';
  _calPts = null;
}

document.getElementById('calibrateCancelBtn').addEventListener('click', () => {
  document.getElementById('calibrateModal').style.display = 'none';
  if (currentTool === 'calibrate') activateTool('select');
});

document.getElementById('calibrateOkBtn').addEventListener('click', () => {
  const mm  = parseFloat(document.getElementById('calibrateMm').value);
  if (!mm || !_calPts) return;
  const dx  = _calPts.x2 - _calPts.x1;
  const dy  = _calPts.y2 - _calPts.y1;
  const px  = Math.sqrt(dx * dx + dy * dy);
  settings.scale_px_per_mm = px / mm;
  document.getElementById('scalePxMm').value = settings.scale_px_per_mm.toFixed(4);
  applySettings();
  document.getElementById('calibrateModal').style.display = 'none';
  activateTool('select');
  setStatus(`Kalibriert: ${settings.scale_px_per_mm.toFixed(2)} px/mm`);
});
