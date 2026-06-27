import { S } from './00-state.js';
import { saveHistory, CUSTOM_PROPS, restoreHistory, _isDirty, _markSaved, _updateDirtyIndicator } from './14-history.js';
export { _isDirty, _markSaved, _updateDirtyIndicator } from './14-history.js';
import { tabById, saveTabs, renderTabBar, loadCanvasFromJSON } from './08-tabs.js';
import { refreshLayersList, loadLayersFromTab } from './13-layers.js';
import { setStatus, scopeLog } from './03-status-log.js';
import { drawGuides } from './24-guides.js';

// ═══════════════════════════════════════════════════════════════════════════════
// DATEI-OPERATIONEN
// ═══════════════════════════════════════════════════════════════════════════════

document.getElementById('linkBtn').addEventListener('click', () => {
  if (S.canvas.getActiveObjects().length < 2) return;
  linkSelectedObjects();
});

document.getElementById('unlinkBtn').addEventListener('click', () => {
  const grouped = S.canvas.getActiveObjects().filter(o => o.linkGroup);
  if (!grouped.length) return;
  const ids = new Set(grouped.map(o => o.linkGroup));
  ids.forEach(id => unlinkObjects(getLinkGroupMembers(id)));
});

document.getElementById('deleteBtn').addEventListener('click', () => {
  const active = S.canvas.getActiveObjects();
  if (!active.length) return;
  const n = active.length;
  active.forEach(o => S.canvas.remove(o));
  S.canvas.discardActiveObject();
  S._nextLabel = n > 1 ? `${n} gelöscht` : 'Gelöscht';
  saveHistory();
  S.canvas.renderAll();
  refreshLayersList();
  setStatus(`🗑 ${n} Objekt${n > 1 ? 'e' : ''} gelöscht`);
});

document.getElementById('clearBtn').addEventListener('click', () => {
  if (!confirm('Alle Annotationen löschen?')) return;
  S.canvas.clear();
  S._nextLabel = 'Alle gelöscht';
  saveHistory();
  refreshLayersList();
  setStatus('🗑 Alle Annotationen gelöscht');
});

document.getElementById('saveJsonBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(S.canvas.toJSON(CUSTOM_PROPS), null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  const fn   = `scopecam_${timestamp()}.json`;
  a.download = fn;
  a.click();
  setStatus(`✓ ${fn} exportiert`);
});

document.getElementById('loadJsonBtn').addEventListener('click', () => {
  document.getElementById('loadJsonInput').click();
});

document.getElementById('loadJsonInput').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  const reader   = new FileReader();
  reader.onload  = e => {
    try {
      // fabric v6: loadFromJSON returns a Promise (2nd arg is now reviver, not callback)
      S.canvas.loadFromJSON(JSON.parse(e.target.result)).then(() => {
        S.canvas.renderAll();
        saveHistory();
        refreshLayersList();
      });
    } catch { alert('Ungültige JSON-Datei'); }
  };
  reader.readAsText(file);
  this.value = '';
});

document.getElementById('exportBtn').addEventListener('click', async () => {
  const tmp = await captureComposite(true);
  if (!tmp) return;
  const a    = document.createElement('a');
  a.href     = tmp.toDataURL('image/png');
  const fn   = `scopecam_${timestamp()}.png`;
  a.download = fn;
  a.click();
  setStatus(`✓ ${fn} exportiert`);
});

export function timestamp() {
  return new Date().toISOString().slice(0, 19).replace(/:/g, '-');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJEKT SPEICHERN / ÖFFNEN — PNG mit eingebetteten iTXt-Metadaten
// In Paint.NET/GIMP: normales PNG (Frame + Annotationen gerendert).
// In ScopeCam: liest iTXt-Chunk → stellt alles editierbar wieder her.
// ═══════════════════════════════════════════════════════════════════════════════

// ── CRC32 für PNG-Chunks ──────────────────────────────────────────────────────
const _crc32Table = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
export function _crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = _crc32Table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Uint8Array → Base64 (chunked, kein Stack-Overflow bei großen Dateien)
export function _u8ToB64(bytes) {
  let s = '';
  const sz = 0x8000;
  for (let i = 0; i < bytes.length; i += sz)
    s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + sz, bytes.length)));
  return btoa(s);
}

