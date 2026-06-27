// ═══════════════════════════════════════════════════════════════════════════════
// CANVAS-LAYOUT & LINEALE
// ═══════════════════════════════════════════════════════════════════════════════

function syncCanvasSize() {
  const w = videoCanvas.offsetWidth, h = videoCanvas.offsetHeight;
  if (w > 0 && h > 0) {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.setWidth(w);
      canvas.setHeight(h);
      canvas.renderAll();
    }
    const { ox, oy } = getImgOffset();
    if (canvas.wrapperEl) {
      canvas.wrapperEl.style.position = 'absolute';
      canvas.wrapperEl.style.left     = ox + 'px';
      canvas.wrapperEl.style.top      = oy + 'px';
      canvas.wrapperEl.style.width    = w  + 'px';
      canvas.wrapperEl.style.height   = h  + 'px';
    }
  }
  drawRulers();
}

window.addEventListener('resize', syncCanvasSize);
new ResizeObserver(syncCanvasSize).observe(videoCanvas);

// ── Canvas-Kontextmenü ────────────────────────────────────────────────────
document.getElementById('canvasWrapper').addEventListener('contextmenu', e => {
  e.preventDefault();
  const target = canvas.findTarget(e);
  if (!target) return;

  // Sicherstellen dass das Objekt ausgewählt ist
  if (!canvas.getActiveObjects().includes(target)) {
    canvas.setActiveObject(target);
    canvas.renderAll();
  }

  const active = canvas.getActiveObjects();
  const isMulti = active.length > 1;
  const obj = isMulti ? null : target;

  const orderItems = obj ? [
    { label: '▲▲ Ganz nach vorne', action: () => { canvas.bringToFront(obj); canvas.renderAll(); _nextLabel='Reihenfolge'; saveHistory(); refreshLayersList(); } },
    { label: '▲  Eine Ebene vor',  action: () => { canvas.bringForward(obj); canvas.renderAll(); _nextLabel='Reihenfolge'; saveHistory(); refreshLayersList(); } },
    { label: '▼  Eine Ebene zurück',action: () => { canvas.sendBackwards(obj); canvas.renderAll(); _nextLabel='Reihenfolge'; saveHistory(); refreshLayersList(); } },
    { label: '▼▼ Ganz nach hinten', action: () => { canvas.sendToBack(obj);  canvas.renderAll(); _nextLabel='Reihenfolge'; saveHistory(); refreshLayersList(); } },
    '-',
  ] : [];

  const linked = active.filter(o => o.linkGroup);
  const linkItems = active.length >= 2 ? [
    { label: '⛓ Verknüpfen',          action: () => linkSelectedObjects() },
  ] : [];
  const unlinkItems = linked.length > 0 ? [
    { label: '⛓ Verknüpfung aufheben', action: () => {
      const ids = new Set(linked.map(o => o.linkGroup));
      ids.forEach(id => unlinkObjects(getLinkGroupMembers(id)));
    }},
  ] : [];

  const visItem = obj
    ? { label: obj.objVisible === false ? '👁 Anzeigen' : '🚫 Verstecken', action: () => setObjectVisible(obj, obj.objVisible === false) }
    : null;

  // target = direkt angeklicktes Objekt — auch bei Link-Gruppe (isMulti=true, obj=null)
  const isText = target?.type === 'i-text' || target?.type === 'text';
  const editTextItem = isText
    ? { label: '✏️ Label bearbeiten', action: () => {
        if (currentTool !== 'select') activateTool('select');
        // Link-Gruppen-Expansion unterdrücken, nur Text-Objekt auswählen
        _suppressLinkExpand = true;
        canvas.setActiveObject(target);
        canvas.renderAll();
        _suppressLinkExpand = false;
        requestAnimationFrame(() => {
          target.enterEditing();
          target.selectAll();
          canvas.renderAll();
        });
      }}
    : null;

  showCtxMenu(e, [
    ...(editTextItem ? [editTextItem, '-'] : []),
    ...orderItems,
    ...linkItems,
    ...unlinkItems,
    ...(linkItems.length || unlinkItems.length ? ['-'] : []),
    ...(visItem ? [visItem] : []),
    { label: obj?.locked ? '🔓 Entsperren' : '🔒 Sperren', action: () => {
      const targets = obj ? [obj] : active;
      targets.forEach(o => {
        o.locked = !o.locked;
        o.selectable = !o.locked;
        o.evented    = !o.locked;
      });
      canvas.discardActiveObject(); canvas.renderAll(); saveHistory(); refreshLayersList();
    }},
    { label: obj?.lockPosition ? '📍 Position freigeben' : '📍 Position sperren', action: () => {
      const targets = obj ? [obj] : active;
      targets.forEach(o => { o.lockPosition = !o.lockPosition; _applyObjLocks(o); });
      canvas.renderAll(); saveHistory(); refreshLayersList();
    }},
    { label: obj?.lockSize ? '🔲 Größe freigeben' : '🔲 Größe sperren', action: () => {
      const targets = obj ? [obj] : active;
      targets.forEach(o => { o.lockSize = !o.lockSize; _applyObjLocks(o); });
      canvas.renderAll(); saveHistory(); refreshLayersList();
    }},
    '-',
    { label: '🗑 Löschen', action: () => {
      active.forEach(o => canvas.remove(o));
      canvas.discardActiveObject(); canvas.renderAll(); saveHistory();
    }},
  ]);
});

document.getElementById('canvasWrapper').addEventListener('mousemove', e => {
  const rect = e.currentTarget.getBoundingClientRect();
  const { ox, oy } = getImgOffset();
  const Z = zoomLevel;
  drawRulers((e.clientX - rect.left) / Z - ox, (e.clientY - rect.top) / Z - oy);
});
document.getElementById('canvasWrapper').addEventListener('mouseleave', () => drawRulers());


