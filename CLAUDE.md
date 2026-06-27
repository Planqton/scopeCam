# ScopeCam — Projektstand

PCB-Annotationstool für Trinokular-Mikroskop. Streamt Kameraeingang auf eine Zeichenfläche, auf der Linien, Bemaßungen, Texte usw. eingezeichnet werden können.

---

## Infrastruktur

- **NAS**: OpenMediaVault auf Rockchip RK3588 (ARM64) — `192.168.0.20`
- **SSH**: `root@192.168.0.20` — Credentials in `test.md`
- **Portainer**: `http://192.168.0.20:9000` — admin-Login in `test.md`
- **Lokaler Dev-Container**: `http://localhost:8080` — auch im Netzwerk erreichbar als `192.168.0.125:8080`

Der NAS-Stack wurde bewusst gelöscht — Deployment läuft aktuell nur lokal zum Testen.

### Docker-Kontext

Zwei Docker-Installationen vorhanden:
- **`default`** (snap Docker) — nativer Gerätezugriff → **für ScopeCam verwenden**
- **`desktop-linux`** (Docker Desktop, QEMU-VM) — kein Zugriff auf `/dev/video*`

```bash
# Immer mit --context default starten:
docker --context default compose up -d --build
```

---

## Kamera / Video-Pipeline

### Lokale USB-Kamera (Entwicklung)
- **Gerät**: `/dev/video4` — `USB Video: USB Video` (UVC, uvcvideo-Treiber)
- **Laptop-Kamera**: `/dev/video0–3` — wird **nicht** verwendet (Default ist `demo`)
- **V4L2-Typ**: Standard Video Capture (kein MPLANE)
- **Format**: MJPG bis 1920×1080 @ 60 fps
- **Wichtig**: YUYV-Fallback liefert nur 5 fps bei 1080p → immer MJPG verwenden

### NAS-Kamera (Produktion)
- **Gerät**: `/dev/video0` — Rockchip `rk_hdmirx` HDMI-Receiver
- **V4L2-Typ**: Multiplanar (MPLANE) — **inkompatibel** mit OpenCV und FFmpeg v4l2-Demuxer
- **Format**: NV24 (Y/UV 4:4:4), 1600×1200 @ 60 fps

### Pipeline-Logik (`main.py → _capture`)

```
MPLANE-Gerät:  v4l2-ctl --stream-mmap --stream-to=- | ffmpeg -f rawvideo -pixel_format nv24
UVC + MJPG:    ffmpeg -f v4l2 -input_format mjpeg -framerate N
UVC fallback:  ffmpeg -f v4l2 -framerate N
Alle → ffmpeg → image2pipe → JPEG → WebSocket → Browser-Canvas
```

`query_device_format()` erkennt automatisch MPLANE und MJPG-Unterstützung.

---

## Stack

| Datei | Zweck |
|---|---|
| `Dockerfile` | python:3.11-slim + ffmpeg + v4l-utils |
| `requirements.txt` | fastapi, uvicorn, numpy, opencv-headless, PyTurboJPEG, httpx |
| `main.py` | FastAPI-Backend: WebSocket-Stream, Settings-API, Geräteliste, File-API, KI-Proxy, Client-Settings |
| `static/index.html` | App-Shell: Menüleiste, Panels, Viewer, Einstellungsseite, Mobile-UI |
| `static/app.js` | Alle JS-Logik |
| `static/style.css` | Dark-Theme + 5 weitere Designs, Panel-System, KI-Chat, Mobile |
| `static/demo.png` | PCB-Testbild für Demo-Modus |
| `docker-compose.yml` | `build: .`, Port 8080, `/dev:/dev` mount, `privileged: true` |

---

## Features (implementiert)

### Video
- Live-Stream via WebSocket → `<canvas>` (kein Lag)
- **Demo-Modus**: `demo` als Kameragerät → zeigt `demo.png`; **ist der Default**
- **Demo-Banner**: orangefarbenes Pill-Banner über dem Canvas wenn Demo aktiv; Link öffnet Geräte-Einstellungen
- Flip H/V, Stream-Skalierung (25–100%), JPEG-Qualität, Max-FPS einstellbar
- Settings → **"Default Device"** (früher "Gerät")

