// ═══════════════════════════════════════════════════════════════════════════════
// KONSOLE PANEL
// ═══════════════════════════════════════════════════════════════════════════════

(function initConsole() {

const _CON_OUT  = document.getElementById('consoleOutput');
const _CON_IN   = document.getElementById('consoleInput');
let   _conHist  = [];
let   _conHistIdx = -1;

function _conLine(text, cls) {
  const el = document.createElement('div');
  el.className = 'con-line con-' + cls;
  el.textContent = text;
  _CON_OUT.appendChild(el);
  _CON_OUT.scrollTop = _CON_OUT.scrollHeight;
  return el;
}
function _conHTML(html, cls) {
  const el = document.createElement('div');
  el.className = 'con-line con-' + cls;
  el.innerHTML = html;
  _CON_OUT.appendChild(el);
  _CON_OUT.scrollTop = _CON_OUT.scrollHeight;
}

function _cInfo (t) { _conLine(t, 'info'); }
function _cOk   (t) { _conLine(t, 'ok'); }
function _cWarn (t) { _conLine(t, 'warn'); }
function _cErr  (t) { _conLine(t, 'err'); }
function _cEcho (t) { _conLine('> ' + t, 'echo'); }
function _cTable(rows) {
  if (!rows.length) { _cInfo('(leer)'); return; }
  const keys = Object.keys(rows[0]);
  const cols  = keys.map(k => Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)));
  const hdr   = keys.map((k, i) => k.padEnd(cols[i])).join('  ');
  const sep   = cols.map(n => '─'.repeat(n)).join('──');
  _conLine(hdr, 'table-hdr');
  _conLine(sep, 'table-sep');
  rows.forEach(r => _conLine(keys.map((k, i) => String(r[k] ?? '').padEnd(cols[i])).join('  '), 'table-row'));
}

// ── Befehle ──────────────────────────────────────────────────────────────────

const CMDS = {};

function cmd(names, usage, desc, fn) {
  (Array.isArray(names) ? names : [names]).forEach(n => { CMDS[n] = { usage, desc, fn }; });
}

// --- HILFE ---
cmd('help', 'help [befehl]', 'Zeigt alle Befehle oder Hilfe für einen Befehl', (args) => {
  if (args[0] && CMDS[args[0]]) {
    const c = CMDS[args[0]];
    _cInfo('Syntax:  ' + c.usage);
    _cInfo('Beschr.: ' + c.desc);
    return;
  }
  const cats = [
    { name: '📋 Objekte',  cmds: ['list','info','select','deselect','delete','deleteAll','rename','move','scale','rotate','color','opacity','lock','unlock','hide','show','bringFwd','sendBwd','bringTop','sendBottom','duplicate','group','ungroup'] },
    { name: '📐 Messen',   cmds: ['measure','bbox','area','count','traceLen'] },
    { name: '🔧 Werkzeug', cmds: ['tool','activeTool'] },
    { name: '👁 Ansicht',  cmds: ['zoom','fit','center','pan','zoomSel'] },
    { name: '📏 Hilfslin', cmds: ['guide','guides','clearGuides'] },
    { name: '⬛ Raster',   cmds: ['grid','gridSize','gridOrigin','snap'] },
    { name: '📷 Kamera',   cmds: ['device','freeze','quality','fps'] },
    { name: '📁 Datei',    cmds: ['save','saveAs','export','layers','layer','deleteLayer'] },
    { name: '↩ History',   cmds: ['undo','redo','history','clearHistory'] },
    { name: '🤖 KI',       cmds: ['ki','clearKi','action','create','setProps','linkIds','moveToLayer','actions'] },
    { name: '🖥 System',   cmds: ['help','clear','echo','eval','log','status','settings','design','reload'] },
  ];
  cats.forEach(cat => {
    _conLine('', 'info');
    _conLine(cat.name, 'cat');
    cat.cmds.filter(n => CMDS[n]).forEach(n => {
      const c = CMDS[n];
      _conLine(`  ${n.padEnd(14)} ${c.desc}`, 'info');
    });
  });
  _conLine('', 'info');
  _cInfo('Tipp: help <befehl>  ·  Tab = Autocomplete  ·  ↑↓ = History');
});

