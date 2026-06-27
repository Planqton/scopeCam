import { S } from './00-state.js';
import { getColor, getWidth, getFontSize, getFontFamily, clearTextPreview } from './09-tools.js';
import { saveHistory, CUSTOM_PROPS } from './14-history.js';
import { refreshLayersList } from './13-layers.js';
import { setStatus } from './03-status-log.js';
import { addArrow, addDimension } from './11-draw-helpers.js';
import { updatePropsPanel } from './12-props-panel.js';
import { _snapAngle, _measureShow, _calloutClean } from './29-feature-batch2.js';
import { _polyFinish, _polyCleanPreview } from './28-tools-extra.js';
import { drawGuides } from './24-guides.js';

// ═══════════════════════════════════════════════════════════════════════════════
// MAUS-EVENTS (Zeichnen)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Text-Cursor-Preview ───────────────────────────────────────────────────
// Zeigt den geplanten Text halbtransparent am Mauszeiger wenn Text-Tool aktiv.

function getTextPreviewContent() {
  return document.getElementById('propTextContent').value.trim() || null;
}

function syncTextPreview(x, y) {
  const content = getTextPreviewContent();
  if (S.currentTool !== 'text' || !content) { clearTextPreview(); return; }

  if (!S._textPreview) {
    S._textPreview = new fabric.Text(content, {
      left: x, top: y,
      fill: getColor(), fontSize: getFontSize(), fontFamily: getFontFamily(),
      opacity: 0.45, selectable: false, evented: false,
    });
    S.canvas.add(S._textPreview);
  } else {
    S._textPreview.set({ left: x, top: y, text: content,
                         fill: getColor(), fontSize: getFontSize(), fontFamily: getFontFamily() });
  }
  S.canvas.renderAll();
}

// Preview aktualisieren wenn Panel-Felder geändert werden
['propTextContent', 'propFontFamily', 'propFontSize'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('input',  () => { if (S._textPreview) syncTextPreview(S._textPreview.left, S._textPreview.top); });
  el.addEventListener('change', () => { if (S._textPreview) syncTextPreview(S._textPreview.left, S._textPreview.top); });
});

// ─────────────────────────────────────────────────────────────────────────────

let isPointerDown = false;
let startPoint    = null;
let previewObj    = null;

S.canvas.on('mouse:move', opt => {
  const p = S.canvas.getScenePoint(opt.e);
  document.getElementById('statusCoords').textContent = `x: ${Math.round(p.x)}  y: ${Math.round(p.y)}`;

  if (S.currentTool === 'text') { syncTextPreview(p.x, p.y); return; }

  // Polyline preview + Winkeleinrasten
  if (S.currentTool === 'polyline' && S._polyPreviewLine && S._polyPts.length) {
    const last = S._polyPts[S._polyPts.length - 1];
    const pt   = e.shiftKey ? _snapAngle(last.x, last.y, p.x, p.y) : { x: p.x, y: p.y };
    S._polyPreviewLine.set({ x2: pt.x, y2: pt.y });
    S.canvas.renderAll();
    return;
  }

  // Schnellmessung: Live-Preview
  if (S.currentTool === 'measure' && S._measurePt1) {
    _measureShow(S._measurePt1.x, S._measurePt1.y, p.x, p.y, e.clientX, e.clientY);
    return;
  }

  // Callout: Vorschau-Linie aktualisieren
  if (S.currentTool === 'callout' && S._calloutPreviewLine && S._calloutAnchor) {
    S._calloutPreviewLine.set({ x2: p.x, y2: p.y });
    S.canvas.renderAll();
    return;
  }

  if (!isPointerDown || !previewObj) return;
  const x1 = startPoint.x, y1 = startPoint.y;
  let x2 = p.x, y2 = p.y;
  if (e.shiftKey && (S.currentTool === 'line' || S.currentTool === 'arrow' || S.currentTool === 'dimension' || S.currentTool === 'calibrate')) {
    const snapped = _snapAngle(x1, y1, p.x, p.y);
    x2 = snapped.x; y2 = snapped.y;
  }
  if (S.currentTool === 'line' || S.currentTool === 'arrow' || S.currentTool === 'dimension' || S.currentTool === 'calibrate') {
    previewObj.set({ x2, y2 });
  } else if (S.currentTool === 'rect') {
    previewObj.set({ left: Math.min(x1,x2), top: Math.min(y1,y2), width: Math.abs(x2-x1), height: Math.abs(y2-y1) });
  } else if (S.currentTool === 'circle') {
    previewObj.set({ left: Math.min(x1,x2), top: Math.min(y1,y2), rx: Math.abs(x2-x1)/2, ry: Math.abs(y2-y1)/2 });
  }
  S.canvas.renderAll();
});

