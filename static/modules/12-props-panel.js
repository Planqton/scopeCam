import { S } from './00-state.js';
import { saveHistory, CUSTOM_PROPS } from './14-history.js';
import { refreshLayersList } from './13-layers.js';
import { setStatus } from './03-status-log.js';
import { getDimAutoLabel, applyDimLabel } from './11-draw-helpers.js';

// ═══════════════════════════════════════════════════════════════════════════════
// EIGENSCHAFTEN-PANEL
// ═══════════════════════════════════════════════════════════════════════════════

export function showPropsSection(id, show) {
  document.getElementById(id).classList.toggle('props-hidden', !show);
}

export function updatePropsPanel() {
  const objs = S.canvas.getActiveObjects();
  if (objs.length === 0) { clearPropsPanel(); return; }

  showPropsSection('propsDefaults', false);
  showPropsSection('propsObj', true);

  // Für Mehrfachauswahl: Werte des ersten Objekts als Referenz zeigen.
  // Bei ActiveSelection (Link-Gruppe) IText-Objekt bevorzugen für Text-Properties.
  const _rawObj = S.canvas.getActiveObject();
  // fabric v6: ActiveSelection.type getter returns 'activeselection' (all lowercase)
  const obj = (_rawObj?.type === 'activeselection' || _rawObj instanceof fabric.ActiveSelection)
    ? (_rawObj.getObjects().find(o => o instanceof fabric.IText) || _rawObj.getObjects()[0] || _rawObj)
    : _rawObj;
  _refreshCoordFields(obj);
  const stroke = obj.stroke || '#ff0000';
  document.getElementById('propStroke').value           = /^#[0-9a-f]{6}$/i.test(stroke) ? stroke : '#ff0000';
  document.getElementById('propStrokeW').value           = obj.strokeWidth || 2;
  const fillVal = obj.fill && obj.fill !== 'transparent' ? obj.fill : '#000000';
  document.getElementById('propFill').value     = /^#[0-9a-f]{6}$/i.test(fillVal) ? fillVal : '#000000';
  document.getElementById('propFillNone').checked = !obj.fill || obj.fill === 'transparent';

  // Text- und Bemaßungs-Sektion: immer anhand des primären Objekts zeigen
  // (auch bei Multi-Auswahl durch Link-Gruppen-Expansion)
  const isText = obj instanceof fabric.IText || obj?.type === 'i-text' || obj?.type === 'text';
  showPropsSection('propsText', isText);
  if (isText) {
    document.getElementById('propTextContent').value  = obj.text || '';
    document.getElementById('propFontFamily').value   = obj.fontFamily || 'monospace';
    document.getElementById('propFontSize').value     = obj.fontSize   || 16;
    const tc = obj.fill || '#ff0000';
    document.getElementById('propTextColor').value    = /^#[0-9a-f]{6}$/i.test(tc) ? tc : '#ff0000';
    document.getElementById('propBold').classList.toggle('active',        obj.fontWeight  === 'bold');
    document.getElementById('propItalic').classList.toggle('active',      obj.fontStyle   === 'italic');
    document.getElementById('propUnderline').classList.toggle('active',   !!obj.underline);
    document.getElementById('propLinethrough').classList.toggle('active', !!obj.linethrough);
  }

  showPropsSection('propsAlign', objs.length > 1);
  if (objs.length > 1) {
    showPropsSection('propsDim', false);
    return;
  }

  const isDim = !!obj.isDimension;
  showPropsSection('propsDim', isDim);
  if (isDim) {
    const hasOverride = !!obj.dimLabelOverride;
    document.getElementById('propDimOverride').checked = hasOverride;
    showPropsSection('propDimLabelRow', hasOverride);
    document.getElementById('propDimLabel').value = obj.dimLabelOverride || getDimAutoLabel(obj.dimPx || 0);
  }
}

export function clearPropsPanel() {
  showPropsSection('propsDefaults', false);
  showPropsSection('propsObj',      false);
  showPropsSection('propsText',     false);
  showPropsSection('propsDim',      false);
  showPropsSection('propsAlign',    false);
}

