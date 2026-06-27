import asyncio
import base64
import glob
import json
import os
import shutil
import signal
import subprocess
import threading
import time

import cv2
import numpy as np
import httpx
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="ScopeCam")

DATA_DIR = "/app/data"
SETTINGS_FILE = f"{DATA_DIR}/settings.json"

DEFAULT_SETTINGS = {
    "device": "demo",
    "jpeg_quality": 70,
    "flip_h": False,
    "flip_v": False,
    "scale_px_per_mm": None,
    "stream_scale": 0.5,
    "max_fps": 25,
    "ruler_unit": "px",
}


def load_settings() -> dict:
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE) as f:
                merged = DEFAULT_SETTINGS.copy()
                merged.update(json.load(f))
                return merged
        except Exception:
            pass
    return DEFAULT_SETTINGS.copy()


def save_settings(data: dict):
    os.makedirs(DATA_DIR, exist_ok=True)
    current = load_settings()
    current.update(data)
    with open(SETTINGS_FILE, "w") as f:
        json.dump(current, f, indent=2)


def list_devices() -> list:
    result = []
    for dev_path in sorted(glob.glob("/dev/video*")):
        num = dev_path.replace("/dev/video", "")
        name_path = f"/sys/class/video4linux/video{num}/name"
        name = dev_path
        if os.path.exists(name_path):
            try:
                with open(name_path) as f:
                    name = f.read().strip()
            except Exception:
                pass
        result.append({"path": dev_path, "name": name})
    return result


def query_device_format(device: str) -> tuple[int, int, str, bool, bool]:
    """Returns (width, height, pixel_format, is_mplane, supports_mjpg)."""
    r = subprocess.run(
        ["v4l2-ctl", "-d", device, "--all"],
        capture_output=True, text=True, timeout=5
    )
    w, h, fmt = 1600, 1200, "nv24"
    is_mplane = "Multiplanar" in r.stdout
    for line in r.stdout.splitlines():
        if "Width/Height" in line:
            try:
                parts = line.split(":")[1].strip().split("/")
                w, h = int(parts[0]), int(parts[1])
            except Exception:
                pass
        if "Pixel Format" in line:
            try:
                fmt = line.split("'")[1].lower()
            except Exception:
                pass

    # Prüfe ob MJPG unterstützt wird (für UVC-Kameras)
    supports_mjpg = False
    if not is_mplane:
        fmts = subprocess.run(
            ["v4l2-ctl", "-d", device, "--list-formats"],
            capture_output=True, text=True, timeout=5
        )
        supports_mjpg = "MJPG" in fmts.stdout

    return w, h, fmt, is_mplane, supports_mjpg


