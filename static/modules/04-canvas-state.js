// ═══════════════════════════════════════════════════════════════════════════════
// CANVAS & STATE
// ═══════════════════════════════════════════════════════════════════════════════

let currentTool   = null;
let isPointerDown = false;
let startPoint    = null;
let previewObj    = null;
let settings      = {};
let history       = [];   // [{json, label, time}, ...]
let historyIdx    = -1;
let _nextLabel    = null; // gesetzt vor saveHistory() für kontextuellen Label

const canvas = new fabric.Canvas('canvas', { selection: false, renderOnAddRemove: true });
fabric.Object.prototype.strokeUniform  = true;  // Strichstärke bleibt beim Resizen konstant
fabric.Object.prototype.objectCaching  = false; // kein Bitmap-Cache → strokeUniform wirkt direkt auf Haupt-Canvas