// Rahmen
document.getElementById('propStroke').addEventListener('input', () => {
  S.canvas.getActiveObjects().forEach(o => o.set('stroke', document.getElementById('propStroke').value));
  S.canvas.renderAll();
});
document.getElementById('propStroke').addEventListener('change', () => { S._nextLabel = 'Farbe geändert'; saveHistory(); });
document.getElementById('propStrokeW').addEventListener('input', function () {
  S.canvas.getActiveObjects().forEach(o => o.set('strokeWidth', parseInt(this.value, 10)));
  S.canvas.renderAll();
});
document.getElementById('propStrokeW').addEventListener('change', () => { S._nextLabel = 'Strichbreite'; saveHistory(); });

// Bemaßungs-Override
document.getElementById('propDimOverride').addEventListener('change', function () {
  const obj = S.canvas.getActiveObject();
  if (!obj?.isDimension) return;
  if (this.checked) {
    obj.dimLabelOverride = document.getElementById('propDimLabel').value || getDimAutoLabel(obj.dimPx || 0);
  } else {
    obj.dimLabelOverride = null;
    document.getElementById('propDimLabel').value = getDimAutoLabel(obj.dimPx || 0);
  }
  showPropsSection('propDimLabelRow', this.checked);
  applyDimLabel(obj);
  saveHistory();
});
document.getElementById('propDimLabel').addEventListener('input', function () {
  const obj = S.canvas.getActiveObject();
  if (!obj?.isDimension) return;
  obj.dimLabelOverride = this.value;
  applyDimLabel(obj);
});
document.getElementById('propDimLabel').addEventListener('change', () => saveHistory());

// ── Koordinaten-Anzeige (Start/Ende, px oder mm) ────────────────────────────
let _propUnit = localStorage.getItem('scopecam_prop_unit') || 'px';

function _pxToCoord(px) {
  if (_propUnit === 'mm' && S.settings.scale_px_per_mm > 0)
    return Math.round(px / S.settings.scale_px_per_mm * 10) / 10;
  return Math.round(px * 10) / 10;
}
function _coordToPx(v) {
  if (_propUnit === 'mm' && S.settings.scale_px_per_mm > 0)
    return v * S.settings.scale_px_per_mm;
  return v;
}
function _updateCoordUnitLabel() {
  const label = (_propUnit === 'mm' && S.settings.scale_px_per_mm > 0) ? 'mm' : 'px';
  ['propPosUnit','propEndUnit'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
}
export function _refreshCoordFields(obj) {
  if (!obj) return;
  const l = obj.left ?? 0, t = obj.top ?? 0;
  const w = obj.getScaledWidth?.() ?? obj.width * (obj.scaleX ?? 1);
  const h = obj.getScaledHeight?.() ?? obj.height * (obj.scaleY ?? 1);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = _pxToCoord(v); };
  set('propLeft', l);
  set('propTop',  t);
  set('propEndX', l + w);
  set('propEndY', t + h);
  _updateCoordUnitLabel();
}

// Klick auf Einheiten-Label → px/mm umschalten
['propPosUnit','propEndUnit'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', () => {
    if (!(S.settings.scale_px_per_mm > 0)) return; // kein mm ohne Kalibrierung
    _propUnit = _propUnit === 'px' ? 'mm' : 'px';
    localStorage.setItem('scopecam_prop_unit', _propUnit);
    const obj = S.canvas.getActiveObject();
    if (obj) _refreshCoordFields(obj);
  });
});

// Start-Position bearbeiten
['propLeft', 'propTop'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    const objs = S.canvas.getActiveObjects();
    if (!objs.length) return;
    const v = _coordToPx(parseFloat(document.getElementById(id).value) || 0);
    const prop = id === 'propLeft' ? 'left' : 'top';
    objs.forEach(o => { o.set(prop, v); o.setCoords(); });
    S.canvas.renderAll();
    S._nextLabel = 'Verschoben';
    saveHistory();
  });
});

