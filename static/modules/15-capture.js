// ═══════════════════════════════════════════════════════════════════════════════
// CAPTURE (Snapshot & Aufnahme)
// ═══════════════════════════════════════════════════════════════════════════════

let mediaRecorder   = null;
let recordedChunks  = [];
let recordingActive = false;
let recordingRAF    = null;

// Gibt ein composites Canvas-Element zurück (Video + optional Annotationen).
function captureComposite(withObjects) {
  return new Promise(resolve => {
    const w = videoCanvas.width  || videoCanvas.offsetWidth;
    const h = videoCanvas.height || videoCanvas.offsetHeight;
    if (!w || !h) { resolve(null); return; }
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const ctx = tmp.getContext('2d');
    try { ctx.drawImage(videoCanvas, 0, 0, w, h); } catch (_) {}
    if (!withObjects) { resolve(tmp); return; }
    const overlay   = new Image();
    overlay.onload  = () => { ctx.drawImage(overlay, 0, 0); resolve(tmp); };
    overlay.onerror = () => resolve(tmp);
    overlay.src     = canvas.toDataURL({ format: 'png', multiplier: 1 });
  });
}

// Snapshot → Download
const CAPTURE_PATH_KEY = 'scopecam_capture_path';

function _capturePath() { return localStorage.getItem(CAPTURE_PATH_KEY) || ''; }

function _updateCapturePathDisplay() {
  const el = document.getElementById('capturePathDisplay');
  if (el) el.textContent = _capturePath() || '—';
}

async function _saveToCapturePath(blob, filename) {
  const dir = _capturePath();
  if (!dir) return false;
  const fullPath = dir.replace(/\/$/, '') + '/' + filename;
  try {
    const buf = await blob.arrayBuffer();
    const res = await fetch(`/api/files/write?path=${encodeURIComponent(fullPath)}`, { method: 'POST', body: buf });
    if (res.ok) { setStatus(`Gespeichert: ${fullPath}`); return true; }
    setStatus('Fehler beim Speichern auf Server');
  } catch (e) { setStatus('Speicherfehler: ' + e.message); }
  return false;
}

document.getElementById('capturePathBrowse').addEventListener('click', () => {
  openFileManager('folder', null, null, path => {
    localStorage.setItem(CAPTURE_PATH_KEY, path);
    _updateCapturePathDisplay();
    setStatus(`Aufnahmepfad: /${path || 'projects'}`);
  });
});
document.getElementById('capturePathClear').addEventListener('click', () => {
  localStorage.removeItem(CAPTURE_PATH_KEY);
  _updateCapturePathDisplay();
  setStatus('Aufnahmepfad geleert — Browser-Download aktiv');
});

document.getElementById('snapshotBtn').addEventListener('click', async () => {
  const withObjs = document.getElementById('captureWithObjs').checked;
  const tmp = await captureComposite(withObjs);
  if (!tmp) return;
  const fname = `scopecam_snap_${timestamp()}.png`;
  tmp.toBlob(async blob => {
    if (!await _saveToCapturePath(blob, fname)) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }, 'image/png');
});

// Snap & Neuer Tab: Standbild als Hintergrund in neuem Tab öffnen
document.getElementById('snapToTabBtn').addEventListener('click', async () => {
  const withObjs = document.getElementById('captureWithObjs').checked;
  const tmp = await captureComposite(withObjs);
  if (!tmp) return;

  // JPEG mit 90% Qualität spart localStorage-Speicher
  const dataUrl = tmp.toDataURL('image/jpeg', 0.9);

  // Aktuellen Tab sichern, dann neuen Snapshot-Tab erstellen
  if (activeTabId) {
    const cur = tabById(activeTabId);
    if (cur) cur.canvasJSON = getCurrentTabCanvasJSON();
  }
  const newTab = createTab('Snapshot ' + (tabs.length + 1), dataUrl, null);
  switchToTab(newTab.id);
});

// Aufnehmen (MediaRecorder auf Compositing-Canvas)
document.getElementById('recordBtn').addEventListener('click', () => {
  recordingActive ? stopRecording() : startRecording(document.getElementById('captureWithObjs').checked);
});

function startRecording(withObjects) {
  const w = videoCanvas.width  || videoCanvas.offsetWidth;
  const h = videoCanvas.height || videoCanvas.offsetHeight;
  if (!w || !h) return;

  const composite   = document.createElement('canvas');
  composite.width   = w;
  composite.height  = h;
  const ctx         = composite.getContext('2d');

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9' : 'video/webm';

  const stream  = composite.captureStream(25);
  mediaRecorder = new MediaRecorder(stream, { mimeType });
  recordedChunks = [];

  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = async () => {
    const blob  = new Blob(recordedChunks, { type: 'video/webm' });
    const fname = `scopecam_rec_${timestamp()}.webm`;
    if (!await _saveToCapturePath(blob, fname)) {
      const a = document.createElement('a');
      a.href  = URL.createObjectURL(blob);
      a.download = fname;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };

  recordingActive = true;

  const renderFrame = () => {
    if (!recordingActive) return;
    try {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(videoCanvas, 0, 0, w, h);
      if (withObjects) ctx.drawImage(canvas.getElement(), 0, 0, w, h);
    } catch (_) {}
    recordingRAF = requestAnimationFrame(renderFrame);
  };

  mediaRecorder.start(200);
  renderFrame();

  const btn       = document.getElementById('recordBtn');
  btn.textContent = '⏹ Stopp';
  btn.classList.add('rec-active');
}

function stopRecording() {
  recordingActive = false;
  cancelAnimationFrame(recordingRAF);
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  mediaRecorder   = null;
  const btn       = document.getElementById('recordBtn');
  btn.textContent = '⏺ Aufnehmen';
  btn.classList.remove('rec-active');
}


