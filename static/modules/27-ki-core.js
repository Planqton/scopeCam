// ═══════════════════════════════════════════════════════════════════════════════
// KI CHAT
// ═══════════════════════════════════════════════════════════════════════════════

let kiChatHistory = []; // {role:'user'|'assistant', content:''}

const KI_CHAT_KEY = 'scopecam_ki_chat_v1';

function saveKiChat() {
  try { localStorage.setItem(KI_CHAT_KEY, JSON.stringify(kiChatHistory)); } catch (_) {}
}

// ── KI Berechtigungen ────────────────────────────────────────────────────────
const KI_PERMS_KEY = 'scopecam_ki_perms_v1';
const KI_PERM_DEFAULTS = { create: true, delete: true, move: true, setProps: true, rename: true, link: true, layers: true, select: true, guides: true };
let kiPerms = { ...KI_PERM_DEFAULTS };

function loadKiPerms() {
  try {
    const s = JSON.parse(localStorage.getItem(KI_PERMS_KEY));
    if (s) kiPerms = { ...KI_PERM_DEFAULTS, ...s };
  } catch (_) {}
  document.querySelectorAll('#kiPermsBody [data-perm]').forEach(cb => {
    cb.checked = !!kiPerms[cb.dataset.perm];
    cb.addEventListener('change', () => {
      kiPerms[cb.dataset.perm] = cb.checked;
      try { localStorage.setItem(KI_PERMS_KEY, JSON.stringify(kiPerms)); } catch (_) {}
    });
  });
}

function kiPermAllowed(action) {
  if (action === 'createLayer' || action === 'moveToLayer' || action === 'renameLayer') return !!kiPerms.layers;
  if (action === 'unlink') return !!kiPerms.link;
  if (action === 'addGuide' || action === 'moveGuide' || action === 'removeGuide' || action === 'clearGuides') return !!kiPerms.guides;
  return !!kiPerms[action];
}

function loadKiChat() {
  try {
    const saved = JSON.parse(localStorage.getItem(KI_CHAT_KEY));
    if (Array.isArray(saved)) {
      kiChatHistory = saved;
      const el = document.getElementById('kiMessages');
      if (el) saved.forEach(m => kiAppendMessage(m.role, m.display ?? m.content, m.actions ?? null));
    }
  } catch (_) {}
}

function getCanvasStateForAI() {
  return {
    objects: canvas.getObjects().map(obj => ({
      id:          obj.objId,
      type:        obj.isDimension ? 'dimension' : obj.type,
      name:        obj.customName || '',
      layer:       obj.layerId || 'default',
      x:           Math.round(obj.left),
      y:           Math.round(obj.top),
      w:           Math.round((obj.width  || 0) * (obj.scaleX || 1)),
      h:           Math.round((obj.height || 0) * (obj.scaleY || 1)),
      fill:        typeof obj.fill === 'string' ? obj.fill : null,
      stroke:      obj.stroke   || null,
      strokeWidth: obj.strokeWidth || null,
      text:        obj.text     || null,
      fontSize:    obj.fontSize || null,
      locked:      obj.locked   || false,
      visible:     obj.objVisible !== false,
      linkGroup:   obj.linkGroup || null,
      dimLabel:    obj.isDimension ? (obj.dimLabelOverride || getDimAutoLabel(obj.dimPx || 0)) : null,
    })),
    layers:      layers.map(l => ({ id: l.id, name: l.name, visible: l.visible })),
    selectedIds: canvas.getActiveObjects().map(o => o.objId).filter(Boolean),
    canvasSize:  { w: canvas.width, h: canvas.height },
  };
}