// --- SYSTEM ---
cmd('clear', 'clear', 'Konsole leeren', () => { _CON_OUT.innerHTML = ''; });
cmd('echo',  'echo <text>', 'Text ausgeben', args => _cInfo(args.join(' ')));
cmd('status','status [text]','Statusleiste setzen oder lesen', args => {
  if (args.length) { setStatus(args.join(' ')); _cOk('Status gesetzt'); }
  else _cInfo(document.getElementById('statusAction')?.textContent || '(leer)');
});
cmd('reload','reload','Seite neu laden', () => location.reload());
cmd('log',   'log <text>','In das Log-Panel schreiben', args => { scopeLog(args.join(' ')); _cOk('OK'); });
cmd('settings','settings','Einstellungen öffnen', () => {
  document.getElementById('settingsOverlay')?.style.setProperty('display','flex');
  _cOk('Einstellungen geöffnet');
});
cmd('design', 'design <name>','Design wechseln (dark/light/midnight/carbon/solarized/nord)', args => {
  if (!args[0]) { _cInfo('Designs: dark, midnight, carbon, light, solarized, nord'); return; }
  applyDesign(args[0]);
  _cOk('Design: ' + args[0]);
});

// --- OBJEKTE ---
cmd('list', 'list [filter]', 'Alle Canvas-Objekte auflisten', args => {
  let objs = S.canvas.getObjects();
  if (args[0]) objs = objs.filter(o => (o.customName || o.type || '').toLowerCase().includes(args[0].toLowerCase()));
  if (!objs.length) { _cInfo('Keine Objekte'); return; }
  _cTable(objs.map((o, i) => ({
    '#': i,
    ID:   (o.objId || '—').slice(0, 8),
    Name: o.customName || '—',
    Typ:  o.type,
    X:    Math.round(o.left),
    Y:    Math.round(o.top),
    Grp:  o.linkGroup ? o.linkGroup.slice(0, 6) : '—',
  })));
  _cInfo(`${objs.length} Objekt(e)`);
});

cmd('info', 'info [name/#idx]', 'Details zu einem Objekt', args => {
  const obj = _conResolveObj(args[0]);
  if (!obj) return;
  const keys = [...Object.keys(obj.toObject()), ...CUSTOM_PROPS];
  const props = obj.toObject(CUSTOM_PROPS);
  const lines = [
    ['Typ', obj.type], ['X', Math.round(obj.left)], ['Y', Math.round(obj.top)],
    ['Breite', Math.round(obj.width)], ['Höhe', Math.round(obj.height)],
    ['Winkel', obj.angle?.toFixed(1) ?? 0],
    ['Farbe', obj.stroke || obj.fill || '—'],
    ['Sichtbar', obj.visible ? 'ja' : 'nein'],
    ['Gesperrt', obj.locked ? 'ja' : 'nein'],
    ['Ebene', obj.layerId || '—'],
    ['linkGroup', obj.linkGroup ? obj.linkGroup.slice(0,8) : '—'],
    ['objId', obj.objId ? obj.objId.slice(0,8) : '—'],
  ];
  lines.forEach(([k, v]) => _conLine(`  ${String(k).padEnd(12)} ${v}`, 'table-row'));
});

cmd('select', 'select <name/#idx>', 'Objekt auswählen', args => {
  const obj = _conResolveObj(args[0]);
  if (!obj) return;
  S.canvas.setActiveObject(obj);
  S.canvas.requestRenderAll();
  _cOk('Ausgewählt: ' + (obj.customName || obj.type));
});

cmd('deselect', 'deselect', 'Auswahl aufheben', () => {
  S.canvas.discardActiveObject(); S.canvas.requestRenderAll(); _cOk('Auswahl aufgehoben');
});

cmd('delete', 'delete <name/#idx>', 'Objekt löschen', args => {
  const obj = _conResolveObj(args[0]);
  if (!obj) return;
  const name = obj.customName || obj.type;
  S.canvas.remove(obj); S.canvas.requestRenderAll();
  S._nextLabel = 'Konsole: Löschen'; saveHistory(); refreshLayersList();
  _cOk('Gelöscht: ' + name);
});

cmd('deleteAll', 'deleteAll', 'Alle Objekte löschen', () => {
  S.canvas.clear(); S._nextLabel = 'Konsole: Alle löschen'; saveHistory(); refreshLayersList();
  _cOk('Canvas geleert');
});

cmd('rename', 'rename <name/#idx> <neuerName>', 'Objekt umbenennen', args => {
  const obj = _conResolveObj(args[0]);
  if (!obj) return;
  const old = obj.customName || obj.type;
  obj.customName = args.slice(1).join(' ');
  S.canvas.requestRenderAll(); refreshLayersList();
  _cOk(`"${old}" → "${obj.customName}"`);
});

cmd('move', 'move <name/#idx> <x> <y>', 'Objekt verschieben', args => {
  const obj = _conResolveObj(args[0]);
  if (!obj) return;
  const x = parseFloat(args[1]), y = parseFloat(args[2]);
  if (isNaN(x) || isNaN(y)) { _cErr('Ungültige Koordinaten'); return; }
  obj.set({ left: x, top: y }); obj.setCoords();
  S.canvas.requestRenderAll(); S._nextLabel = 'Konsole: Verschieben'; saveHistory();
  _cOk(`${obj.customName || obj.type} → (${x}, ${y})`);
});

