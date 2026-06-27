"""
ScopeCam Playwright Smoke-Tests

Prüft grundlegende UI-Funktionen im Headless-Browser.

Voraussetzungen:
  pip3 install pytest-playwright --break-system-packages
  python3 -m playwright install chromium

Ausführen:
  python3 -m pytest tests/test_ui.py -v
"""
import os
import sys
import subprocess
import time

import pytest
import requests
from playwright.sync_api import sync_playwright

# ── Konstanten ────────────────────────────────────────────────────────────────

PORT       = 8087
BASE_URL   = f"http://127.0.0.1:{PORT}"
TESTS_DIR  = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(TESTS_DIR)
HELPER     = os.path.join(TESTS_DIR, "server_for_ui_tests.py")

# ── Server-Fixture ────────────────────────────────────────────────────────────

def _poll_ready(url: str, timeout: float = 20.0) -> bool:
    """Pollt GET url bis HTTP < 500 oder Timeout."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if requests.get(url, timeout=2).status_code < 500:
                return True
        except Exception:
            pass
        time.sleep(0.4)
    return False


@pytest.fixture(scope="module")
def live_server():
    """Startet den FastAPI-Testserver und gibt die Base-URL zurück."""
    proc = subprocess.Popen(
        [sys.executable, HELPER],
        cwd=PROJECT_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    ready = _poll_ready(f"{BASE_URL}/api/settings")
    if not ready:
        proc.terminate()
        out, err = proc.communicate(timeout=5)
        pytest.fail(
            f"Server konnte nicht gestartet werden.\n"
            f"STDOUT: {out.decode()}\nSTDERR: {err.decode()}"
        )
    yield BASE_URL
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


# ── Browser / Page Hilfsfunktionen ───────────────────────────────────────────

def _open_page(pw, base_url: str):
    """Öffnet eine frische Seite und wartet bis die App initialisiert ist."""
    browser = pw.chromium.launch(headless=True)
    context = browser.new_context()
    page    = context.new_page()

    # JavaScript-Fehler sammeln
    js_errors = []
    page.on("pageerror", lambda e: js_errors.append(str(e)))

    page.goto(base_url, wait_until="networkidle", timeout=20_000)

    # Warten bis S.settings (aus /api/settings) geladen ist
    page.wait_for_function(
        "() => typeof S !== 'undefined' && S.canvas !== null && "
        "S.settings && S.settings.device !== undefined",
        timeout=12_000,
    )

    return browser, context, page, js_errors


# ── Smoke-Tests ───────────────────────────────────────────────────────────────

def test_page_loads_without_js_errors(live_server):
    """1 · Seite lädt ohne JavaScript-Fehler."""
    with sync_playwright() as pw:
        browser, ctx, page, js_errors = _open_page(pw, live_server)
        try:
            assert js_errors == [], f"JS-Fehler: {js_errors}"
        finally:
            ctx.close()
            browser.close()


def test_canvas_exists_and_has_size(live_server):
    """2 · Canvas-Element ist vorhanden und hat Breite/Höhe > 0."""
    with sync_playwright() as pw:
        browser, ctx, page, _ = _open_page(pw, live_server)
        try:
            # Warten bis Fabric das upper-canvas erstellt hat
            page.wait_for_selector(".upper-canvas", timeout=8_000)
            box = page.locator(".upper-canvas").bounding_box()
            assert box is not None,        "upper-canvas nicht gefunden"
            assert box["width"]  > 0,      f"Canvas-Breite ist {box['width']}"
            assert box["height"] > 0,      f"Canvas-Höhe ist {box['height']}"
        finally:
            ctx.close()
            browser.close()


def test_demo_banner_visible(live_server):
    """3 · Demo-Modus: orangefarbenes Banner (#demoBanner) sichtbar."""
    with sync_playwright() as pw:
        browser, ctx, page, _ = _open_page(pw, live_server)
        try:
            # applyDevice() setzt display:flex wenn device === 'demo'
            page.wait_for_function(
                "() => {"
                "  const b = document.getElementById('demoBanner');"
                "  return b && getComputedStyle(b).display !== 'none';"
                "}",
                timeout=8_000,
            )
            banner = page.locator("#demoBanner")
            assert banner.is_visible(), "#demoBanner ist nicht sichtbar"
        finally:
            ctx.close()
            browser.close()


def test_tool_switch_to_line(live_server):
    """4 · Klick auf Linie-Werkzeug setzt S.currentTool auf 'line'."""
    with sync_playwright() as pw:
        browser, ctx, page, _ = _open_page(pw, live_server)
        try:
            page.wait_for_selector('[data-tool="line"]', timeout=5_000)
            page.click('[data-tool="line"]')
            tool = page.evaluate("() => S.currentTool")
            assert tool == "line", f"currentTool ist '{tool}', erwartet 'line'"
        finally:
            ctx.close()
            browser.close()


def test_basic_drawing_creates_object(live_server):
    """5 · Mousedown+Mouseup auf Canvas → mindestens 1 Fabric-Objekt vorhanden."""
    with sync_playwright() as pw:
        browser, ctx, page, _ = _open_page(pw, live_server)
        try:
            # Linie-Werkzeug aktivieren
            page.wait_for_selector('[data-tool="line"]', timeout=5_000)
            page.click('[data-tool="line"]')

            # Warten bis upper-canvas bereit ist
            page.wait_for_selector(".upper-canvas", timeout=8_000)
            box = page.locator(".upper-canvas").bounding_box()
            assert box is not None, "upper-canvas hat keine Bounding-Box"

            # Linie quer über die Mitte ziehen
            cx = box["x"] + box["width"]  / 2
            cy = box["y"] + box["height"] / 2
            page.mouse.move(cx - 40, cy)
            page.mouse.down()
            page.mouse.move(cx + 40, cy + 40)
            page.mouse.up()

            # Kurz warten damit Fabric die Objekt-Liste aktualisiert
            page.wait_for_timeout(200)

            count = page.evaluate("() => S.canvas.getObjects().length")
            assert count > 0, f"Erwartet mindestens 1 Objekt, gefunden: {count}"
        finally:
            ctx.close()
            browser.close()


def test_new_tab_created_on_plus_button(live_server):
    """6 · Klick auf + erstellt einen neuen Tab."""
    with sync_playwright() as pw:
        browser, ctx, page, _ = _open_page(pw, live_server)
        try:
            page.wait_for_selector("#tabAddBtn", timeout=5_000)
            before = page.evaluate("() => S.tabs.length")
            page.click("#tabAddBtn")
            # Kurz warten damit switchToTab() abgeschlossen ist
            page.wait_for_timeout(300)
            after = page.evaluate("() => S.tabs.length")
            assert after == before + 1, (
                f"Tab-Anzahl vor: {before}, nach: {after} — kein neuer Tab erstellt"
            )
        finally:
            ctx.close()
            browser.close()


def test_console_opens_with_f12(live_server):
    """7 · F12 öffnet das Konsolen-Panel (panel-visible Klasse)."""
    with sync_playwright() as pw:
        browser, ctx, page, _ = _open_page(pw, live_server)
        try:
            # Richtiger Selektor: .panel-Klasse, nicht das Menü-Item
            # (beide haben data-panel="console", querySelector liefert das erste Match)
            _qs = 'document.querySelector(".panel[data-panel=\\"console\\"]")'

            # Panel initial geschlossen
            is_open_before = page.evaluate(
                f"() => {_qs}?.classList.contains('panel-visible') ?? false"
            )
            assert not is_open_before, "Konsolen-Panel sollte initial geschlossen sein"

            # F12 via dispatchEvent — headless Chromium schluckt page.keyboard.press('F12')
            page.evaluate(
                "() => document.dispatchEvent(new KeyboardEvent('keydown', "
                "  {key:'F12', code:'F12', bubbles:true, cancelable:true, composed:true}))"
            )
            page.wait_for_timeout(300)

            is_open_after = page.evaluate(
                f"() => {_qs}?.classList.contains('panel-visible') ?? false"
            )
            assert is_open_after, "Konsolen-Panel ist nach F12 nicht geöffnet"
        finally:
            ctx.close()
            browser.close()
