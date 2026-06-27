"""Pytest-Konfiguration: patcht DATA_DIR und StaticFiles vor dem Import von main."""
import os
import sys
import tempfile
from unittest import mock

# Temporäres Verzeichnis für alle Tests
_tmp = tempfile.mkdtemp(prefix="scopecam_test_")
os.makedirs(os.path.join(_tmp, "projects"), exist_ok=True)
os.makedirs(os.path.join(_tmp, "static"),   exist_ok=True)

# StaticFiles-mount zur Laufzeit umlenken, bevor main importiert wird
_real_sf_init = None

def _sf_init(self, *, directory=None, **kwargs):
    if directory == "/app/static":
        directory = os.path.join(_tmp, "static")
    from starlette.staticfiles import StaticFiles
    object.__setattr__(self, "_real_init_done", True)
    # Ruft die Originalimplementierung auf, aber mit gepatchtem Pfad
    _real_sf_init(self, directory=directory, **kwargs)

import starlette.staticfiles as _sf_module
_real_sf_init = _sf_module.StaticFiles.__init__

with mock.patch.object(_sf_module.StaticFiles, "__init__", _sf_init):
    import main as _main_module

# Pfade nach dem Import setzen
_main_module.DATA_DIR             = _tmp
_main_module.PROJECTS_DIR         = os.path.join(_tmp, "projects")
_main_module.SETTINGS_FILE        = os.path.join(_tmp, "settings.json")
_main_module.CLIENT_SETTINGS_FILE = os.path.join(_tmp, "client-settings.json")

# Für alle Tests zugänglich machen
sys.modules["_scopecam_main"] = _main_module