cmd('scale', 'scale <name/#idx> <sx> [sy]', 'Objekt skalieren', args => {
  const obj = _conResolveObj(args[0]);
  if (!obj) return;
  const sx = parseFloat(args[1]), sy = parseFloat(args[2] ?? args[1]);
  if (isNaN(sx)) { _cErr('Ungültiger Wert'); return; }
  obj.set({ scaleX: sx, scaleY: sy }); obj.setCoords();
  S.canvas.requestRenderAll(); S._nextLabel = 'Konsole: Skalieren'; saveHistory();
  _cOk(`Skaliert: ${sx} × ${sy}`);
});

cmd('rotate', 'rotate <name/#idx> <grad>', 'Objekt drehen', args => {
  const obj = _conResolveObj(args[0]);
  if (!obj) return;
  const deg = parseFloat(args[1]);
  if (isNaN(deg)) { _cErr('Ungültiger Winkel'); return; }
  obj.set('angle', deg); obj.setCoords();
  S.canvas.requestRenderAll(); S._nextLabel = 'Konsole: Rotieren'; saveHistory();
  _cOk(`Winkel: ${deg}°`);
});

cmd('color', 'color <name/#idx> <farbe>', 'Farbe setzen', args => {
  const obj = _conResolveObj(args[0]);
  if (!obj) return;
  const c = args[1];
  if (!c) { _cErr('Farbe fehlt'); return; }
  if (obj.stroke) obj.set('stroke', c);
  if (obj.fill && obj.fill !== 'transparent') obj.set('fill', c);
  S.canvas.requestRenderAll(); S._nextLabel = 'Konsole: Farbe'; saveHistory();
  _cOk('Farbe: ' + c);
});

cmd('opacity', 'opacity <name/#idx> <0-1>', 'Deckkraft setzen', args => {
  const obj = _conResolveObj(args[0]);
  if (!obj) return;
  const v = parseFloat(args[1]);
  if (isNaN(v)) { _cErr('Wert 0.0–1.0'); return; }
  obj.set('opacity', Math.max(0, Math.min(1, v)));
  S.canvas.requestRenderAll(); saveHistory();
  _cOk('Deckkraft: ' + v);
});

cmd('lock',   'lock <name/#idx>',   'Objekt sperren',    args => { _conSetLock(args[0], true);  });
cmd('unlock', 'unlock <name/#idx>', 'Objekt entsperren', args => { _conSetLock(args[0], false); });
cmd('hide',   'hide <name/#idx>',   'Objekt verstecken', args => { _conSetVis(args[0], false); });
cmd('show',   'show <name/#idx>',   'Objekt anzeigen',   args => { _conSetVis(args[0], true);  });

function _conSetLock(ref, val) {
  const obj = _conResolveObj(ref); if (!obj) return;
  obj.locked = val; obj.selectable = !val; obj.evented = !val;
  S.canvas.requestRenderAll(); refreshLayersList();
  _cOk((val ? 'Gesperrt' : 'Entsperrt') + ': ' + (obj.customName || obj.type));
}
function _conSetVis(ref, val) {
  const obj = _conResolveObj(ref); if (!obj) return;
  obj.visible = val; obj.objVisible = val;
  S.canvas.requestRenderAll(); refreshLayersList();
  _cOk((val ? 'Sichtbar' : 'Versteckt') + ': ' + (obj.customName || obj.type));
}

cmd('bringFwd',    'bringFwd <name/#idx>',    'Eine Ebene nach vorne',   args => { const o = _conResolveObj(args[0]); if(o){S.canvas.bringObjectForward(o);S.canvas.requestRenderAll();refreshLayersList();_cOk('OK');} });
cmd('sendBwd',     'sendBwd <name/#idx>',     'Eine Ebene nach hinten',  args => { const o = _conResolveObj(args[0]); if(o){S.canvas.sendObjectBackwards(o);S.canvas.requestRenderAll();refreshLayersList();_cOk('OK');} });
cmd('bringTop',    'bringTop <name/#idx>',    'Ganz nach vorne',         args => { const o = _conResolveObj(args[0]); if(o){S.canvas.bringObjectToFront(o);S.canvas.requestRenderAll();refreshLayersList();_cOk('OK');} });
cmd('sendBottom',  'sendBottom <name/#idx>',  'Ganz nach hinten',        args => { const o = _conResolveObj(args[0]); if(o){S.canvas.sendObjectToBack(o);S.canvas.requestRenderAll();refreshLayersList();_cOk('OK');} });

cmd('duplicate', 'duplicate <name/#idx>', 'Objekt duplizieren', args => {
  const obj = _conResolveObj(args[0]); if (!obj) return;
  // fabric v6: clone() returns a Promise; signature is clone(propertiesToInclude) → Promise
  obj.clone(CUSTOM_PROPS).then(cl => { _addClonedToCanvas(cl, 'Konsole: Duplizieren', 'Dupliziert'); _cOk('Dupliziert'); });
});

