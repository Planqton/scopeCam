// ═══════════════════════════════════════════════════════════════════════════════
// PCB-KANTENANALYSE
// ═══════════════════════════════════════════════════════════════════════════════

import { S } from './00-state.js';
import { getImgOffset } from './22-rulers.js';
import { refreshLayersList } from './13-layers.js';
import { saveHistory } from './14-history.js';
import { setStatus } from './03-status-log.js';
import { _renderStatusKeys } from './17-shortcuts.js';

// ═══════════════════════════════════════════════════════════════════════════════
// HILFSLINIEN (Guide Lines)
// Horizontal aus rulerH ziehen, Vertikal aus rulerV ziehen.
// Gespeichert in Bild-Koordinaten (video S.canvas px).
// ═══════════════════════════════════════════════════════════════════════════════

const GUIDE_KEY = 'scopecam_guides_v1';
S.guideLines    = { h: [], v: [] };
S.guidesVisible = true;
S.guidesSnap    = false;
S.selectedGuide = null; // {axis, idx} — aktuell ausgewählte Hilfslinie
S._guidesCollapsed = true;
export function _saveGuidesCollapsed() { try { localStorage.setItem('scopecam_guides_collapsed', JSON.stringify(S._guidesCollapsed)); } catch(_) {} }
function _loadGuidesCollapsed() { try { S._guidesCollapsed = JSON.parse(localStorage.getItem('scopecam_guides_collapsed')) ?? true; } catch(_) { S._guidesCollapsed = true; } }

export function saveGuides() {
  try { localStorage.setItem(GUIDE_KEY, JSON.stringify({ lines: S.guideLines, visible: S.guidesVisible, snap: S.guidesSnap })); } catch (_) {}
}
function loadGuides() {
  try {
    const s = JSON.parse(localStorage.getItem(GUIDE_KEY));
    if (s) { S.guideLines = s.lines || { h: [], v: [] }; S.guidesVisible = s.visible ?? true; S.guidesSnap = s.snap ?? false; }
  } catch (_) {}
}

// Viewport-Koordinaten → Bild-Koordinaten (S.canvas px)
function clientToCanvas(clientX, clientY) {
  const wrapper = document.getElementById('canvasWrapper');
  const vc      = document.getElementById('videoCanvas');
  const rect    = wrapper.getBoundingClientRect();
  const localX  = (clientX - rect.left) / S.zoomLevel;
  const localY  = (clientY - rect.top)  / S.zoomLevel;
  const { ox, oy } = getImgOffset();
  const scaleX  = vc.offsetWidth  / (vc.width  || 1);
  const scaleY  = vc.offsetHeight / (vc.height || 1);
  return { x: (localX - ox) / scaleX, y: (localY - oy) / scaleY };
}

export function drawGuides(previewAxis, previewPos, highlight) {
  const gc      = document.getElementById('guideCanvas');
  const wrapper = document.getElementById('canvasWrapper');
  const vc      = document.getElementById('videoCanvas');
  const dpr     = window.devicePixelRatio || 1;
  const w = wrapper.offsetWidth, h = wrapper.offsetHeight;
  if (gc.width !== w * dpr || gc.height !== h * dpr) {
    gc.width = w * dpr; gc.height = h * dpr;
    gc.style.width = w + 'px'; gc.style.height = h + 'px';
  }
  const ctx = gc.getContext('2d');
  ctx.clearRect(0, 0, gc.width, gc.height);
  if (!S.guidesVisible && previewAxis == null) return;

  const scaleX = vc.offsetWidth  / (vc.width  || 1);
  const scaleY = vc.offsetHeight / (vc.height || 1);
  const { ox, oy } = getImgOffset();
  const toSX = cx => (cx * scaleX + ox) * dpr;
  const toSY = cy => (cy * scaleY + oy) * dpr;

  ctx.save();
  if (S.guidesVisible) {
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([5 * dpr, 4 * dpr]);
    const drawLine = (axis, i, pos) => {
      const isFlash = highlight && highlight.color && highlight.axis === axis && highlight.idx === i;
      const isSel   = highlight && !highlight.color && highlight.axis === axis && highlight.idx === i;
      ctx.strokeStyle = isFlash ? highlight.color : isSel ? '#f5c542' : '#1bc9e9';
      ctx.lineWidth   = (isFlash || isSel) ? 2 * dpr : 1 * dpr;
      ctx.setLineDash(isSel ? [] : [5 * dpr, 4 * dpr]);
      ctx.beginPath();
      if (axis === 'h') { const sy = toSY(pos); ctx.moveTo(0, sy); ctx.lineTo(gc.width, sy); }
      else              { const sx = toSX(pos); ctx.moveTo(sx, 0); ctx.lineTo(sx, gc.height); }
      ctx.stroke();
    };
    S.guideLines.h.forEach((y, i) => drawLine('h', i, y));
    S.guideLines.v.forEach((x, i) => drawLine('v', i, x));
  }
  if (previewAxis != null && previewPos != null) {
    ctx.strokeStyle = 'rgba(27,201,233,0.55)';
    ctx.lineWidth   = 1 * dpr;
    ctx.setLineDash([6 * dpr, 3 * dpr]);
    ctx.beginPath();
    if (previewAxis === 'h') { const sy = toSY(previewPos); ctx.moveTo(0, sy); ctx.lineTo(gc.width, sy); }
    else                     { const sx = toSX(previewPos); ctx.moveTo(sx, 0); ctx.lineTo(sx, gc.height); }
    ctx.stroke();
  }
  ctx.restore();
}