// PNG: iTXt-Chunk vor IEND einfügen
export function _pngInjectITXt(png, keyword, text) {
  const enc = new TextEncoder();
  const kw  = enc.encode(keyword);
  const tx  = enc.encode(text);
  // iTXt: keyword\0 compression_flag(0) compression_method(0) lang\0 translated_kw\0 text
  const data = new Uint8Array(kw.length + 5 + tx.length);
  data.set(kw); data[kw.length]=0; data[kw.length+1]=0; data[kw.length+2]=0;
  data[kw.length+3]=0; data[kw.length+4]=0;
  data.set(tx, kw.length + 5);

  const typeBytes = new Uint8Array([0x69,0x54,0x58,0x74]); // "iTXt"
  const td = new Uint8Array(4 + data.length);
  td.set(typeBytes); td.set(data, 4);
  const crc = _crc32(td);
  const dlen = data.length;

  const chunk = new Uint8Array(4 + td.length + 4);
  chunk[0]=dlen>>>24; chunk[1]=dlen>>>16&0xFF; chunk[2]=dlen>>>8&0xFF; chunk[3]=dlen&0xFF;
  chunk.set(td, 4);
  chunk[4+td.length]=crc>>>24; chunk[4+td.length+1]=crc>>>16&0xFF;
  chunk[4+td.length+2]=crc>>>8&0xFF; chunk[4+td.length+3]=crc&0xFF;

  const iend = png.length - 12; // IEND ist immer die letzten 12 Bytes
  const out  = new Uint8Array(iend + chunk.length + 12);
  out.set(png.subarray(0, iend));
  out.set(chunk, iend);
  out.set(png.subarray(iend), iend + chunk.length);
  return out;
}

// PNG: iTXt-Chunk lesen
export function _pngReadITXt(png, keyword) {
  const dec = new TextDecoder();
  let pos = 8;
  while (pos + 12 <= png.length) {
    const len  = ((png[pos]<<24)|(png[pos+1]<<16)|(png[pos+2]<<8)|png[pos+3]) >>> 0;
    const type = String.fromCharCode(png[pos+4],png[pos+5],png[pos+6],png[pos+7]);
    if (type === 'iTXt') {
      const d = png.subarray(pos+8, pos+8+len);
      let i = 0; while (i < d.length && d[i] !== 0) i++;
      if (dec.decode(d.subarray(0, i)) === keyword) {
        let s = i+3; // +null +flag +method
        while (s < d.length && d[s] !== 0) s++; s++; // lang\0
        while (s < d.length && d[s] !== 0) s++; s++; // translated\0
        return dec.decode(d.subarray(s));
      }
    }
    if (type === 'IEND') break;
    pos += 12 + len;
  }
  return null;
}

// ── Speichern ─────────────────────────────────────────────────────────────────
export async function _buildProjectBytes() {
  // 1. Composites: mit Objekten (sichtbar in Paint.NET) + nur Frame (für ScopeCam-Hintergrund)
  const composite = await captureComposite(true);
  if (!composite) { alert('Kein Bild vorhanden'); return; }

  // Frame ohne Annotationen (JPEG, niedrigere Qualität → kompakt)
  const frameOnly = document.createElement('canvas');
  frameOnly.width = S.videoCanvas.width || S.videoCanvas.offsetWidth;
  frameOnly.height = S.videoCanvas.height || S.videoCanvas.offsetHeight;
  try { frameOnly.getContext('2d').drawImage(S.videoCanvas, 0, 0, frameOnly.width, frameOnly.height); } catch(_){}
  const frameB64 = frameOnly.width ? frameOnly.toDataURL('image/jpeg', 0.78) : null;

  // 2. PNG-Bytes des Composite holen
  const pngDataUrl = composite.toDataURL('image/png');
  let pngBytes = Uint8Array.from(atob(pngDataUrl.split(',')[1]), c => c.charCodeAt(0));

  // 3. Metadaten als iTXt einbetten (frame = nur für ScopeCam-Hintergrund)
  const meta = JSON.stringify({
    version: 2,
    type: 'scopecam-project',
    timestamp: new Date().toISOString(),
    frame: frameB64,
    canvasJSON: S.canvas.toJSON(CUSTOM_PROPS),
    layers: JSON.parse(JSON.stringify(S.layers)),
    guides: JSON.parse(JSON.stringify(S.guideLines)),
    history: S.history.map(e => ({ label: e.label, time: e.time, json: e.json })),
    historyIdx: S.historyIdx,
  });
  pngBytes = _pngInjectITXt(pngBytes, 'ScopeCam', meta);

  return pngBytes;
}

// Speicherpfad pro Tab verwalten
S.currentSavePath = null;

export function _setSavePath(path) {
  S.currentSavePath = path || null;
  const tab = tabById(S.activeTabId);
  if (tab) tab.savePath = path || null;
  _updateSaveBtn();
}

