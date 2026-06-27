// ═══════════════════════════════════════════════════════════════════════════════
// SHORTCUT-SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

const SC_KEY = 'scopecam_shortcuts_v1';
const SC_DEFAULTS = {
  tool_select:    { key: 's',      ctrl:false, alt:false, shift:false, label:'Auswahl-Werkzeug',       cat:'Werkzeuge' },
  tool_line:      { key: 'l',      ctrl:false, alt:false, shift:false, label:'Linie',                  cat:'Werkzeuge' },
  tool_arrow:     { key: 'a',      ctrl:false, alt:false, shift:false, label:'Pfeil',                  cat:'Werkzeuge' },
  tool_dimension: { key: 'd',      ctrl:false, alt:false, shift:false, label:'Bemaßung',               cat:'Werkzeuge' },
  tool_rect:      { key: 'r',      ctrl:false, alt:false, shift:false, label:'Rechteck',               cat:'Werkzeuge' },
  tool_circle:    { key: 'c',      ctrl:false, alt:false, shift:false, label:'Kreis',                  cat:'Werkzeuge' },
  tool_text:      { key: 't',      ctrl:false, alt:false, shift:false, label:'Text',                   cat:'Werkzeuge' },
  tool_freehand:  { key: 'f',      ctrl:false, alt:false, shift:false, label:'Freihand',               cat:'Werkzeuge' },
  tool_hand:      { key: 'h',      ctrl:false, alt:false, shift:false, label:'Hand/Pan',               cat:'Werkzeuge' },
  tool_polyline:  { key: 'p',      ctrl:false, alt:false, shift:false, label:'Polylinie',              cat:'Werkzeuge' },
  undo:           { key: 'z',      ctrl:true,  alt:false, shift:false, label:'Rückgängig',             cat:'Bearbeiten' },
  redo:           { key: 'y',      ctrl:true,  alt:false, shift:false, label:'Wiederholen',            cat:'Bearbeiten' },
  link:           { key: 'g',      ctrl:true,  alt:false, shift:false, label:'Verknüpfen',             cat:'Bearbeiten' },
  unlink:         { key: 'g',      ctrl:true,  alt:false, shift:true,  label:'Verknüpfung aufheben',   cat:'Bearbeiten' },
  delete_obj:     { key: 'Delete', ctrl:false, alt:false, shift:false, label:'Löschen',                cat:'Bearbeiten' },
  save:           { key: 's',      ctrl:true,  alt:false, shift:false, label:'Speichern',              cat:'Datei' },
  save_as:        { key: 's',      ctrl:true,  alt:false, shift:true,  label:'Speichern unter',        cat:'Datei' },
  open_file:      { key: 'o',      ctrl:true,  alt:false, shift:false, label:'Öffnen',                 cat:'Datei' },
  grid_toggle:    { key: "'",      ctrl:true,  alt:false, shift:false, label:'Raster anzeigen',        cat:'Ansicht' },
  axis_lock_x:    { key: 'x',      ctrl:false, alt:true,  shift:false, label:'Achse X sperren',        cat:'Verschieben' },
  axis_lock_y:    { key: 'y',      ctrl:false, alt:true,  shift:false, label:'Achse Y sperren',        cat:'Verschieben' },
  snap_skip:      { key: 'Control',ctrl:false, alt:false, shift:false, label:'Einrasten ignorieren',   cat:'Verschieben' },
  scale_prop:     { key: 'p',      ctrl:false, alt:true,  shift:false, label:'Proportionen sperren',   cat:'Skalieren' },
};
let SC = {};

function _loadShortcuts() {
  try {
    const saved = JSON.parse(localStorage.getItem(SC_KEY)) || {};
    SC = Object.fromEntries(
      Object.entries(SC_DEFAULTS).map(([id, def]) => [id, { ...def, ...(saved[id] || {}) }])
    );
  } catch(_) { SC = Object.fromEntries(Object.entries(SC_DEFAULTS).map(([k,v]) => [k, {...v}])); }
}
_loadShortcuts();

function _saveShortcuts() {
  try { localStorage.setItem(SC_KEY, JSON.stringify(SC)); } catch(_) {}
}

function matchSC(e, id) {
  const sc = SC[id]; if (!sc) return false;
  return e.key.toLowerCase() === sc.key.toLowerCase()
    && !!e.ctrlKey  === !!sc.ctrl
    && !!e.altKey   === !!sc.alt
    && !!e.shiftKey === !!sc.shift;
}