cmd('group',   'group',  'Ausgewählte Objekte verknüpfen',  () => { linkSelectedObjects();  _cOk('Verknüpft'); });
cmd('ungroup', 'ungroup','Verknüpfung aufheben',            () => { unlinkObjects();         _cOk('Verknüpfung aufgehoben'); });

// --- MESSEN ---
cmd('measure', 'measure <obj1> <obj2>', 'Abstand zwischen zwei Objekten', args => {
  const a = _conResolveObj(args[0]), b = _conResolveObj(args[1]);
  if (!a || !b) return;
  const cx1 = a.left + (a.width * a.scaleX) / 2, cy1 = a.top + (a.height * a.scaleY) / 2;
  const cx2 = b.left + (b.width * b.scaleX) / 2, cy2 = b.top + (b.height * b.scaleY) / 2;
  const px = Math.sqrt((cx2-cx1)**2 + (cy2-cy1)**2);
  const label = S.settings.scale_px_per_mm > 0
    ? (px / S.settings.scale_px_per_mm).toFixed(2) + ' mm  (' + Math.round(px) + ' px)'
    : Math.round(px) + ' px';
  _cOk('Abstand (Mittelpunkt): ' + label);
  _cInfo('  Δx=' + Math.abs(cx2-cx1).toFixed(1) + '  Δy=' + Math.abs(cy2-cy1).toFixed(1));
});

cmd('bbox', 'bbox <name/#idx>', 'Bounding-Box eines Objekts', args => {
  const obj = _conResolveObj(args[0]); if (!obj) return;
  const bb = obj.getBoundingRect(true);
  _cTable([{ X: Math.round(bb.left), Y: Math.round(bb.top), Breite: Math.round(bb.width), Höhe: Math.round(bb.height) }]);
});

cmd('area', 'area <name/#idx>', 'Fläche (px² / mm²)', args => {
  const obj = _conResolveObj(args[0]); if (!obj) return;
  const bb = obj.getBoundingRect(true);
  const px2 = bb.width * bb.height;
  const s   = S.settings.scale_px_per_mm;
  _cOk(`Fläche: ${Math.round(px2)} px²` + (s > 0 ? `  =  ${(px2 / (s * s)).toFixed(2)} mm²` : ''));
});

cmd('count', 'count [typ]', 'Objekte zählen', args => {
  const objs = S.canvas.getObjects();
  if (args[0]) {
    const n = objs.filter(o => o.type === args[0] || (o.customName||'').includes(args[0])).length;
    _cOk(`"${args[0]}": ${n}`);
  } else {
    const byType = {};
    objs.forEach(o => { byType[o.type] = (byType[o.type] || 0) + 1; });
    _cTable(Object.entries(byType).map(([Typ, Anzahl]) => ({ Typ, Anzahl })));
    _cInfo('Gesamt: ' + objs.length);
  }
});

cmd('traceLen', 'traceLen <linkGrpPrefix>', 'Gesamtlänge einer Trace-Gruppe', args => {
  const gid = args[0];
  const segs = S.canvas.getObjects().filter(o => o.type === 'line' && o.linkGroup?.startsWith(gid || ''));
  if (!segs.length) { _cErr('Keine Liniensegmente gefunden'); return; }
  let total = 0;
  segs.forEach(o => {
    const p = o.calcLinePoints?.();
    if (!p) return;
    total += Math.sqrt((p.x2-p.x1)**2 + (p.y2-p.y1)**2);
  });
  const s = S.settings.scale_px_per_mm;
  _cOk(`Länge (${segs.length} Segmente): ${Math.round(total)} px` + (s > 0 ? `  =  ${(total/s).toFixed(2)} mm` : ''));
});

// --- WERKZEUG ---
cmd('tool', 'tool <name>', 'Werkzeug aktivieren', args => {
  const t = args[0];
  if (!t) { _cInfo('Verfügbar: select, hand, line, arrow, dimension, rect, circle, text, freehand, polyline, callout, measure, calibrate'); return; }
  activateTool(t);
  _cOk('Werkzeug: ' + (TOOL_NAMES[t] || t));
});
cmd('activeTool', 'activeTool', 'Aktives Werkzeug anzeigen', () => {
  _cInfo('Aktiv: ' + (TOOL_NAMES[S.currentTool] || S.currentTool || '—'));
});

