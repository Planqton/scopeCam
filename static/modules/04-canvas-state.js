// ═══════════════════════════════════════════════════════════════════════════════
// CANVAS & STATE
// ═══════════════════════════════════════════════════════════════════════════════

S.currentTool   = null;
let isPointerDown = false;
let startPoint    = null;
let previewObj    = null;
S.settings      = {};
S.history       = [];   // [{json, label, time}, ...]
S.historyIdx    = -1;
S._nextLabel    = null; // gesetzt vor saveHistory() für kontextuellen Label

S.canvas = new fabric.Canvas('canvas', { selection: false, renderOnAddRemove: true });
fabric.Object.prototype.strokeUniform  = true;  // Strichstärke bleibt beim Resizen konstant
fabric.Object.prototype.objectCaching  = false; // kein Bitmap-Cache → strokeUniform wirkt direkt auf Haupt-Canvas


