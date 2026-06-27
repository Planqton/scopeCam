// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// EBENEN-MANAGER
// Logische Ebenen für Objekte: jede Ebene kann sichtbar/unsichtbar geschaltet
// werden. Objekte haben eine layerId (custom prop) und eine individuelle
// objVisible-Flag (custom prop). Echte Canvas-Sichtbarkeit = layer.visible && objVisible.
// ═══════════════════════════════════════════════════════════════════════════════

let layers = []; // Aktive Ebenen des offenen Tabs

function ensureLayers() {
  if (!Array.isArray(layers)) layers = [];
  const def = layers.find(l => l.id === 'default');
  if (!def) {
    layers.unshift({ id: 'default', name: 'Ebene 1', visible: true, collapsed: false });
  } else if (def.name === 'Standard') {
    def.name = 'Ebene 1'; // Migration alter Zustand
  }
}

function saveCurrentTabLayers() {
  const tab = tabById(activeTabId);
  if (tab) { tab.layers = JSON.parse(JSON.stringify(layers)); saveTabs(); }
}

function loadLayersFromTab(tab) {
  layers = (tab?.layers && tab.layers.length > 0) ? JSON.parse(JSON.stringify(tab.layers)) : [];
  ensureLayers();
}

function createLayer(name) {
  ensureLayers();
  const lname = name || ('Ebene ' + layers.length);
  const layer = { id: 'layer_' + Date.now(), name: lname, visible: true, collapsed: false };
  layers.push(layer);
  saveCurrentTabLayers();
  _nextLabel = `Ebene "${lname}" erstellt`;
  saveHistory();
  refreshLayersList();
  return layer;
}

function deleteLayer(layerId) {
  if (layerId === 'default') return;
  if (layers.length <= 1) return;
  const lname = layers.find(l => l.id === layerId)?.name || layerId;
  canvas.getObjects().forEach(obj => { if ((obj.layerId || 'default') === layerId) obj.layerId = 'default'; });
  layers = layers.filter(l => l.id !== layerId);
  ensureLayers();
  saveCurrentTabLayers();
  _nextLabel = `Ebene "${lname}" gelöscht`;
  saveHistory();
  refreshLayersList();
}

function setLayerVisible(layerId, visible) {
  const layer = layers.find(l => l.id === layerId);
  if (!layer) return;
  layer.visible = visible;
  canvas.getObjects().forEach(obj => {
    if ((obj.layerId || 'default') === layerId) {
      obj.visible    = visible && (obj.objVisible !== false);
      obj.selectable = obj.visible && !obj.locked && currentTool === 'select';
      obj.evented    = obj.selectable;
    }
  });
  canvas.renderAll();
  saveCurrentTabLayers();
  refreshLayersList();
}

function setObjectVisible(obj, visible) {
  obj.objVisible     = visible;
  const layer        = layers.find(l => l.id === (obj.layerId || 'default'));
  const layerVisible = layer ? layer.visible : true;
  obj.visible        = layerVisible && visible;
  obj.selectable     = obj.visible && !obj.locked && currentTool === 'select';
  obj.evented        = obj.selectable;
  if (!obj.visible && canvas.getActiveObjects().includes(obj)) {
    canvas.discardActiveObject();
  }
  canvas.renderAll();
  saveHistory();
  refreshLayersList();
}

function moveObjectToLayer(obj, layerId) {
  obj.layerId = layerId;
  const layer        = layers.find(l => l.id === layerId);
  const layerVisible = layer ? layer.visible : true;
  obj.visible        = layerVisible && (obj.objVisible !== false);
  obj.selectable     = obj.visible && !obj.locked && currentTool === 'select';
  obj.evented        = obj.selectable;
  canvas.renderAll();
  saveHistory();
  refreshLayersList();
}

document.getElementById('newLayerBtn').addEventListener('click', () => createLayer());

// ─── Kontext-Menü ────────────────────────────────────────────────────────────

let ctxMenuEl = null;

