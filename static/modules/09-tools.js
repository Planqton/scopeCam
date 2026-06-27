import { S } from './00-state.js';
import { clearPropsPanel, showPropsSection } from './12-props-panel.js';
import { savePanelStates } from './02-panels.js';
import { _updateMobTools } from './33-mobile.js';
import { _openCalibrateModal, _polyCleanPreview, _polyFinish } from './28-tools-extra.js';
import { setStatus } from './03-status-log.js';

// Text-Preview-Helper (hier definiert, da 10-mouse-events ↔ 09-tools zirkulär wäre)
export function clearTextPreview() {
  if (S._textPreview) { S.canvas.remove(S._textPreview); S._textPreview = null; S.canvas.renderAll(); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WERKZEUGE
// ═══════════════════════════════════════════════════════════════════════════════

export const TOOL_NAMES = {
  select: 'Auswahl', hand: 'Verschieben', line: 'Linie', arrow: 'Pfeil',
  dimension: 'Bemaßung', rect: 'Rechteck', circle: 'Kreis', text: 'Text', freehand: 'Freihand',
  polyline: 'Polylinie', calibrate: 'Kalibrierung', measure: 'Schnellmessung', callout: 'Callout',
};

document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool;
    if (S.currentTool === tool) {
      deactivateTool();
    } else {
      clearTextPreview();
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activateTool(tool);
    }
  });
});

export function activateTool(tool) {
  // Measure/Callout zurücksetzen
  if (S.currentTool === 'measure')  { S._measurePt1 = null; S._measureOverlay.style.display = 'none'; }
  if (S.currentTool === 'callout')  { _calloutClean(); S._calloutAnchor = null; }
  // Polylinie abbrechen wenn anderes Werkzeug gewählt wird
  if (S.currentTool === 'polyline' && tool !== 'polyline') {
    _polyCleanPreview();
    if (S._polyPts.length >= 2) _polyFinish();
    else {
      S.canvas.getObjects().filter(o => o._polyTmp).forEach(o => S.canvas.remove(o));
      S._polyPts = []; S._polyLinkId = null;
    }
  }
  S.currentTool          = tool;
  S.canvas.isDrawingMode = (tool === 'freehand');
  S.canvas.selection     = (tool === 'select');

  if (tool === 'hand') {
    S.canvas.defaultCursor = 'grab';
    S.canvas.forEachObject(o => { o.selectable = false; o.evented = false; });
    document.body.classList.add('tool-hand-active');
  } else {
    S.canvas.defaultCursor = (tool === 'select') ? 'default' : 'crosshair';
    S.canvas.forEachObject(o => {
      o.selectable = (tool === 'select') && o.visible && !o.locked;
      o.evented    = (tool === 'select') && o.visible && !o.locked;
    });
    document.body.classList.remove('tool-hand-active');
  }

  if (tool === 'freehand') {
    S.canvas.freeDrawingBrush.color = getColor();
    S.canvas.freeDrawingBrush.width = getWidth();
  }

  // Eigenschaften-Sektionen anzeigen
  const isDrawTool = tool !== 'select' && tool !== 'hand';
  if (tool === 'hand') {
    clearPropsPanel();
  } else if (tool === 'select') {
    clearPropsPanel(); // propsDefaults bleibt verborgen bis Objekt ausgewählt
  } else if (tool === 'text') {
    showPropsSection('propsDefaults', true);
    showPropsSection('propsObj',  false);
    showPropsSection('propsText', false);
  } else if (tool === 'freehand') {
    showPropsSection('propsDefaults', true);
    showPropsSection('propsObj',  false);
    showPropsSection('propsText', false);
  } else if (tool === 'calibrate') {
    showPropsSection('propsDefaults', true);
    showPropsSection('propsObj',  false);
    showPropsSection('propsText', false);
    _openCalibrateModal();
  } else {
    // Alle anderen Zeichenwerkzeuge (line, arrow, dimension, rect, circle, polyline, measure, callout)
    showPropsSection('propsDefaults', true);
    showPropsSection('propsObj',  false);
    showPropsSection('propsText', false);
  }

  document.getElementById('statusTool').textContent = 'Werkzeug: ' + (TOOL_NAMES[tool] || tool);
  _updateMobTools(tool);

  // Eigenschaften-Panel automatisch einblenden (nicht bei Hand-Tool)
  if (tool !== 'hand' && !S.panelStates['props'].open) {
    S.panelStates['props'].open = true;
    S.applyPanel('props');
    savePanelStates();
  }
}

export function deactivateTool() {
  // Polyline abbrechen wenn Werkzeug gewechselt wird
  if (S.currentTool === 'polyline') {
    _polyCleanPreview();
    // Temporäre Segmente entfernen und Polyline fertigstellen
    if (S._polyPts.length >= 2) _polyFinish();
    else {
      S.canvas.getObjects().filter(o => o._polyTmp).forEach(o => S.canvas.remove(o));
      S._polyPts = []; S._polyLinkId = null;
    }
  }
  clearTextPreview();
  S.currentTool          = null;
  S.canvas.isDrawingMode = false;
  S.canvas.selection     = false;
  S.canvas.defaultCursor = 'default';
  S.canvas.forEachObject(o => { o.selectable = false; o.evented = false; });
  S.canvas.discardActiveObject();
  S.canvas.renderAll();
  document.body.classList.remove('tool-hand-active');
  S.isPanning = false;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('statusTool').textContent = 'Kein Werkzeug';

  // Eigenschaften-Panel automatisch ausblenden
  S.panelStates['props'].open = false;
  S.applyPanel('props');
  savePanelStates();
}

export function getColor()    { return document.getElementById('colorPicker').value; }
export function getWidth()    { return parseInt(document.getElementById('lineWidth').value, 10); }
export function getFontSize() { return parseInt(document.getElementById('fontSize').value, 10); }
export function getFontFamily() { return document.getElementById('propFontFamily').value || 'monospace'; }

document.getElementById('lineWidth').addEventListener('input', function () {
  if (S.canvas.isDrawingMode) S.canvas.freeDrawingBrush.width = getWidth();
});
document.getElementById('colorPicker').addEventListener('input', () => {
  if (S.canvas.isDrawingMode) S.canvas.freeDrawingBrush.color = getColor();
});