function buildKiSystemPrompt() {
  const base = kiSettings.template ||
    'Du bist ein KI-Assistent für PCB-Annotation. Antworte präzise auf Deutsch.';
  const state  = JSON.stringify(getCanvasStateForAI(), null, 2);
  const region = getKiRegionInCanvasCoords();

  // Bilddimensionen ermitteln (was die KI tatsächlich sieht)
  const videoCanvas = document.getElementById('videoCanvas');
  const imgW = region ? region.w : (videoCanvas.width  || canvas.width);
  const imgH = region ? region.h : (videoCanvas.height || canvas.height);

  const regionNote = region
    ? `\n## Aktiver Bildausschnitt (KRITISCH für Koordinaten!)
Das mitgesendete Bild ist ${imgW}×${imgH}px und zeigt einen Ausschnitt des Canvas:
- Pixel (0,0) im Bild = Canvas-Koordinate (${region.x}, ${region.y})
- Pixel (${imgW},${imgH}) im Bild = Canvas-Koordinate (${region.x + imgW}, ${region.y + imgH})
- Formel: Canvas-X = Bild-X + ${region.x},  Canvas-Y = Bild-Y + ${region.y}
- IMMER den Offset addieren wenn du Objekte platzierst!\n`
    : `\n## Bild
Das mitgesendete Bild ist ${imgW}×${imgH}px und zeigt den gesamten Canvas.
Bildkoordinaten = Canvas-Koordinaten direkt.\n`;

  const permLabels = { create:'Objekte erstellen', delete:'Objekte löschen', move:'Verschieben', setProps:'Eigenschaften ändern', rename:'Umbenennen', link:'Verknüpfen', layers:'Ebenen', select:'Auswahl', guides:'Hilfslinien' };
  const allowed  = Object.entries(kiPerms).filter(([,v])=>v).map(([k])=>permLabels[k]||k).join(', ');
  const blocked  = Object.entries(kiPerms).filter(([,v])=>!v).map(([k])=>permLabels[k]||k).join(', ');
  const permNote = `\n## Berechtigungen\nErlaubt: ${allowed||'keine'}${blocked ? `\nNICHT erlaubt (diese Aktionen NICHT verwenden): ${blocked}` : ''}\n`;

  return `${base}
${permNote}
## Aktueller Canvas-Zustand
\`\`\`json
${state}
\`\`\`

## Koordinaten
Ursprung (0,0) oben links. x→rechts, y→unten. Alles in Pixel (Ganzzahlen).
${regionNote}
## Koordinaten-Raster im Bild
Das Bild enthält ein gelbes Hilfsraster mit Canvas-Koordinaten-Beschriftungen (bereits mit Offset verrechnet).
Die Zahlen an den Rasterlinien sind direkte Canvas-X/Y-Werte — lies sie ab und verwende sie 1:1 ohne weiteren Offset.

## Präzises Einrahmen von Bauteilen
1. Lies die Rasterbeschriftungen ab um die Bauteil-Position zu bestimmen
2. Schätze linke/obere/rechte/untere Kante anhand des Rasters (interpolieren zwischen Linien)
3. x=links, y=oben, w=rechts−links, h=unten−oben — eng um das Bauteil, nicht zu locker
4. Label-Text knapp unter dem Bauteil (y = untere Kante + 4)

## Antwortformat (PFLICHT)
Antworte IMMER mit genau einem JSON-Block:
\`\`\`json
{"reply":"Text an den Nutzer","actions":[...]}
\`\`\`

## Verfügbare Aktionen
\`{"action":"create","type":"text","x":100,"y":100,"text":"Label","color":"#ffffff","fontSize":16,"linkGroup":"g1","name":"C1-Label"}\`
\`{"action":"create","type":"rect","x":100,"y":100,"w":80,"h":40,"stroke":"#ff0000","strokeWidth":2,"fill":"transparent","linkGroup":"g1","name":"C1-Rahmen"}\`
\`{"action":"create","type":"circle","cx":200,"cy":200,"r":30,"stroke":"#00ff00","fill":"transparent"}\`
\`{"action":"create","type":"line","x1":0,"y1":0,"x2":100,"y2":0,"stroke":"#ffffff","strokeWidth":2}\`
\`{"action":"create","type":"arrow","x1":0,"y1":0,"x2":100,"y2":0,"stroke":"#ffffff","strokeWidth":2}\`
\`{"action":"create","type":"dimension","x1":0,"y1":0,"x2":100,"y2":0,"stroke":"#ffffff","strokeWidth":1}\` — Bemaßungslinie mit automatischem Maß-Label
\`{"action":"move","id":"<objId>","x":150,"y":200}\`
\`{"action":"delete","id":"<objId>"}\`
\`{"action":"setProps","id":"<objId>","props":{"stroke":"#ff0000","strokeWidth":3,"fill":"#00000033"}}\`
\`{"action":"rename","id":"<objId>","name":"C1"}\`
\`{"action":"link","ids":["<id1>","<id2>"]}\`
\`{"action":"unlink","id":"<objId>"}\`
\`{"action":"createLayer","name":"Bezeichnungen"}\`
\`{"action":"renameLayer","layerName":"Ebene 1","newName":"transistor q13"}\`
\`{"action":"moveToLayer","id":"<objId>","layerName":"Bezeichnungen"}\`
\`{"action":"select","ids":["<id1>"]}\`

## Hilfslinien
Aktuelle Hilfslinien: H=${JSON.stringify(guideLines.h)} V=${JSON.stringify(guideLines.v)}
axis muss IMMER "h" (horizontal, y-Position) oder "v" (vertikal, x-Position) sein — NIEMALS "x" oder "y".
\`{"action":"addGuide","axis":"h","pos":200}\` — horizontale Linie bei y=200 (quer über das Bild)
\`{"action":"addGuide","axis":"v","pos":350}\` — vertikale Linie bei x=350 (senkrecht über das Bild)
\`{"action":"moveGuide","axis":"h","oldPos":200,"newPos":250}\` — Linie verschieben
\`{"action":"removeGuide","axis":"h","pos":200}\` — Linie entfernen
\`{"action":"clearGuides"}\` — alle Hilfslinien löschen

## Automatisches Verknüpfen (WICHTIG)
Wenn du für ein Bauteil mehrere Objekte erstellst (z.B. Rahmen + Beschriftung), gib ihnen IMMER dasselbe \`linkGroup\`-Feld (beliebiger eindeutiger String, z.B. "g1", "cap1", "ic3").
Sie werden dann automatisch verknüpft und lassen sich gemeinsam verschieben.
Vergib außerdem aussagekräftige \`name\`-Felder (z.B. "C217-Rahmen", "C217-Label").

## PCB-Leiterbahnen nachziehen
PCB-Traces bestehen meist aus mehreren geraden Segmenten mit 45°- oder 90°-Knicken — NIEMALS als einzelne diagonale Linie zeichnen.
Vorgehensweise:
1. Trace in Segmente aufteilen: horizontal, vertikal oder 45° diagonal
2. Jedes Segment = ein \`line\`-Objekt; Endpunkt des einen = Startpunkt des nächsten (Koordinaten müssen EXAKT übereinstimmen)
3. Alle Segmente einer Leiterbahn mit GLEICHEM \`linkGroup\`-String verknüpfen
4. Gleiche \`stroke\`-Farbe und \`strokeWidth\` für alle Segmente einer Leiterbahn verwenden
5. Sinnvolle Namen vergeben: "Leiterbahn-A Seg1", "Leiterbahn-A Seg2" usw.

Beispiel für eine L-förmige Leiterbahn:
\`{"action":"create","type":"line","x1":100,"y1":200,"x2":300,"y2":200,"stroke":"#00ff00","strokeWidth":3,"linkGroup":"trace_a","name":"Trace-A Seg1"}\`
\`{"action":"create","type":"line","x1":300,"y1":200,"x2":300,"y2":350,"stroke":"#00ff00","strokeWidth":3,"linkGroup":"trace_a","name":"Trace-A Seg2"}\``;

}