function hideCtxMenu() {
  if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; }
}

function showCtxMenu(e, items) {
  hideCtxMenu();
  e.preventDefault();
  e.stopPropagation();

  const menu = document.createElement('div');
  menu.id = 'ctxMenu';

  items.forEach(item => {
    if (item === '-') {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.appendChild(sep);
      return;
    }
    const el = document.createElement('div');
    el.className = 'ctx-item' + (item.disabled ? ' ctx-disabled' : '');
    el.textContent = item.label;
    if (!item.disabled && item.action) {
      el.addEventListener('mousedown', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        hideCtxMenu();
        item.action();
      });
    }
    menu.appendChild(el);
  });

  menu.style.left = e.clientX + 'px';
  menu.style.top  = e.clientY + 'px';
  document.body.appendChild(menu);
  ctxMenuEl = menu;

  // Im Viewport halten
  const r = menu.getBoundingClientRect();
  if (r.right  > window.innerWidth)  menu.style.left = (e.clientX - r.width)  + 'px';
  if (r.bottom > window.innerHeight) menu.style.top  = (e.clientY - r.height) + 'px';

  requestAnimationFrame(() => {
    document.addEventListener('mousedown', hideCtxMenu, { once: true });
    document.addEventListener('keydown',   ev => { if (ev.key === 'Escape') hideCtxMenu(); }, { once: true });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// OBJEKT-MANAGER (Ebenen-Panel)
// ═══════════════════════════════════════════════════════════════════════════════

const TYPE_LABELS = {
  'i-text': 'Text', line: 'Linie', rect: 'Rechteck', ellipse: 'Ellipse',
  group: 'Gruppe', path: 'Freihand', triangle: 'Dreieck',
};

function getObjLabel(obj)     { return obj.customName || TYPE_LABELS[obj.type] || 'Objekt'; }
function getObjTypeBadge(obj) { return TYPE_LABELS[obj.type] || obj.type || '?'; }

function makeObjNameEditor(nameEl, obj) {
  const input     = document.createElement('input');
  input.type      = 'text';
  input.value     = obj.customName || '';
  input.className = 'layer-name-input';
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    obj.customName     = input.value.trim();
    nameEl.textContent = getObjLabel(obj);
    input.replaceWith(nameEl);
    saveHistory();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e2 => {
    if (e2.key === 'Enter')  commit();
    if (e2.key === 'Escape') input.replaceWith(nameEl);
  });
}

function makeLayerNameEditor(nameEl, layer) {
  const input     = document.createElement('input');
  input.type      = 'text';
  input.value     = layer.name;
  input.className = 'layer-name-input';
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    layer.name         = input.value.trim() || layer.name;
    nameEl.textContent = layer.name;
    input.replaceWith(nameEl);
    saveCurrentTabLayers();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e2 => {
    if (e2.key === 'Enter')  commit();
    if (e2.key === 'Escape') input.replaceWith(nameEl);
  });
}