S.canvas.on('mouse:out', () => clearTextPreview());

S.canvas.on('mouse:dblclick', opt => {
  if (S.currentTool !== 'polyline') return;
  _polyFinish();
});

S.canvas.on('mouse:down', opt => {
  if (S.currentTool === 'select' || S.canvas.isDrawingMode) return;
  const p = S.canvas.getPointer(opt.e);

  // Polyline: Punkt hinzufügen
  if (S.currentTool === 'polyline') {
    if (!S._polyLinkId) S._polyLinkId = crypto.randomUUID();
    let pt = { x: p.x, y: p.y };
    if (opt.e?.shiftKey && S._polyPts.length) {
      const last = S._polyPts[S._polyPts.length - 1];
      pt = _snapAngle(last.x, last.y, p.x, p.y);
    }
    S._polyPts.push(pt);
    if (S._polyPts.length >= 2) {
      // letztes Segment als permanente Linie hinzufügen
      const prev = S._polyPts[S._polyPts.length - 2];
      const cur  = S._polyPts[S._polyPts.length - 1];
      const seg  = new fabric.Line([prev.x, prev.y, cur.x, cur.y], {
        stroke: getColor(), strokeWidth: getWidth(), strokeUniform: true,
        objectCaching: false, selectable: false, evented: false,
        _polyTmp: true,
      });
      S.canvas.add(seg);
    }
    // Preview-Linie vom letzten Punkt zur Maus
    _polyCleanPreview();
    const last = S._polyPts[S._polyPts.length - 1];
    S._polyPreviewLine = new fabric.Line([last.x, last.y, last.x, last.y], {
      stroke: getColor(), strokeWidth: getWidth(), strokeDashArray: [5, 5],
      selectable: false, evented: false, objectCaching: false,
    });
    S.canvas.add(S._polyPreviewLine);
    S.canvas.renderAll();
    return;
  }

  // Schnellmessung: erster Klick
  if (S.currentTool === 'measure') {
    if (!S._measurePt1) {
      S._measurePt1 = { x: p.x, y: p.y };
      setStatus('Zweiten Punkt anklicken…');
    } else {
      _measureShow(S._measurePt1.x, S._measurePt1.y, p.x, p.y, opt.e.clientX, opt.e.clientY);
      setTimeout(() => { S._measureOverlay.style.display = 'none'; }, 4000);
      S._measurePt1 = null;
    }
    return;
  }

  // Callout: erster Klick = Ankerpunkt
  if (S.currentTool === 'callout') {
    if (!S._calloutAnchor) {
      S._calloutAnchor = { x: p.x, y: p.y };
      S._calloutPreviewLine = new fabric.Line([p.x, p.y, p.x, p.y], {
        stroke: getColor(), strokeWidth: getWidth(), strokeDashArray: [4, 4],
        selectable: false, evented: false, objectCaching: false,
      });
      S.canvas.add(S._calloutPreviewLine);
      setStatus('Zweiten Punkt für Textposition anklicken…');
    } else {
      _calloutClean();
      const ax = S._calloutAnchor.x, ay = S._calloutAnchor.y;
      const tx = p.x, ty = p.y;
      const color = getColor(), sw = getWidth();
      const gid   = crypto.randomUUID();
      const line  = new fabric.Line([ax, ay, tx, ty], { stroke: color, strokeWidth: sw, strokeUniform: true, objectCaching: false });
      const text  = new fabric.IText('Label', { left: tx, top: ty - 18, fill: color, fontSize: S.settings.defaultFontSize || 14, fontFamily: 'Arial' });
      const pad   = 4;
      line.objId  = crypto.randomUUID(); line.linkGroup = gid; line.customName = 'Callout-Linie';
      text.objId  = crypto.randomUUID(); text.linkGroup = gid; text.customName = 'Callout-Text';
      S.canvas.add(line); S.canvas.add(text);
      S.canvas.setActiveObject(text);
      text.enterEditing(); text.selectAll();
      S._calloutAnchor = null;
      S.canvas.requestRenderAll();
      S._nextLabel = 'Callout';
      saveHistory();
      refreshLayersList();
    }
    return;
  }

  // Calibrate: wie Linie
  if (S.currentTool === 'calibrate') {
    isPointerDown = true;
    startPoint    = { x: p.x, y: p.y };
    previewObj = new fabric.Line([p.x, p.y, p.x, p.y], { stroke: '#ffaa00', strokeWidth: 2, selectable: false, evented: false });
    S.canvas.add(previewObj);
    return;
  }

  isPointerDown = true;
  startPoint    = { x: p.x, y: p.y };

  if (S.currentTool === 'text') {
    clearTextPreview();
    const content = getTextPreviewContent() || 'Text';
    const t = new fabric.IText(content, {
      left: p.x, top: p.y,
      fill: getColor(), fontSize: getFontSize(), fontFamily: getFontFamily(),
      selectable: true, evented: true,
    });
    S.canvas.add(t);
    S.canvas.setActiveObject(t);
    t.enterEditing();
    t.selectAll();
    isPointerDown = false;
    S._nextLabel = 'Text';
    saveHistory();
    refreshLayersList();
    return;
  }

  const color = getColor(), strokeWidth = getWidth();
  if (S.currentTool === 'line' || S.currentTool === 'arrow' || S.currentTool === 'dimension') {
    previewObj = new fabric.Line([p.x, p.y, p.x, p.y], { stroke: color, strokeWidth, selectable: false, evented: false });
  } else if (S.currentTool === 'rect') {
    previewObj = new fabric.Rect({ left: p.x, top: p.y, width: 0, height: 0, fill: 'transparent', stroke: color, strokeWidth, selectable: false, evented: false });
  } else if (S.currentTool === 'circle') {
    previewObj = new fabric.Ellipse({ left: p.x, top: p.y, rx: 0, ry: 0, fill: 'transparent', stroke: color, strokeWidth, selectable: false, evented: false });
  }
  if (previewObj) S.canvas.add(previewObj);
});