async function callKiLLM(messages) {
  const { endpoint, apiKey } = kiSettings;
  // Strip "models/" prefix that Google's model list adds
  const model = kiSettings.model.replace(/^models\//, '');
  if (!endpoint || !model) throw new Error('KI nicht konfiguriert');
  const prov   = detectKiProvider(endpoint);
  const config = KI_PROVIDERS[prov];
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey && config) Object.assign(headers, config.authHeader(apiKey));
  else if (apiKey)       headers['Authorization'] = `Bearer ${apiKey}`;

  let url, body;
  if (prov === 'anthropic') {
    url  = endpoint + '/v1/messages';
    const sys = messages.find(m => m.role === 'system');
    const budgetTokens = kiSettings.thinkingBudget || 8000;
    body = {
      model,
      max_tokens: kiSettings.thinking ? budgetTokens + 4096 : 4096,
      system: sys?.content || '',
      messages: messages.filter(m => m.role !== 'system'),
    };
    if (kiSettings.thinking) {
      body.thinking = { type: 'enabled', budget_tokens: budgetTokens };
    }
  } else if (prov === 'google') {
    // Immer native Gemini API (generateContent) — über Backend-Proxy (kein CORS)
    // Basis-URL immer aus dem festen Domain-Teil ableiten, nicht aus dem konfigurierten Pfad
    const nativeBase = 'https://generativelanguage.googleapis.com/v1beta';
    const modelId    = model.replace(/^models\//, '');
    url = `${nativeBase}/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const sysMsg = messages.find(m => m.role === 'system');
    const turns  = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: Array.isArray(m.content)
        ? m.content.map(p => p.type === 'image_url'
            ? { inlineData: { mimeType: 'image/jpeg', data: p.image_url.url.split(',')[1] } }
            : { text: p.text || '' })
        : [{ text: m.content }],
    }));
    body = { contents: turns, generationConfig: {} };
    if (kiSettings.thinking) {
      body.generationConfig.thinkingConfig = {
        thinkingBudget: kiSettings.thinkingBudget || 8000,
        includeThoughts: true,
      };
    }
    if (sysMsg) body.systemInstruction = { parts: [{ text: sysMsg.content }] };
    // Kein Auth-Header für native API (Key ist im URL)
    delete headers['Authorization'];

    let res2;
    try {
      res2 = await fetch('/api/ki_proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, headers, body }),
      });
    } catch (netErr) { throw new Error(`Netzwerkfehler (ki-proxy): ${netErr.message}`); }
    if (!res2.ok) { const err = await res2.json().catch(()=>({})); throw new Error(err?.error?.message || err?.detail || `HTTP ${res2.status}`); }
    const data2 = await res2.json();
    scopeLog(`Gemini response: ${JSON.stringify(data2).slice(0, 300)}`);
    const parts  = data2.candidates?.[0]?.content?.parts || [];
    scopeLog(`parts: ${JSON.stringify(parts.map(p => ({ thought: p.thought, len: p.text?.length })))}`);
    const thinking2 = parts.filter(p => p.thought === true).map(p => p.text).join('\n\n') || null;
    const text2     = parts.filter(p => !p.thought).map(p => p.text).join('') || '';
    return { text: text2, thinking: thinking2 };
  } else {
    url  = endpoint + '/chat/completions';
    body = { model, max_tokens: 4096, messages };
  }

  let res;
  try { res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) }); }
  catch (netErr) { throw new Error(`Netzwerkfehler (${prov}): ${netErr.message}`); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status} (${url.split('?')[0].split('/').slice(-2).join('/')})`);
  }
  const data = await res.json();
  if (prov === 'anthropic') {
    const thinking = data.content?.filter(c => c.type === 'thinking').map(c => c.thinking).join('\n\n') || null;
    const text     = data.content?.filter(c => c.type === 'text').map(c => c.text).join('') || '';
    return { text, thinking };
  }
  return { text: data.choices?.[0]?.message?.content || '', thinking: null };
}