class Camera:
    """
    Pipeline: v4l2-ctl (MPLANE capture) → ffmpeg (convert + scale + JPEG) → WebSocket clients.

    v4l2-ctl handles the rk_hdmirx MPLANE device correctly.
    ffmpeg converts the raw NV24 frames and outputs JPEG.
    """

    def __init__(self):
        self._v4l2: subprocess.Popen | None = None
        self._ff: subprocess.Popen | None = None
        self._latest: bytes | None = None
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._clients: dict[WebSocket, asyncio.AbstractEventLoop] = {}
        self._clients_lock = threading.Lock()

    def _kill_procs(self):
        for proc in (self._ff, self._v4l2):
            if proc and proc.poll() is None:
                try:
                    proc.kill()
                    proc.wait(timeout=2)
                except Exception:
                    pass
        self._v4l2 = None
        self._ff = None

    def start(self, device: str, scale: float, fps: int, quality: int,
              flip_h: bool, flip_v: bool):
        self._stop.set()
        if self._thread and self._thread is not threading.current_thread():
            self._thread.join(timeout=5)
        self._kill_procs()

        self._stop.clear()
        self._latest = None

        self._thread = threading.Thread(
            target=self._run,
            args=(device, scale, fps, quality, flip_h, flip_v),
            daemon=True, name="cam"
        )
        self._thread.start()

    def _run(self, device: str, scale: float, fps: int, quality: int,
             flip_h: bool, flip_v: bool):
        while not self._stop.is_set():
            try:
                self._capture(device, scale, fps, quality, flip_h, flip_v)
            except Exception as e:
                print(f"[cam] error: {e}")
            if not self._stop.is_set():
                time.sleep(2)

    def _capture(self, device: str, scale: float, fps: int, quality: int,
                 flip_h: bool, flip_v: bool):
        w, h, pix_fmt, is_mplane, supports_mjpg = query_device_format(device)

        scale_w = int(w * scale) & ~1
        scale_h = int(h * scale) & ~1
        qv = max(2, int(31 - (quality / 100) * 29))

        vf = f"scale={scale_w}:{scale_h},fps={fps}"
        if flip_h and flip_v:
            vf = "hflip,vflip," + vf
        elif flip_h:
            vf = "hflip," + vf
        elif flip_v:
            vf = "vflip," + vf

        if is_mplane:
            # Rockchip rk_hdmirx: MPLANE-Gerät — v4l2-ctl streamt Raw-Frames an ffmpeg
            v4l2_proc = subprocess.Popen(
                ["v4l2-ctl", "-d", device,
                 "--stream-mmap", "--stream-to=-", "--stream-count=0"],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0
            )
            self._v4l2 = v4l2_proc
            ff_proc = subprocess.Popen(
                ["ffmpeg", "-y", "-loglevel", "error",
                 "-f", "rawvideo",
                 "-pixel_format", pix_fmt,
                 "-video_size", f"{w}x{h}",
                 "-framerate", "60",
                 "-i", "pipe:0",
                 "-vf", vf,
                 "-f", "image2pipe",
                 "-vcodec", "mjpeg",
                 "-q:v", str(qv),
                 "pipe:1"],
                stdin=v4l2_proc.stdout,
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0
            )
            self._ff = ff_proc
            v4l2_proc.stdout.close()

        elif supports_mjpg:
            # UVC-Kamera mit MJPG: direkt in MJPG erfassen — kein YUYV-Bottleneck
            # MJPG erlaubt 60fps statt 5fps bei YUYV 1920×1080
            ff_proc = subprocess.Popen(
                ["ffmpeg", "-y", "-loglevel", "error",
                 "-f", "v4l2",
                 "-input_format", "mjpeg",
                 "-framerate", str(fps),
                 "-video_size", f"{w}x{h}",
                 "-i", device,
                 "-vf", vf,
                 "-f", "image2pipe",
                 "-vcodec", "mjpeg",
                 "-q:v", str(qv),
                 "pipe:1"],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0
            )
            self._ff = ff_proc

        else:
            # Fallback: Standard V4L2 ohne MJPG
            ff_proc = subprocess.Popen(
                ["ffmpeg", "-y", "-loglevel", "error",
                 "-f", "v4l2",
                 "-framerate", str(fps),
                 "-video_size", f"{w}x{h}",
                 "-i", device,
                 "-vf", vf,
                 "-f", "image2pipe",
                 "-vcodec", "mjpeg",
                 "-q:v", str(qv),
                 "pipe:1"],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0
            )
            self._ff = ff_proc

        SOI, EOI = b"\xff\xd8", b"\xff\xd9"
        buf = b""

        while not self._stop.is_set() and ff_proc.poll() is None:
            chunk = ff_proc.stdout.read(1 << 16)
            if not chunk:
                break
            buf += chunk
            while True:
                s = buf.find(SOI)
                if s == -1:
                    buf = b""
                    break
                e = buf.find(EOI, s + 2)
                if e == -1:
                    buf = buf[s:]
                    break
                frame = buf[s: e + 2]
                buf = buf[e + 2:]
                with self._lock:
                    self._latest = frame
                self._broadcast(frame)

        self._kill_procs()

    def _broadcast(self, frame: bytes):
        with self._clients_lock:
            dead = []
            for ws, loop in self._clients.items():
                try:
                    asyncio.run_coroutine_threadsafe(ws.send_bytes(frame), loop)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self._clients.pop(ws, None)

    def add_client(self, ws: WebSocket, loop: asyncio.AbstractEventLoop):
        with self._clients_lock:
            self._clients[ws] = loop

    def remove_client(self, ws: WebSocket):
        with self._clients_lock:
            self._clients.pop(ws, None)

    def get_latest(self) -> bytes | None:
        with self._lock:
            return self._latest


cam = Camera()


@app.on_event("startup")
def startup():
    s = load_settings()
    if s["device"] != "demo":
        cam.start(s["device"], s["stream_scale"], s["max_fps"],
                  s["jpeg_quality"], s["flip_h"], s["flip_v"])


@app.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket):
    await websocket.accept()
    loop = asyncio.get_event_loop()
    cam.add_client(websocket, loop)
    frame = cam.get_latest()
    if frame:
        await websocket.send_bytes(frame)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        cam.remove_client(websocket)


@app.get("/api/devices")
def api_devices():
    return {"devices": list_devices()}