export function _updateSaveBtn() {
  const btn = document.getElementById('saveProjectBtn');
  if (S.currentSavePath) {
    btn.classList.remove('menu-item-dimmed');
    btn.title = S.currentSavePath;
  } else {
    btn.classList.add('menu-item-dimmed');
    btn.title = 'Noch nicht gespeichert — öffnet Speichern-Dialog';
  }
}

export async function saveProject() {
  const pngBytes = await _buildProjectBytes();
  if (!pngBytes) return;
  if (S.currentSavePath) {
    await fetch('/api/files/write?path=' + encodeURIComponent(S.currentSavePath), {
      method: 'POST', body: pngBytes,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    const fname = S.currentSavePath.split('/').pop();
    setStatus(`✓ ${fname} gespeichert nach ${S.currentSavePath.includes('/') ? S.currentSavePath.substring(0, S.currentSavePath.lastIndexOf('/')) : '/'}`);
    _markSaved();
  } else {
    await openFileManager('save', pngBytes, `projekt_${timestamp()}.scopecam`);
  }
}

export async function saveProjectAs() {
  const pngBytes = await _buildProjectBytes();
  if (!pngBytes) return;
  await openFileManager('save', pngBytes, S.currentSavePath ? S.currentSavePath.split('/').pop() : `projekt_${timestamp()}.scopecam`);
}

// ── Laden (ArrayBuffer) ───────────────────────────────────────────────────────
function _applyProjectData(p) {
  if (p.canvasJSON) {
    // fabric v6: loadFromJSON returns a Promise (2nd arg is now reviver, not callback)
    S.canvas.loadFromJSON(p.canvasJSON).then(() => {
      S.canvas.renderAll();
      if (p.layers) { S.layers = JSON.parse(JSON.stringify(p.layers)); saveCurrentTabLayers(); }
      if (p.guides) { S.guideLines = p.guides; saveGuides(); drawGuides(); }
      saveHistory();
      refreshLayersList();
    });
  } else {
    if (p.layers) { S.layers = JSON.parse(JSON.stringify(p.layers)); saveCurrentTabLayers(); }
    if (p.guides) { S.guideLines = p.guides; saveGuides(); drawGuides(); }
    refreshLayersList();
  }
}

export function loadProject(buf, serverPath) {
  const bytes = new Uint8Array(buf);
  const isPNG = bytes[0]===0x89 && bytes[1]===0x50 && bytes[2]===0x4E && bytes[3]===0x47;

  if (isPNG) {
    const metaStr = _pngReadITXt(bytes, 'ScopeCam');
    if (metaStr) {
      let p; try { p = JSON.parse(metaStr); } catch(_) { alert('Metadaten korrupt'); return; }
      const bg     = p.frame || ('data:image/png;base64,' + _u8ToB64(bytes));
      const name   = 'Projekt ' + (p.timestamp?.slice(0, 10) || timestamp());
      const newTab = createTab(name, bg, null);
      switchToTab(newTab.id);
      _applyProjectData(p);
      if (p.history && p.history.length > 0) {
        S.history    = p.history;
        S.historyIdx = p.historyIdx ?? S.history.length - 1;
        const tab2 = tabById(S.activeTabId);
        if (tab2) { tab2.history = S.history; tab2.historyIdx = S.historyIdx; }
        refreshTimeline();
      }
      if (serverPath) _setSavePath(serverPath);
      setTimeout(_markSaved, 50);
      return;
    }
    // Normales PNG ohne ScopeCam-Daten → als Snapshot importieren
    const dataUrl = 'data:image/png;base64,' + _u8ToB64(bytes);
    const newTab  = createTab('Importiert', dataUrl, null);
    switchToTab(newTab.id);
    return;
  }

  // Fallback: altes JSON-Format
  try {
    const p = JSON.parse(new TextDecoder().decode(bytes));
    if (p.type === 'scopecam-project') {
      const name   = 'Projekt ' + (p.timestamp?.slice(0, 10) || timestamp());
      const newTab = createTab(name, p.frame || null, null);
      switchToTab(newTab.id);
      _applyProjectData(p);
      return;
    }
  } catch (_) {}

  alert('Unbekanntes Format — nur .png (ScopeCam) oder altes .scopecam unterstützt');
}

document.getElementById('saveProjectBtn').addEventListener('click', saveProject);
document.getElementById('saveProjectAsBtn').addEventListener('click', saveProjectAs);
document.getElementById('loadProjectBtn').addEventListener('click', () => openFileManager('open'));
document.getElementById('openFileManagerBtn').addEventListener('click', () => openFileManager('browse'));