function scLabel(id) {
  const sc = SC[id]; if (!sc) return '';
  const parts = [];
  if (sc.ctrl)  parts.push('Ctrl');
  if (sc.alt)   parts.push('Alt');
  if (sc.shift) parts.push('Shift');
  parts.push(sc.key === ' ' ? 'Space' : sc.key.toUpperCase());
  return parts.join('+');
}

// ── Shortcut-Manager UI ───────────────────────────────────────────────────────

function renderScManager() {
  const list = document.getElementById('scList');
  if (!list) return;
  list.innerHTML = '';

  const cats = [...new Set(Object.values(SC_DEFAULTS).map(s => s.cat))];
  cats.forEach(cat => {
    const entries = Object.entries(SC).filter(([, v]) => v.cat === cat);
    if (!entries.length) return;

    const hdr = document.createElement('div');
    hdr.className = 'sc-cat-hdr';
    hdr.textContent = cat;
    list.appendChild(hdr);

    entries.forEach(([id, sc]) => {
      const row = document.createElement('div');
      row.className = 'sc-row';

      const lbl = document.createElement('span');
      lbl.className = 'sc-label';
      lbl.textContent = sc.label;

      const inp = document.createElement('div');
      inp.className = 'sc-input';
      inp.tabIndex = 0;
      inp.textContent = scLabel(id);
      inp.dataset.scId = id;

      let recording = false;
      const startRec = () => {
        if (recording) return;
        recording = true;
        inp.classList.add('sc-recording');
        inp.textContent = 'Taste drücken…';
        const onKey = ev => {
          ev.preventDefault(); ev.stopPropagation();
          if (ev.key === 'Escape') { cancel(); return; }
          SC[id] = { ...SC[id], key: ev.key, ctrl: ev.ctrlKey, alt: ev.altKey, shift: ev.shiftKey };
          _saveShortcuts();
          inp.textContent = scLabel(id);
          inp.classList.remove('sc-recording');
          recording = false;
          document.removeEventListener('keydown', onKey, true);
        };
        const cancel = () => {
          recording = false;
          inp.classList.remove('sc-recording');
          inp.textContent = scLabel(id);
          document.removeEventListener('keydown', onKey, true);
        };
        document.addEventListener('keydown', onKey, true);
        inp.addEventListener('blur', cancel, { once: true });
      };
      inp.addEventListener('click', startRec);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') startRec(); });

      const rst = document.createElement('button');
      rst.className = 'sc-reset';
      rst.title = 'Zurücksetzen';
      rst.textContent = '↺';
      rst.addEventListener('click', () => {
        SC[id] = { ...SC_DEFAULTS[id] };
        _saveShortcuts();
        inp.textContent = scLabel(id);
      });

      row.appendChild(lbl);
      row.appendChild(inp);
      row.appendChild(rst);
      list.appendChild(row);
    });
  });
}

document.getElementById('scResetAllBtn')?.addEventListener('click', () => {
  SC = Object.fromEntries(Object.entries(SC_DEFAULTS).map(([k,v]) => [k, {...v}]));
  _saveShortcuts();
  renderScManager();
});

// Tab "Tastenkürzel" aktiviert → Manager rendern
document.querySelector('[data-sp-tab="shortcuts"]')?.addEventListener('click', renderScManager);

// ═══════════════════════════════════════════════════════════════════════════════
// ACHSSPERRUNG (Alt+X / Alt+Y beim Verschieben)
// ═══════════════════════════════════════════════════════════════════════════════

let axisLock    = null; // 'x' | 'y' | null
let _axisStart  = null; // {left, top} beim Start des Verschiebens
let _snapSkipActive = false;
let _heldMods = { ctrl: false, alt: false, shift: false };
let _heldRegKey = null;

function _snapSkipKey() { return (SC['snap_skip']?.key || 'Shift').toLowerCase(); }

// Gibt 'exact', 'partial' oder null zurück für einen SC-Eintrag
function _scState(sc) {
  const k = sc.key.toLowerCase();
  const isModKey = k === 'shift' || k === 'control' || k === 'alt';
  if (isModKey) {
    const held = k === 'shift' ? _heldMods.shift : k === 'control' ? _heldMods.ctrl : _heldMods.alt;
    if (!held) return null;
    const othersOk = (k !== 'control' ? !!sc.ctrl  === _heldMods.ctrl  : true)
                  && (k !== 'alt'     ? !!sc.alt   === _heldMods.alt   : true)
                  && (k !== 'shift'   ? !!sc.shift  === _heldMods.shift : true);
    return othersOk ? 'exact' : null;
  }
  const modsOk = !!sc.ctrl === _heldMods.ctrl && !!sc.alt === _heldMods.alt && !!sc.shift === _heldMods.shift;
  if (!modsOk) return null;
  if (!_heldMods.ctrl && !_heldMods.alt && !_heldMods.shift && !_heldRegKey) return null;
  return _heldRegKey === k ? 'exact' : 'partial';
}

