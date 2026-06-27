// ScopeCam — app.js
//
// Der Code wurde in 33 Module aufgeteilt (static/modules/).
// index.html lädt sie in der richtigen Reihenfolge.
//
// Modul-Übersicht:
//   01-server-settings   — Settings-Sync + localStorage-Override
//   02-panels            — Panel-Manager, Dock, Drag
//   03-status-log        — setStatus(), scopeLog()
//   04-canvas-state      — Fabric-Canvas-Init, globals
//   05-video             — WebSocket-Stream, Demo-Modus
//   06-transform         — Zoom, Pan, applyTransform()
//   07-canvas-layout     — syncCanvasSize(), Kontextmenü, Lineale-Events
//   08-tabs              — Tab-System, Snapshot-Hintergründe
//   09-tools             — activateTool(), deactivateTool()
//   10-mouse-events      — canvas mouse:down/move/up/dblclick
//   11-draw-helpers      — addArrow(), addDimension()
//   12-props-panel       — Eigenschaften-Panel
//   13-layers            — Ebenen-CRUD, refreshLayersList(), Objekt-Manager
//   14-history           — saveHistory(), restoreHistory(), Timeline
//   15-capture           — Snapshot, MediaRecorder
//   16-file-ops          — PNG-iTXt, saveProject(), loadProject()
//   17-shortcuts         — SC_DEFAULTS, matchSC(), renderScManager()
//   18-keyboard          — Achssperrung + keydown-Handler
//   19-file-manager      — openFileManager(), Server-Datei-API
//   20-design            — Design-Presets, applyDesign()
//   21-settings-ui       — Einstellungen-Fenster
//   22-rulers            — drawHRuler(), drawVRuler()
//   23-grid              — drawGrid(), gridState, Snap
//   24-guides            — Hilfslinien (initGuides, drawGuides)
//   25-pcb-snap          — PCB-Kanten-Snap (Beta)
//   26-ki-settings       — KI-Provider, loadKiSettings(), testKiConnection()
//   27-ki-core           — buildKiSystemPrompt(), callKiLLM(), executeAIActions()
//   28-tools-extra       — Copy/Paste, Align, Snap-to-Obj, Polyline, Kalibrierung
//   29-feature-batch2    — 12 Features: Freeze, Winkelsnap, Zoom-to-Sel, …
//   30-ki-chat-ui        — KI-Chat-UI, Bereich-Auswahl, sendKiMessage()
//   31-console-panel     — Konsole (IIFE, 48 Befehle)
//   32-init              — init()
//   33-mobile            — Mobile-UI, Pinch-Zoom, Top-Bar