### Tab-System
- Tabs für Kamera-Live und Snapshot-Hintergründe
- Close-Button immer sichtbar (auch bei letztem Tab)
- **Letzter Tab geschlossen → automatisch neuer "Kamera"-Tab mit Default Device**
- Pro Tab eigene Canvas-History, Ebenen, Savepath
- **Ungespeicherte Änderungen**: blauer Dot-Indikator im Tab-Header; Tab-Schließen mit ungespeicherten Änderungen zeigt Bestätigungs-Dialog
- **beforeunload**-Warnung: Browser warnt beim Verlassen wenn irgendein Tab ungespeicherte Änderungen hat

### Menüleiste
- **Datei**:
  - **Speichern** `Ctrl+S` — speichert direkt an aktuellen Pfad; wenn kein Pfad gesetzt: ausgegraut, öffnet aber trotzdem File-Manager
  - **Speichern unter** `Ctrl+Shift+S` — öffnet immer den File-Manager
  - **Öffnen** `Ctrl+O` — öffnet File-Manager im Öffnen-Modus
  - **File Manager** — öffnet File-Manager ohne Speichern/Öffnen-Aktion (Browse-Modus)
  - JSON exportieren/importieren, PNG exportieren, **SVG exportieren** (`canvas.toSVG()`)
- **Bearbeiten**: Rückgängig `Ctrl+Z`, Wiederholen `Ctrl+Y`, **Kopieren `Ctrl+C`**, **Einfügen `Ctrl+V`**, **Duplizieren `Ctrl+D`**, Verknüpfen `Ctrl+G`, Verknüpfung aufheben `Ctrl+Shift+G`, Löschen `Entf`, Alle löschen
- **Ansicht**: Timeline, Log Fenster, **Konsole** `F12` (direkt im Menü); Raster, Hilfslinien sichtbar/einrasten/löschen, PCB-Kanten

### Projektformat `.scopecam`
- Gültiges PNG (öffnet in Paint.NET / Pinta via Datei-Assoziierung)
- Metadaten als **iTXt-Chunk** eingebettet: `frame` (JPEG-Hintergrund), `canvasJSON`, `layers`, `guides`, `history`
- `_pngInjectITXt()` / `_pngReadITXt()` — eigene CRC32-Implementierung
- `_buildProjectBytes()` → PNG-Bytes; `loadProject(buf, serverPath)` → stellt alles wieder her
- **`currentSavePath`** pro Tab — nach Speichern/Öffnen gesetzt; Ctrl+S speichert direkt ohne Dialog

### Server-seitiger File-Manager (`main.py`)
- Storage: `/app/data/projects/` (Docker named volume `scopecam_data`)
- Endpoints: `GET /api/files`, `POST /api/files/mkdir`, `DELETE /api/files`, `POST /api/files/rename`, `GET /api/files/read`, `POST /api/files/write`
- `_safe(rel)` — verhindert Path-Traversal
- **File-Manager-Modal**: Breadcrumb, Ordner erstellen, Umbenennen, Löschen, Herunterladen, Kontextmenü
- **Vorschau-Panel** (rechts im File-Manager): Einzelklick auf Bild/`.scopecam` → Vorschau; bei `.scopecam` wird `frame` aus iTXt extrahiert. Öffnet sich mit Animation (`width: 0 → 220px`)

### Server-seitige Client-Settings
- `GET/POST /api/client-settings` → `/app/data/client-settings.json`
- Alle `scopecam_*`-Keys aus `localStorage` werden debounced (800ms) auf den Server synchronisiert
- `localStorage.setItem` ist überschrieben → Sync automatisch bei jeder Änderung
- Beim Start: Server-Daten überschreiben Browser-Daten (Server gewinnt); wenn Server leer → Browser-Daten hochladen
- Ermöglicht Geräteübergreifende Einstellungssynchronisierung

### Status-Leiste
- `setStatus(msg, durationMs=9000)` — zeigt Aktionsmeldungen in der Fußleiste (mittig)
- Fade-out nach ~9 Sekunden (CSS-Transition `opacity`)
- Wird aufgerufen bei: Speichern, Öffnen, Export, Undo/Redo, Löschen, Achssperrung