S.canvas.on('mouse:up', opt => {
  if (!isPointerDown) return;
  isPointerDown = false;
  const p = S.canvas.getPointer(opt.e);
  if (previewObj) S.canvas.remove(previewObj);
  previewObj = null;
  if (!startPoint) return;

  const x1 = startPoint.x, y1 = startPoint.y;
  let   x2 = p.x, y2 = p.y;
  startPoint = null;
  // Winkeleinrasten beim Loslassen
  if (opt.e?.shiftKey && (S.currentTool === 'line' || S.currentTool === 'arrow' || S.currentTool === 'dimension' || S.currentTool === 'calibrate')) {
    const s = _snapAngle(x1, y1, x2, y2); x2 = s.x; y2 = s.y;
  }
  const color = getColor(), strokeWidth = getWidth();
  if (Math.abs(x2 - x1) < 3 && Math.abs(y2 - y1) < 3) return;

  // Kalibrierungslinie fertig
  if (S.currentTool === 'calibrate') {
    const dx = x2 - x1, dy = y2 - y1;
    const px = Math.round(Math.sqrt(dx * dx + dy * dy));
    S._calPts = { x1, y1, x2, y2 };
    document.getElementById('calibratePx').textContent = px + ' px';
    document.getElementById('calibrateInputRow').style.display = 'block';
    document.getElementById('calibrateOkBtn').style.display    = 'inline-block';
    document.getElementById('calibrateHint').textContent = 'Gib die echte Länge ein:';
    document.getElementById('calibrateMm').focus();
    return;
  }

  const toolLabels = { line: 'Linie', arrow: 'Pfeil', dimension: 'Bemaßung', rect: 'Rechteck', circle: 'Kreis' };
  if      (S.currentTool === 'line')      S.canvas.add(new fabric.Line([x1, y1, x2, y2], { stroke: color, strokeWidth, strokeUniform: true, selectable: true, evented: true }));
  else if (S.currentTool === 'arrow')     addArrow(x1, y1, x2, y2, color, strokeWidth);
  else if (S.currentTool === 'dimension') addDimension(x1, y1, x2, y2, color, strokeWidth);
  else if (S.currentTool === 'rect')      S.canvas.add(new fabric.Rect({ left: Math.min(x1,x2), top: Math.min(y1,y2), width: Math.abs(x2-x1), height: Math.abs(y2-y1), fill: 'transparent', stroke: color, strokeWidth, strokeUniform: true, selectable: true, evented: true }));
  else if (S.currentTool === 'circle')    S.canvas.add(new fabric.Ellipse({ left: Math.min(x1,x2), top: Math.min(y1,y2), rx: Math.abs(x2-x1)/2, ry: Math.abs(y2-y1)/2, fill: 'transparent', stroke: color, strokeWidth, strokeUniform: true, selectable: true, evented: true }));

  S._nextLabel = toolLabels[S.currentTool] || 'Objekt';
  saveHistory();
  S.canvas.renderAll();
  refreshLayersList();
});


