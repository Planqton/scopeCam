import { S } from './00-state.js';
import { getColor, getWidth } from './09-tools.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ZEICHEN-HELPER (Pfeil, Bemaßung)
// ═══════════════════════════════════════════════════════════════════════════════

export function addArrow(x1, y1, x2, y2, color, strokeWidth) {
  const angle   = Math.atan2(y2 - y1, x2 - x1);
  const headLen = Math.max(12, strokeWidth * 4);
  const line    = new fabric.Line([x1, y1, x2, y2], { stroke: color, strokeWidth });
  const head    = new fabric.Triangle({
    left: x2, top: y2, width: headLen, height: headLen * 1.5,
    fill: color, angle: (angle * 180 / Math.PI) + 90,
    originX: 'center', originY: 'center',
  });
  const grp = new fabric.Group([line, head], { selectable: true, evented: true });
  S.canvas.add(grp);
  return grp;
}

export function getDimAutoLabel(px) {
  return S.settings.scale_px_per_mm
    ? (px / S.settings.scale_px_per_mm).toFixed(2) + ' mm'
    : Math.round(px) + ' px';
}

export function applyDimLabel(obj) {
  const label = obj.dimLabelOverride || getDimAutoLabel(obj.dimPx || 0);
  const textObj = obj._objects?.find(o => o.type === 'text');
  if (textObj) { textObj.set('text', label); obj.dirty = true; S.canvas.renderAll(); }
}

export function addDimension(x1, y1, x2, y2, color, strokeWidth) {
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const tickLen = 10;
  const px = -Math.sin(angle) * tickLen, py = Math.cos(angle) * tickLen;

  const mainLine = new fabric.Line([x1, y1, x2, y2], { stroke: color, strokeWidth });
  const tick1    = new fabric.Line([x1-px, y1-py, x1+px, y1+py], { stroke: color, strokeWidth });
  const tick2    = new fabric.Line([x2-px, y2-py, x2+px, y2+py], { stroke: color, strokeWidth });
  const label    = getDimAutoLabel(dist);
  const midText  = new fabric.Text(label, {
    left: (x1+x2)/2, top: (y1+y2)/2 - getFontSize() - 4,
    fill: color, fontSize: getFontSize(), fontFamily: 'monospace',
    originX: 'center', backgroundColor: 'rgba(0,0,0,0.55)', padding: 3,
  });
  const grp = new fabric.Group([mainLine, tick1, tick2, midText], { selectable: true, evented: true });
  grp.isDimension = true;
  grp.dimPx = dist;
  grp.dimLabelOverride = null;
  S.canvas.add(grp);
  return grp;
}