### Log-Panel (`data-panel="log"`)
- Zugriff über **Ansicht → Log Fenster**
- `scopeLog(msg, level)` — schreibt Zeile in Log mit Timestamp (`info`/`warn`/`error`)
- Öffnet sich automatisch beim ersten Eintrag
- Volle Breite im unteren Dock
- "Leeren"-Button

### Konsole (`data-panel="console"`)
- Zugriff über **Ansicht → Konsole** oder `F12`
- Standard-Dock: unten
- Terminal-Stil: monospacefont, farbige Ausgabe (grün=ok, rot=err, gelb=warn, cyan=info)
- **Tab-Completion**: ein Match → direkt eingesetzt; mehrere → Vorschau
- **Befehlshistorie**: ↑/↓ zum Durchblättern (max. 100 Einträge)
- `_conRun(raw)` — parst und führt Befehl aus; `"text mit Leerzeichen"` als Argument möglich
- `_conResolveObj(ref)` — löst Objekt auf: Index `#0`, Name (exakt oder fuzzy), oder `undefined` = aktuelle Auswahl
- `cmd(names, usage, desc, fn)` — registriert Befehl in `CMDS`-Map
- Ausgabe-Funktionen: `_cOk`, `_cErr`, `_cWarn`, `_cInfo`, `_cEcho`, `_cTable(rows[])`
- **Befehls-Kategorien**:
  - **Objekte**: list, info, select, deselect, delete, deleteAll, rename, move, scale, rotate, color, opacity, lock, unlock, hide, show, bringFwd/sendBwd/bringTop/sendBottom, duplicate, group, ungroup
  - **Messen**: measure (Abstand Mittelpunkte), bbox, area (px²/mm²), count [typ], traceLen [linkGrpPrefix]
  - **Werkzeug**: tool \<name\>, activeTool
  - **Ansicht**: zoom \<faktor|in|out|reset\>, fit, center, pan \<x\> \<y\>, zoomSel
  - **Hilfslinien**: guide \<h|v\> \<pos\>, guides, clearGuides
  - **Raster**: grid \<on|off\>, gridSize \<px\>, gridOrigin \<x\> \<y\>, snap \<on|off\>
  - **Kamera**: device \<name|demo\>, freeze \<on|off\>, quality \<10-100\>, fps \<1-60\>
  - **Datei**: save, saveAs, export \<png|svg|json\>
  - **Ebenen**: layers, layer \<name\>, deleteLayer \<name\>
  - **History**: undo \[n\], redo, history, clearHistory
  - **KI**: ki \<prompt\>, clearKi
  - **System**: help \[befehl\], clear, echo, status, log, settings, design \<name\>, reload
  - **eval**: beliebiges JS ausführen (Power-User)

### Timeline-Panel (`data-panel="timeline"`)
- **Pro Tab eigene History** — `tab.history = [{json, label, time}, ...]`, `tab.historyIdx`
- **Maximale History-Tiefe: 100 Einträge** (älteste werden verworfen)
- Loggt jede Aktion mit präzisem Label und Uhrzeit:
  - Zeichenwerkzeuge: Linie, Pfeil, Bemaßung, Rechteck, Kreis, Text, Freihand
  - Objekt modifiziert: **Verschoben / Skaliert / Rotiert / Bearbeitet** (via `e.action` von Fabric.js)
  - Eigenschaften: Farbe geändert, Strichbreite, Füllung, Schriftart, Schriftgröße, Textfarbe, Formatierung
  - Verknüpfen: "3 Objekte verknüpft", "Verknüpfung aufgehoben"
  - Hilfslinien: "Hilfslinie horizontal hinzugefügt", "verschoben", "gelöscht", "Alle Hilfslinien gelöscht"
  - Ebenen: "Ebene 'Name' erstellt", "Ebene 'Name' gelöscht"
  - KI: "KI: rect erstellt", "KI: verschoben", "KI: Hilfslinie" usw.
