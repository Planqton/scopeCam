import { S } from './00-state.js';
import { buildKiSystemPrompt, callKiLLM, parseKiResponse, executeAIActions, saveKiChat } from './27-ki-core.js';
import { detectKiProvider } from './26-ki-settings.js';
import { setStatus } from './03-status-log.js';

// ── Chat UI ──────────────────────────────────────────────────────────────────

function kiAppendThinking(thinkingText) {
  const log = document.getElementById('kiMessages');
  const el = document.createElement('details');
  el.className = 'ki-thinking';
  const sum = document.createElement('summary');
  sum.textContent = '💭 Reasoning';
  const pre = document.createElement('pre');
  pre.className = 'ki-thinking-body';
  pre.textContent = thinkingText;
  el.appendChild(sum);
  el.appendChild(pre);
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

export function kiAppendMessage(role, text, actions, thinking) {
  const el  = document.getElementById('kiMessages');
  const msg = document.createElement('div');
  msg.className = 'ki-msg ki-msg-' + role;

  const bubble = document.createElement('div');
  bubble.className = 'ki-bubble';
  bubble.textContent = text;
  msg.appendChild(bubble);

  if (thinking) {
    const det = document.createElement('details');
    det.className = 'ki-thinking';
    const sum = document.createElement('summary');
    sum.textContent = '💭 Reasoning';
    const pre = document.createElement('pre');
    pre.className = 'ki-thinking-body';
    pre.textContent = thinking;
    det.appendChild(sum);
    det.appendChild(pre);
    msg.appendChild(det);
  }

  if (actions?.length) {
    const pills = document.createElement('div');
    pills.className = 'ki-actions';
    actions.forEach(a => {
      const pill = document.createElement('span');
      pill.className = 'ki-action-pill';
      pill.textContent = a.action + (a.type ? ':' + a.type : '') + (a.id ? ' …' + a.id.slice(-4) : '');
      pills.appendChild(pill);
    });
    msg.appendChild(pills);
  }

  el.appendChild(msg);
  el.scrollTop = el.scrollHeight;
}

function kiSetStatus(text, color) {
  const bar = document.getElementById('kiModelBar');
  if (color) bar.style.color = color;
  else bar.style.color = '';
  if (text !== null) bar.textContent = text;
}

export function getKiRegionInCanvasCoords() {
  if (!S.kiRegionRect) return null;
  const videoCanvas = document.getElementById('videoCanvas');
  const wrapper     = document.getElementById('canvasWrapper');
  const vr  = videoCanvas.getBoundingClientRect();
  const wr  = wrapper.getBoundingClientRect();
  const offX = vr.left - wr.left;
  const offY = vr.top  - wr.top;
  const scX  = videoCanvas.width  / vr.width;
  const scY  = videoCanvas.height / vr.height;
  return {
    x: Math.round((S.kiRegionRect.rx - offX) * scX),
    y: Math.round((S.kiRegionRect.ry - offY) * scY),
    w: Math.round(S.kiRegionRect.rw * scX),
    h: Math.round(S.kiRegionRect.rh * scY),
  };
}

function captureKiFrame() {
  const videoCanvas = document.getElementById('videoCanvas');
  const fabricEl    = S.canvas.getElement();

  let sx = 0, sy = 0, sw, sh;
  const region = getKiRegionInCanvasCoords();

  if (region) {
    sx = region.x; sy = region.y; sw = region.w; sh = region.h;
  } else {
    sw = videoCanvas.width  || fabricEl.width;
    sh = videoCanvas.height || fabricEl.height;
  }

  sw = Math.max(1, Math.round(sw));
  sh = Math.max(1, Math.round(sh));

  const tmp  = document.createElement('canvas');
  tmp.width  = sw;
  tmp.height = sh;
  const ctx2 = tmp.getContext('2d');
  if (videoCanvas.width > 0) ctx2.drawImage(videoCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  ctx2.drawImage(fabricEl, sx, sy, sw, sh, 0, 0, sw, sh);

  // Koordinaten-Raster einblenden damit KI Pixel-Positionen ablesen kann
  const step = Math.round(Math.max(sw, sh) / 8 / 10) * 10 || 50;
  ctx2.save();
  ctx2.strokeStyle = 'rgba(255,255,0,0.35)';
  ctx2.fillStyle   = 'rgba(255,255,0,0.85)';
  ctx2.lineWidth   = 0.5;
  ctx2.font        = `${Math.max(9, Math.round(step * 0.28))}px monospace`;
  ctx2.textBaseline = 'top';
  for (let x = step; x < sw; x += step) {
    ctx2.beginPath(); ctx2.moveTo(x, 0); ctx2.lineTo(x, sh); ctx2.stroke();
    ctx2.fillText(String(x + (region ? region.x : 0)), x + 2, 2);
  }
  for (let y = step; y < sh; y += step) {
    ctx2.beginPath(); ctx2.moveTo(0, y); ctx2.lineTo(sw, y); ctx2.stroke();
    ctx2.fillText(String(y + (region ? region.y : 0)), 2, y + 2);
  }
  ctx2.restore();

  return tmp.toDataURL('image/jpeg', 0.95);
}

export async function sendKiMessage() {
  const input = document.getElementById('kiInput');
  const text  = input.value.trim();
  if (!text) return;
  if (!S.kiSettings.endpoint || !S.kiSettings.model) {
    kiAppendMessage('system', '⚠ KI nicht konfiguriert. Einstellungen → KI öffnen.', null);
    return;
  }

  input.value = '';
  kiAppendMessage('user', text, null);

  const systemPrompt = buildKiSystemPrompt();
  // Immer aktuelles Frame aufnehmen (live) — bei Bereich: Ausschnitt, sonst alles
  const imageUrl = captureKiFrame();

  const b64 = imageUrl.split(',')[1];
  let userContent;
  if (detectKiProvider(S.kiSettings.endpoint) === 'anthropic') {
    userContent = [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
      { type: 'text', text },
    ];
  } else {
    userContent = [
      { type: 'image_url', image_url: { url: imageUrl } },
      { type: 'text', text },
    ];
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...S.kiChatHistory,
    { role: 'user', content: userContent },
  ];

  kiSetStatus('⏳ Denkt…', 'var(--clr-muted)');
  document.getElementById('kiSendBtn').disabled = true;

  // Platzhalter am Ende der Nachrichten-Liste zeigen
  const kiMsgs = document.getElementById('kiMessages');
  const placeholder = document.createElement('div');
  placeholder.className = 'ki-msg ki-msg-assistant';
  const phBubble = document.createElement('div');
  phBubble.className = 'ki-bubble ki-thinking-placeholder';
  phBubble.textContent = '⏳ Denkt…';
  placeholder.appendChild(phBubble);
  kiMsgs.appendChild(placeholder);
  kiMsgs.scrollTop = kiMsgs.scrollHeight;

  try {
    const { text: raw, thinking } = await callKiLLM(messages);
    placeholder.remove();
    const parsed   = parseKiResponse(raw);
    const reply    = parsed.reply || raw;
    const actions  = parsed.actions || [];

    S.kiChatHistory.push({ role: 'user', content: text });
    S.kiChatHistory.push({ role: 'assistant', content: raw, display: reply, actions });
    const KI_MAX = 32;
    if (S.kiChatHistory.length > KI_MAX) {
      S.kiChatHistory = S.kiChatHistory.slice(-KI_MAX);
    }
    saveKiChat();

    kiAppendMessage('assistant', reply, actions, thinking);
    if (actions.length) await executeAIActions(actions);
    kiSetStatus(S.kiSettings.model, '');
  } catch (e) {
    placeholder.remove();
    const errEl = document.getElementById('kiMessages');
    const errMsg = document.createElement('div');
    errMsg.className = 'ki-msg ki-msg-system';
    const bubble = document.createElement('div');
    bubble.className = 'ki-bubble';
    bubble.textContent = '✗ ' + e.message;
    const retryBtn = document.createElement('button');
    retryBtn.className = 'ki-retry-btn';
    retryBtn.textContent = '↻ Erneut senden';
    retryBtn.addEventListener('click', () => {
      errMsg.remove();
      document.getElementById('kiInput').value = text;
      sendKiMessage();
    });
    errMsg.appendChild(bubble);
    errMsg.appendChild(retryBtn);
    errEl.appendChild(errMsg);
    errEl.scrollTop = errEl.scrollHeight;
    kiSetStatus(S.kiSettings.model, '');
  }

  document.getElementById('kiSendBtn').disabled = false;
  document.getElementById('kiInput').focus();
}

export function updateKiPanel() {
  const ready = !!(S.kiSettings.endpoint && S.kiSettings.model);
  document.getElementById('kiPanelHint').style.display = ready ? 'none' : '';
  const chat = document.getElementById('kiChat');
  chat.style.display = ready ? 'flex' : 'none';
  if (ready) kiSetStatus(S.kiSettings.model);
}

// ── KI Bereich-Auswahl ───────────────────────────────────────────────────────
// Speichert NUR Koordinaten (Wrapper-Pixel) — Bild wird immer frisch aufgenommen
S.kiRegionRect = null; // {rx, ry, rw, rh} relativ zu canvasWrapper

const KI_REGION_KEY = 'scopecam_ki_region_v1';

export function createRegionBadge(rw, rh) {
  const preview = document.createElement('div');
  preview.className = 'ki-region-badge';
  preview.style.cursor = 'pointer';
  preview.innerHTML = `<span>⊡ Bereich ${Math.round(rw)}×${Math.round(rh)}px aktiv — wird live mitgesendet</span>`
    + `<button title="Bereich entfernen">✕</button>`;

  let _liveInterval = null, _popupOpen = false;
  const _popup = document.createElement('div');
  _popup.className = 'ki-region-hover-popup';
  _popup.style.display = 'none';
  const _popupImg = document.createElement('img');
  _popup.appendChild(_popupImg);
  document.body.appendChild(_popup);

  function closePopup() {
    clearInterval(_liveInterval);
    _popup.style.display = 'none';
    _popupOpen = false;
  }

  preview.querySelector('button').addEventListener('click', () => {
    closePopup(); _popup.remove();
    preview.remove();
    S.kiRegionRect = null;
    saveKiRegion();
    document.getElementById('kiRegionStatus').textContent = '';
  });

  preview.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    if (_popupOpen) { closePopup(); return; }
    _popupOpen = true;
    _popup.style.display = 'block';
    const refresh = () => { if (S.kiRegionRect) _popupImg.src = captureKiFrame(); };
    refresh();
    _liveInterval = setInterval(refresh, 500);
    requestAnimationFrame(() => {
      const br = preview.getBoundingClientRect();
      const pw = _popup.offsetWidth, ph = _popup.offsetHeight;
      let left = br.left, top = br.top - ph - 8;
      if (top < 4) top = br.bottom + 8;
      if (left + pw > window.innerWidth - 4) left = window.innerWidth - pw - 4;
      _popup.style.left = left + 'px';
      _popup.style.top  = top  + 'px';
    });
  });

  return preview;
}