// --- ANSICHT ---
cmd('zoom', 'zoom <faktor|in|out|reset>', 'Zoom setzen', args => {
  const a = args[0];
  if (!a || a === 'reset') { S.zoomLevel = 1; S.panX = 0; S.panY = 0; applyTransform(); _cOk('Zoom: 100%'); return; }
  if (a === 'in')  { S.zoomLevel = Math.min(ZOOM_MAX, S.zoomLevel * 1.25); applyTransform(); _cOk('Zoom: ' + Math.round(S.zoomLevel*100) + '%'); return; }
  if (a === 'out') { S.zoomLevel = Math.max(ZOOM_MIN, S.zoomLevel / 1.25); applyTransform(); _cOk('Zoom: ' + Math.round(S.zoomLevel*100) + '%'); return; }
  const v = parseFloat(a);
  if (isNaN(v)) { _cErr('Ungültig'); return; }
  S.zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v));
  applyTransform();
  _cOk('Zoom: ' + Math.round(S.zoomLevel*100) + '%');
});

cmd('fit', 'fit', 'Alles einpassen', () => {
  document.getElementById('zoomResetBtn')?.click();
  _cOk('Ansicht zurückgesetzt');
});

cmd('center', 'center', 'Ansicht zentrieren', () => {
  S.panX = 0; S.panY = 0; applyTransform(); _cOk('Zentriert');
});

cmd('pan', 'pan <x> <y>', 'Pan setzen', args => {
  S.panX = parseFloat(args[0]) || 0; S.panY = parseFloat(args[1]) || 0;
  applyTransform(); _cOk(`Pan: (${S.panX}, ${S.panY})`);
});

cmd('zoomSel', 'zoomSel', 'Zoom auf Auswahl', () => {
  zoomToSelection(); _cOk('Zoom auf Auswahl');
});

// --- HILFSLINIEN ---
cmd('guide', 'guide <h|v> <pos>', 'Hilfslinie hinzufügen', args => {
  const axis = args[0], pos = parseFloat(args[1]);
  if ((axis !== 'h' && axis !== 'v') || isNaN(pos)) { _cErr('Syntax: guide h 100  oder  guide v 200'); return; }
  if (axis === 'h') S.guideLines.h.push(pos);
  else              S.guideLines.v.push(pos);
  drawGuides(); saveGuides();
  S._nextLabel = `Hilfslinie ${axis.toUpperCase()} ${pos}`; saveHistory();
  _cOk(`Hilfslinie ${axis === 'h' ? 'horizontal' : 'vertikal'} @ ${pos}px`);
});

cmd('guides', 'guides', 'Alle Hilfslinien auflisten', () => {
  const rows = [
    ...S.guideLines.h.map((p, i) => ({ Typ: 'H', Idx: i, Pos: Math.round(p) })),
    ...S.guideLines.v.map((p, i) => ({ Typ: 'V', Idx: i, Pos: Math.round(p) })),
  ];
  if (!rows.length) { _cInfo('Keine Hilfslinien'); return; }
  _cTable(rows);
});

cmd('clearGuides', 'clearGuides', 'Alle Hilfslinien löschen', () => {
  S.guideLines.h = []; S.guideLines.v = []; drawGuides(); saveGuides();
  S._nextLabel = 'Alle Hilfslinien gelöscht'; saveHistory();
  _cOk('Alle Hilfslinien gelöscht');
});

// --- RASTER ---
cmd('grid', 'grid <on|off>', 'Raster an/aus', args => {
  const v = args[0];
  if (v === 'on')  S.gridState.enabled = true;
  if (v === 'off') S.gridState.enabled = false;
  if (!v) S.gridState.enabled = !S.gridState.enabled;
  saveGridState(); applyGridState();
  _cOk('Raster: ' + (S.gridState.enabled ? 'an' : 'aus'));
});

cmd('gridSize', 'gridSize <px>', 'Rastergröße setzen', args => {
  const v = parseInt(args[0]);
  if (isNaN(v) || v < 2) { _cErr('Mindestens 2px'); return; }
  S.gridState.size = v; saveGridState(); drawGrid();
  _cOk('Rastergröße: ' + v + 'px');
});

cmd('gridOrigin', 'gridOrigin <x> <y>', 'Raster-Ursprung setzen', args => {
  S.gridState.originX = parseFloat(args[0]) || 0;
  S.gridState.originY = parseFloat(args[1]) || 0;
  saveGridState(); drawGrid();
  _cOk(`Ursprung: (${S.gridState.originX}, ${S.gridState.originY})`);
});

cmd('snap', 'snap <on|off>', 'Einrasten an/aus', args => {
  const v = args[0];
  if (v === 'on')  S.gridState.snap = true;
  if (v === 'off') S.gridState.snap = false;
  if (!v) S.gridState.snap = !S.gridState.snap;
  saveGridState(); applyGridState();
  _cOk('Snap: ' + (S.gridState.snap ? 'an' : 'aus'));
});