- Neueste Einträge oben; aktueller Stand hervorgehoben (gelber Balken); zukünftige Einträge (Redo) ausgegraut
- Klick → springt direkt zu diesem Stand (`restoreHistory(idx)`)
- `_nextLabel` — globale Variable; vor `saveHistory()` setzen für kontextuellen Label
- History wird in `.scopecam`-Datei mitgespeichert und beim Öffnen wiederhergestellt
- Ansicht → Timeline zum Ein-/Ausblenden

### Zeichenwerkzeuge (Fabric.js 5.3.0)
- **Auswahl** (S) — Standard beim Start
- Linie (L), Pfeil (A), Bemaßung (D), Rechteck (R), Kreis (C), Text (T), Freihand (F), Hand (H)
- **Polylinie** (P) — Klick = Punkt hinzufügen, Doppelklick oder Enter = fertigstellen; alle Segmente erhalten denselben `linkGroup`-UUID; temporäre Segmente haben `_polyTmp: true` und werden bei `_polyFinish()` durch selektierbare ersetzt; Escape bricht ab
- **Kalibrierung** — Linie über bekannte Strecke zeichnen → Modal fragt Länge in mm → berechnet `scale_px_per_mm`
- **Escape**: Werkzeug abwählen, Auswahl aufheben
- **Rechtsklick auf Canvas-Objekt**: Kontextmenü mit Reihenfolge / Verknüpfen / Sperren / Löschen / Label bearbeiten (Text)
- `addArrow()` und `addDimension()` geben das Fabric-Objekt zurück (wichtig für KI-Aktionen)

### Achssperrung beim Verschieben
- `Alt+X` — nur horizontale Bewegung erlaubt (Y fixiert)
- `Alt+Y` — nur vertikale Bewegung erlaubt (X fixiert)
- Toggle (nochmal drücken hebt Sperre auf); wird bei `mouse:up` automatisch aufgehoben
- `axisLock` + `_axisStart` im `object:moving`-Handler
- **Wichtig**: Bei aktiver Achssperrung ist Einrasten (Grid, Hilfslinien, PCB, Objekt-Snap) automatisch deaktiviert

### Einrasten
- **Grid-Snap**: `canvas.on('object:moving')` — `Ctrl` gedrückt = Snap temporär ignorieren (`_snapSkipActive`)
- **Hilfslinien-Snap**: ebenfalls `Ctrl` zum Überspringen
- **Objekt-Snap** (`_snapToObjEnabled`): Magnetisch an Ecken, Kantenmittelpunkte und Linienpunkte anderer Objekte. Threshold: 12 px. Für Linien: `calcLinePoints()` liefert Endpunkte. Deaktiviert wenn `_snapSkipActive || axisLock`.
- Grid-Einstellungen: Größe, Sichtbarkeit, Snap — `scopecam_grid_v1`

### Hilfslinien
- Ziehen vom Lineal → erstellt Hilfslinie (cyan, gestrichelt)
- **Auswählen vor Verschieben**: Erster Klick = auswählen (gelb, durchgezogen), zweiter Klick+Drag = verschieben
- `selectedGuide = {axis, idx}` auf Modul-Ebene; `canvas.on('after:render')` zeichnet Selektion
- Entf-Taste löscht ausgewählte Hilfslinie
- Außerhalb Canvas ziehen = löschen
- Hilfslinien im Objekt-Manager als flache Sektion "HILFSLINIEN" (ohne Ebenen-Hierarchie)
- Gespeichert in `guideLines = {h: [], v: []}` (Image-Koordinaten), `scopecam_guides_v1`

### Shortcut-Manager
- **Einstellungen → Tastenkürzel** — alle Kürzel editierbar
- `SC_DEFAULTS` / `SC` / `_loadShortcuts()` / `_saveShortcuts()` — `scopecam_shortcuts_v1`
- `matchSC(e, id)` — prüft Event gegen konfigurierten Shortcut
- `scLabel(id)` — erzeugt lesbares Label (z.B. "Ctrl+S")
- Aufnahme-Modus: Klick auf Feld → gelb blinkend → Taste drücken → gespeichert
- "Alle zurücksetzen"-Button; Kategorien: Werkzeuge, Bearbeiten, Datei, Ansicht, Verschieben
- Keydown-Handler nutzt `matchSC()` statt hardcodierte Checks

