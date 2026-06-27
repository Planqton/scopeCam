import { S } from './00-state.js';
import { drawGrid } from './23-grid.js';
import { drawGuides } from './24-guides.js';
import { drawRulers } from './22-rulers.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// ZOOM + PAN
// Zoom: CSS scale auf #canvasWrapper via Ctrl+Scroll oder Buttons.
// Pan: translate-Offset (S.panX/Y) via Hand-Werkzeug oder Leertaste.
// Beides wird im localStorage persistiert.
// ═══════════════════════════════════════════════════════════════════════════════

const VIEW_KEY  = 'scopecam_view_v1';
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8.0;
S.zoomLevel   = 1.0;
S.panX        = 0, S.panY = 0;
S.isPanning   = false;
let panStartX   = 0, panStartY = 0, panStartPX = 0, panStartPY = 0;
let spaceHeld   = false, prevSpaceTool = null;

function saveViewState() {
  try { localStorage.setItem(VIEW_KEY, JSON.stringify({ z: S.zoomLevel, x: S.panX, y: S.panY })); } catch (_) {}
}

export function loadViewState() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY));
    if (v) { S.zoomLevel = v.z ?? 1; S.panX = v.x ?? 0; S.panY = v.y ?? 0; }
  } catch (_) {}
}

export function applyTransform() {
  const w = document.getElementById('canvasWrapper');
  if (S.zoomLevel === 1 && S.panX === 0 && S.panY === 0) {
    w.style.transform = '';
  } else if (S.panX === 0 && S.panY === 0) {
    w.style.transform = `scale(${S.zoomLevel})`;
  } else {
    w.style.transform = `translate(${S.panX}px,${S.panY}px) scale(${S.zoomLevel})`;
  }
  document.getElementById('statusZoom').textContent = Math.round(S.zoomLevel * 100) + '%';
  saveViewState();
  drawGrid();
  drawGuides();
  drawRulers();
}

export function setZoom(nz) {
  S.zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nz));
  applyTransform();
}

export function resetView() { S.panX = 0; S.panY = 0; S.zoomLevel = 1; applyTransform(); }

document.getElementById('zoomInBtn').addEventListener('click',      () => setZoom(S.zoomLevel * 1.25));
document.getElementById('zoomOutBtn').addEventListener('click',     () => setZoom(S.zoomLevel / 1.25));
document.getElementById('zoomResetBtn').addEventListener('click',   () => resetView());
document.getElementById('statusZoom').addEventListener('click',     () => resetView());
document.getElementById('zoomResetMenu').addEventListener('click', () => resetView());

document.getElementById('viewer').addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setZoom(S.zoomLevel * (e.deltaY < 0 ? 1.1 : 0.9));
}, { passive: false });

document.addEventListener('keydown', e => {
  if (e.ctrlKey && (e.key === '0' || e.key === 'Dead')) { e.preventDefault(); resetView(); }
  if (e.ctrlKey && (e.key === '=' || e.key === '+'))    { e.preventDefault(); setZoom(S.zoomLevel * 1.25); }
  if (e.ctrlKey && e.key === '-')                       { e.preventDefault(); setZoom(S.zoomLevel / 1.25); }
}, true);

// ── Hand-Pan-Events (DOM-Level, damit sie auch ohne Fabric-Canvas funktionieren) ──
const _viewer = document.getElementById('viewer');

_viewer.addEventListener('mousedown', e => {
  if (S.currentTool !== 'hand' || e.button !== 0) return;
  e.preventDefault();
  S.isPanning   = true;
  panStartX   = e.clientX; panStartY   = e.clientY;
  panStartPX  = S.panX;      panStartPY  = S.panY;
  document.body.classList.add('panning');
});

document.addEventListener('mousemove', e => {
  if (!S.isPanning) return;
  S.panX = panStartPX + (e.clientX - panStartX);
  S.panY = panStartPY + (e.clientY - panStartY);
  applyTransform();
});

document.addEventListener('mouseup', () => {
  if (!S.isPanning) return;
  S.isPanning = false;
  document.body.classList.remove('panning');
});

// Leertaste = temporäres Hand-Tool (wie Photoshop)
function isTypingContext() {
  const t = document.activeElement?.tagName;
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT';
}

document.addEventListener('keydown', e => {
  if (e.key === ' ' && !e.ctrlKey && !e.altKey && !spaceHeld && !isTypingContext()) {
    e.preventDefault();
    spaceHeld     = true;
    prevSpaceTool = S.currentTool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tool="hand"]')?.classList.add('active');
    activateTool('hand');
  }
});
document.addEventListener('keyup', e => {
  if (e.key === ' ' && spaceHeld) {
    spaceHeld = false;
    if (prevSpaceTool) {
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      document.querySelector(`[data-tool="${prevSpaceTool}"]`)?.classList.add('active');
      activateTool(prevSpaceTool);
    } else {
      deactivateTool();
    }
    prevSpaceTool = null;
  }
});


