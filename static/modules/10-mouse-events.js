// ═══════════════════════════════════════════════════════════════════════════════
// MAUS-EVENTS (Zeichnen)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Text-Cursor-Preview ───────────────────────────────────────────────────
// Zeigt den geplanten Text halbtransparent am Mauszeiger wenn Text-Tool aktiv.

let textPreview = null;

function getTextPreviewContent() {
  return document.getElementById('propTextContent').value.trim() || null;
}

function syncTextPreview(x, y) {
  const content = getTextPreviewContent();
  if (currentTool !== 'text' || !content) { clearTextPreview(); return; }

  if (!textPreview) {
    textPreview = new fabric.Text(content, {
      left: x, top: y,
      fill: getColor(), fontSize: getFontSize(), fontFamily: getFontFamily(),
      opacity: 0.45, selectable: false, evented: false,
    });
    canvas.add(textPreview);
  } else {
    textPreview.set({ left: x, top: y, text: content,
                      fill: getColor(), fontSize: getFontSize(), fontFamily: getFontFamily() });
  }
  canvas.renderAll();
}

function clearTextPreview() {
  if (textPreview) { canvas.remove(textPreview); textPreview = null; canvas.renderAll(); }
}

// Preview aktualisieren wenn Panel-Felder geändert werden
['propTextContent', 'propFontFamily', 'propFontSize'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('input',  () => { if (textPreview) syncTextPreview(textPreview.left, textPreview.top); });
  el.addEventListener('change', () => { if (textPreview) syncTextPreview(textPreview.left, textPreview.top); });
});

// ─────────────────────────────────────────────────────────────────────────────

canvas.on('mouse:move', opt => {
  const p = canvas.getPointer(opt.e);
  document.getElementById('statusCoords').textContent = `x: ${Math.round(p.x)}  y: ${Math.round(p.y)}`;

  if (currentTool === 'text') { syncTextPreview(p.x, p.y); return; }

  // Polyline preview + Winkeleinrasten
  if (currentTool === 'polyline' && _polyPreviewLine && _polyPts.length) {
    const last = _polyPts[_polyPts.length - 1];
    const pt   = e.shiftKey ? _snapAngle(last.x, last.y, p.x, p.y) : { x: p.x, y: p.y };
    _polyPreviewLine.set({ x2: pt.x, y2: pt.y });
    canvas.renderAll();
    return;
  }

  // Schnellmessung: Live-Preview
  if (currentTool === 'measure' && _measurePt1) {
    _measureShow(_measurePt1.x, _measurePt1.y, p.x, p.y, e.clientX, e.clientY);
    return;
  }

  // Callout: Vorschau-Linie aktualisieren
  if (currentTool === 'callout' && _calloutPreviewLine && _calloutAnchor) {
    _calloutPreviewLine.set({ x2: p.x, y2: p.y });
    canvas.renderAll();
    return;
  }

  if (!isPointerDown || !previewObj) return;
  const x1 = startPoint.x, y1 = startPoint.y;
  let x2 = p.x, y2 = p.y;
  if (e.shiftKey && (currentTool === 'line' || currentTool === 'arrow' || currentTool === 'dimension' || currentTool === 'calibrate')) {
    const snapped = _snapAngle(x1, y1, p.x, p.y);
    x2 = snapped.x; y2 = snapped.y;
  }
  if (currentTool === 'line' || currentTool === 'arrow' || currentTool === 'dimension' || currentTool === 'calibrate') {
    previewObj.set({ x2, y2 });
  } else if (currentTool === 'rect') {
    previewObj.set({ left: Math.min(x1,x2), top: Math.min(y1,y2), width: Math.abs(x2-x1), height: Math.abs(y2-y1) });
  } else if (currentTool === 'circle') {
    previewObj.set({ left: Math.min(x1,x2), top: Math.min(y1,y2), rx: Math.abs(x2-x1)/2, ry: Math.abs(y2-y1)/2 });
  }
  canvas.renderAll();
});

canvas.on('mouse:out', () => clearTextPreview());

canvas.on('mouse:dblclick', opt => {
  if (currentTool !== 'polyline') return;
  _polyFinish();
});