### Panel-System
- Panels: **Werkzeuge**, **Eigenschaften**, **Objekte**, **KI**, **Capture**, **Timeline**, **Log**
- Frei schwebend oder links/rechts/unten andocken
- `PANEL_DEFAULTS` — timeline: `{ mode: 'float', open: false, ... }`, log: `{ mode: 'float', open: false, ... }`, console: `{ mode: 'bottom', open: false, ... }`
- Persistenz: `localStorage` (`scopecam_panels_v4`)

### Eigenschaften-Panel
- Farbe, Strichbreite, Standardschriftgröße
- Bei Objekt-Auswahl: Rahmenfarbe, Breite, Füllfarbe
- Bei Text: Inhalt (live → `obj.set('text', ...)`), Schriftart, -größe, Farbe, B/I/U/Durchgestrichen — alle via `_getActiveText()` (findet IText auch in ActiveSelection; prüft `.type === 'i-text'` statt nur `instanceof`)
- Bei Bemaßung: Checkbox „Maßung überschreiben" → manuelles Label
- Bei ≥2 Objekten ausgewählt: **Ausrichten-Sektion** (`#propsAlign`) mit 8 Buttons — `alignObjects(mode)`: left/right/top/bottom/centerH/centerV/distH/distV

### Objekt-Manager (`data-panel="layers"`)
- Listet alle Canvas-Objekte + Hilfslinien (flache Sektion)
- Umbenennen (Doppelklick), Sperren 🔒, Reihenfolge ↑/↓, Sichtbarkeit 👁
- Kontextmenü: Umbenennen, Verstecken, Verknüpfung aufheben, In andere Ebene verschieben, Löschen
- Verknüpfte Objekte zeigen ⛓-Badge
- Hilfslinien: Klick = Flash-Animation, Löschen-Button

### Objekt-Verknüpfung (Link Groups)
- `Ctrl+G` → verknüpfen; `Ctrl+Shift+G` → aufheben
- `linkGroup` (UUID) als Custom-Prop; `objId` (UUID) für KI-Referenzierung
- Visualisierung: gestrichelte blaue Mesh-Linien zwischen Mittelpunkten

### Bemaßung
- Zeigt px oder mm (wenn `scale_px_per_mm` kalibriert)
- `dimPx` speichert Roh-Pixelwert

### Lineale
- Horizontal + Vertikal, HiDPI-scharf
- Einheit: px / mm / inch / %
- Hilfslinien durch Ziehen vom Lineal erstellen

### Design-System
- 6 Presets: **dark** (Standard), **midnight**, **carbon**, **light**, **solarized**, **nord**
- 14 CSS-Variablen (`--clr-*`) per JS überschreibbar

### KI-Integration (`scopecam_ki_v1`)
- **Settings → KI-Tab**: Provider-Presets (OpenAI / Anthropic / Google / Custom), URL, Key, Modell, Prompt-Vorlage
- **Extended Thinking**: Sektion nur sichtbar bei Anthropic/Google (bei OpenAI ausgeblendet)
  - Anthropic: `thinking: { type: 'enabled', budget_tokens: N }` im Request-Body
  - Google: wechselt bei Thinking auf native Gemini-API (`generateContent` + `thinkingConfig`)
  - Thinking-Inhalt erscheint als aufklappbarer `💭 Gedanken`-Block im KI-Chat (innerhalb der Antwort)
- **Google-Modellname**: `models/gemini-2.5-pro` → Prefix `models/` wird automatisch gestripped
- **Google alle Requests**: gehen über `/api/ki_proxy` (FastAPI + httpx) um CORS zu vermeiden
- **KI-Panel** (`data-panel="ki"`): Chat-Interface
  - Enter = Senden, Shift+Enter = Neue Zeile
  - ⊠ Bereich-Button: Rubber-Band auf Canvas → Koordinaten + Snapshot als Kontext
  - Jede Anfrage mit aktuellem Live-Frame