@app.get("/api/settings")
def api_get_settings():
    return load_settings()


@app.post("/api/settings")
async def api_save_settings(request: Request):
    data = await request.json()
    save_settings(data)
    s = load_settings()
    if s["device"] == "demo":
        cam._stop.set()
        cam._kill_procs()
    else:
        cam.start(s["device"], s["stream_scale"], s["max_fps"],
                  s["jpeg_quality"], s["flip_h"], s["flip_v"])
    return s


def _merge_lines(segs, axis, gap=8):
    """Fasst nahe parallele H- oder V-Linien zusammen."""
    if not segs:
        return []
    # nach Mittelachse sortieren
    segs = sorted(segs, key=lambda s: s[axis])
    merged = []
    cur = list(segs[0])
    for s in segs[1:]:
        if abs(s[axis] - cur[axis]) <= gap:
            # gleiche Gruppe: Achse mitteln, Ausdehnung ausdehnen
            cur[axis] = (cur[axis] + s[axis]) // 2
            if axis == 1:   # horizontal: x1 min, x2 max
                cur[0] = min(cur[0], s[0])
                cur[2] = max(cur[2], s[2])
            else:            # vertikal: y1 min, y2 max
                cur[1] = min(cur[1], s[1])
                cur[3] = max(cur[3], s[3])
        else:
            merged.append(cur)
            cur = list(s)
    merged.append(cur)
    return merged


@app.post("/api/pcb-edges")
async def api_pcb_edges(request: Request):
    try:
        data    = await request.json()
        b64     = data.get("image", "")
        thresh  = int(data.get("threshold", 150))
        min_len = int(data.get("min_length", 80))

        img_bytes = base64.b64decode(b64)
        arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return {"lines": [], "error": "Bild konnte nicht geladen werden"}

        gray    = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 1.0)
        edges   = cv2.Canny(blurred, thresh * 0.4, thresh, apertureSize=3, L2gradient=True)

        raw = cv2.HoughLinesP(
            edges, rho=1, theta=np.pi / 180,
            threshold=thresh,
            minLineLength=min_len,
            maxLineGap=12,
        )

        h_segs, v_segs = [], []
        ANGLE_TOL = 0.09  # ~5° in Radiant

        if raw is not None:
            for seg in raw:
                x1, y1, x2, y2 = seg[0].tolist()
                dx, dy = x2 - x1, y2 - y1
                length = (dx*dx + dy*dy) ** 0.5
                if length < 1:
                    continue
                angle = abs(dy / length)   # sin(θ) ≈ 0 → horizontal
                if angle < ANGLE_TOL:
                    # horizontal: y normieren auf Mittelpunkt
                    y_mid = (y1 + y2) // 2
                    h_segs.append([min(x1,x2), y_mid, max(x1,x2), y_mid])
                elif angle > 1 - ANGLE_TOL:
                    # vertikal: x normieren auf Mittelpunkt
                    x_mid = (x1 + x2) // 2
                    v_segs.append([x_mid, min(y1,y2), x_mid, max(y1,y2)])

        # Nahe parallele Linien zusammenführen
        h_merged = _merge_lines(h_segs, axis=1, gap=6)  # axis=1 = y
        v_merged = _merge_lines(v_segs, axis=0, gap=6)  # axis=0 = x

        imgH, imgW = img.shape[:2]

        # H-Linien auf volle Bildbreite strecken
        for s in h_merged:
            s[0] = 0
            s[2] = imgW

        # V-Linien auf volle Bildhöhe strecken
        for s in v_merged:
            s[1] = 0
            s[3] = imgH

        result = [{"x1": s[0], "y1": s[1], "x2": s[2], "y2": s[3]}
                  for s in h_merged + v_merged]

        return {"lines": result}
    except Exception as e:
        return {"lines": [], "error": str(e)}


# ─── Datei-Manager API ────────────────────────────────────────────────────────

PROJECTS_DIR = os.path.join(DATA_DIR, "projects")


def _safe(rel: str) -> str:
    target = os.path.normpath(os.path.join(PROJECTS_DIR, rel or ""))
    if not target.startswith(os.path.normpath(PROJECTS_DIR)):
        raise HTTPException(403, "Ungültiger Pfad")
    return target


