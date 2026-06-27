// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN-SYSTEM
// CSS-Variablen für Farben und Leistenhöhen. Presets, Export/Import, live Apply.
// ═══════════════════════════════════════════════════════════════════════════════

import { S } from './00-state.js';
import { drawRulers } from './22-rulers.js';
import { setStatus } from './03-status-log.js';

const DESIGN_STORAGE_KEY = 'scopecam_design_v1';

const DESIGN_COLOR_VARS = [
  { id: 'clr-bg',         label: 'Hintergrund (Canvas)' },
  { id: 'clr-surface',    label: 'App-Hintergrund'       },
  { id: 'clr-panel',      label: 'Dock / Sidebar'        },
  { id: 'clr-component',  label: 'Panels / Dropdowns'    },
  { id: 'clr-component2', label: 'Panel-Header'          },
  { id: 'clr-hover',      label: 'Hover-Fläche'          },
  { id: 'clr-input',      label: 'Eingabefelder'         },
  { id: 'clr-overlay',    label: 'Leisten-BG'            },
  { id: 'clr-border',     label: 'Rahmenfarbe'           },
  { id: 'clr-accent',     label: 'Akzentfarbe'           },
  { id: 'clr-text',       label: 'Text (primär)'         },
  { id: 'clr-muted',      label: 'Text (sekundär)'       },
  { id: 'clr-ruler-bg',   label: 'Lineal-Hintergrund'    },
  { id: 'clr-ruler-fg',   label: 'Lineal-Beschriftung'   },
];

const DESIGN_SIZE_VARS = [
  { id: 'h-menu',   label: 'Menüleiste (px)',    min: 20, max: 60 },
  { id: 'h-tab',    label: 'Tab-Leiste (px)',    min: 18, max: 50 },
  { id: 'h-status', label: 'Statusleiste (px)',  min: 18, max: 60 },
  { id: 'ui-font',  label: 'UI-Schrift (px)',    min: 9,  max: 18 },
];