- **KI kennt Canvas-Zustand**: alle Objekte, Ebenen, Hilfslinien, Auswahl
- **KI-Aktionen**: create (text/rect/circle/line/arrow/**dimension**), move, delete, setProps, rename, link, unlink, createLayer, moveToLayer, select, addGuide, moveGuide, removeGuide, clearGuides
  - `axis` für Hilfslinien: immer `"h"` oder `"v"` — `"x"`/`"y"` werden automatisch normalisiert
  - `addArrow`/`addDimension` geben Objekt zurück → `objId`/`linkGroup`/`customName` werden gesetzt
  - Alle KI-Aktionen werden in der Timeline geloggt (`KI: <typ>`)
- **KI-Batch-Undo**: `_kiBatchMode = true` vor der Action-Schleife, `false` danach — unterdrückt alle `saveHistory()`-Calls innerhalb; ein einziger Eintrag am Ende
- **Leiterbahnen-Prompt**: System-Prompt enthält Anweisung, Traces als mehrere verbundene Liniensegmente mit exakt übereinstimmenden Endpunkten und gleichem `linkGroup` zu zeichnen
- **Kontext-Management**: max. 16 Turns in `kiChatHistory`; bei Überschreitung erscheint Info-Meldung im Chat
- Provider-Auth: OpenAI/Google → `Authorization: Bearer`; Anthropic → `x-api-key` + `anthropic-version`; Google native → Key im URL-Parameter

### Mobile-Version (`@media (max-width: 768px)`)
- Desktop-UI komplett ausgeblendet (Menüleiste, Statusleiste, Tab-Bar, Docks, Lineale)
- **`#mobTopBar`** (48px oben): Undo, Redo, KI-Toggle, Speichern, Menü-Button
- **`#mobToolBar`** (62px unten): 9 Zeichenwerkzeug-Buttons mit aktivem Zustand
- **`#mobSheet`** / `#mobSheetBg`: Action-Sheet (slide-up) für Datei-Aktionen, KI, Timeline, Einstellungen
- Panels öffnen als Vollbild-Overlays (`position:fixed; inset:48px 0 62px 0`)
- `applyPanel` ist monkey-gepatcht für Mobile: `el.removeAttribute('style')` + `.classList.add('mob-overlay')`
- Pinch-Zoom über Touch-Events auf `#canvasWrapper`

---

## JS-Architektur (`app.js`)

```
SERVER-SETTINGS     — _syncSettingsToServer(), _loadSettingsFromServer(), localStorage.setItem override
PANEL MANAGER       — applyPanel(), loadPanelStates(), Drag/Dock-Logik, 3 Docks (L/R/Bottom)
STATUS-LEISTE       — setStatus(msg, durationMs)
LOG-PANEL           — scopeLog(msg, level)
CANVAS & STATE      — currentTool, history, settings, axisLock
VIDEO / WEBSOCKET   — connectWS(), showDemo(), applyDevice() → Demo-Banner
CANVAS-LAYOUT       — syncCanvasSize(), Lineal-Events
CANVAS-KONTEXTMENÜ  — Rechtsklick: Reihenfolge, Link, Sperren, Label-Bearbeiten, Löschen
WERKZEUGE           — activateTool(), deactivateTool(), TOOL_NAMES
                      (select/hand/line/arrow/dimension/rect/circle/text/freehand/polyline/calibrate)
MAUS-EVENTS         — canvas.on('mouse:down/move/up/dblclick')
ACHSSPERRUNG        — axisLock, _axisStart, canvas.on('object:moving')
ZEICHEN-HELPER      — addArrow(), addDimension() → geben Objekt zurück
POLYLINIE           — _polyPts[], _polyPreviewLine, _polyLinkId, _polyFinish(), _polyCleanPreview()
KALIBRIERUNG        — _calPts, _openCalibrateModal() → #calibrateModal; berechnet scale_px_per_mm
COPY/PASTE          — _clipboard, copySelected(), pasteClipboard(), duplicateSelected()
AUSRICHTEN          — alignObjects(mode): left/right/top/bottom/centerH/centerV/distH/distV
OBJEKT-SNAP         — _getSnapPoints(other), canvas.on('object:moving') → _snapToObjEnabled, 12px
EIGENSCHAFTEN       — updatePropsPanel(), clearPropsPanel(), Prop-Inputs
                      _getActiveText() — findet IText auch in ActiveSelection (prüft .type, nicht instanceof)
OBJEKT-VERKNÜPFUNG  — linkSelectedObjects(), unlinkObjects(), expandToLinkGroup()
OBJEKT-MANAGER      — refreshLayersList(), getObjLabel(), Ebenen-System
HISTORY / TIMELINE  — saveHistory(label), restoreHistory(idx), refreshTimeline(), _nextLabel
                      MAX_HISTORY=100, _kiBatchMode, _markSaved(), _isDirty(), _updateDirtyIndicator()
DATEI-OPERATIONEN   — _buildProjectBytes(), saveProject(), saveProjectAs(), loadProject()
                      _pngInjectITXt(), _pngReadITXt(), _crc32(), exportSVG()
                      _setSavePath(), _markSaved() → dirty-Tracking
SHORTCUT-SYSTEM     — SC_DEFAULTS, SC, matchSC(e,id), scLabel(id), renderScManager()
TASTATURKÜRZEL      — keydown handler (nutzt matchSC)
EINSTELLUNGEN       — populateSettings(), applyDesign(), Design-Presets
LINEALE             — drawHRuler(), drawVRuler(), px2label(), chooseStep(), getRulerColors()
RASTER              — drawGrid(), gridState, scopecam_grid_v1
HILFSLINIEN         — drawGuides(), guideLines, selectedGuide, initGuides()
                      guideCanvas (z-index:11, pointer-events:none)
FILE-MANAGER        — openFileManager(mode), _fmLoad(), _fmRender(), _fmShowPreview()
                      _fmConfirmSave(), _fmConfirmOpen(), _fmClose()
KI-EINSTELLUNGEN    — KI_PROVIDERS, loadKiSettings(), fetchKiModels(), testKiConnection()
                      _updateThinkingVisibility(providerName)
KI CHAT             — captureKiFrame(), buildKiSystemPrompt(), callKiLLM()
                      parseKiResponse(), executeAIActions(), sendKiMessage()
                      kiAppendMessage(), kiAppendThinking()
MOBILE              — _isMobile(), _updateMobTools(), _openMobSheet(), Pinch-Zoom
                      applyPanel monkey-patch für mob-overlay
KONSOLE PANEL       — initConsole() IIFE; cmd(), _conRun(), _conResolveObj(), _cTable()
                      Tab-Completion, Befehlshistorie (↑↓), F12-Toggle
INIT                — init() → await _loadSettingsFromServer(), lädt Design, Tabs, Settings
```

---

## Custom Props (CUSTOM_PROPS)

```js
['customName', 'locked', 'layerId', 'objVisible',
 'isDimension', 'dimPx', 'dimLabelOverride',
 'linkGroup', 'objId', 'lockPosition', 'lockSize']
```

---

## localStorage-Keys

| Key | Inhalt |
|---|---|
| `scopecam_panels_v4` | Panel-Positionen, Dock-Modus, open/collapsed |
| `scopecam_dock_widths` | Breiten von links/rechts, Höhe von unten |
| `scopecam_design_v1` | Aktives Design (alle CSS-Variablen) |
| `scopecam_view_v1` | Zoom-Level, Pan-Position |
| `scopecam_ki_v1` | KI-Endpoint, API-Key, Modell, Template, Thinking-Settings |
| `scopecam_ki_perms_v1` | KI-Berechtigungen |
| `scopecam_sp_pos` | Position des Einstellungen-Fensters |
| `scopecam_guides_v1` | Hilfslinien + Sichtbarkeit + Snap |
| `scopecam_grid_v1` | Raster-Einstellungen |
| `scopecam_pcblive_v1` | PCB-Kanten-Snap-Einstellungen |
| `scopecam_shortcuts_v1` | Benutzerdefinierte Tastenkürzel |

Alle `scopecam_*`-Keys werden zusätzlich server-seitig in `/app/data/client-settings.json` gespiegelt.

---

## Backend-API (`main.py`)

| Endpoint | Beschreibung |
|---|---|
| `GET /api/files?path=` | Verzeichnislisting |
| `POST /api/files/mkdir?path=` | Ordner erstellen |
| `DELETE /api/files?path=` | Datei/Ordner löschen |
| `POST /api/files/rename` | Umbenennen (JSON: `{path, newName}`) |
| `GET /api/files/read?path=` | Datei herunterladen / lesen |
| `POST /api/files/write?path=` | Datei speichern (raw bytes) |
| `GET /api/client-settings` | Client-Einstellungen lesen |
| `POST /api/client-settings` | Client-Einstellungen schreiben |
| `POST /api/ki_proxy` | KI-Proxy (Google native API via httpx, CORS-frei) |

`_safe(rel)` validiert alle Pfade gegen `PROJECTS_DIR`.

---

## Bekannte Eigenheiten / Fallstricke

- **Docker Desktop (QEMU)** kann nicht auf `/dev/video*` zugreifen → immer snap Docker (`--context default`)
- `docker restart` rekreiert keinen Container aus neuem Image → immer `compose up -d --build`
- `panelElCache` muss beim Start aufgebaut werden — nach `el.remove()` schlägt `querySelector` fehl
- Fabric-Canvas-Offset per JS gesetzt (kein `!important` in CSS) — behebt „nur 1/4 zeichenbar"-Bug
- UVC-Kamera: YUYV liefert bei 1920×1080 nur 5 fps → MJPG mit `-input_format mjpeg` verwenden
- Panel-Key-Bumps setzen alle Layouts zurück → nur bei echten Schema-Brüchen bumpen
- **KI-Bereich-Koordinaten**: Ausschnitt-Bild hat Pixel (0,0) ≠ Canvas (0,0) → Offset im System-Prompt
- **Google Modellnamen**: API liefert `models/gemini-2.5-pro` → `models/`-Prefix wird in `callKiLLM` gestripped
- **Google Thinking**: native Gemini-API (`generateContent`) statt OpenAI-compat → nur bei `kiSettings.thinking === true`; alle Google-Requests über `/api/ki_proxy`
- **KI Hilfslinien**: KI sendet manchmal `axis:"x"/"y"` → wird in `executeAIActions` zu `"v"/"h"` normalisiert
- `guideLines` Koordinaten = Image-Pixel (gleich wie Fabric `left`/`top`), nicht CSS-Pixel
- `selectedGuide` ist auf Modul-Ebene (nicht in `initGuides`) — damit `after:render` darauf zugreifen kann
- `Ctrl` während Verschieben = Snap (Grid + Hilfslinien + Objekt-Snap) temporär ignorieren
- **Achssperrung deaktiviert Snap**: wenn `axisLock !== null`, überall `|| axisLock` prüfen
- **Dirty-Tracking**: `_savedHistoryIdx` wird pro Tab in `tab._savedHistoryIdx` gespeichert; nach `loadProject` wird `_markSaved()` mit `setTimeout(50)` aufgerufen (weil saveHistory async folgt)
- **`instanceof fabric.IText` unzuverlässig nach JSON-Reload** → stets `obj.type === 'i-text' || obj.type === 'text'` zusätzlich prüfen
- **`_kiBatchMode`**: verhindert mehrfache saveHistory()-Calls in executeAIActions; IMMER auf `false` zurücksetzen (auch im Fehlerfall — ggf. try/finally erwägen)
- **Polylinie `_polyTmp`**: temporäre Segmente werden beim Zeichnen mit `_polyTmp: true` markiert; `_polyFinish()` entfernt sie alle und erstellt selektierbare Segmente; `_polyCleanPreview()` entfernt nur die Vorschau-Linie
- **Kein Mehrbenutzer-Schutz**: Zwei Geräte können gleichzeitig überschreiben — kein Locking

---

## Offene Punkte

- NAS-Deployment wieder einrichten (Stack in Portainer, Port 7733)
- Lagtest mit echter HDMI-Kamera am NAS
- Bug-Suchlauf ausstehend (siehe `bug.md`)
