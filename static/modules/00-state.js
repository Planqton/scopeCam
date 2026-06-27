// ═══════════════════════════════════════════════════════════════════════════════
// ZENTRALES STATE-OBJEKT
// Alle geteilten Variablen zwischen Modulen — macht Cross-Modul-Abhängigkeiten
// explizit sichtbar. Wird als ERSTES Script geladen (vor allen anderen Modulen).
//
// Ausnahmen (bleiben als globale Bare-Vars):
//   applyPanel         — wird in 33-mobile.js monkey-gepatcht (S.applyPanel wäre inkompatibel)
//   isPointerDown      — nur in 10-mouse-events.js genutzt
//   startPoint         — nur in 10-mouse-events.js genutzt
//   previewObj         — nur in 10-mouse-events.js genutzt
//   PANEL_DEFAULTS     — Konstante (nur gelesen, nie neu zugewiesen)
//   TOOL_NAMES         — Konstante
//   DESIGN_PRESETS     — Konstante
//   KI_PROVIDERS       — Konstante
//   SC_DEFAULTS        — Konstante
//   CUSTOM_PROPS       — Konstante
//   KI_PERM_DEFAULTS   — Konstante
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} AppState
 * @property {fabric.Canvas|null} canvas
 * @property {Object} settings
 * @property {string|null} currentTool
 * @property {Array<{json:string,label:string,time:number}>} history
 * @property {number} historyIdx
 * @property {string|null} _nextLabel
 * @property {HTMLCanvasElement|null} videoCanvas
 * @property {CanvasRenderingContext2D|null} videoCtx
 * @property {Object} panelStates
 * @property {Object} panelElCache
 * @property {number} zoomLevel
 * @property {number} panX
 * @property {number} panY
 * @property {boolean} isPanning
 * @property {Array} tabs
 * @property {string|null} activeTabId
 * @property {Array} layers
 * @property {boolean} _kiBatchMode
 * @property {string|null} currentSavePath
 * @property {Object} SC
 * @property {string|null} axisLock
 * @property {boolean} _snapSkipActive
 * @property {Object} gridState
 * @property {boolean} _aspectLocked
 * @property {{h:number[],v:number[]}} guideLines
 * @property {boolean} guidesVisible
 * @property {boolean} guidesSnap
 * @property {{axis:string,idx:number}|null} selectedGuide
 * @property {boolean} _guidesCollapsed
 * @property {boolean} pcbLiveSnapEnabled
 * @property {Object} kiSettings
 * @property {Array} kiChatHistory
 * @property {Object} kiPerms
 * @property {Object|null} _clipboard
 * @property {boolean} _snapToObjEnabled
 * @property {Array} _polyPts
 * @property {fabric.Line|null} _polyPreviewLine
 * @property {string|null} _polyLinkId
 * @property {Object|null} _calPts
 * @property {boolean} _streamFrozen
 * @property {Object|null} _measurePt1
 * @property {HTMLElement|null} _measureOverlay
 * @property {Object|null} _calloutAnchor
 * @property {fabric.Line|null} _calloutPreviewLine
 * @property {Object|null} kiRegionRect
 * @property {boolean} _suppressLinkExpand
 */

/** @type {AppState} */
export const S = {

  // ── Canvas & Core State (04-canvas-state.js) ────────────────────────────────
  canvas:       null,    // fabric.Canvas — gesetzt in 04-canvas-state.js
  applyPanel:   null,    // S.applyPanel = function(id) {...} — gesetzt in 02-panels.js
  settings:     {},      // Kamera- & App-Einstellungen
  currentTool:  null,    // aktives Zeichenwerkzeug
  history:      [],      // [{json, label, time}, ...]
  historyIdx:   -1,
  _nextLabel:   null,    // vor saveHistory() setzen fuer kontextuellen Label

  // ── Video / WebSocket (05-video.js) ─────────────────────────────────────────
  videoCanvas:  null,    // HTMLCanvasElement — gesetzt in 05-video.js
  videoCtx:     null,    // CanvasRenderingContext2D — gesetzt in 05-video.js

  // ── Panels (02-panels.js) ───────────────────────────────────────────────────
  panelStates:  {},      // Panel-Positionen, Dock-Modus, open/collapsed
  panelElCache: {},      // data-panel => HTMLElement Cache

  // ── Transform / View (06-transform.js) ──────────────────────────────────────
  zoomLevel:    1.0,
  panX:         0,
  panY:         0,
  isPanning:    false,

  // ── Tabs (08-tabs.js) ───────────────────────────────────────────────────────
  tabs:         [],
  activeTabId:  null,

  // ── Layers (13-layers.js) ───────────────────────────────────────────────────
  layers:       [],

  // ── History / KI Batch (14-history.js) ──────────────────────────────────────
  _kiBatchMode: false,

  // ── File Ops (16-file-ops.js) ────────────────────────────────────────────────
  currentSavePath: null,

  // ── Shortcuts & Achssperrung (17-shortcuts.js) ──────────────────────────────
  SC:              {},     // aktive Kuerzel { id: { key, ctrl, shift, alt } }
  axisLock:        null,   // null | 'x' | 'y'
  _snapSkipActive: false,

  // ── Grid (23-grid.js) ────────────────────────────────────────────────────────
  gridState: {
    enabled: false,
    snap:    false,
    size:    20,
    color:   '#444444',
    opacity: 25,
    originX: 0,
    originY: 0,
  },
  _aspectLocked: false,

  // ── Guides (24-guides.js) ────────────────────────────────────────────────────
  guideLines:       { h: [], v: [] },  // Image-Pixel-Koordinaten
  guidesVisible:    true,
  guidesSnap:       false,
  selectedGuide:    null,              // { axis, idx } | null
  _guidesCollapsed: true,

  // ── PCB Snap (25-pcb-snap.js) ────────────────────────────────────────────────
  pcbLiveSnapEnabled: false,

  // ── KI Settings (26-ki-settings.js) ──────────────────────────────────────────
  kiSettings: {
    endpoint:       '',
    apiKey:         '',
    model:          '',
    provider:       '',
    template:       '',
    thinking:       false,
    thinkingBudget: 8000,
  },

  // ── KI Core (27-ki-core.js) ───────────────────────────────────────────────────
  kiChatHistory: [],   // max. 16 Turns
  kiPerms: {
    create: true, delete: true, move: true, setProps: true,
    rename: true, link: true, layers: true, select: true, guides: true,
  },

  // ── Tools Extra (28-tools-extra.js) ───────────────────────────────────────────
  _clipboard:        null,
  _snapToObjEnabled: true,
  _polyPts:          [],
  _polyPreviewLine:  null,
  _polyLinkId:       null,
  _calPts:           null,   // {x1,y1,x2,y2} nach dem Kalibrierungs-Strich

  // ── Feature Batch 2 (29-feature-batch2.js) ────────────────────────────────────
  _streamFrozen:       false,
  _measurePt1:         null,
  _measureOverlay:     null,   // HTMLElement — gesetzt in 29-feature-batch2.js
  _calloutAnchor:      null,
  _calloutPreviewLine: null,

  // ── KI Chat UI (30-ki-chat-ui.js) ─────────────────────────────────────────────
  kiRegionRect: null,

  // ── Props Panel (12-props-panel.js) ───────────────────────────────────────────
  _suppressLinkExpand: false,

};

window.S = S; // console eval access
