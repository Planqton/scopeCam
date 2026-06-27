import { S } from './00-state.js';
import { getImgOffset } from './22-rulers.js';
import { setObjectVisible } from './13-layers.js';
import { getLinkGroupMembers, linkSelectedObjects, unlinkObjects } from './12-props-panel.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CANVAS-LAYOUT & LINEALE
// ═══════════════════════════════════════════════════════════════════════════════

export function syncCanvasSize() {
  const w = S.videoCanvas.offsetWidth, h = S.videoCanvas.offsetHeight;
  if (w > 0 && h > 0) {
    if (S.canvas.width !== w || S.canvas.height !== h) {
      S.canvas.setWidth(w);
      S.canvas.setHeight(h);
      S.canvas.renderAll();
    }
    const { ox, oy } = getImgOffset();
    if (S.canvas.wrapperEl) {
      S.canvas.wrapperEl.style.position = 'absolute';
      S.canvas.wrapperEl.style.left     = ox + 'px';
      S.canvas.wrapperEl.style.top      = oy + 'px';
      S.canvas.wrapperEl.style.width    = w  + 'px';
      S.canvas.wrapperEl.style.height   = h  + 'px';
    }
  }
  drawRulers();
}

window.addEventListener('resize', syncCanvasSize);
new ResizeObserver(syncCanvasSize).observe(S.videoCanvas);

// ── Canvas-Kontextmenü ────────────────────────────────────────────────────
document.getElementById('canvasWrapper').addEventListener('contextmenu', e => {
  e.preventDefault();
  const target = S.canvas.findTarget(e);
  if (!target) return;

  // Sicherstellen dass das Objekt ausgewählt ist
  if (!S.canvas.getActiveObjects().includes(target)) {
    S.canvas.setActiveObject(target);
    S.canvas.renderAll();
  }

  const active = S.canvas.getActiveObjects();
  const isMulti = active.length > 1;
  const obj = isMulti ? null : target;

  const orderItems = obj ? [
    { label: '▲▲ Ganz nach vorne', action: () => { S.canvas.bringObjectToFront(obj); S.canvas.renderAll(); S._nextLabel='Reihenfolge'; saveHistory(); refreshLayersList(); } },
    { label: '▲  Eine Ebene vor',  action: () => { S.canvas.bringObjectForward(obj); S.canvas.renderAll(); S._nextLabel='Reihenfolge'; saveHistory(); refreshLayersList(); } },
    { label: '▼  Eine Ebene zurück',action: () => { S.canvas.sendObjectBackwards(obj); S.canvas.renderAll(); S._nextLabel='Reihenfolge'; saveHistory(); refreshLayersList(); } },
    { label: '▼▼ Ganz nach hinten', action: () => { S.canvas.sendObjectToBack(obj);  S.canvas.renderAll(); S._nextLabel='Reihenfolge'; saveHistory(); refreshLayersList(); } },
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
        if (S.currentTool !== 'select') activateTool('select');
        // Link-Gruppen-Expansion unterdrücken, nur Text-Objekt auswählen
        S._suppressLinkExpand = true;
        S.canvas.setActiveObject(target);
        S.canvas.renderAll();
        S._suppressLinkExpand = false;
        requestAnimationFrame(() => {
          target.enterEditing();
          target.selectAll();
          S.canvas.renderAll();
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
      S.canvas.discardActiveObject(); S.canvas.renderAll(); saveHistory(); refreshLayersList();
    }},
    { label: obj?.lockPosition ? '📍 Position freigeben' : '📍 Position sperren', action: () => {
      const targets = obj ? [obj] : active;
      targets.forEach(o => { o.lockPosition = !o.lockPosition; _applyObjLocks(o); });
      S.canvas.renderAll(); saveHistory(); refreshLayersList();
    }},
    { label: obj?.lockSize ? '🔲 Größe freigeben' : '🔲 Größe sperren', action: () => {
      const targets = obj ? [obj] : active;
      targets.forEach(o => { o.lockSize = !o.lockSize; _applyObjLocks(o); });
      S.canvas.renderAll(); saveHistory(); refreshLayersList();
    }},
    '-',
    { label: '🗑 Löschen', action: () => {
      active.forEach(o => S.canvas.remove(o));
      S.canvas.discardActiveObject(); S.canvas.renderAll(); saveHistory();
    }},
  ]);
});

document.getElementById('canvasWrapper').addEventListener('mousemove', e => {
  const rect = e.currentTarget.getBoundingClientRect();
  const { ox, oy } = getImgOffset();
  const Z = S.zoomLevel;
  drawRulers((e.clientX - rect.left) / Z - ox, (e.clientY - rect.top) / Z - oy);
});
document.getElementById('canvasWrapper').addEventListener('mouseleave', () => drawRulers());


