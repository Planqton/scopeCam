// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// ZOOM + PAN
// Zoom: CSS scale auf #canvasWrapper via Ctrl+Scroll oder Buttons.
// Pan: translate-Offset (panX/Y) via Hand-Werkzeug oder Leertaste.
// Beides wird im localStorage persistiert.
// ═══════════════════════════════════════════════════════════════════════════════

const VIEW_KEY  = 'scopecam_view_v1';
const ZOOM_MIN  = 0.1, ZOOM_MAX = 8.0;
let zoomLevel   = 1.0;
let panX        = 0, panY = 0;
let isPanning   = false;
let panStartX   = 0, panStartY = 0, panStartPX = 0, panStartPY = 0;
let spaceHeld   = false, prevSpaceTool = null;

function saveViewState() {
  try { localStorage.setItem(VIEW_KEY, JSON.stringify({ z: zoomLevel, x: panX, y: panY })); } catch (_) {}
}

function loadViewState() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY));
    if (v) { zoomLevel = v.z ?? 1; panX = v.x ?? 0; panY = v.y ?? 0; }
  } catch (_) {}
}

function applyTransform() {
  const w = document.getElementById('canvasWrapper');
  if (zoomLevel === 1 && panX === 0 && panY === 0) {
    w.style.transform = '';
  } else if (panX === 0 && panY === 0) {
    w.style.transform = `scale(${zoomLevel})`;
  } else {
    w.style.transform = `translate(${panX}px,${panY}px) scale(${zoomLevel})`;
  }
  document.getElementById('statusZoom').textContent = Math.round(zoomLevel * 100) + '%';
  saveViewState();
  drawGrid();
  drawGuides();
  drawRulers();
}

function setZoom(nz) {
  zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nz));
  applyTransform();
}

function resetView() { panX = 0; panY = 0; zoomLevel = 1; applyTransform(); }

document.getElementById('zoomInBtn').addEventListener('click',      () => setZoom(zoomLevel * 1.25));
document.getElementById('zoomOutBtn').addEventListener('click',     () => setZoom(zoomLevel / 1.25));
document.getElementById('zoomResetBtn').addEventListener('click',   () => resetView());
document.getElementById('statusZoom').addEventListener('click',     () => resetView());
document.getElementById('zoomResetMenu').addEventListener('click', () => resetView());

document.getElementById('viewer').addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setZoom(zoomLevel * (e.deltaY < 0 ? 1.1 : 0.9));
}, { passive: false });

document.addEventListener('keydown', e => {
  if (e.ctrlKey && (e.key === '0' || e.key === 'Dead')) { e.preventDefault(); resetView(); }
  if (e.ctrlKey && (e.key === '=' || e.key === '+'))    { e.preventDefault(); setZoom(zoomLevel * 1.25); }
  if (e.ctrlKey && e.key === '-')                       { e.preventDefault(); setZoom(zoomLevel / 1.25); }
}, true);

// ── Hand-Pan-Events (DOM-Level, damit sie auch ohne Fabric-Canvas funktionieren) ──
const _viewer = document.getElementById('viewer');

_viewer.addEventListener('mousedown', e => {
  if (currentTool !== 'hand' || e.button !== 0) return;
  e.preventDefault();
  isPanning   = true;
  panStartX   = e.clientX; panStartY   = e.clientY;
  panStartPX  = panX;      panStartPY  = panY;
  document.body.classList.add('panning');
});

document.addEventListener('mousemove', e => {
  if (!isPanning) return;
  panX = panStartPX + (e.clientX - panStartX);
  panY = panStartPY + (e.clientY - panStartY);
  applyTransform();
});

document.addEventListener('mouseup', () => {
  if (!isPanning) return;
  isPanning = false;
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
    prevSpaceTool = currentTool;
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


