// ═══════════════════════════════════════════════════════════════════════════════
// WERKZEUGE
// ═══════════════════════════════════════════════════════════════════════════════

const TOOL_NAMES = {
  select: 'Auswahl', hand: 'Verschieben', line: 'Linie', arrow: 'Pfeil',
  dimension: 'Bemaßung', rect: 'Rechteck', circle: 'Kreis', text: 'Text', freehand: 'Freihand',
  polyline: 'Polylinie', calibrate: 'Kalibrierung', measure: 'Schnellmessung', callout: 'Callout',
};

document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool;
    if (currentTool === tool) {
      deactivateTool();
    } else {
      clearTextPreview();
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activateTool(tool);
    }
  });
});

function activateTool(tool) {
  // Measure/Callout zurücksetzen
  if (currentTool === 'measure')  { _measurePt1 = null; _measureOverlay.style.display = 'none'; }
  if (currentTool === 'callout')  { _calloutClean(); _calloutAnchor = null; }
  // Polylinie abbrechen wenn anderes Werkzeug gewählt wird
  if (currentTool === 'polyline' && tool !== 'polyline') {
    _polyCleanPreview();
    if (_polyPts.length >= 2) _polyFinish();
    else {
      canvas.getObjects().filter(o => o._polyTmp).forEach(o => canvas.remove(o));
      _polyPts = []; _polyLinkId = null;
    }
  }
  currentTool          = tool;
  canvas.isDrawingMode = (tool === 'freehand');
  canvas.selection     = (tool === 'select');

  if (tool === 'hand') {
    canvas.defaultCursor = 'grab';
    canvas.forEachObject(o => { o.selectable = false; o.evented = false; });
    document.body.classList.add('tool-hand-active');
  } else {
    canvas.defaultCursor = (tool === 'select') ? 'default' : 'crosshair';
    canvas.forEachObject(o => {
      o.selectable = (tool === 'select') && o.visible && !o.locked;
      o.evented    = (tool === 'select') && o.visible && !o.locked;
    });
    document.body.classList.remove('tool-hand-active');
  }

  if (tool === 'freehand') {
    canvas.freeDrawingBrush.color = getColor();
    canvas.freeDrawingBrush.width = getWidth();
  }

  // Eigenschaften-Sektionen anzeigen
  if (tool === 'hand') {
    clearPropsPanel();
  } else if (tool === 'text') {
    showPropsSection('propsObj',  true);
    showPropsSection('propsText', true);
  } else if (tool !== 'select' && tool !== 'freehand') {
    showPropsSection('propsObj',  true);
    showPropsSection('propsText', false);
  } else if (tool === 'freehand') {
    showPropsSection('propsObj',  false);
    showPropsSection('propsText', false);
  } else if (tool === 'polyline' || tool === 'measure' || tool === 'callout') {
    showPropsSection('propsObj',  true);
    showPropsSection('propsText', false);
  } else if (tool === 'calibrate') {
    showPropsSection('propsObj',  true);
    showPropsSection('propsText', false);
    _openCalibrateModal();
  } else {
    clearPropsPanel();
  }

  document.getElementById('statusTool').textContent = 'Werkzeug: ' + (TOOL_NAMES[tool] || tool);
  _updateMobTools(tool);

  // Eigenschaften-Panel automatisch einblenden (nicht bei Hand-Tool)
  if (tool !== 'hand' && !panelStates['props'].open) {
    panelStates['props'].open = true;
    applyPanel('props');
    savePanelStates();
  }
}

function deactivateTool() {
  // Polyline abbrechen wenn Werkzeug gewechselt wird
  if (currentTool === 'polyline') {
    _polyCleanPreview();
    // Temporäre Segmente entfernen und Polyline fertigstellen
    if (_polyPts.length >= 2) _polyFinish();
    else {
      canvas.getObjects().filter(o => o._polyTmp).forEach(o => canvas.remove(o));
      _polyPts = []; _polyLinkId = null;
    }
  }
  clearTextPreview();
  currentTool          = null;
  canvas.isDrawingMode = false;
  canvas.selection     = false;
  canvas.defaultCursor = 'default';
  canvas.forEachObject(o => { o.selectable = false; o.evented = false; });
  canvas.discardActiveObject();
  canvas.renderAll();
  document.body.classList.remove('tool-hand-active');
  isPanning = false;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('statusTool').textContent = 'Kein Werkzeug';

  // Eigenschaften-Panel automatisch ausblenden
  panelStates['props'].open = false;
  applyPanel('props');
  savePanelStates();
}

function getColor()    { return document.getElementById('colorPicker').value; }
function getWidth()    { return parseInt(document.getElementById('lineWidth').value, 10); }
function getFontSize() { return parseInt(document.getElementById('fontSize').value, 10); }
function getFontFamily() { return document.getElementById('propFontFamily').value || 'monospace'; }

document.getElementById('lineWidth').addEventListener('input', function () {
  if (canvas.isDrawingMode) canvas.freeDrawingBrush.width = getWidth();
});
document.getElementById('colorPicker').addEventListener('input', () => {
  if (canvas.isDrawingMode) canvas.freeDrawingBrush.color = getColor();
});


