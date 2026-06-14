import io
import pytest
from unittest.mock import patch
from backend.services.mod_manager import ModManager


@pytest.fixture(autouse=True)
def mods_dir(tmp_path):
    import backend.main as main
    mgr = ModManager(
        mods_dir=str(tmp_path / "mods"),
        paks_dir=str(tmp_path / "paks"),
        manifest_path=str(tmp_path / "manifest.json"),
    )
    (tmp_path / "mods").mkdir()
    with patch.object(main, "mod_manager", mgr):
        yield mgr


def test_list_empty(client):
    resp = client.get("/api/mods")
    assert resp.status_code == 200
    assert resp.json() == {"mods": []}


def test_upload_then_list(client):
    resp = client.post(
        "/api/mods/upload",
        files={"file": ("a.pak", io.BytesIO(b"data"), "application/octet-stream")},
    )
    assert resp.status_code == 200
    assert resp.json() == {"path": "a.pak", "size": 4, "installed": False}
    listed = client.get("/api/mods").json()["mods"]
    assert listed[0]["path"] == "a.pak"


def test_upload_into_subfolder(client):
    resp = client.post(
        "/api/mods/upload",
        files={"file": ("b.pak", io.BytesIO(b"bb"), "application/octet-stream")},
        data={"subfolder": "LogicMods"},
    )
    assert resp.json()["path"] == "LogicMods/b.pak"


def test_upload_rejects_bad_extension(client):
    resp = client.post(
        "/api/mods/upload",
        files={"file": ("evil.exe", io.BytesIO(b"x"), "application/octet-stream")},
    )
    assert resp.status_code == 400


def test_delete_removes_file(client, mods_dir):
    (mods_dir.mods_dir / "a.pak").write_bytes(b"x")
    resp = client.delete("/api/mods/a.pak")
    assert resp.status_code == 200
    assert client.get("/api/mods").json()["mods"] == []


def test_delete_missing_returns_404(client):
    resp = client.delete("/api/mods/nope.pak")
    assert resp.status_code == 404