// Ende-Position bearbeiten → ändert Größe (width/height), kein scaleX/scaleY
['propEndX', 'propEndY'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    const obj = S.canvas.getActiveObject();
    if (!obj) return;
    const v = _coordToPx(parseFloat(document.getElementById(id).value) || 0);
    if (id === 'propEndX') {
      const newW = Math.max(1, v - (obj.left ?? 0));
      obj.set({ width: newW / (obj.scaleX ?? 1) });
    } else {
      const newH = Math.max(1, v - (obj.top ?? 0));
      obj.set({ height: newH / (obj.scaleY ?? 1) });
    }
    obj.setCoords();
    S.canvas.renderAll();
    S._nextLabel = 'Größe geändert';
    saveHistory();
  });
});

// Füllung
document.getElementById('propFill').addEventListener('input', () => {
  if (document.getElementById('propFillNone').checked) return;
  S.canvas.getActiveObjects().forEach(o => o.set('fill', document.getElementById('propFill').value));
  S.canvas.renderAll();
});
document.getElementById('propFill').addEventListener('change', () => { S._nextLabel = 'Füllung geändert'; saveHistory(); });
document.getElementById('propFillNone').addEventListener('change', function () {
  S.canvas.getActiveObjects().forEach(o => o.set('fill', this.checked ? 'transparent' : document.getElementById('propFill').value));
  S.canvas.renderAll();
  S._nextLabel = this.checked ? 'Füllung: transparent' : 'Füllung gesetzt';
  saveHistory();
});

// Text-Inhalt
function _getActiveText() {
  const raw = S.canvas.getActiveObject();
  if (!raw) return null;
  if (raw.type === 'i-text' || raw.type === 'text') return raw;
  if (raw.type === 'activeSelection') return raw.getObjects().find(o => o.type === 'i-text' || o.type === 'text') || null;
  return null;
}

document.getElementById('propTextContent').addEventListener('input', function () {
  const obj = _getActiveText();
  if (obj) { obj.set('text', this.value); S.canvas.renderAll(); }
});
document.getElementById('propTextContent').addEventListener('change', function () {
  const obj = _getActiveText();
  if (obj) { S._nextLabel = 'Text bearbeitet'; saveHistory(); }
});
// Schriftart
document.getElementById('propFontFamily').addEventListener('change', function () {
  const obj = _getActiveText();
  if (obj) { obj.set('fontFamily', this.value); S.canvas.renderAll(); S._nextLabel = 'Schriftart'; saveHistory(); }
});
// Schriftgröße
document.getElementById('propFontSize').addEventListener('input', function () {
  const obj = _getActiveText();
  if (obj) { obj.set('fontSize', parseInt(this.value, 10) || 16); S.canvas.renderAll(); }
});
document.getElementById('propFontSize').addEventListener('change', () => { S._nextLabel = 'Schriftgröße'; saveHistory(); });
// Textfarbe
document.getElementById('propTextColor').addEventListener('input', function () {
  const obj = _getActiveText();
  if (obj) { obj.set('fill', this.value); S.canvas.renderAll(); }
});
document.getElementById('propTextColor').addEventListener('change', () => { S._nextLabel = 'Textfarbe'; saveHistory(); });

// Formatierungs-Buttons
function makeFormatToggle(btnId, prop, onVal, offVal) {
  document.getElementById(btnId).addEventListener('click', () => {
    const obj = _getActiveText();
    if (!obj) return;
    const isOn = obj[prop] === onVal;
    obj.set(prop, isOn ? offVal : onVal);
    document.getElementById(btnId).classList.toggle('active', !isOn);
    S.canvas.renderAll();
    saveHistory();
  });
}
makeFormatToggle('propBold',        'fontWeight',  'bold',   'normal');
makeFormatToggle('propItalic',      'fontStyle',   'italic', 'normal');
makeFormatToggle('propUnderline',   'underline',   true,     false);
makeFormatToggle('propLinethrough', 'linethrough', true,     false);

// ── Verknüpfungs-Logik ──────────────────────────────────────────────────────
S._suppressLinkExpand = false;

export function getLinkGroupMembers(id) {
  return S.canvas.getObjects().filter(o => o.linkGroup === id);
}

