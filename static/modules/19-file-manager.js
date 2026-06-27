// ═══════════════════════════════════════════════════════════════════════════════
// DATEI-MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

import { S } from './00-state.js';
import { loadProject, _pngReadITXt, _u8ToB64, _setSavePath, _markSaved } from './16-file-ops.js';
import { setStatus } from './03-status-log.js';
import { showCtxMenu } from './13-layers.js';

const _fm = { mode: 'save', path: '', selected: null, bytes: null, resolve: null };

function _fmFmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function _fmFmtDate(ts) {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'gerade eben';
  if (diff < 3600) return Math.round(diff / 60) + ' Min.';
  if (diff < 86400) return Math.round(diff / 3600) + ' Std.';
  return d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });
}
function _fmIcon(item) {
  if (item.isDir) return '📁';
  const ext = item.name.split('.').pop().toLowerCase();
  if (['scopecam','png','jpg','jpeg','gif','bmp','webp'].includes(ext)) return '🖼';
  if (['json'].includes(ext)) return '📋';
  return '📄';
}

async function _fmLoad() {
  const res  = await fetch('/api/files?path=' + encodeURIComponent(_fm.path));
  const data = await res.json();
  _fm.items  = data.items || [];
  _fmHidePreview();
  _fmRender();
}

function _fmCrumb() {
  const el = document.getElementById('fmCrumb');
  el.innerHTML = '';
  const root = document.createElement('span');
  root.className = 'fm-crumb-seg';
  root.textContent = '📁 Projekte';
  root.onclick = () => { _fm.path = ''; _fm.selected = null; _fmLoad(); };
  el.appendChild(root);
  if (_fm.path) {
    const parts = _fm.path.split('/');
    parts.forEach((seg, i) => {
      const sep = document.createElement('span');
      sep.className = 'fm-crumb-sep'; sep.textContent = ' / ';
      el.appendChild(sep);
      const s = document.createElement('span');
      s.className = 'fm-crumb-seg';
      s.textContent = seg;
      s.onclick = () => {
        _fm.path = parts.slice(0, i + 1).join('/');
        _fm.selected = null; _fmLoad();
      };
      el.appendChild(s);
    });
  }
}

function _fmRender() {
  _fmCrumb();
  document.getElementById('fmUpBtn').disabled = !_fm.path;
  const list = document.getElementById('fmItems');
  list.innerHTML = '';
  if (!_fm.items.length) {
    const h = document.createElement('div');
    h.className = 'fm-empty'; h.textContent = 'Ordner ist leer';
    list.appendChild(h); return;
  }
  _fm.items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'fm-item' + (_fm.selected?.path === item.path ? ' fm-selected' : '');
    row.dataset.path = item.path;

    const icon = document.createElement('span');
    icon.className = 'fm-item-icon'; icon.textContent = _fmIcon(item);

    const name = document.createElement('span');
    name.className = 'fm-item-name'; name.textContent = item.name;

    const meta = document.createElement('span');
    meta.className = 'fm-item-meta';
    meta.textContent = item.isDir ? '' : _fmFmtSize(item.size) + '  ' + _fmFmtDate(item.mtime);

    row.append(icon, name, meta);

    row.addEventListener('click', () => {
      _fm.selected = item;
      list.querySelectorAll('.fm-item').forEach(r => r.classList.remove('fm-selected'));
      row.classList.add('fm-selected');
      if (_fm.mode === 'save' && !item.isDir)
        document.getElementById('fmNameInput').value = item.name;
      _fmShowPreview(item);
    });

    row.addEventListener('dblclick', () => {
      if (item.isDir) { _fm.path = item.path; _fm.selected = null; _fmLoad(); }
      else if (_fm.mode === 'open') _fmConfirmOpen(item.path);
    });

    row.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      const items = [
        { label: '✎ Umbenennen', action: () => _fmStartRename(row, item) },
        '-',
        { label: '🗑 Löschen',   action: () => _fmDelete(item) },
      ];
      if (!item.isDir) items.splice(1, 0, {
        label: '⬇ Herunterladen',
        action: () => {
          const a = document.createElement('a');
          a.href     = '/api/files/read?path=' + encodeURIComponent(item.path);
          a.download = item.name;
          a.click();
        },
      });
      showCtxMenu(e, items);
    });

    list.appendChild(row);
  });
}

