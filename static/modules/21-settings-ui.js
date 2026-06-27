// ═══════════════════════════════════════════════════════════════════════════════
// EINSTELLUNGEN
// ═══════════════════════════════════════════════════════════════════════════════

import { S } from './00-state.js';
import { applyDevice } from './05-video.js';
import { applyDesign, populateDesignControls } from './20-design.js';
import { setStatus, scopeLog } from './03-status-log.js';
import { savePanelStates } from './02-panels.js';
import { tabById } from './08-tabs.js';
import { _updateCapturePathDisplay } from './15-capture.js';
import { drawRulers } from './22-rulers.js';

const settingsPage = document.getElementById('settingsPage');

// Settings tab switching
document.querySelectorAll('.sp-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sp-tab').forEach(b => b.classList.remove('sp-tab-active'));
    document.querySelectorAll('.sp-tab-pane').forEach(p => p.classList.add('sp-hidden'));
    btn.classList.add('sp-tab-active');
    const paneId = 'spPane' + btn.dataset.spTab.charAt(0).toUpperCase() + btn.dataset.spTab.slice(1);
    document.getElementById(paneId)?.classList.remove('sp-hidden');
  });
});

const spBackdrop = document.getElementById('spBackdrop');

// Fensterpositon (persistent)
const SP_POS_KEY = 'scopecam_sp_pos';
let spPos = null;

export function loadSpPos() {
  try { spPos = JSON.parse(localStorage.getItem(SP_POS_KEY)); } catch (_) {}
}

function saveSpPos() {
  try { localStorage.setItem(SP_POS_KEY, JSON.stringify(spPos)); } catch (_) {}
}

function positionSpWindow() {
  if (spPos) {
    // Sicherstellen dass Fenster sichtbar bleibt
    const maxX = window.innerWidth  - settingsPage.offsetWidth  - 10;
    const maxY = window.innerHeight - Math.min(settingsPage.offsetHeight, 200) - 10;
    settingsPage.style.left = Math.max(10, Math.min(spPos.x, maxX)) + 'px';
    settingsPage.style.top  = Math.max(10, Math.min(spPos.y, maxY)) + 'px';
  } else {
    // Erstmalig zentrieren
    settingsPage.style.left = Math.round((window.innerWidth  - 500) / 2) + 'px';
    settingsPage.style.top  = Math.round((window.innerHeight - 560) / 2) + 'px';
  }
}

export function openSettings() {
  settingsPage.classList.add('sp-open');
  spBackdrop.classList.add('sp-open');
  positionSpWindow();
}

export function closeSettings() {
  settingsPage.classList.remove('sp-open');
  spBackdrop.classList.remove('sp-open');
}

// Titelleiste: Fenster verschieben
let spDragging = false, spDragOX = 0, spDragOY = 0;

document.getElementById('spHeader').addEventListener('mousedown', e => {
  if (e.target.closest('#closeSettingsPage')) return;
  e.preventDefault();
  spDragging = true;
  const rect = settingsPage.getBoundingClientRect();
  spDragOX = e.clientX - rect.left;
  spDragOY = e.clientY - rect.top;
});
document.addEventListener('mousemove', e => {
  if (!spDragging) return;
  const x = Math.max(0, Math.min(window.innerWidth  - settingsPage.offsetWidth,  e.clientX - spDragOX));
  const y = Math.max(0, Math.min(window.innerHeight - 80,                        e.clientY - spDragOY));
  settingsPage.style.left = x + 'px';
  settingsPage.style.top  = y + 'px';
  spPos = { x, y };
});
document.addEventListener('mouseup', () => {
  if (spDragging) { spDragging = false; saveSpPos(); }
});

document.getElementById('openSettingsPage').addEventListener('click', async () => {
  await populateSettings();
  populateDesignControls();
  openSettings();
});
document.getElementById('closeSettingsPage').addEventListener('click', closeSettings);
spBackdrop.addEventListener('click', closeSettings);
document.getElementById('jpegQuality').addEventListener('input', function () {
  document.getElementById('qualityVal').textContent = this.value;
});
document.getElementById('maxFps').addEventListener('input', function () {
  document.getElementById('maxFpsVal').textContent = this.value;
});

export async function populateSettings() {
  const { devices } = await fetch('/api/devices').then(r => r.json());
  const sel = document.getElementById('deviceSelect');
  sel.innerHTML = '';

  const demoOpt       = document.createElement('option');
  demoOpt.value       = 'demo';
  demoOpt.textContent = 'Demo (PCB-Testbild)';
  if (S.settings.device === 'demo') demoOpt.selected = true;
  sel.appendChild(demoOpt);

  devices.forEach(d => {
    const opt       = document.createElement('option');
    opt.value       = d.path;
    opt.textContent = `${d.path}  (${d.name})`;
    if (d.path === S.settings.device) opt.selected = true;
    sel.appendChild(opt);
  });

  document.getElementById('jpegQuality').value      = S.settings.jpeg_quality   ?? 70;
  document.getElementById('qualityVal').textContent  = S.settings.jpeg_quality   ?? 70;
  document.getElementById('streamScale').value       = S.settings.stream_scale   ?? 0.5;
  document.getElementById('maxFps').value            = S.settings.max_fps        ?? 25;
  document.getElementById('maxFpsVal').textContent   = S.settings.max_fps        ?? 25;
  document.getElementById('scalePxMm').value         = S.settings.scale_px_per_mm ?? '';
  document.getElementById('rulerUnit').value         = S.settings.ruler_unit     ?? 'px';
  document.getElementById('flipH').checked           = S.settings.flip_h         ?? false;
  document.getElementById('flipV').checked           = S.settings.flip_v         ?? false;
  document.getElementById('arrowStep').value         = localStorage.getItem('scopecam_arrow_step') || '1';
  _updateCapturePathDisplay();
}

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  const stepVal = parseFloat(document.getElementById('arrowStep').value) || 1;
  localStorage.setItem('scopecam_arrow_step', String(stepVal));
  const updated = {
    device:          document.getElementById('deviceSelect').value,
    jpeg_quality:    parseInt(document.getElementById('jpegQuality').value, 10),
    stream_scale:    parseFloat(document.getElementById('streamScale').value),
    max_fps:         parseInt(document.getElementById('maxFps').value, 10),
    scale_px_per_mm: parseFloat(document.getElementById('scalePxMm').value) || null,
    ruler_unit:      document.getElementById('rulerUnit').value,
    flip_h:          document.getElementById('flipH').checked,
    flip_v:          document.getElementById('flipV').checked,
  };
  const res  = await fetch('/api/settings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updated),
  });
  S.settings = await res.json();
  updateScaleStatus();
  // Nur bei Kamera-Tabs die Device-Pipeline neu starten
  const tab = tabById(S.activeTabId);
  if (!tab?.backgroundDataUrl) applyDevice();
  closeSettings();
  drawRulers();
});

export function updateScaleStatus() {
  document.getElementById('statusScale').textContent = S.settings.scale_px_per_mm
    ? `Skalierung: ${S.settings.scale_px_per_mm} px/mm` : '';
}