function expandToLinkGroup(e) {
  if (S._suppressLinkExpand) return;
  const selected = S.canvas.getActiveObjects();
  if (!selected.length) return;

  const extraIds = new Set();
  selected.forEach(o => { if (o.linkGroup) extraIds.add(o.linkGroup); });
  if (!extraIds.size) return;

  const expanded = new Set(selected);
  extraIds.forEach(id => getLinkGroupMembers(id).forEach(o => expanded.add(o)));
  if (expanded.size === selected.length) return;

  S._suppressLinkExpand = true;
  const sel = new fabric.ActiveSelection([...expanded], { canvas: S.canvas });
  S.canvas.setActiveObject(sel);
  S.canvas.requestRenderAll();
  S._suppressLinkExpand = false;
}

export function linkSelectedObjects() {
  const objs = S.canvas.getActiveObjects().filter(o => !o.locked);
  if (objs.length < 2) return;
  const id = crypto.randomUUID();
  objs.forEach(o => { o.linkGroup = id; });
  S._nextLabel = `${objs.length} Objekte verknüpft`;
  saveHistory();
  refreshLayersList();
}

export function unlinkObjects(objs) {
  objs.forEach(o => { o.linkGroup = null; });
  S._nextLabel = 'Verknüpfung aufgehoben';
  saveHistory();
  refreshLayersList();
}

// ── Verbindungslinien für verknüpfte Objekte ──────────────────────────────
S.canvas.on('after:render', () => {
  const objs = S.canvas.getObjects();
  const groups = {};
  objs.forEach(o => {
    if (!o.linkGroup || o.objVisible === false) return;
    (groups[o.linkGroup] = groups[o.linkGroup] || []).push(o);
  });
  if (!Object.keys(groups).length) return;

  const ctx = S.canvas.getContext();
  const vt  = S.canvas.viewportTransform;  // [scaleX,0,0,scaleY,tx,ty]
  const z   = vt[0];                     // zoom level
  const active = new Set(S.canvas.getActiveObjects());

  ctx.save();
  ctx.transform(vt[0], vt[1], vt[2], vt[3], vt[4], vt[5]);

  Object.values(groups).forEach(members => {
    if (members.length < 2) return;
    const isSelected = members.some(o => active.has(o));
    const alpha = isSelected ? 0.9 : 0.35;
    ctx.strokeStyle = `rgba(47,128,237,${alpha})`;
    ctx.fillStyle   = `rgba(47,128,237,${alpha})`;
    ctx.lineWidth   = 1.5 / z;
    ctx.setLineDash([5 / z, 4 / z]);

    const centers = members.map(o => {
      const c = o.getCenterPoint();
      return { x: c.x, y: c.y };
    });

    // Alle Paare verbinden (Mesh)
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        ctx.beginPath();
        ctx.moveTo(centers[i].x, centers[i].y);
        ctx.lineTo(centers[j].x, centers[j].y);
        ctx.stroke();
      }
    }

    // Kleiner Kreis in Mitte jedes Objekts
    ctx.setLineDash([]);
    const r = 4 / z;
    centers.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  ctx.restore();
});

S.canvas.on('selection:created', e => { expandToLinkGroup(e); updatePropsPanel(); refreshLayersList(); });
S.canvas.on('selection:updated', e => { expandToLinkGroup(e); updatePropsPanel(); refreshLayersList(); });
S.canvas.on('selection:cleared', () => { clearPropsPanel();  refreshLayersList(); });
S.canvas.on('object:moving', () => {
  const obj = S.canvas.getActiveObject();
  if (obj) _refreshCoordFields(obj);
});
// (object:scaling-Handler ist weiter unten als vereinheitlichter Handler)
S.canvas.on('object:modified', e => {
  // uniformScaling nach Skalierung zurücksetzen (Shift-Quadrat nur während Drag)
  S.canvas.uniformScaling = S._aspectLocked;
  const obj = e.target;
  if (!S._nextLabel) {
    const name = obj?.customName || obj?.type || '';
    const prefix = name ? `${name}: ` : '';
    const actionMap = { drag:'Verschoben', scale:'Skaliert', scaleX:'Skaliert X', scaleY:'Skaliert Y', rotate:'Rotiert', skewX:'Verzerrt', skewY:'Verzerrt', resize:'Größe' };
    S._nextLabel = prefix + (actionMap[e.action] || 'Bearbeitet');
  }
  saveHistory();
  updatePropsPanel();
});