// --- KAMERA ---
cmd('device', 'device <name|demo>', 'Kameragerät wechseln', args => {
  const d = args[0] || 'demo';
  S.settings.device = d;
  document.getElementById('deviceInput').value = d;
  applyDevice();
  _cOk('Gerät: ' + d);
});

cmd('freeze', 'freeze [on|off]', 'Stream einfrieren', args => {
  const v = args[0];
  if (v === 'on')  S._streamFrozen = true;
  if (v === 'off') S._streamFrozen = false;
  if (!v) S._streamFrozen = !S._streamFrozen;
  const btn = document.getElementById('freezeBtn');
  if (btn) { btn.textContent = S._streamFrozen ? '▶ Fortsetzen' : '⏸ Einfrieren'; btn.style.background = S._streamFrozen ? 'var(--clr-accent,#1bc9e9)' : ''; btn.style.color = S._streamFrozen ? '#000' : ''; }
  _cOk('Freeze: ' + (S._streamFrozen ? 'an' : 'aus'));
});

cmd('quality', 'quality <10-100>', 'JPEG-Qualität setzen', args => {
  const v = parseInt(args[0]);
  if (isNaN(v)) { _cErr('10–100'); return; }
  S.settings.quality = Math.max(10, Math.min(100, v));
  document.getElementById('qualityInput').value = S.settings.quality;
  _cOk('Qualität: ' + S.settings.quality);
});

cmd('fps', 'fps <1-60>', 'Max-FPS setzen', args => {
  const v = parseInt(args[0]);
  if (isNaN(v)) { _cErr('1–60'); return; }
  S.settings.maxFps = Math.max(1, Math.min(60, v));
  _cOk('Max-FPS: ' + S.settings.maxFps);
});

// --- DATEI ---
cmd('save',   'save',   'Projekt speichern',        () => { saveProject();   _cOk('Gespeichert'); });
cmd('saveAs', 'saveAs', 'Speichern unter…',         () => { saveProjectAs(); _cOk('Dialog geöffnet'); });
cmd('export', 'export <png|svg|json>', 'Exportieren', args => {
  const f = args[0] || 'png';
  if (f === 'svg') { exportSVG(); _cOk('SVG exportiert'); }
  else if (f === 'json') { document.getElementById('exportJsonMenu')?.click(); _cOk('JSON exportiert'); }
  else {
    const link = document.createElement('a');
    link.download = 'scopecam_export.png';
    link.href = S.canvas.toDataURL({ format: 'png', multiplier: 1 });
    link.click();
    _cOk('PNG exportiert');
  }
});

// --- EBENEN ---
cmd('layers', 'layers', 'Alle Ebenen auflisten', () => {
  _cTable(S.layers.map((l, i) => ({ '#': i, ID: l.id, Name: l.name, Sichtbar: l.visible ? 'ja' : 'nein' })));
});

cmd('layer', 'layer <name>', 'Ebene erstellen', args => {
  const name = args.join(' ');
  if (!name) { _cErr('Name fehlt'); return; }
  createLayer(name);
  _cOk('Ebene erstellt: ' + name);
});

cmd('deleteLayer', 'deleteLayer <name>', 'Ebene löschen', args => {
  const name = args.join(' ');
  const l = S.layers.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!l) { _cErr('Ebene nicht gefunden: ' + name); return; }
  deleteLayer(l.id);
  _cOk('Ebene gelöscht: ' + name);
});

// --- HISTORY ---
cmd('undo', 'undo [n]', 'Rückgängig (n-mal)', args => {
  const n = parseInt(args[0]) || 1;
  for (let i = 0; i < n; i++) {
    const tab = getCurrentTab?.();
    if (!tab || tab.historyIdx <= 0) break;
    restoreHistory(tab.historyIdx - 1);
  }
  _cOk('Rückgängig');
});

cmd('redo', 'redo', 'Wiederholen', () => {
  const tab = getCurrentTab?.();
  if (tab && tab.historyIdx < tab.history.length - 1) restoreHistory(tab.historyIdx + 1);
  _cOk('Wiederholen');
});

cmd('history', 'history', 'History anzeigen', () => {
  const tab = getCurrentTab?.();
  if (!tab) return;
  const rows = tab.history.map((h, i) => ({ '#': i, Aktuell: i === tab.historyIdx ? '▶' : '', Label: h.label || '—', Zeit: h.time || '' }));
  _cTable(rows.slice(-20));
  if (rows.length > 20) _cInfo('(zeige letzte 20 von ' + rows.length + ')');
});

cmd('clearHistory', 'clearHistory', 'History leeren', () => {
  const tab = getCurrentTab?.();
  if (!tab) return;
  tab.history = []; tab.historyIdx = -1;
  S._nextLabel = 'History geleert'; saveHistory();
  _cOk('History geleert');
});

