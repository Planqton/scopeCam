"""
ScopeCam Backend Tests
Run: pip3 install pytest httpx --break-system-packages && pytest tests/ -v
"""
import json
import os
import sys
import pytest
from fastapi.testclient import TestClient

# conftest.py importiert main mit gepatchtem StaticFiles-Pfad
app_module = sys.modules["_scopecam_main"]
client = TestClient(app_module.app)


# ── Settings ────────────────────────────────────────────────────────────────

def test_settings_defaults():
    r = client.get("/api/settings")
    assert r.status_code == 200
    d = r.json()
    assert d["device"] == "demo"
    assert "jpeg_quality" in d

def test_settings_round_trip():
    client.post("/api/settings", json={"jpeg_quality": 42})
    r = client.get("/api/settings")
    assert r.json()["jpeg_quality"] == 42

def test_settings_partial_update():
    client.post("/api/settings", json={"jpeg_quality": 80})
    client.post("/api/settings", json={"flip_h": True})
    d = client.get("/api/settings").json()
    assert d["jpeg_quality"] == 80
    assert d["flip_h"] is True


# ── File API ────────────────────────────────────────────────────────────────

def test_files_list_root():
    r = client.get("/api/files")
    assert r.status_code == 200
    assert "items" in r.json()

def test_files_write_and_read():
    content = b"hello scopecam"
    r = client.post("/api/files/write?path=test.txt", content=content)
    assert r.status_code == 200
    assert r.json()["size"] == len(content)
    r2 = client.get("/api/files/read?path=test.txt")
    assert r2.status_code == 200
    assert r2.content == content

def test_files_mkdir():
    r = client.post("/api/files/mkdir", json={"path": "mydir"})
    assert r.status_code == 200
    assert os.path.isdir(os.path.join(app_module.PROJECTS_DIR, "mydir"))

def test_files_rename():
    client.post("/api/files/write?path=old.txt", content=b"data")
    r = client.post("/api/files/rename", json={"from": "old.txt", "to": "new.txt"})
    assert r.status_code == 200
    assert not os.path.exists(os.path.join(app_module.PROJECTS_DIR, "old.txt"))
    assert os.path.exists(os.path.join(app_module.PROJECTS_DIR, "new.txt"))

def test_files_delete():
    client.post("/api/files/write?path=todelete.txt", content=b"bye")
    r = client.delete("/api/files?path=todelete.txt")
    assert r.status_code == 200
    assert not os.path.exists(os.path.join(app_module.PROJECTS_DIR, "todelete.txt"))

def test_files_delete_root_blocked():
    r = client.delete("/api/files?path=")
    assert r.status_code == 403

def test_files_read_missing():
    r = client.get("/api/files/read?path=doesnotexist.txt")
    assert r.status_code == 404


# ── Path-Traversal-Schutz ───────────────────────────────────────────────────

@pytest.mark.parametrize("evil", [
    "../../../etc/passwd",
    "../../secret",
    "subdir/../../../../etc/hosts",
])
def test_path_traversal_read_blocked(evil):
    r = client.get(f"/api/files/read?path={evil}")
    assert r.status_code in (403, 404)

@pytest.mark.parametrize("evil", [
    "../../evil.txt",
    "../../../tmp/pwned",
])
def test_path_traversal_write_blocked(evil):
    r = client.post(f"/api/files/write?path={evil}", content=b"pwned")
    assert r.status_code == 403


# ── File Locking ─────────────────────────────────────────────────────────────

def test_lock_acquire_and_check():
    client.post("/api/files/write?path=lockme.scopecam", content=b"x")
    r = client.post("/api/files/lock?path=lockme.scopecam", json={"by": "Alice"})
    assert r.status_code == 200
    r2 = client.get("/api/files/lock?path=lockme.scopecam")
    assert r2.json()["locked"] is True
    assert r2.json()["by"] == "Alice"
    # Aufräumen
    client.delete("/api/files/lock?path=lockme.scopecam")

def test_lock_blocks_second_client():
    client.post("/api/files/write?path=contested.scopecam", content=b"x")
    client.post("/api/files/lock?path=contested.scopecam", json={"by": "Alice"})
    r = client.post("/api/files/lock?path=contested.scopecam", json={"by": "Bob"})
    assert r.status_code == 409
    client.delete("/api/files/lock?path=contested.scopecam")

def test_lock_released_after_write():
    client.post("/api/files/write?path=autolock.scopecam", content=b"x")
    client.post("/api/files/lock?path=autolock.scopecam", json={"by": "Alice"})
    client.post("/api/files/write?path=autolock.scopecam", content=b"updated")
    r = client.get("/api/files/lock?path=autolock.scopecam")
    assert r.json()["locked"] is False

def test_unlock_explicit():
    client.post("/api/files/write?path=explicit.scopecam", content=b"x")
    client.post("/api/files/lock?path=explicit.scopecam", json={"by": "Alice"})
    client.delete("/api/files/lock?path=explicit.scopecam")
    r = client.get("/api/files/lock?path=explicit.scopecam")
    assert r.json()["locked"] is False

def test_no_lock_on_fresh_file():
    client.post("/api/files/write?path=neverlock.txt", content=b"x")
    r = client.get("/api/files/lock?path=neverlock.txt")
    assert r.json()["locked"] is False


# ── Client Settings ──────────────────────────────────────────────────────────

def test_client_settings_empty():
    r = client.get("/api/client-settings")
    assert r.status_code == 200

def test_client_settings_round_trip():
    payload = {"scopecam_design_v1": "midnight", "scopecam_grid_v1": {"size": 20}}
    client.post("/api/client-settings", json=payload)
    r = client.get("/api/client-settings")
    assert r.json()["scopecam_design_v1"] == "midnight"
    assert r.json()["scopecam_grid_v1"]["size"] == 20
