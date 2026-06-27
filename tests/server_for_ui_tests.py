"""
Hilfsskript für Playwright UI-Tests.

Patcht /app/static → lokales static/ und DATA_DIR → tmpdir,
dann startet uvicorn auf Port 8087.  Wird als Subprocess von
tests/test_ui.py gestartet.
"""
import os
import sys
import tempfile

# Projektverzeichnis = zwei Ebenen über diesem Skript
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR  = os.path.join(PROJECT_DIR, "static")
sys.path.insert(0, PROJECT_DIR)

# Temporäres DATA-Verzeichnis
_tmp = tempfile.mkdtemp(prefix="scopecam_uitest_")
os.makedirs(os.path.join(_tmp, "projects"), exist_ok=True)

# StaticFiles patchen BEVOR main importiert wird
import starlette.staticfiles as _sf_mod
_real_sf_init = _sf_mod.StaticFiles.__init__

def _patched_sf_init(self, *, directory=None, **kw):
    if directory == "/app/static":
        directory = STATIC_DIR
    _real_sf_init(self, directory=directory, **kw)

_sf_mod.StaticFiles.__init__ = _patched_sf_init

# main importieren und DATA-Pfade überschreiben
import main  # noqa: E402
main.DATA_DIR             = _tmp
main.PROJECTS_DIR         = os.path.join(_tmp, "projects")
main.SETTINGS_FILE        = os.path.join(_tmp, "settings.json")
main.CLIENT_SETTINGS_FILE = os.path.join(_tmp, "client-settings.json")

import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(main.app, host="127.0.0.1", port=8087, log_level="warning")