// --- KI ---
cmd('ki', 'ki <prompt>', 'KI-Nachricht senden', args => {
  if (!args.length) { _cErr('Prompt fehlt'); return; }
  const msg = args.join(' ');
  document.getElementById('kiInput').value = msg;
  sendKiMessage();
  _cOk('Gesendet: ' + msg);
});

cmd('clearKi', 'clearKi', 'KI-Kontext zurücksetzen', () => {
  S.kiChatHistory = [];
  document.getElementById('kiMessages').innerHTML = '';
  _cOk('KI-Kontext geleert');
});

// --- KI-AKTIONEN direkt ausführen ---
cmd('action', 'action <json>', 'KI-Aktion direkt ausführen (JSON)', args => {
  const raw = args.join(' ');
  let actions;
  try {
    const parsed = JSON.parse(raw);
    actions = Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    _cErr('Ungültiges JSON: ' + e.message);
    _cInfo('Beispiel: action {"action":"create","type":"rect","x":100,"y":100,"w":80,"h":40}');
    return;
  }
  executeAIActions(actions).then(() => {
    S.canvas.requestRenderAll();
    refreshLayersList();
    _cOk(`${actions.length} Aktion(en) ausgeführt`);
  }).catch(e => _cErr(String(e)));
});

cmd('create', 'create <typ> [optionen...]', 'Objekt erstellen. Typen: rect, circle, line, arrow, dimension, text', args => {
  const type = args[0];
  if (!type) { _cInfo('Typen: rect, circle, line, arrow, dimension, text'); return; }
  // Optionen als key=value parsen
  const opts = { action: 'create', type };
  args.slice(1).forEach(a => {
    const [k, v] = a.split('=');
    if (!k || v === undefined) return;
    const n = parseFloat(v);
    opts[k] = isNaN(n) ? v : n;
  });
  executeAIActions([opts]).then(() => {
    S.canvas.requestRenderAll(); refreshLayersList(); saveHistory();
    _cOk(`${type} erstellt`);
  }).catch(e => _cErr(String(e)));
});

cmd('setProps', 'setProps <name/#idx> <prop=wert...>', 'Fabric-Eigenschaften direkt setzen', args => {
  const obj = _conResolveObj(args[0]); if (!obj) return;
  if (!obj.objId) obj.objId = crypto.randomUUID();
  const props = {};
  args.slice(1).forEach(a => {
    const eq = a.indexOf('=');
    if (eq < 1) return;
    const k = a.slice(0, eq), v = a.slice(eq + 1);
    const n = parseFloat(v);
    props[k] = isNaN(n) ? v : n;
  });
  executeAIActions([{ action: 'setProps', id: obj.objId, props }]).then(() => {
    S.canvas.requestRenderAll(); saveHistory();
    _cOk('Eigenschaften gesetzt: ' + Object.keys(props).join(', '));
  });
});

cmd('linkIds', 'linkIds <objId1> <objId2> [...]', 'Objekte per objId verknüpfen', args => {
  if (args.length < 2) { _cErr('Mindestens 2 IDs'); return; }
  executeAIActions([{ action: 'link', ids: args }]).then(() => {
    S.canvas.requestRenderAll(); refreshLayersList(); saveHistory();
    _cOk('Verknüpft: ' + args.length + ' Objekte');
  });
});

cmd('moveToLayer', 'moveToLayer <name/#idx> <ebenenname>', 'Objekt in Ebene verschieben', args => {
  const obj = _conResolveObj(args[0]); if (!obj) return;
  if (!obj.objId) obj.objId = crypto.randomUUID();
  const layerName = args.slice(1).join(' ');
  executeAIActions([{ action: 'moveToLayer', id: obj.objId, layerName }]).then(() => {
    refreshLayersList(); saveHistory();
    _cOk(`→ Ebene "${layerName}"`);
  });
});

cmd('actions', 'actions', 'Alle verfügbaren KI-Aktionen und ihre Parameter anzeigen', () => {
  _cInfo('Verfügbare action-Typen:');
  const docs = [
    ['create',      'type, x, y, w, h, x1, y1, x2, y2, r, cx, cy, stroke, fill, strokeWidth, text, fontSize, linkGroup, name'],
    ['move',        'id (objId), x, y'],
    ['delete',      'id (objId)'],
    ['setProps',    'id (objId), props: {key:value,...}'],
    ['rename',      'id (objId), name'],
    ['link',        'ids: [objId1, objId2, ...]'],
    ['unlink',      'id (objId)'],
    ['select',      'ids: [objId1, ...]'],
    ['createLayer', 'name'],
    ['renameLayer', 'layerName oder layerId, newName'],
    ['moveToLayer', 'id (objId), layerName oder layerId'],
    ['addGuide',    'axis: "h"/"v", pos (px)'],
    ['moveGuide',   'axis, oldPos, newPos'],
    ['removeGuide', 'axis, pos'],
    ['clearGuides', '(keine Parameter)'],
  ];
  _cTable(docs.map(([Aktion, Parameter]) => ({ Aktion, Parameter })));
  _cInfo('Direkter Aufruf: action {"action":"create","type":"rect","x":50,"y":50,"w":100,"h":60}');
  _cInfo('Oder: create rect x=50 y=50 w=100 h=60 stroke=#ff0000');
});

