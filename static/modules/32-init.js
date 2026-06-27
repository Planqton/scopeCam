// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// Stellt gespeicherte Tabs und den aktiven Tab wieder her.
// ═══════════════════════════════════════════════════════════════════════════════

async function init() {
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
  settings  = await res.json();
  updateScaleStatus();

  // Tabs aus localStorage laden oder Ersttab erstellen
  if (!loadTabsFromStorage()) {
    const defaultTab = createTab('Kamera');
    activeTabId      = defaultTab.id;
    saveTabs();
  }
  renderTabBar();

  // Aktiven Tab wiederherstellen
  const tab = tabById(activeTabId);
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
  if (kiRegionRect) {
    const { rw, rh } = kiRegionRect;
    document.getElementById('kiRegionStatus').textContent = `⊡ ${Math.round(rw)}×${Math.round(rh)}px (live)`;
    const msgs = document.getElementById('kiMessages');
    if (msgs) { msgs.appendChild(createRegionBadge(rw, rh)); msgs.scrollTop = msgs.scrollHeight; }
  }
}