function _renderStatusKeys() {
  const el = document.getElementById('statusKeys');
  if (!el) return;
  const anyHeld = _heldMods.ctrl || _heldMods.alt || _heldMods.shift || _heldRegKey;
  if (!anyHeld) { _updateStatusKeys(); return; }
  el.innerHTML = '';
  Object.entries(SC).forEach(([, sc]) => {
    const state = _scState(sc);
    if (!state) return;
    const p = document.createElement('span');
    p.className = 'sk-pill' + (state === 'exact' ? '' : ' sk-off');
    p.textContent = sc.label;
    el.appendChild(p);
  });
}

function _updateStatusKeys() {
  const el = document.getElementById('statusKeys');
  if (!el) return;
  el.innerHTML = '';
  const add = (label, active) => {
    const p = document.createElement('span');
    p.className = 'sk-pill' + (active ? '' : ' sk-off');
    p.textContent = label;
    el.appendChild(p);
  };
  if (_snapSkipActive)    add('⊘ Snap', true);
  if (axisLock === 'x')   add('⟺ X-Achse', true);
  if (axisLock === 'y')   add('⟺ Y-Achse', true);
  if (gridState?.snap && gridState?.enabled) add('⊞ Raster', false);
  if (guidesSnap)         add('┼ Linien', false);
}

const _onAnyKeyDown = e => {
  const k = e.key.toLowerCase();
  _heldMods.ctrl  = e.ctrlKey;
  _heldMods.alt   = e.altKey;
  _heldMods.shift = e.shiftKey || k === 'shift';
  // Reguläre Taste nur tracken wenn Modifier mitgedrückt (sonst flackert die Statusleiste bei jedem Buchstaben)
  if (!['control','alt','shift'].includes(k) && (e.ctrlKey || e.altKey)) _heldRegKey = k;
  if (k === _snapSkipKey()) _snapSkipActive = true;
  _renderStatusKeys();
};
const _onAnyKeyUp = e => {
  const k = e.key.toLowerCase();
  if (k === _heldRegKey) _heldRegKey = null;
  _heldMods.ctrl  = e.ctrlKey;
  _heldMods.alt   = e.altKey;
  _heldMods.shift = e.shiftKey;
  if (k === _snapSkipKey()) _snapSkipActive = false;
  _renderStatusKeys();
};
document.addEventListener('keydown', _onAnyKeyDown);
document.addEventListener('keyup',   _onAnyKeyUp);
window.addEventListener('keydown',   _onAnyKeyDown);
window.addEventListener('keyup',     _onAnyKeyUp);
// Fallback: Modifier-State aus Fabric mouse:move (falls keyup ausserhalb gefeuert)
canvas.on('mouse:move', opt => {
  const sk = _snapSkipKey();
  let nv;
  if      (sk === 'shift')   nv = !!(opt.e?.shiftKey);
  else if (sk === 'control') nv = !!(opt.e?.ctrlKey);
  else if (sk === 'alt')     nv = !!(opt.e?.altKey);
  else return;
  if (_snapSkipActive !== nv) { _snapSkipActive = nv; _renderStatusKeys(); }
});

canvas.on('mouse:down', opt => {
  const obj = opt.target;
  if (!obj || !obj.selectable) return;
  _axisStart = { left: obj.left, top: obj.top };
});

canvas.on('object:moving', opt => {
  if (!axisLock || !_axisStart) return;
  const obj = opt.target;
  if (axisLock === 'x') obj.top  = _axisStart.top;   // nur X (links/rechts) erlaubt
  if (axisLock === 'y') obj.left = _axisStart.left;  // nur Y (oben/unten) erlaubt
});

document.addEventListener('keydown', e => {
  if (matchSC(e, 'axis_lock_x')) { e.preventDefault(); axisLock = axisLock === 'x' ? null : 'x'; setStatus(axisLock === 'x' ? '⟺ X-Achse gesperrt' : 'Achssperrung aufgehoben'); _renderStatusKeys(); }
  if (matchSC(e, 'axis_lock_y')) { e.preventDefault(); axisLock = axisLock === 'y' ? null : 'y'; setStatus(axisLock === 'y' ? '⟺ Y-Achse gesperrt' : 'Achssperrung aufgehoben'); _renderStatusKeys(); }
}, true);

canvas.on('mouse:up', () => { axisLock = null; _axisStart = null; _renderStatusKeys(); });

