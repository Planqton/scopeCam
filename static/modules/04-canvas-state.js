import { S } from './00-state.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CANVAS & STATE
// Canvas-Erstellung erfolgt in 00-state.js (garantiert zuerst ausgewertet).
// ═══════════════════════════════════════════════════════════════════════════════

S.currentTool   = null;
S.settings      = {};
S.history       = [];   // [{json, label, time}, ...]
S.historyIdx    = -1;
S._nextLabel    = null; // gesetzt vor saveHistory() für kontextuellen Label