export const DESIGN_PRESETS = {
  // Dark themes
  dark: {
    name: 'Dark',
    'clr-bg': '#0a0a0a', 'clr-surface': '#111111', 'clr-panel': '#161616',
    'clr-component': '#1e1e1e', 'clr-component2': '#141414',
    'clr-hover': '#2a2a2a', 'clr-input': '#181818',
    'clr-overlay': '#111111', 'clr-border': '#2e2e2e', 'clr-accent': '#2f80ed',
    'clr-text': '#e0e0e0', 'clr-muted': '#888888',
    'clr-ruler-bg': '#141414', 'clr-ruler-fg': '#606060',
    'h-menu': '30', 'h-tab': '26', 'h-status': '30', 'ui-font': '12',
  },
  midnight: {
    name: 'Midnight',
    'clr-bg': '#020408', 'clr-surface': '#06080f', 'clr-panel': '#0b0e18',
    'clr-component': '#0f1520', 'clr-component2': '#080a10',
    'clr-hover': '#141b28', 'clr-input': '#080c14',
    'clr-overlay': '#08090e', 'clr-border': '#1e2535', 'clr-accent': '#00e5ff',
    'clr-text': '#b8cfe8', 'clr-muted': '#5a7a9a',
    'clr-ruler-bg': '#060810', 'clr-ruler-fg': '#2e4a6a',
    'h-menu': '32', 'h-tab': '28', 'h-status': '32', 'ui-font': '12',
  },
  carbon: {
    name: 'Carbon',
    'clr-bg': '#181412', 'clr-surface': '#1f1b18', 'clr-panel': '#272320',
    'clr-component': '#2d2825', 'clr-component2': '#1c1916',
    'clr-hover': '#352f2b', 'clr-input': '#1a1715',
    'clr-overlay': '#1c1916', 'clr-border': '#3a342f', 'clr-accent': '#f59e0b',
    'clr-text': '#e8ddd0', 'clr-muted': '#9e8e80',
    'clr-ruler-bg': '#1a1612', 'clr-ruler-fg': '#7a6a58',
    'h-menu': '30', 'h-tab': '24', 'h-status': '30', 'ui-font': '12',
  },
  // Light themes
  light: {
    name: 'Light',
    'clr-bg': '#e8e8e8', 'clr-surface': '#f0f0f0', 'clr-panel': '#e2e2e2',
    'clr-component': '#ffffff', 'clr-component2': '#f5f5f5',
    'clr-hover': '#e8e8e8', 'clr-input': '#fafafa',
    'clr-overlay': '#ececec', 'clr-border': '#d0d0d0', 'clr-accent': '#2563eb',
    'clr-text': '#1a1a1a', 'clr-muted': '#6b7280',
    'clr-ruler-bg': '#e0e0e0', 'clr-ruler-fg': '#9a9a9a',
    'h-menu': '30', 'h-tab': '26', 'h-status': '30', 'ui-font': '12',
  },
  solarized: {
    name: 'Solarized',
    'clr-bg': '#eee8d5', 'clr-surface': '#fdf6e3', 'clr-panel': '#e4dcc9',
    'clr-component': '#fdf6e3', 'clr-component2': '#eee8d5',
    'clr-hover': '#e0d9c4', 'clr-input': '#faf3e0',
    'clr-overlay': '#eee8d5', 'clr-border': '#c8bfaa', 'clr-accent': '#268bd2',
    'clr-text': '#073642', 'clr-muted': '#93a1a1',
    'clr-ruler-bg': '#e8e2cf', 'clr-ruler-fg': '#a09480',
    'h-menu': '30', 'h-tab': '26', 'h-status': '30', 'ui-font': '12',
  },
  nord: {
    name: 'Nord',
    'clr-bg': '#d8dee9', 'clr-surface': '#e5e9f0', 'clr-panel': '#d0d6e2',
    'clr-component': '#eceff4', 'clr-component2': '#e5e9f0',
    'clr-hover': '#d8dee9', 'clr-input': '#f8f9fc',
    'clr-overlay': '#e5e9f0', 'clr-border': '#c2cad8', 'clr-accent': '#5e81ac',
    'clr-text': '#2e3440', 'clr-muted': '#7a8496',
    'clr-ruler-bg': '#d0d6e2', 'clr-ruler-fg': '#8896aa',
    'h-menu': '30', 'h-tab': '26', 'h-status': '30', 'ui-font': '12',
  },
};

let currentDesign = { ...DESIGN_PRESETS.dark };

export function applyDesign(design) {
  currentDesign = { ...design };
  const isDark = parseInt((design['clr-bg'] || '#000').slice(1, 3), 16) < 128;

  [...DESIGN_COLOR_VARS, ...DESIGN_SIZE_VARS].forEach(v => {
    const val = design[v.id];
    if (val == null) return;
    const cssVal = DESIGN_SIZE_VARS.find(sv => sv.id === v.id) ? val + 'px' : val;
    document.documentElement.style.setProperty('--' + v.id, cssVal);
  });

  // Lineal-Fallback: ableiten wenn nicht explizit gesetzt
  if (!design['clr-ruler-bg']) {
    document.documentElement.style.setProperty('--clr-ruler-bg', isDark ? '#181818' : '#e0e0e0');
  }
  if (!design['clr-ruler-fg']) {
    document.documentElement.style.setProperty('--clr-ruler-fg', isDark ? '#606060' : '#9a9a9a');
  }

  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  drawRulers();
}

function saveDesign() {
  try { localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(currentDesign)); } catch (_) {}
}

export function loadDesign() {
  try {
    const saved = JSON.parse(localStorage.getItem(DESIGN_STORAGE_KEY));
    if (saved) { applyDesign(saved); return; }
  } catch (_) {}
  applyDesign(DESIGN_PRESETS.dark);
}

function exportDesign() {
  const data = { scopecamDesign: true, ...currentDesign };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'scopecam-design.json'; a.click();
  URL.revokeObjectURL(url);
}