S.canvas.on('after:render', () => drawGuides(null, null, S.selectedGuide));

export function _flashGuide(axis, idx) {
  let step = 0;
  const colors = ['#ff6b35', '#1bc9e9'];
  const id = setInterval(() => {
    drawGuides(null, null, { axis, idx, color: colors[step % 2] });
    if (++step >= 6) { clearInterval(id); drawGuides(); }
  }, 120);
}

// Snap an Hilfslinien beim Verschieben + Skalieren
S.canvas.on('object:moving', e => {
  if (!S.guidesSnap || S._snapSkipActive || S.axisLock) return;
  const obj = e.target, SNAP = 8;
  const objH = obj.height * (obj.scaleY || 1), objW = obj.width * (obj.scaleX || 1);
  for (const y of S.guideLines.h) {
    if (Math.abs(obj.top - y) < SNAP)        { obj.set('top',  y);        break; }
    if (Math.abs(obj.top + objH - y) < SNAP) { obj.set('top',  y - objH); break; }
  }
  for (const x of S.guideLines.v) {
    if (Math.abs(obj.left - x) < SNAP)        { obj.set('left', x);        break; }
    if (Math.abs(obj.left + objW - x) < SNAP) { obj.set('left', x - objW); break; }
  }
});

export function initGuides() {
  loadGuides();
  _loadGuidesCollapsed();
  drawGuides();

  // Menü
  document.getElementById('guidesVisibleCm').textContent = S.guidesVisible ? '✓' : '';
  document.getElementById('guidesSnapCm').textContent    = S.guidesSnap    ? '✓' : '';

  document.getElementById('guidesVisibleMenu').addEventListener('click', () => {
    S.guidesVisible = !S.guidesVisible;
    document.getElementById('guidesVisibleCm').textContent = S.guidesVisible ? '✓' : '';
    saveGuides(); drawGuides();
  });
  document.getElementById('guidesSnapMenu').addEventListener('click', () => {
    S.guidesSnap = !S.guidesSnap;
    document.getElementById('guidesSnapCm').textContent = S.guidesSnap ? '✓' : '';
    saveGuides();
    _renderStatusKeys();
  });
  document.getElementById('guidesClearMenu').addEventListener('click', () => {
    S.guideLines = { h: [], v: [] }; saveGuides(); drawGuides();
    S._nextLabel = 'Alle Hilfslinien gelöscht'; saveHistory();
  });

  // Aus Lineal ziehen → neue Hilfslinie
  function startRulerDrag(axis, startEvent) {
    if (startEvent.button !== 0) return;
    let previewPos = null;
    const onMove = ev => {
      const pos = clientToCanvas(ev.clientX, ev.clientY);
      previewPos = axis === 'h' ? pos.y : pos.x;
      drawGuides(axis, previewPos);
    };
    const onUp = ev => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const wrapper = document.getElementById('canvasWrapper');
      const r = wrapper.getBoundingClientRect();
      const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (inside && previewPos != null) {
        S.guideLines[axis].push(Math.round(previewPos));
        saveGuides();
        S._nextLabel = `Hilfslinie ${axis === 'h' ? 'horizontal' : 'vertikal'} hinzugefügt`;
        saveHistory();
      }
      drawGuides();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
  document.getElementById('rulerH').addEventListener('mousedown', e => startRulerDrag('h', e));
  document.getElementById('rulerV').addEventListener('mousedown', e => startRulerDrag('v', e));

  // Hilfslinie auf Canvas verschieben / löschen
  const wrapper = document.getElementById('canvasWrapper');
  const HIT = 7;
  let movingGuide = null;

  function findGuide(pos) {
    const vc     = document.getElementById('videoCanvas');
    const scaleX = vc.offsetWidth  / (vc.width  || 1);
    const scaleY = vc.offsetHeight / (vc.height || 1);
    const hitH   = HIT / scaleY / S.zoomLevel;
    const hitV   = HIT / scaleX / S.zoomLevel;
    for (let i = 0; i < S.guideLines.h.length; i++) {
      if (Math.abs(pos.y - S.guideLines.h[i]) < hitH) return { axis: 'h', idx: i };
    }
    for (let i = 0; i < S.guideLines.v.length; i++) {
      if (Math.abs(pos.x - S.guideLines.v[i]) < hitV) return { axis: 'v', idx: i };
    }
    return null;
  }

  function guideSelected(hit) {
    if (!hit || !S.selectedGuide) return false;
    return S.selectedGuide.axis === hit.axis && S.selectedGuide.idx === hit.idx;
  }

  function selectGuide(g) {
    S.selectedGuide = g;
    drawGuides(null, null, g);
    refreshLayersList();
  }

  wrapper.addEventListener('mousemove', e => {
    if (movingGuide || !S.guidesVisible) return;
    const hit = findGuide(clientToCanvas(e.clientX, e.clientY));
    if (!hit) { wrapper.style.cursor = ''; return; }
    wrapper.style.cursor = guideSelected(hit)
      ? (hit.axis === 'h' ? 'ns-resize' : 'ew-resize')
      : 'pointer';
  }, { passive: true });

  wrapper.addEventListener('mouseleave', () => { if (!movingGuide) wrapper.style.cursor = ''; });

  wrapper.addEventListener('mousedown', e => {
    if (e.button !== 0 || !S.guidesVisible) return;
    const hit = findGuide(clientToCanvas(e.clientX, e.clientY));

    if (!hit) {
      // Klick ins Leere → Auswahl aufheben
      if (S.selectedGuide) { selectGuide(null); }
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    if (!guideSelected(hit)) {
      // Erster Klick → nur auswählen, nicht verschieben
      selectGuide(hit);
      return;
    }

    // Zweiter Klick (ausgewählt) → verschieben starten
    movingGuide = hit;
    wrapper.style.cursor = hit.axis === 'h' ? 'ns-resize' : 'ew-resize';

    const onMove = ev => {
      const pos = clientToCanvas(ev.clientX, ev.clientY);
      S.guideLines[hit.axis][hit.idx] = Math.round(hit.axis === 'h' ? pos.y : pos.x);
      drawGuides(null, null, S.selectedGuide);
    };
    const onUp = ev => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const r = wrapper.getBoundingClientRect();
      const outside = ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom;
      if (outside) {
        S.guideLines[hit.axis].splice(hit.idx, 1);
        selectGuide(null);
        S._nextLabel = 'Hilfslinie gelöscht';
      } else {
        S._nextLabel = `Hilfslinie ${hit.axis === 'h' ? 'horizontal' : 'vertikal'} verschoben`;
      }
      saveGuides(); drawGuides(null, null, S.selectedGuide);
      saveHistory();
      movingGuide = null;
      wrapper.style.cursor = '';
      refreshLayersList();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, { capture: true });

  // Entf-Taste löscht ausgewählte Hilfslinie
  document.addEventListener('keydown', e => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.selectedGuide && document.activeElement === document.body) {
      S.guideLines[S.selectedGuide.axis].splice(S.selectedGuide.idx, 1);
      selectGuide(null);
      saveGuides(); drawGuides();
      S._nextLabel = 'Hilfslinie gelöscht';
      saveHistory();
      refreshLayersList();
    }
  });
}