function refreshLayersList() {
  ensureLayers();
  const list    = document.getElementById('layersList');
  const objects = canvas.getObjects();
  const active  = new Set(canvas.getActiveObjects());
  list.innerHTML = '';

  // Objekte nach Ebene gruppieren
  const byLayer = {};
  layers.forEach(l => (byLayer[l.id] = []));
  objects.forEach(obj => {
    const lid = obj.layerId || 'default';
    if (!byLayer[lid]) byLayer[lid] = [];
    byLayer[lid].push(obj);
  });

  layers.forEach(layer => {
    const layerObjs = (byLayer[layer.id] || []).slice().reverse(); // oberster zuerst

    // ── Ebenen-Header ───────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'layer-group-header' + (layer.visible ? '' : ' lgh-hidden');

    const arrow       = document.createElement('span');
    arrow.className   = 'lgh-arrow';
    arrow.textContent = layer.collapsed ? '▶' : '▼';

    const nameEl       = document.createElement('span');
    nameEl.className   = 'lgh-name';
    nameEl.textContent = layer.name;
    nameEl.title       = 'Doppelklick: Umbenennen';
    nameEl.addEventListener('dblclick', e => { e.stopPropagation(); makeLayerNameEditor(nameEl, layer); });

    const visBtn       = document.createElement('button');
    visBtn.className   = 'lgh-vis' + (layer.visible ? '' : ' lgh-vis-off');
    visBtn.title       = layer.visible ? 'Ebene verstecken' : 'Ebene anzeigen';
    visBtn.textContent = layer.visible ? '👁' : '🚫';
    visBtn.addEventListener('click', e => { e.stopPropagation(); setLayerVisible(layer.id, !layer.visible); });

    const content = document.createElement('div');
    content.className    = 'layer-group-content';
    content.style.display = layer.collapsed ? 'none' : '';

    header.addEventListener('click', () => {
      layer.collapsed       = !layer.collapsed;
      arrow.textContent     = layer.collapsed ? '▶' : '▼';
      content.style.display = layer.collapsed ? 'none' : '';
      saveCurrentTabLayers();
    });

    header.addEventListener('contextmenu', e => {
      showCtxMenu(e, [
        { label: '✎ Umbenennen',            action: () => makeLayerNameEditor(nameEl, layer) },
        { label: layer.visible ? '🚫 Verstecken' : '👁 Anzeigen',
                                             action: () => setLayerVisible(layer.id, !layer.visible) },
        '-',
        { label: '+ Neue Ebene',            action: () => createLayer() },
        '-',
        { label: '🗑 Ebene löschen', disabled: layer.id === 'default' || layers.length <= 1,
                                             action: () => deleteLayer(layer.id) },
      ]);
    });

    header.append(arrow, nameEl, visBtn);
    list.appendChild(header);

    // ── Objekte in dieser Ebene ──────────────────────────────────
    layerObjs.forEach(obj => {
      const idx  = objects.indexOf(obj);
      const isHidden = obj.objVisible === false;
      const item = document.createElement('div');
      item.className = 'layer-item'
        + (active.has(obj) ? ' layer-selected' : '')
        + (isHidden        ? ' layer-item-dimmed' : '');
      item.tabIndex = -1;
      item.addEventListener('mouseenter', () => _flashObject(obj, true));
      item.addEventListener('mouseleave', () => _flashObject(obj, false));

      const lockBtn       = document.createElement('button');
      lockBtn.className   = 'layer-btn' + (obj.locked ? ' locked' : '');
      lockBtn.title       = obj.locked ? 'Entsperren' : 'Sperren';
      lockBtn.textContent = obj.locked ? '🔒' : '○';
      lockBtn.addEventListener('click', e => {
        e.stopPropagation();
        obj.locked     = !obj.locked;
        obj.selectable = !obj.locked && obj.visible && currentTool === 'select';
        obj.evented    = obj.selectable;
        canvas.discardActiveObject();
        canvas.renderAll();
        saveHistory();
        refreshLayersList();
      });

      const lockPosBtn       = document.createElement('button');
      lockPosBtn.className   = 'layer-btn' + (obj.lockPosition ? ' locked' : '');
      lockPosBtn.title       = obj.lockPosition ? 'Position freigeben' : 'Position sperren';
      lockPosBtn.textContent = '📍';
      lockPosBtn.style.opacity = obj.lockPosition ? '1' : '0.3';
      lockPosBtn.addEventListener('click', e => {
        e.stopPropagation();
        obj.lockPosition = !obj.lockPosition;
        _applyObjLocks(obj);
        canvas.renderAll();
        saveHistory();
        refreshLayersList();
      });

      const lockSizeBtn       = document.createElement('button');
      lockSizeBtn.className   = 'layer-btn' + (obj.lockSize ? ' locked' : '');
      lockSizeBtn.title       = obj.lockSize ? 'Größe freigeben' : 'Größe sperren';
      lockSizeBtn.textContent = '🔲';
      lockSizeBtn.style.opacity = obj.lockSize ? '1' : '0.3';
      lockSizeBtn.addEventListener('click', e => {
        e.stopPropagation();
        obj.lockSize = !obj.lockSize;
        _applyObjLocks(obj);
        canvas.renderAll();
        saveHistory();
        refreshLayersList();
      });

      const objNameEl       = document.createElement('span');
      objNameEl.className   = 'layer-name';
      objNameEl.textContent = getObjLabel(obj);
      objNameEl.title       = 'Doppelklick: Umbenennen';
      objNameEl.addEventListener('dblclick', e => { e.stopPropagation(); makeObjNameEditor(objNameEl, obj); });

      const typeBadge       = document.createElement('span');
      typeBadge.className   = 'layer-type';
      typeBadge.textContent = getObjTypeBadge(obj);

      const upBtn       = document.createElement('button');
      upBtn.className   = 'layer-btn';
      upBtn.title       = 'Nach oben';
      upBtn.textContent = '↑';
      upBtn.disabled    = idx === objects.length - 1;
      upBtn.addEventListener('click', e => {
        e.stopPropagation();
        canvas.bringForward(obj);
        canvas.renderAll();
        refreshLayersList();
      });

      const downBtn       = document.createElement('button');
      downBtn.className   = 'layer-btn';
      downBtn.title       = 'Nach unten';
      downBtn.textContent = '↓';
      downBtn.disabled    = idx === 0;
      downBtn.addEventListener('click', e => {
        e.stopPropagation();
        canvas.sendBackwards(obj);
        canvas.renderAll();
        refreshLayersList();
      });

      const visObjBtn       = document.createElement('button');
      visObjBtn.className   = 'layer-btn obj-vis-btn' + (isHidden ? ' vis-off' : '');
      visObjBtn.title       = isHidden ? 'Anzeigen' : 'Verstecken';
      visObjBtn.textContent = isHidden ? '🚫' : '👁';
      visObjBtn.addEventListener('click', e => {
        e.stopPropagation();
        setObjectVisible(obj, isHidden); // toggle: wenn hidden → show, sonst hide
      });

      // Kettensymbol wenn verknüpft
      if (obj.linkGroup) {
        const linkBadge       = document.createElement('span');
        linkBadge.className   = 'layer-link-badge';
        linkBadge.textContent = '⛓';
        linkBadge.title       = 'Verknüpft (ID: ' + obj.linkGroup.slice(0,6) + '…)';
        objNameEl.prepend(linkBadge);
      }

      // Objekt-Manager-Klick: wählt NUR dieses Objekt (kein Gruppenexpand)
      item.addEventListener('click', () => {
        if (obj.locked || !obj.visible) return;
        if (currentTool !== 'select') document.querySelector('[data-tool="select"]')?.click();
        _suppressLinkExpand = true;
        canvas.setActiveObject(obj);
        canvas.renderAll();
        _suppressLinkExpand = false;
        updatePropsPanel();
        refreshLayersList();
      });

      item.addEventListener('contextmenu', e => {
        const otherLayers = layers.filter(l => l.id !== (obj.layerId || 'default'));
        const moveItems   = otherLayers.length > 0
          ? ['-', ...otherLayers.map(l => ({ label: '📁 → ' + l.name, action: () => moveObjectToLayer(obj, l.id) }))]
          : [];
        const linkItems = obj.linkGroup
          ? ['-', { label: '⛓ Verknüpfung aufheben', action: () => unlinkObjects(getLinkGroupMembers(obj.linkGroup)) }]
          : [];
        showCtxMenu(e, [
          { label: '✎ Umbenennen', action: () => makeObjNameEditor(objNameEl, obj) },
          { label: isHidden ? '👁 Anzeigen' : '🚫 Verstecken', action: () => setObjectVisible(obj, isHidden) },
          ...linkItems,
          ...moveItems,
          '-',
          { label: '🗑 Löschen', action: () => { canvas.remove(obj); canvas.renderAll(); _nextLabel='Gelöscht'; saveHistory(); } },
        ]);
      });

      item.append(lockBtn, lockPosBtn, lockSizeBtn, objNameEl, typeBadge, upBtn, downBtn, visObjBtn);
      content.appendChild(item);
    });

    if (layerObjs.length === 0 && !layer.collapsed) {
      const empty       = document.createElement('div');
      empty.className   = 'layer-empty-hint';
      empty.textContent = 'Leer';
      content.appendChild(empty);
    }

    list.appendChild(content);
  });

  // Button: Neue Ebene
  const addBtn       = document.createElement('div');
  addBtn.className   = 'layer-add-btn';
  addBtn.textContent = '+ Neue Ebene';
  addBtn.addEventListener('click', () => createLayer());
  list.appendChild(addBtn);

  // ── Hilfslinien-Sektion ──────────────────────────────────────────────────────
  const allGuides = [
    ...guideLines.h.map((pos, i) => ({ axis: 'h', idx: i, pos })),
    ...guideLines.v.map((pos, i) => ({ axis: 'v', idx: i, pos })),
  ];

  const guidesSep = document.createElement('div');
  guidesSep.className = 'guides-list-sep';
  guidesSep.style.cursor = 'pointer';
  guidesSep.style.userSelect = 'none';
  const guideArrow = document.createElement('span');
  guideArrow.style.cssText = 'margin-right:4px;font-size:10px;display:inline-block;width:10px';
  guideArrow.textContent = _guidesCollapsed ? '▶' : '▼';
  const guideBadge = document.createElement('span');
  guideBadge.style.cssText = 'margin-left:4px;opacity:.55;font-size:10px';
  if (allGuides.length) guideBadge.textContent = `(${allGuides.length})`;
  guidesSep.appendChild(guideArrow);
  guidesSep.appendChild(document.createTextNode('Hilfslinien'));
  guidesSep.appendChild(guideBadge);
  guidesSep.addEventListener('click', () => {
    _guidesCollapsed = !_guidesCollapsed;
    _saveGuidesCollapsed();
    refreshLayersList();
  });
  list.appendChild(guidesSep);

  if (!_guidesCollapsed) {
  if (allGuides.length === 0) {
    const hint = document.createElement('div');
    hint.className   = 'layer-empty-hint';
    hint.textContent = 'Keine — aus Lineal ziehen';
    list.appendChild(hint);
  } else {
    allGuides.forEach(({ axis, idx, pos }) => {
      const item = document.createElement('div');
      item.className = 'layer-item guide-list-item';

      const delBtn = document.createElement('button');
      delBtn.className   = 'layer-btn';
      delBtn.title       = 'Löschen';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        guideLines[axis].splice(idx, 1);
        saveGuides(); drawGuides(); refreshLayersList();
      });

      const label = document.createElement('span');
      label.className   = 'layer-name';
      label.textContent = (axis === 'h' ? 'H: ' : 'V: ') + Math.round(pos) + ' px';

      const typeBadge = document.createElement('span');
      typeBadge.className   = 'layer-type';
      typeBadge.textContent = axis === 'h' ? '—' : '|';
      typeBadge.style.color = '#1bc9e9';

      // Kurz aufleuchten wenn angeklickt
      item.addEventListener('click', () => {
        _flashGuide(axis, idx);
      });

      item.append(delBtn, label, typeBadge);
      list.appendChild(item);
    });
  }
  } // end if (!_guidesCollapsed)
}

canvas.on('object:added', e => {
  const o = e.target;
  if (!o.objId) o.objId = crypto.randomUUID();
  // Auswahl nur mit Auswahl-Werkzeug erlauben
  const isSelect = currentTool === 'select';
  if (!isSelect) { o.selectable = false; o.evented = false; }
  refreshLayersList();
});
canvas.on('object:removed', refreshLayersList);


