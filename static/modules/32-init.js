// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// Stellt gespeicherte Tabs und den aktiven Tab wieder her.
// ═══════════════════════════════════════════════════════════════════════════════

import { S } from './00-state.js';
import { _loadSettingsFromServer } from './01-server-settings.js';
import { loadPanelStates, savePanelStates } from './02-panels.js';
import { scopeLog, setStatus } from './03-status-log.js';
import { loadCanvasFromJSON } from './04-canvas-state.js';
import { applyDevice, stopCameraStream } from './05-video.js';
import { applyTransform, loadViewState, resetView } from './06-transform.js';
import { syncCanvasSize } from './07-canvas-layout.js';
import { loadTabsFromStorage, renderTabBar, loadSnapshotBackground, createTab, tabById, saveTabs } from './08-tabs.js';
import { activateTool } from './09-tools.js';
import { loadLayersFromTab, refreshLayersList } from './13-layers.js';
import { saveHistory, restoreHistory, refreshTimeline } from './14-history.js';
import { _updateSaveBtn, _markSaved } from './16-file-ops.js';
import { renderScManager, _renderStatusKeys } from './17-shortcuts.js';
import { openFileManager } from './19-file-manager.js';
import { applyDesign, loadDesign, buildDesignControls } from './20-design.js';
import { populateSettings, updateScaleStatus, loadSpPos } from './21-settings-ui.js';
import { drawRulers } from './22-rulers.js';
import { loadGridState, applyGridState } from './23-grid.js';
import { initGuides } from './24-guides.js';
import { loadKiSettings, populateKiSettings } from './26-ki-settings.js';
import { loadKiPerms, loadKiChat } from './27-ki-core.js';
import { restoreKiRegion, createRegionBadge, updateKiPanel } from './30-ki-chat-ui.js';

export async function init() {
  // Einstellungen vom Server laden bevor alles andere initialisiert wird
  await _loadSettingsFromServer();
  // Design + View-State zuerst laden, damit Layout sofort korrekt ist
  loadDesign();
  buildDesignControls();
  loadViewState();
  applyTransform();
  loadSpPos();
  loadKiSettings();
  populateKiSettings();
  loadKiPerms();
  loadGridState();
  initGuides();
  _renderStatusKeys();

  const res = await fetch('/api/settings');
  S.settings  = await res.json();
  updateScaleStatus();

  // Tabs aus localStorage laden oder Ersttab erstellen
  if (!loadTabsFromStorage()) {
    const defaultTab = createTab('Kamera');
    S.activeTabId      = defaultTab.id;
    saveTabs();
  }
  renderTabBar();

  // Aktiven Tab wiederherstellen
  const tab = tabById(S.activeTabId);
  loadLayersFromTab(tab);
  if (tab) {
    if (tab.backgroundDataUrl && tab.backgroundDataUrl !== '[gespeichert]') {
      stopCameraStream();
      loadSnapshotBackground(tab.backgroundDataUrl);
    } else {
      applyDevice();
    }
    if (tab.canvasJSON) {
      loadCanvasFromJSON(tab.canvasJSON);
    }
  } else {
    applyDevice();
  }

  syncCanvasSize();
  drawRulers();
  await populateSettings();
  refreshLayersList();
  saveHistory();

  // Auswahl-Werkzeug standardmäßig aktivieren
  document.querySelector('[data-tool="select"]')?.click();

  // KI-Chat und Bereich wiederherstellen — ganz am Ende wenn DOM sicher bereit ist
  loadKiChat();

  // KI-Bereich wiederherstellen (nach syncCanvasSize damit Wrapper-Größe bekannt ist)
  restoreKiRegion();
  if (S.kiRegionRect) {
    const { rw, rh } = S.kiRegionRect;
    document.getElementById('kiRegionStatus').textContent = `⊡ ${Math.round(rw)}×${Math.round(rh)}px (live)`;
    const msgs = document.getElementById('kiMessages');
    if (msgs) { msgs.appendChild(createRegionBadge(rw, rh)); msgs.scrollTop = msgs.scrollHeight; }
  }
}

