// ═══════════════════════════════════════════════════════════════════════════════
// PCB LIVE-SNAP (Beta)
// ═══════════════════════════════════════════════════════════════════════════════

let pcbLiveSnapEnabled = (() => {
  try { const p = JSON.parse(localStorage.getItem('scopecam_pcblive_v1')); return !!(p?.enabled); } catch(_) { return false; }
})();
document.getElementById('pcbLiveSnapCheckmark').textContent = pcbLiveSnapEnabled ? '✓' : '';

// PCB-Snap-Einstellungen aus localStorage
(function() {
  const s = localStorage.getItem('scopecam_pcblive_v1');
  if (s) {
    try {
      const p = JSON.parse(s);
      if (p.search) PCB_SNAP_SEARCH = p.search;
      if (p.grad)   PCB_SNAP_MIN_GRAD = p.grad;
    } catch(_) {}
  }
})();

function _savePcbLiveSettings() {
  try {
    localStorage.setItem('scopecam_pcblive_v1', JSON.stringify({
      enabled: pcbLiveSnapEnabled, search: PCB_SNAP_SEARCH, grad: PCB_SNAP_MIN_GRAD
    }));
  } catch(_) {}
}

document.getElementById('pcbSnapSearchInput').addEventListener('input', e => {
  PCB_SNAP_SEARCH = parseInt(e.target.value);
  document.getElementById('pcbSnapSearchVal').textContent = PCB_SNAP_SEARCH;
  _savePcbLiveSettings();
});
document.getElementById('pcbSnapGradInput').addEventListener('input', e => {
  PCB_SNAP_MIN_GRAD = parseInt(e.target.value);
  document.getElementById('pcbSnapGradVal').textContent = PCB_SNAP_MIN_GRAD;
  _savePcbLiveSettings();
});
document.getElementById('pcbLiveSnapSubmenu').addEventListener('click', e => e.stopPropagation());

let PCB_SNAP_SEARCH = 20;
let PCB_SNAP_MIN_GRAD = 18;

function _sampleGradient(ctx, axis, pos, start, end) {
  // axis='h': suche stärkste horizontale Kante bei x∈[start,end], scanne y um pos
  // axis='v': suche stärkste vertikale Kante bei y∈[start,end], scanne x um pos
  const r  = PCB_SNAP_SEARCH;
  const vc = document.getElementById('videoCanvas');
  const scX = vc.width  / (vc.offsetWidth  || 1);
  const scY = vc.height / (vc.offsetHeight || 1);

  let sx, sy, sw, sh;
  if (axis === 'h') {
    sx = Math.max(0, Math.round(start  * scX));
    sy = Math.max(0, Math.round((pos - r) * scY));
    sw = Math.min(vc.width,  Math.round((end - start) * scX));
    sh = Math.min(vc.height - sy, Math.round(r * 2 * scY));
  } else {
    sx = Math.max(0, Math.round((pos - r) * scX));
    sy = Math.max(0, Math.round(start  * scY));
    sw = Math.min(vc.width  - sx, Math.round(r * 2 * scX));
    sh = Math.min(vc.height, Math.round((end - start) * scY));
  }
  if (sw < 1 || sh < 1) return null;

  const data = ctx.getImageData(sx, sy, sw, sh).data;

  // Gradient entlang der Suchachse aufsummieren
  let bestVal = PCB_SNAP_MIN_GRAD, bestOff = null;
  if (axis === 'h') {
    for (let row = 1; row < sh - 1; row++) {
      let sum = 0;
      for (let col = 0; col < sw; col++) {
        const i0 = ((row - 1) * sw + col) * 4;
        const i1 = ((row + 1) * sw + col) * 4;
        const g = Math.abs(
          (data[i1] + data[i1+1] + data[i1+2]) / 3 -
          (data[i0] + data[i0+1] + data[i0+2]) / 3
        );
        sum += g;
      }
      const avg = sum / sw;
      if (avg > bestVal) { bestVal = avg; bestOff = row; }
    }
    if (bestOff === null) return null;
    return (pos - r) + bestOff / scY;
  } else {
    for (let col = 1; col < sw - 1; col++) {
      let sum = 0;
      for (let row = 0; row < sh; row++) {
        const i0 = (row * sw + col - 1) * 4;
        const i1 = (row * sw + col + 1) * 4;
        const g = Math.abs(
          (data[i1] + data[i1+1] + data[i1+2]) / 3 -
          (data[i0] + data[i0+1] + data[i0+2]) / 3
        );
        sum += g;
      }
      const avg = sum / sh;
      if (avg > bestVal) { bestVal = avg; bestOff = col; }
    }
    if (bestOff === null) return null;
    return (pos - r) + bestOff / scX;
  }
}

canvas.on('object:moving', e => {
  if (!pcbLiveSnapEnabled || _snapSkipActive || axisLock) return;
  const obj = e.target;
  const vc  = document.getElementById('videoCanvas');
  if (!vc.width) return;

  let ctx;
  try { ctx = vc.getContext('2d'); } catch(_) { return; }

  const l = obj.left, t = obj.top;
  const w = obj.width  * (obj.scaleX || 1);
  const h = obj.height * (obj.scaleY || 1);

  // Suche entlang aller 4 Kanten
  const snapTop    = _sampleGradient(ctx, 'h', t,     l, l + w);
  const snapBottom = _sampleGradient(ctx, 'h', t + h, l, l + w);
  const snapLeft   = _sampleGradient(ctx, 'v', l,     t, t + h);
  const snapRight  = _sampleGradient(ctx, 'v', l + w, t, t + h);

  if (snapTop    !== null) obj.set('top',  snapTop);
  else if (snapBottom !== null) obj.set('top',  snapBottom - h);
  if (snapLeft   !== null) obj.set('left', snapLeft);
  else if (snapRight  !== null) obj.set('left', snapRight - w);
});