function _fmStartRename(row, item) {
  const nameEl = row.querySelector('.fm-item-name');
  const old    = item.name;
  const inp    = document.createElement('input');
  inp.value    = old;
  inp.className = 'fm-item-rename-inp';
  inp.style.cssText = 'flex:1;background:#222;border:1px solid #2f80ed;border-radius:3px;color:#fff;padding:1px 5px;font-size:13px;outline:none;width:100%';
  nameEl.replaceWith(inp);
  inp.focus(); inp.select();
  const commit = async () => {
    const n = inp.value.trim();
    if (n && n !== old) {
      const dir  = _fm.path;
      const from = dir ? dir + '/' + old  : old;
      const to   = dir ? dir + '/' + n    : n;
      await fetch('/api/files/rename', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ from, to }) });
      _fmLoad();
    } else _fmLoad();
  };
  inp.addEventListener('blur',  commit);
  inp.addEventListener('keydown', e => { if (e.key==='Enter') commit(); if (e.key==='Escape') _fmLoad(); });
}

async function _fmDelete(item) {
  if (!confirm(`"${item.name}" wirklich löschen?`)) return;
  await fetch('/api/files?path=' + encodeURIComponent(item.path), { method: 'DELETE' });
  if (_fm.selected?.path === item.path) _fm.selected = null;
  _fmLoad();
}

async function _fmConfirmOpen(path) {
  const res = await fetch('/api/files/read?path=' + encodeURIComponent(path));
  if (!res.ok) { alert('Fehler beim Lesen'); return; }
  const buf = await res.arrayBuffer();
  _fmClose();
  loadProject(buf, path);
  setStatus(`📂 ${path.split('/').pop()} geöffnet`);
}