// --- eval (Power-User) ---
cmd('eval', 'eval <js>', 'JavaScript direkt ausführen (Vorsicht!)', args => {
  const code = args.join(' ');
  try {
    const result = eval(code); // eslint-disable-line no-eval
    if (result !== undefined) _cInfo(String(result));
    _cOk('OK');
  } catch (e) {
    _cErr(String(e));
  }
});

// ── Hilfs-Resolver ────────────────────────────────────────────────────────────
function _conResolveObj(ref) {
  if (ref === undefined || ref === null) {
    const sel = S.canvas.getActiveObject();
    if (!sel) { _cErr('Kein Objekt angegeben und nichts ausgewählt'); return null; }
    // fabric v6: ActiveSelection.type returns 'activeselection' (all lowercase)
    if (sel.type === 'activeselection' || sel instanceof fabric.ActiveSelection) return sel.getObjects()[0];
    return sel;
  }
  const objs = S.canvas.getObjects();
  if (/^\d+$/.test(ref)) {
    const idx = parseInt(ref);
    if (idx < 0 || idx >= objs.length) { _cErr('Index außerhalb: ' + idx); return null; }
    return objs[idx];
  }
  const found = objs.find(o => (o.customName || '').toLowerCase() === ref.toLowerCase())
             || objs.find(o => (o.customName || '').toLowerCase().includes(ref.toLowerCase()));
  if (!found) { _cErr('Objekt nicht gefunden: ' + ref); return null; }
  return found;
}

// ── Tab-Completion ────────────────────────────────────────────────────────────
const CMD_NAMES = Object.keys(CMDS).sort();

_CON_IN.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const val  = _CON_IN.value.trimStart();
    const parts = val.split(/\s+/);
    if (parts.length === 1) {
      const prefix = parts[0].toLowerCase();
      const matches = CMD_NAMES.filter(n => n.startsWith(prefix));
      if (matches.length === 1)  { _CON_IN.value = matches[0] + ' '; }
      else if (matches.length > 1) { _cInfo('→ ' + matches.join('  ')); }
    }
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (_conHistIdx < _conHist.length - 1) { _conHistIdx++; _CON_IN.value = _conHist[_conHist.length - 1 - _conHistIdx] || ''; }
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (_conHistIdx > 0) { _conHistIdx--; _CON_IN.value = _conHist[_conHist.length - 1 - _conHistIdx] || ''; }
    else { _conHistIdx = -1; _CON_IN.value = ''; }
    return;
  }
  if (e.key === 'Enter') {
    const raw = _CON_IN.value.trim();
    if (!raw) return;
    _cEcho(raw);
    _conHist.push(raw);
    if (_conHist.length > 100) _conHist.shift();
    _conHistIdx = -1;
    _CON_IN.value = '';
    _conRun(raw);
  }
});

function _conRun(raw) {
  const parts = raw.match(/"[^"]*"|\S+/g) || [];
  const name  = parts[0]?.toLowerCase();
  const args  = parts.slice(1).map(a => a.replace(/^"|"$/g, ''));
  const c     = CMDS[name];
  if (!c) { _cErr(`Unbekannter Befehl: "${name}" — tippe help`); return; }
  try { c.fn(args); } catch (e) { _cErr(String(e)); }
}

document.getElementById('consoleRunBtn').addEventListener('click', () => {
  const raw = _CON_IN.value.trim();
  if (!raw) return;
  _cEcho(raw);
  _conHist.push(raw);
  _conHistIdx = -1;
  _CON_IN.value = '';
  _conRun(raw);
});

document.getElementById('consoleClearBtn').addEventListener('click', () => { _CON_OUT.innerHTML = ''; });
document.getElementById('consoleHelpBtn').addEventListener('click', () => { _conRun('help'); });

// F12 → Konsole öffnen/schließen
document.addEventListener('keydown', e => {
  if (e.key === 'F12') {
    e.preventDefault();
    S.panelStates['console'].open = !S.panelStates['console'].open;
    applyPanel('console');
    savePanelStates();
    if (S.panelStates['console'].open) setTimeout(() => _CON_IN.focus(), 80);
  }
}, true);

// Begrüßung
_cInfo('ScopeCam Konsole  ·  help = Befehlsliste  ·  Tab = Autocomplete  ·  ↑↓ = History');

})(); // Ende initConsole IIFE
