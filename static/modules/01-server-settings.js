'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER-SETTINGS SYNC
// Alle scopecam_*-Keys werden transparent zum Server synchronisiert,
// damit Einstellungen geräteübergreifend im Netzwerk erhalten bleiben.
// ═══════════════════════════════════════════════════════════════════════════════
let _syncTimer = null;
function _syncSettingsToServer() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('scopecam_')) data[k] = localStorage.getItem(k);
  }
  fetch('/api/client-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => {});
}
function _debouncedSync() {
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(_syncSettingsToServer, 800);
}
// localStorage.setItem überschreiben — alle scopecam_*-Writes lösen Sync aus
const _lsSetOrig = localStorage.setItem.bind(localStorage);
localStorage.setItem = function(key, value) {
  _lsSetOrig(key, value);
  if (key && key.startsWith('scopecam_')) _debouncedSync();
};

async function _loadSettingsFromServer() {
  try {
    const res = await fetch('/api/client-settings');
    if (!res.ok) return;
    const serverData = await res.json();
    const hasServerData = Object.keys(serverData).length > 0;
    if (hasServerData) {
      // Server hat Daten → in localStorage schreiben (Server gewinnt)
      for (const [k, v] of Object.entries(serverData)) {
        _lsSetOrig(k, v);
      }
    } else {
      // Server leer → bestehende Browser-Settings hochladen
      _syncSettingsToServer();
    }
  } catch {
    // Kein Server → Browser-Settings behalten, aber einmalig hochladen versuchen
    _syncSettingsToServer();
  }
}