async function _fmConfirmSave() {
  let name = document.getElementById('fmNameInput').value.trim();
  if (!name) { document.getElementById('fmNameInput').focus(); return; }
  if (!name.includes('.')) name += '.scopecam';
  const path = _fm.path ? _fm.path + '/' + name : name;
  await fetch('/api/files/write?path=' + encodeURIComponent(path), {
    method: 'POST', body: _fm.bytes,
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  _setSavePath(path);
  _markSaved();
  const dir = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '/';
  setStatus(`✓ ${name} gespeichert nach ${dir}`);
  _fmClose();
}

const _FM_IMG_EXTS = new Set(['png','jpg','jpeg','gif','webp','bmp','svg','scopecam','tiff','tif','avif']);

async function _fmShowPreview(item) {
  const prev    = document.getElementById('fmPreview');
  const imgBox  = document.getElementById('fmPreviewImg');
  const metaBox = document.getElementById('fmPreviewMeta');

  if (item.isDir) { prev.classList.remove('fm-preview-open'); return; }

  const ext = item.name.split('.').pop().toLowerCase();
  if (!_FM_IMG_EXTS.has(ext)) {
    prev.classList.remove('fm-preview-open');
    return;
  }

  prev.classList.add('fm-preview-open');
  imgBox.innerHTML = '<div class="fm-prev-noimg">⏳</div>';
  metaBox.innerHTML = '';

  try {
    const res  = await fetch('/api/files/read?path=' + encodeURIComponent(item.path));
    if (!res.ok) throw new Error();
    const buf  = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);

    let src = null;
    if (ext === 'scopecam') {
      // ScopeCam: frame aus iTXt lesen
      const metaStr = _pngReadITXt(bytes, 'ScopeCam');
      if (metaStr) {
        try {
          const p = JSON.parse(metaStr);
          src = p.frame || ('data:image/png;base64,' + _u8ToB64(bytes));
          metaBox.innerHTML = `<b>${item.name}</b><br>${_fmFmtSize(item.size)}<br>${new Date(item.mtime*1000).toLocaleString('de-DE')}` +
            (p.timestamp ? `<br>Erstellt: ${p.timestamp.slice(0,10)}` : '');
        } catch(_) { src = 'data:image/png;base64,' + _u8ToB64(bytes); }
      } else {
        src = 'data:image/png;base64,' + _u8ToB64(bytes);
      }
    } else if (ext === 'svg') {
      src = 'data:image/svg+xml;base64,' + btoa(new TextDecoder().decode(bytes));
    } else {
      src = URL.createObjectURL(new Blob([buf], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` }));
    }

    if (!metaBox.innerHTML) {
      metaBox.innerHTML = `<b>${item.name}</b><br>${_fmFmtSize(item.size)}<br>${new Date(item.mtime*1000).toLocaleString('de-DE')}`;
    }

    const img = document.createElement('img');
    img.src = src;
    img.alt = item.name;
    imgBox.innerHTML = '';
    imgBox.appendChild(img);
  } catch(_) {
    imgBox.innerHTML = '<div class="fm-prev-noimg">⚠</div>';
  }
}

function _fmHidePreview() {
  document.getElementById('fmPreview').classList.remove('fm-preview-open');
  document.getElementById('fmPreviewImg').innerHTML = '';
  document.getElementById('fmPreviewMeta').innerHTML = '';
}

function _fmClose() {
  document.getElementById('fmOverlay').classList.remove('fm-open');
  _fmHidePreview();
  _fm.bytes = null;
}

export function openFileManager(mode, bytes, defaultName, onFolderSelect) {
  _fm.mode = mode;
  _fm.bytes = bytes || null;
  _fm.selected = null;
  _fm.onFolderSelect = onFolderSelect || null;
  const isBrowse = mode === 'browse';
  const isFolder = mode === 'folder';
  document.getElementById('fmTitle').textContent = isFolder ? 'Ordner wählen' : isBrowse ? 'File Manager' : mode === 'save' ? 'Speichern' : 'Öffnen';
  document.getElementById('fmNameInput').style.display = mode === 'save' ? '' : 'none';
  document.getElementById('fmOkBtn').style.display = (isBrowse) ? 'none' : '';
  document.getElementById('fmOkBtn').textContent = isFolder ? 'Diesen Ordner wählen' : mode === 'save' ? 'Speichern' : 'Öffnen';
  if (mode === 'save' && defaultName) document.getElementById('fmNameInput').value = defaultName;
  document.getElementById('fmOverlay').classList.add('fm-open');
  _fmLoad();
}

// Event-Handler für File-Manager
document.getElementById('fmCloseBtn').addEventListener('click',  _fmClose);
document.getElementById('fmCancelBtn').addEventListener('click', _fmClose);
document.getElementById('fmOverlay').addEventListener('click',   e => { if (e.target === document.getElementById('fmOverlay')) _fmClose(); });
document.getElementById('fmUpBtn').addEventListener('click', () => {
  _fm.path = _fm.path.includes('/') ? _fm.path.split('/').slice(0,-1).join('/') : '';
  _fm.selected = null; _fmLoad();
});
document.getElementById('fmMkdirBtn').addEventListener('click', async () => {
  const n = prompt('Ordnername:');
  if (!n?.trim()) return;
  const p = _fm.path ? _fm.path + '/' + n.trim() : n.trim();
  await fetch('/api/files/mkdir', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: p }) });
  _fmLoad();
});
document.getElementById('fmOkBtn').addEventListener('click', () => {
  if (_fm.mode === 'save') _fmConfirmSave();
  else if (_fm.mode === 'folder') {
    if (_fm.onFolderSelect) _fm.onFolderSelect(_fm.path || '');
    _fmClose();
  } else if (_fm.selected && !_fm.selected.isDir) _fmConfirmOpen(_fm.selected.path);
});
document.getElementById('fmNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') _fmConfirmSave();
});


