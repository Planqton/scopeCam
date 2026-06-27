import { S } from './00-state.js';
import { syncCanvasSize } from './07-canvas-layout.js';
import { setStatus } from './03-status-log.js';

// ═══════════════════════════════════════════════════════════════════════════════
// VIDEO / WEBSOCKET
// ═══════════════════════════════════════════════════════════════════════════════

S.videoCanvas = document.getElementById('videoCanvas');
S.videoCtx    = S.videoCanvas.getContext('2d');
let ws = null;

const demoImg = new Image();
demoImg.src = '/demo.png';

function isDemo() { return S.settings.device === 'demo'; }

function showDemo() {
  if (!demoImg.complete || !demoImg.naturalWidth) { demoImg.onload = showDemo; return; }
  S.videoCanvas.width  = demoImg.naturalWidth;
  S.videoCanvas.height = demoImg.naturalHeight;
  S.videoCtx.drawImage(demoImg, 0, 0);
  syncCanvasSize();
}

let noSignalTimer = null;

function showNoSignal(visible) {
  document.getElementById('noSignal').classList.toggle('visible', visible);
}

function connectWS() {
  if (isDemo()) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws/stream`);
  ws.binaryType = 'blob';

  // Kein Signal-Overlay nach 3 Sekunden ohne Frame
  clearTimeout(noSignalTimer);
  noSignalTimer = setTimeout(() => showNoSignal(true), 3000);

  ws.onmessage = async (e) => {
    if (isDemo()) return;
    clearTimeout(noSignalTimer);
    showNoSignal(false);
    const bitmap = await createImageBitmap(e.data);
    if (S.videoCanvas.width !== bitmap.width || S.videoCanvas.height !== bitmap.height) {
      S.videoCanvas.width  = bitmap.width;
      S.videoCanvas.height = bitmap.height;
      syncCanvasSize();
    }
    if (!S._streamFrozen) S.videoCtx.drawImage(bitmap, 0, 0);
    bitmap.close();
  };
  ws.onclose = () => {
    showNoSignal(true);
    if (!isDemo()) setTimeout(connectWS, 1000);
  };
  ws.onerror = () => ws.close();
}

export function stopCameraStream() {
  clearTimeout(noSignalTimer);
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
}

export function applyDevice() {
  const demoBanner = document.getElementById('demoBanner');
  if (isDemo()) {
    stopCameraStream();
    showNoSignal(false);
    showDemo();
    if (demoBanner) demoBanner.style.display = 'flex';
  } else {
    showNoSignal(false);
    if (demoBanner) demoBanner.style.display = 'none';
    if (!ws || ws.readyState > 1) connectWS();
  }
}