function importDesign(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      applyDesign(data);
      saveDesign();
      populateDesignControls();
    } catch (_) { alert('Ungültige Design-Datei'); }
  };
  reader.readAsText(file);
}

export function buildDesignControls() {
  // Preset-Karten mit Farbvorschau
  const presetRow = document.getElementById('designPresets');
  presetRow.innerHTML = '';
  Object.entries(DESIGN_PRESETS).forEach(([key, preset]) => {
    const card = document.createElement('div');
    card.className     = 'design-preset-card';
    card.dataset.preset = key;

    const swatch = document.createElement('div');
    swatch.className = 'preset-swatch';
    const swBg     = document.createElement('div');
    swBg.className  = 'psw-bg';
    swBg.style.background = preset['clr-bg'];
    const swPanel  = document.createElement('div');
    swPanel.className = 'psw-panel';
    swPanel.style.background = preset['clr-panel'];
    const swAccent = document.createElement('div');
    swAccent.className = 'psw-accent';
    swAccent.style.background = preset['clr-accent'];
    swatch.append(swBg, swPanel, swAccent);

    const label = document.createElement('div');
    label.className   = 'preset-label';
    label.textContent = preset.name;

    card.append(swatch, label);
    card.addEventListener('click', () => {
      applyDesign(preset);
      saveDesign();
      populateDesignControls();
      document.querySelectorAll('.design-preset-card').forEach(c => c.classList.remove('preset-active'));
      card.classList.add('preset-active');
    });
    presetRow.appendChild(card);
  });

  // Color variable controls
  const colorGrid = document.getElementById('designColorVars');
  colorGrid.innerHTML = '';
  DESIGN_COLOR_VARS.forEach(v => {
    const row = document.createElement('div');
    row.className = 'design-var-row';
    const label = document.createElement('label');
    label.textContent = v.label;
    const input = document.createElement('input');
    input.type = 'color';
    input.id   = 'dv-' + v.id;
    input.addEventListener('input', () => {
      currentDesign[v.id] = input.value;
      document.documentElement.style.setProperty('--' + v.id, input.value);
      saveDesign();
    });
    row.append(label, input);
    colorGrid.appendChild(row);
  });

  // Size variable controls
  const sizeGrid = document.getElementById('designSizeVars');
  sizeGrid.innerHTML = '';
  DESIGN_SIZE_VARS.forEach(v => {
    const row = document.createElement('div');
    row.className = 'design-var-row';
    const label = document.createElement('label');
    label.textContent = v.label;
    const input = document.createElement('input');
    input.type = 'number';
    input.id   = 'dv-' + v.id;
    input.min  = v.min; input.max = v.max;
    input.addEventListener('input', () => {
      currentDesign[v.id] = input.value;
      document.documentElement.style.setProperty('--' + v.id, input.value + 'px');
      saveDesign();
    });
    row.append(label, input);
    sizeGrid.appendChild(row);
  });
}

export function populateDesignControls() {
  [...DESIGN_COLOR_VARS, ...DESIGN_SIZE_VARS].forEach(v => {
    const el = document.getElementById('dv-' + v.id);
    if (!el) return;
    el.value = currentDesign[v.id] ?? '';
  });
  // Mark active preset card
  document.querySelectorAll('.design-preset-card').forEach(card => {
    const p = DESIGN_PRESETS[card.dataset.preset];
    const matches = p && Object.keys(p).every(k => k === 'name' || currentDesign[k] === p[k]);
    card.classList.toggle('preset-active', !!matches);
  });
}

// Design action buttons
document.getElementById('designExportBtn').addEventListener('click', exportDesign);
document.getElementById('designImportBtn').addEventListener('click', () => {
  document.getElementById('designImportFile').click();
});
document.getElementById('designImportFile').addEventListener('change', e => {
  if (e.target.files[0]) importDesign(e.target.files[0]);
  e.target.value = '';
});
document.getElementById('designResetBtn').addEventListener('click', () => {
  applyDesign(DESIGN_PRESETS.dark);
  saveDesign();
  populateDesignControls();
});