canvas.on('mouse:down', opt => {
  if (currentTool === 'select' || canvas.isDrawingMode) return;
  const p = canvas.getPointer(opt.e);

  // Polyline: Punkt hinzufügen
  if (currentTool === 'polyline') {
    if (!_polyLinkId) _polyLinkId = crypto.randomUUID();
    let pt = { x: p.x, y: p.y };
    if (opt.e?.shiftKey && _polyPts.length) {
      const last = _polyPts[_polyPts.length - 1];
      pt = _snapAngle(last.x, last.y, p.x, p.y);
    }
    _polyPts.push(pt);
    if (_polyPts.length >= 2) {
      // letztes Segment als permanente Linie hinzufügen
      const prev = _polyPts[_polyPts.length - 2];
      const cur  = _polyPts[_polyPts.length - 1];
      const seg  = new fabric.Line([prev.x, prev.y, cur.x, cur.y], {
        stroke: getColor(), strokeWidth: getWidth(), strokeUniform: true,
        objectCaching: false, selectable: false, evented: false,
        _polyTmp: true,
      });
      canvas.add(seg);
    }
    // Preview-Linie vom letzten Punkt zur Maus
    _polyCleanPreview();
    const last = _polyPts[_polyPts.length - 1];
    _polyPreviewLine = new fabric.Line([last.x, last.y, last.x, last.y], {
      stroke: getColor(), strokeWidth: getWidth(), strokeDashArray: [5, 5],
      selectable: false, evented: false, objectCaching: false,
    });
    canvas.add(_polyPreviewLine);
    canvas.renderAll();
    return;
  }

  // Schnellmessung: erster Klick
  if (currentTool === 'measure') {
    if (!_measurePt1) {
      _measurePt1 = { x: p.x, y: p.y };
      setStatus('Zweiten Punkt anklicken…');
    } else {
      _measureShow(_measurePt1.x, _measurePt1.y, p.x, p.y, opt.e.clientX, opt.e.clientY);
      setTimeout(() => { _measureOverlay.style.display = 'none'; }, 4000);
      _measurePt1 = null;
    }
    return;
  }

  // Callout: erster Klick = Ankerpunkt
  if (currentTool === 'callout') {
    if (!_calloutAnchor) {
      _calloutAnchor = { x: p.x, y: p.y };
      _calloutPreviewLine = new fabric.Line([p.x, p.y, p.x, p.y], {
        stroke: getColor(), strokeWidth: getWidth(), strokeDashArray: [4, 4],
        selectable: false, evented: false, objectCaching: false,
      });
      canvas.add(_calloutPreviewLine);
      setStatus('Zweiten Punkt für Textposition anklicken…');
    } else {
      _calloutClean();
      const ax = _calloutAnchor.x, ay = _calloutAnchor.y;
      const tx = p.x, ty = p.y;
      const color = getColor(), sw = getWidth();
      const gid   = crypto.randomUUID();
      const line  = new fabric.Line([ax, ay, tx, ty], { stroke: color, strokeWidth: sw, strokeUniform: true, objectCaching: false });
      const text  = new fabric.IText('Label', { left: tx, top: ty - 18, fill: color, fontSize: settings.defaultFontSize || 14, fontFamily: 'Arial' });
      const pad   = 4;
      line.objId  = crypto.randomUUID(); line.linkGroup = gid; line.customName = 'Callout-Linie';
      text.objId  = crypto.randomUUID(); text.linkGroup = gid; text.customName = 'Callout-Text';
      canvas.add(line); canvas.add(text);
      canvas.setActiveObject(text);
      text.enterEditing(); text.selectAll();
      _calloutAnchor = null;
      canvas.requestRenderAll();
      _nextLabel = 'Callout';
      saveHistory();
      refreshLayersList();
    }
    return;
  }

  // Calibrate: wie Linie
  if (currentTool === 'calibrate') {
    isPointerDown = true;
    startPoint    = { x: p.x, y: p.y };
    previewObj = new fabric.Line([p.x, p.y, p.x, p.y], { stroke: '#ffaa00', strokeWidth: 2, selectable: false, evented: false });
    canvas.add(previewObj);
    return;
  }

  isPointerDown = true;
  startPoint    = { x: p.x, y: p.y };

  if (currentTool === 'text') {
    clearTextPreview();
    const content = getTextPreviewContent() || 'Text';
    const t = new fabric.IText(content, {
      left: p.x, top: p.y,
      fill: getColor(), fontSize: getFontSize(), fontFamily: getFontFamily(),
      selectable: true, evented: true,
    });
    canvas.add(t);
    canvas.setActiveObject(t);
    t.enterEditing();
    t.selectAll();
    isPointerDown = false;
    _nextLabel = 'Text';
    saveHistory();
    refreshLayersList();
    return;
  }

  const color = getColor(), strokeWidth = getWidth();
  if (currentTool === 'line' || currentTool === 'arrow' || currentTool === 'dimension') {
    previewObj = new fabric.Line([p.x, p.y, p.x, p.y], { stroke: color, strokeWidth, selectable: false, evented: false });
  } else if (currentTool === 'rect') {
    previewObj = new fabric.Rect({ left: p.x, top: p.y, width: 0, height: 0, fill: 'transparent', stroke: color, strokeWidth, selectable: false, evented: false });
  } else if (currentTool === 'circle') {
    previewObj = new fabric.Ellipse({ left: p.x, top: p.y, rx: 0, ry: 0, fill: 'transparent', stroke: color, strokeWidth, selectable: false, evented: false });
  }
  if (previewObj) canvas.add(previewObj);
});