function parseKiResponse(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return { reply: text, actions: [] };
  try { return JSON.parse(match[1]); } catch { return { reply: text, actions: [] }; }
}

async function executeAIActions(actions) {
  if (!Array.isArray(actions)) return;
  _kiBatchMode = true;
  const findObj = id => canvas.getObjects().find(o => o.objId === id);
  try {

  for (const act of actions) {
    if (!kiPermAllowed(act.action)) continue;
    // KI-Aktion in Timeline loggen
    const _kiLabel = () => {
      const who = act.id ? `"${findObj(act.id)?.customName || act.id.slice(-4)}"` : (act.type || '');
      const map = { create:`KI: ${act.type} erstellt`, move:`KI: ${who} verschoben`, delete:`KI: ${who} gelöscht`, setProps:`KI: Eigenschaft`, rename:`KI: umbenannt`, link:`KI: verknüpft`, unlink:`KI: entkoppelt`, createLayer:`KI: Ebene erstellt`, renameLayer:`KI: Ebene umbenannt`, moveToLayer:`KI: Ebene gewechselt`, select:`KI: ausgewählt`, addGuide:`KI: Hilfslinie`, moveGuide:`KI: Hilfslinie verschoben`, removeGuide:`KI: Hilfslinie gelöscht`, clearGuides:`KI: Hilfslinien geleert` };
      return map[act.action] || `KI: ${act.action}`;
    };
    try {
      switch (act.action) {
        case 'create': {
          const stroke = act.stroke || act.color || '#ffffff';
          const fill   = act.fill   ?? 'transparent';
          const sw     = act.strokeWidth || 2;
          let obj;
          if (act.type === 'text') {
            obj = new fabric.Text(act.text || '', {
              left: act.x||0, top: act.y||0,
              fill: act.color || '#ffffff',
              fontSize: act.fontSize || settings.defaultFontSize || 16,
              fontFamily: 'Arial',
            });
          } else if (act.type === 'rect') {
            obj = new fabric.Rect({ left:act.x||0, top:act.y||0, width:act.w||80, height:act.h||40, stroke, strokeWidth:sw, fill });
          } else if (act.type === 'circle') {
            obj = new fabric.Circle({ left:(act.cx||0)-(act.r||30), top:(act.cy||0)-(act.r||30), radius:act.r||30, stroke, strokeWidth:sw, fill });
          } else if (act.type === 'line') {
            obj = new fabric.Line([act.x1||0,act.y1||0,act.x2||100,act.y2||0], { stroke, strokeWidth:sw });
          } else if (act.type === 'arrow') {
            obj = addArrow(act.x1||0, act.y1||0, act.x2||100, act.y2||0, stroke, sw);
          } else if (act.type === 'dimension') {
            obj = addDimension(act.x1||0, act.y1||0, act.x2||100, act.y2||0, stroke, sw);
          }
          if (obj) {
            obj.objId = crypto.randomUUID();
            if (act.linkGroup) obj.linkGroup = act.linkGroup;
            if (act.name)      obj.customName = act.name;
            if (!['arrow','dimension'].includes(act.type)) canvas.add(obj);
          }
          break;
        }
        case 'move': {
          const o = findObj(act.id);
          if (o) { o.set({ left: act.x, top: act.y }); o.setCoords(); }
          break;
        }
        case 'delete': {
          const o = findObj(act.id);
          if (o) canvas.remove(o);
          break;
        }
        case 'setProps': {
          const o = findObj(act.id);
          if (o && act.props) o.set(act.props);
          break;
        }
        case 'rename': {
          const o = findObj(act.id);
          if (o) o.customName = act.name;
          break;
        }
        case 'link': {
          const objs = (act.ids||[]).map(findObj).filter(Boolean);
          if (objs.length >= 2) {
            const gid = crypto.randomUUID();
            objs.forEach(o => { o.linkGroup = gid; });
          }
          break;
        }
        case 'unlink': {
          const o = findObj(act.id);
          if (o?.linkGroup) unlinkObjects(getLinkGroupMembers(o.linkGroup));
          break;
        }
        case 'renameLayer': {
          const ly = layers.find(l =>
            l.name?.toLowerCase() === act.layerName?.toLowerCase() || l.id === act.layerId
          );
          if (ly) {
            ly.name = act.newName || act.name || ly.name;
            refreshLayersList();
            saveHistory();
          }
          break;
        }
        case 'createLayer': {
          createLayer(act.name);
          break;
        }
        case 'moveToLayer': {
          const o  = findObj(act.id);
          const ly = layers.find(l => l.name === act.layerName || l.id === act.layerId);
          if (o && ly) moveObjectToLayer(o, ly.id);
          break;
        }
        case 'select': {
          const objs = (act.ids||[]).map(findObj).filter(Boolean);
          if (objs.length === 1) canvas.setActiveObject(objs[0]);
          else if (objs.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas }));
          break;
        }
        case 'addGuide': {
          let gAxis = act.axis === 'x' ? 'v' : act.axis === 'y' ? 'h' : act.axis;
          if ((gAxis === 'h' || gAxis === 'v') && act.pos != null) {
            guidesVisible = true;
            guideLines[gAxis].push(Math.round(act.pos));
            saveGuides();
            drawGuides();
            refreshLayersList();
          }
          break;
        }
        case 'moveGuide': {
          let gAxis = act.axis === 'x' ? 'v' : act.axis === 'y' ? 'h' : act.axis;
          if ((gAxis === 'h' || gAxis === 'v') && act.oldPos != null && act.newPos != null) {
            const arr = guideLines[gAxis];
            const i   = arr.findIndex(p => Math.abs(p - act.oldPos) < 8);
            if (i >= 0) { arr[i] = Math.round(act.newPos); saveGuides(); drawGuides(); refreshLayersList(); }
          }
          break;
        }
        case 'removeGuide': {
          let gAxis = act.axis === 'x' ? 'v' : act.axis === 'y' ? 'h' : act.axis;
          if ((gAxis === 'h' || gAxis === 'v') && act.pos != null) {
            const arr = guideLines[gAxis];
            const i   = arr.findIndex(p => Math.abs(p - act.pos) < 8);
            if (i >= 0) { arr.splice(i, 1); saveGuides(); drawGuides(); refreshLayersList(); }
          }
          break;
        }
        case 'clearGuides': {
          guideLines = { h: [], v: [] }; saveGuides(); drawGuides(); refreshLayersList();
          break;
        }
      }
      _nextLabel = _kiLabel();
    } catch (_) {}
  }
  } finally {
    _kiBatchMode = false;
  }
  canvas.renderAll();
  drawGuides();
  if (!_nextLabel) _nextLabel = 'KI-Aktion';
  saveHistory();
  refreshLayersList();
}