@app.get("/api/files")
async def files_list(path: str = Query("")):
    target = _safe(path)
    os.makedirs(target, exist_ok=True)
    items = []
    try:
        names = sorted(os.listdir(target), key=lambda n: (not os.path.isdir(os.path.join(target, n)), n.lower()))
        for name in names:
            full = os.path.join(target, name)
            st   = os.stat(full)
            rel  = (path + "/" + name).lstrip("/") if path else name
            items.append({"name": name, "path": rel,
                          "isDir": os.path.isdir(full),
                          "size": st.st_size, "mtime": st.st_mtime})
    except PermissionError:
        pass
    return {"path": path, "items": items}


@app.post("/api/files/mkdir")
async def files_mkdir(request: Request):
    d = await request.json()
    os.makedirs(_safe(d.get("path", "")), exist_ok=True)
    return {"ok": True}


@app.delete("/api/files")
async def files_delete(path: str = Query(...)):
    target = _safe(path)
    if target == os.path.normpath(PROJECTS_DIR):
        raise HTTPException(403, "Root nicht löschbar")
    if os.path.isdir(target):
        shutil.rmtree(target)
    elif os.path.isfile(target):
        os.remove(target)
    return {"ok": True}


@app.post("/api/files/rename")
async def files_rename(request: Request):
    d = await request.json()
    src = _safe(d.get("from", ""))
    dst = _safe(d.get("to", ""))
    if not os.path.exists(src):
        raise HTTPException(404, "Nicht gefunden")
    os.rename(src, dst)
    return {"ok": True}


@app.get("/api/files/read")
async def files_read(path: str = Query(...)):
    target = _safe(path)
    if not os.path.isfile(target):
        raise HTTPException(404, "Datei nicht gefunden")
    return FileResponse(target, media_type="application/octet-stream")


@app.get("/api/files/lock")
async def files_lock_status(path: str = Query(...)):
    lock_path = _safe(path) + ".lock"
    if os.path.exists(lock_path):
        try:
            with open(lock_path) as f:
                info = json.load(f)
            # Stale lock nach 30 Minuten automatisch freigeben
            if time.time() - info.get("ts", 0) > 1800:
                os.remove(lock_path)
                return {"locked": False}
            return {"locked": True, "by": info.get("by", "unbekannt"), "since": info.get("ts")}
        except Exception:
            return {"locked": False}
    return {"locked": False}


@app.post("/api/files/lock")
async def files_lock(request: Request, path: str = Query(...)):
    d = await request.json()
    lock_path = _safe(path) + ".lock"
    if os.path.exists(lock_path):
        try:
            with open(lock_path) as f:
                info = json.load(f)
            if time.time() - info.get("ts", 0) <= 1800:
                raise HTTPException(409, f"Datei gesperrt von {info.get('by', '?')}")
        except HTTPException:
            raise
        except Exception:
            pass
    with open(lock_path, "w") as f:
        json.dump({"by": d.get("by", "Unbekannt"), "ts": time.time()}, f)
    return {"ok": True}


@app.delete("/api/files/lock")
async def files_unlock(path: str = Query(...)):
    lock_path = _safe(path) + ".lock"
    if os.path.exists(lock_path):
        os.remove(lock_path)
    return {"ok": True}


@app.post("/api/files/write")
async def files_write(request: Request, path: str = Query(...)):
    target = _safe(path)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    body = await request.body()
    with open(target, "wb") as f:
        f.write(body)
    # Lock nach erfolgreichem Speichern automatisch freigeben
    lock_path = target + ".lock"
    if os.path.exists(lock_path):
        os.remove(lock_path)
    return {"ok": True, "size": len(body)}


CLIENT_SETTINGS_FILE = f"{DATA_DIR}/client-settings.json"

@app.get("/api/client-settings")
async def get_client_settings():
    if os.path.exists(CLIENT_SETTINGS_FILE):
        with open(CLIENT_SETTINGS_FILE) as f:
            return json.load(f)
    return {}

@app.post("/api/client-settings")
async def post_client_settings(request: Request):
    data = await request.json()
    with open(CLIENT_SETTINGS_FILE, "w") as f:
        json.dump(data, f)
    return {"ok": True}


@app.post("/api/ki_proxy")
async def ki_proxy(request: Request):
    """Proxies KI requests server-side to avoid browser CORS restrictions."""
    data = await request.json()
    url = data.get("url", "")
    headers = {k: v for k, v in data.get("headers", {}).items()
               if k.lower() not in ("host", "content-length")}
    body = data.get("body", {})
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, headers=headers, json=body)
        ct = resp.headers.get("content-type", "application/json")
        return Response(content=resp.content, status_code=resp.status_code,
                        media_type=ct)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


app.mount("/", StaticFiles(directory="/app/static", html=True), name="static")