canvas.on('mouse:up', opt => {
  if (!isPointerDown) return;
  isPointerDown = false;
  const p = canvas.getPointer(opt.e);
  if (previewObj) canvas.remove(previewObj);
  previewObj = null;
  if (!startPoint) return;

  const x1 = startPoint.x, y1 = startPoint.y;
  let   x2 = p.x, y2 = p.y;
  startPoint = null;
  // Winkeleinrasten beim Loslassen
  if (opt.e?.shiftKey && (currentTool === 'line' || currentTool === 'arrow' || currentTool === 'dimension' || currentTool === 'calibrate')) {
    const s = _snapAngle(x1, y1, x2, y2); x2 = s.x; y2 = s.y;
  }
  const color = getColor(), strokeWidth = getWidth();
  if (Math.abs(x2 - x1) < 3 && Math.abs(y2 - y1) < 3) return;

  // Kalibrierungslinie fertig
  if (currentTool === 'calibrate') {
    const dx = x2 - x1, dy = y2 - y1;
    const px = Math.round(Math.sqrt(dx * dx + dy * dy));
    _calPts = { x1, y1, x2, y2 };
    document.getElementById('calibratePx').textContent = px + ' px';
    document.getElementById('calibrateInputRow').style.display = 'block';
    document.getElementById('calibrateOkBtn').style.display    = 'inline-block';
    document.getElementById('calibrateHint').textContent = 'Gib die echte Länge ein:';
    document.getElementById('calibrateMm').focus();
    return;
  }

  const toolLabels = { line: 'Linie', arrow: 'Pfeil', dimension: 'Bemaßung', rect: 'Rechteck', circle: 'Kreis' };
  if      (currentTool === 'line')      canvas.add(new fabric.Line([x1, y1, x2, y2], { stroke: color, strokeWidth, strokeUniform: true, selectable: true, evented: true }));
  else if (currentTool === 'arrow')     addArrow(x1, y1, x2, y2, color, strokeWidth);
  else if (currentTool === 'dimension') addDimension(x1, y1, x2, y2, color, strokeWidth);
  else if (currentTool === 'rect')      canvas.add(new fabric.Rect({ left: Math.min(x1,x2), top: Math.min(y1,y2), width: Math.abs(x2-x1), height: Math.abs(y2-y1), fill: 'transparent', stroke: color, strokeWidth, strokeUniform: true, selectable: true, evented: true }));
  else if (currentTool === 'circle')    canvas.add(new fabric.Ellipse({ left: Math.min(x1,x2), top: Math.min(y1,y2), rx: Math.abs(x2-x1)/2, ry: Math.abs(y2-y1)/2, fill: 'transparent', stroke: color, strokeWidth, strokeUniform: true, selectable: true, evented: true }));

  _nextLabel = toolLabels[currentTool] || 'Objekt';
  saveHistory();
  canvas.renderAll();
  refreshLayersList();
});


