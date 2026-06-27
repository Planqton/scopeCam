// ═══════════════════════════════════════════════════════════════════════════════
// LINEALE
// ═══════════════════════════════════════════════════════════════════════════════

import { S } from './00-state.js';

const rulerH   = document.getElementById('rulerH');
const rulerV   = document.getElementById('rulerV');
const RULER_SZ = 22;
const DPR      = () => window.devicePixelRatio || 1;

export function getImgOffset() {
  const wrapper = document.getElementById('canvasWrapper');
  return {
    ox: Math.round((wrapper.offsetWidth  - S.videoCanvas.offsetWidth)  / 2),
    oy: Math.round((wrapper.offsetHeight - S.videoCanvas.offsetHeight) / 2),
  };
}

export function px2label(px, axis) {
  const unit = S.settings.ruler_unit || 'px';
  const ppm  = S.settings.scale_px_per_mm;
  const dim  = axis === 'x' ? S.videoCanvas.offsetWidth : S.videoCanvas.offsetHeight;
  switch (unit) {
    case 'mm':   return ppm ? (px / ppm).toFixed(px / ppm < 10 ? 1 : 0) : String(Math.round(px));
    case 'inch': return ppm ? (px / ppm / 25.4).toFixed(2) : (px / 96).toFixed(2);
    case '%':    return dim  ? Math.round(px / dim * 100) + '%' : String(Math.round(px));
    default:     return String(Math.round(px));
  }
}

export function chooseStep(imgPx, Z = 1) {
  const unit = S.settings.ruler_unit || 'px';
  const ppm  = S.settings.scale_px_per_mm;
  const MIN_SCREEN = 8; // minimum visual screen pixels between ticks
  let candidates, scale;
  if      (unit === 'mm'   && ppm) { candidates = [0.5,1,2,5,10,20,50,100]; scale = ppm; }
  else if (unit === 'inch' && ppm) { candidates = [0.01,0.02,0.05,0.1,0.2,0.25,0.5,1,2]; scale = ppm * 25.4; }
  else if (unit === '%')           { candidates = [0.5,1,2,5,10,25]; scale = imgPx / 100; }
  else                             { candidates = [1,2,5,10,20,25,50,100,200,500]; scale = 1; }
  const minImgPx = MIN_SCREEN / Math.max(Z, 0.01);
  let minor = candidates[candidates.length - 1];
  for (const c of candidates) { if (c * scale >= minImgPx) { minor = c; break; } }
  const major = candidates.includes(minor * 5) ? minor * 5 : minor * 10;
  return { minorPx: minor * scale, majorPx: major * scale };
}

export function getRulerColors() {
  const s = getComputedStyle(document.documentElement);
  const get = v => s.getPropertyValue(v).trim();
  const bg  = get('--clr-ruler-bg') || '#181818';
  const fg  = get('--clr-ruler-fg') || '#666666';
  const acc = get('--clr-accent')   || '#2f80ed';
  return {
    bgOut:   bg,
    bgIn:    bg,
    edge:    fg,
    tickIn:  fg,
    tickOut: fg,
    textIn:  fg,
    textOut: fg,
    cursor:  acc,
  };
}

function drawHRuler(cursorImgX = null) {
  const wrapper = document.getElementById('canvasWrapper');
  const totalW  = wrapper.offsetWidth, imgW = S.videoCanvas.offsetWidth;
  if (!totalW || !imgW) return;
  const { ox } = getImgOffset(), dpr = DPR(), Z = S.zoomLevel;
  const C = getRulerColors();
  rulerH.width  = totalW * dpr; rulerH.height = RULER_SZ * dpr;
  rulerH.style.width = totalW + 'px'; rulerH.style.height = RULER_SZ + 'px';
  const ctx = rulerH.getContext('2d');
  ctx.save(); ctx.scale(dpr, dpr);
  // image pixel → ruler screen x (accounting for zoom + pan)
  const imgToSx = imgX => (ox + imgX - totalW / 2) * Z + totalW / 2 + S.panX;
  ctx.fillStyle = C.bgOut; ctx.fillRect(0, 0, totalW, RULER_SZ);
  const imgLeft = imgToSx(0), imgRight = imgToSx(imgW);
  if (imgRight > 0 && imgLeft < totalW) {
    ctx.fillStyle = C.bgIn;
    ctx.fillRect(Math.max(0, imgLeft), 0, Math.min(totalW, imgRight) - Math.max(0, imgLeft), RULER_SZ);
  }
  ctx.strokeStyle = C.edge; ctx.lineWidth = 1;
  [0, imgW].forEach(ix => {
    const sx = imgToSx(ix);
    if (sx >= 0 && sx <= totalW) { ctx.beginPath(); ctx.moveTo(sx+.5,0); ctx.lineTo(sx+.5,RULER_SZ); ctx.stroke(); }
  });
  const { minorPx, majorPx } = chooseStep(imgW, Z);
  // visible image range
  const imgStart = Math.ceil(((0 - totalW/2 - S.panX) / Z + totalW/2 - ox) / minorPx) * minorPx;
  const imgEnd   = (totalW/2 - S.panX) / Z + totalW/2 - ox;
  ctx.textBaseline = 'top'; ctx.font = '9px monospace';
  for (let imgX = imgStart; imgX <= imgEnd + minorPx; imgX += minorPx) {
    const sx = imgToSx(imgX); if (sx < 0 || sx > totalW) continue;
    const isMajor = Math.abs(Math.round(imgX/minorPx) % Math.round(majorPx/minorPx)) === 0;
    const inside  = imgX >= 0 && imgX <= imgW;
    ctx.strokeStyle = inside ? C.tickIn : C.tickOut;
    ctx.beginPath(); ctx.moveTo(sx+.5,RULER_SZ); ctx.lineTo(sx+.5,RULER_SZ-(isMajor?12:6)); ctx.stroke();
    if (isMajor) { ctx.fillStyle = inside ? C.textIn : C.textOut; ctx.fillText(px2label(imgX,'x'), sx+2, 1); }
  }
  if (cursorImgX !== null) {
    const sx = imgToSx(cursorImgX);
    if (sx >= 0 && sx <= totalW) { ctx.strokeStyle=C.cursor; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(sx+.5,0); ctx.lineTo(sx+.5,RULER_SZ); ctx.stroke(); }
  }
  ctx.restore();
}