function saveKiRegion() {
  if (!S.kiRegionRect) { try { localStorage.removeItem(KI_REGION_KEY); } catch (_) {} return; }
  const wr = document.getElementById('canvasWrapper').getBoundingClientRect();
  if (!wr.width || !wr.height) return;
  try {
    localStorage.setItem(KI_REGION_KEY, JSON.stringify({
      rx: S.kiRegionRect.rx / wr.width,  ry: S.kiRegionRect.ry / wr.height,
      rw: S.kiRegionRect.rw / wr.width,  rh: S.kiRegionRect.rh / wr.height,
    }));
  } catch (_) {}
}

export function restoreKiRegion() {
  try {
    const saved = JSON.parse(localStorage.getItem(KI_REGION_KEY));
    if (!saved) return;
    const wr = document.getElementById('canvasWrapper').getBoundingClientRect();
    if (!wr.width || !wr.height) return;
    S.kiRegionRect = {
      rx: saved.rx * wr.width,  ry: saved.ry * wr.height,
      rw: saved.rw * wr.width,  rh: saved.rh * wr.height,
    };
  } catch (_) {}
}

function startKiRegionSelect() {
  const wrapper = document.getElementById('canvasWrapper');

  // Overlay over full viewport — eliminates offset from wrapper's internal positioning
  const overlay = document.createElement('div');
  overlay.id = 'kiRegionOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;cursor:crosshair;z-index:9000;';
  document.body.appendChild(overlay);

  document.getElementById('kiRegionStatus').textContent = 'Bereich ziehen…';
  document.getElementById('kiRegionBtn').classList.add('ki-region-active');

  let startX, startY;
  const sel = document.createElement('div');
  sel.style.cssText = 'position:fixed;border:2px dashed var(--clr-accent);background:rgba(47,128,237,0.08);pointer-events:none;display:none;box-sizing:border-box;';
  document.body.appendChild(sel);

  overlay.addEventListener('mousedown', e => {
    // Work in viewport (client) coordinates — no offset issues
    startX = e.clientX; startY = e.clientY;
    sel.style.display = 'block';
    sel.style.left = startX + 'px'; sel.style.top = startY + 'px';
    sel.style.width = '0'; sel.style.height = '0';

    const onMove = e => {
      const x = Math.min(e.clientX, startX), y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
      sel.style.left = x + 'px'; sel.style.top = y + 'px';
      sel.style.width = w + 'px'; sel.style.height = h + 'px';
    };

    const onUp = e => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      overlay.remove(); sel.remove();
      document.getElementById('kiRegionBtn').classList.remove('ki-region-active');

      // Convert viewport coords → wrapper-relative coords
      const wr = wrapper.getBoundingClientRect();
      const x1 = Math.min(e.clientX, startX) - wr.left;
      const y1 = Math.min(e.clientY, startY) - wr.top;
      const x2 = Math.max(e.clientX, startX) - wr.left;
      const y2 = Math.max(e.clientY, startY) - wr.top;
      const rx = x1, ry = y1, rw = x2 - x1, rh = y2 - y1;

      if (rw < 10 || rh < 10) {
        document.getElementById('kiRegionStatus').textContent = '';
        return;
      }

      // Nur Koordinaten speichern — Bild wird beim Senden frisch aufgenommen
      S.kiRegionRect = { rx, ry, rw, rh };
      saveKiRegion();
      document.getElementById('kiRegionStatus').textContent =
        `⊡ ${Math.round(rw)}×${Math.round(rh)}px (live)`;

      const msgs = document.getElementById('kiMessages');
      msgs.appendChild(createRegionBadge(rw, rh));
      msgs.scrollTop = msgs.scrollHeight;
      document.getElementById('kiInput').focus();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Abbruch mit Escape
  const onKey = e => {
    if (e.key === 'Escape') {
      overlay.remove(); sel.remove();
      document.removeEventListener('keydown', onKey);
      document.getElementById('kiRegionStatus').textContent = '';
      document.getElementById('kiRegionBtn').classList.remove('ki-region-active');
    }
  };
  document.addEventListener('keydown', onKey, { once: false });
}

document.getElementById('kiRegionBtn').addEventListener('click', startKiRegionSelect);
document.getElementById('kiClearBtn').addEventListener('click', () => {
  S.kiChatHistory = [];
  saveKiChat();
  document.getElementById('kiMessages').innerHTML = '';
});

document.getElementById('kiSendBtn').addEventListener('click', sendKiMessage);
document.getElementById('kiInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendKiMessage(); }
});
