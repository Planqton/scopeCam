// ═══════════════════════════════════════════════════════════════════════════════
// TASTATURKÜRZEL
// ═══════════════════════════════════════════════════════════════════════════════

document.addEventListener('keydown', e => {
  // Escape: Werkzeug deaktivieren
  if (e.key === 'Escape') {
    if (canvas.getActiveObject()?.isEditing) return;
    canvas.discardActiveObject();
    canvas.renderAll();
    activateTool('select');
    return;
  }

  // Kein Shortcut in Eingabefeldern
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (matchSC(e, 'scale_prop')) { _aspectLocked = !_aspectLocked; _applyAspectLock(); setStatus(_aspectLocked ? '🔒 Proportionen gesperrt' : '🔓 Proportionen frei'); return; }

  if (matchSC(e, 'save_as'))    { e.preventDefault(); saveProjectAs(); return; }
  if (matchSC(e, 'save'))       { e.preventDefault(); saveProject(); return; }
  if (matchSC(e, 'open_file'))  { e.preventDefault(); openFileManager('open'); return; }
  if (matchSC(e, 'undo'))       { document.getElementById('undoBtn').click(); return; }
  if (matchSC(e, 'redo'))       { document.getElementById('redoBtn').click(); return; }
  if (matchSC(e, 'unlink'))     { document.getElementById('unlinkBtn').click(); return; }
  if (matchSC(e, 'link'))       { document.getElementById('linkBtn').click(); return; }
  if (matchSC(e, 'delete_obj') || e.key === 'Backspace') { document.getElementById('deleteBtn').click(); return; }

  // Pfeilpfeile: selektierte Objekte verschieben
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
    const objs = canvas.getActiveObjects();
    if (!objs.length) return;
    e.preventDefault();
    const step = (e.shiftKey ? 10 : 1) * (_arrowStep());
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;
    objs.forEach(o => { o.set({ left: o.left + dx, top: o.top + dy }); o.setCoords(); });
    canvas.renderAll();
    _nextLabel = 'Verschoben';
    saveHistory();
    updatePropsPanel();
    return;
  }

  const toolMap = {
    tool_select: 'select', tool_hand: 'hand', tool_line: 'line', tool_arrow: 'arrow',
    tool_dimension: 'dimension', tool_rect: 'rect', tool_circle: 'circle',
    tool_text: 'text', tool_freehand: 'freehand',
    tool_polyline: 'polyline',
  };
  for (const [scId, tool] of Object.entries(toolMap)) {
    if (matchSC(e, scId)) { document.querySelector(`[data-tool="${tool}"]`)?.click(); return; }
  }

  // Copy / Paste / Duplicate
  if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key === 'c') { copySelected(); return; }
  if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key === 'v') { pasteClipboard(); return; }
  if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key === 'd') { e.preventDefault(); duplicateSelected(); return; }

  // Polyline: Enter zum Abschließen
  if (e.key === 'Enter' && currentTool === 'polyline') { _polyFinish(); return; }
});


// Ctrl+A im Objekt-Manager: alle nicht-gesperrten Objekte auswählen,
// wenn der Fokus irgendwo innerhalb des Objekte-Panels liegt
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey && e.key === 'a')) return;
  const layersPanel = document.querySelector('[data-panel="layers"]');
  if (!layersPanel || !layersPanel.contains(document.activeElement)) return;
  e.preventDefault();
  const objs = canvas.getObjects().filter(o => !o.locked);
  if (!objs.length) return;
  activateTool('select');
  canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas }));
  canvas.renderAll();
}, true); // capture phase — fires before Fabric