function drawVRuler(cursorImgY = null) {
  const wrapper = document.getElementById('canvasWrapper');
  const totalH  = wrapper.offsetHeight, imgH = S.videoCanvas.offsetHeight;
  if (!totalH || !imgH) return;
  const { oy } = getImgOffset(), dpr = DPR(), Z = S.zoomLevel;
  const C = getRulerColors();
  rulerV.width  = RULER_SZ * dpr; rulerV.height = totalH * dpr;
  rulerV.style.width = RULER_SZ + 'px'; rulerV.style.height = totalH + 'px';
  const ctx = rulerV.getContext('2d');
  ctx.save(); ctx.scale(dpr, dpr);
  const imgToSy = imgY => (oy + imgY - totalH / 2) * Z + totalH / 2 + S.panY;
  ctx.fillStyle = C.bgOut; ctx.fillRect(0,0,RULER_SZ,totalH);
  const imgTop = imgToSy(0), imgBot = imgToSy(imgH);
  if (imgBot > 0 && imgTop < totalH) {
    ctx.fillStyle = C.bgIn;
    ctx.fillRect(0, Math.max(0, imgTop), RULER_SZ, Math.min(totalH, imgBot) - Math.max(0, imgTop));
  }
  ctx.strokeStyle = C.edge; ctx.lineWidth = 1;
  [0, imgH].forEach(iy => {
    const sy = imgToSy(iy);
    if (sy>=0 && sy<=totalH) { ctx.beginPath(); ctx.moveTo(0,sy+.5); ctx.lineTo(RULER_SZ,sy+.5); ctx.stroke(); }
  });
  const { minorPx, majorPx } = chooseStep(imgH, Z);
  const imgStart = Math.ceil(((0 - totalH/2 - S.panY) / Z + totalH/2 - oy) / minorPx) * minorPx;
  const imgEnd   = (totalH/2 - S.panY) / Z + totalH/2 - oy;
  ctx.font = '9px monospace'; ctx.textBaseline = 'middle';
  for (let imgY = imgStart; imgY <= imgEnd + minorPx; imgY += minorPx) {
    const sy = imgToSy(imgY); if (sy<0 || sy>totalH) continue;
    const isMajor = Math.abs(Math.round(imgY/minorPx) % Math.round(majorPx/minorPx)) === 0;
    const inside = imgY >= 0 && imgY <= imgH;
    ctx.strokeStyle = inside ? C.tickIn : C.tickOut;
    ctx.beginPath(); ctx.moveTo(RULER_SZ,sy+.5); ctx.lineTo(RULER_SZ-(isMajor?12:6),sy+.5); ctx.stroke();
    if (isMajor) {
      ctx.fillStyle = inside ? C.textIn : C.textOut;
      ctx.save(); ctx.translate(RULER_SZ-13,sy); ctx.rotate(-Math.PI/2); ctx.fillText(px2label(imgY,'y'),0,0); ctx.restore();
    }
  }
  if (cursorImgY !== null) {
    const sy = imgToSy(cursorImgY);
    if (sy>=0 && sy<=totalH) { ctx.strokeStyle=C.cursor; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,sy+.5); ctx.lineTo(RULER_SZ,sy+.5); ctx.stroke(); }
  }
  ctx.restore();
}

export function drawRulers(cx = null, cy = null) { drawHRuler(cx); drawVRuler(cy); }


