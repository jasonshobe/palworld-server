import json
import pytest
from backend.services.mod_manager import ModManager


@pytest.fixture
def mgr(tmp_path):
    mods = tmp_path / "mods"
    paks = tmp_path / "paks"
    mods.mkdir()
    paks.mkdir()
    return ModManager(
        mods_dir=str(mods),
        paks_dir=str(paks),
        manifest_path=str(tmp_path / "manifest.json"),
    )


def test_list_empty(mgr):
    assert mgr.list_mods() == []


def test_list_reports_accepted_files_and_ignores_others(mgr):
    (mgr.mods_dir / "a.pak").write_bytes(b"x")
    (mgr.mods_dir / "readme.txt").write_text("hi")
    sub = mgr.mods_dir / "LogicMods"
    sub.mkdir()
    (sub / "b.utoc").write_bytes(b"yy")
    listed = {m["path"]: m for m in mgr.list_mods()}
    assert set(listed) == {"a.pak", "LogicMods/b.utoc"}
    assert listed["a.pak"]["size"] == 1
    assert listed["a.pak"]["installed"] is False


def test_installed_flag_reflects_manifest(mgr):
    (mgr.mods_dir / "a.pak").write_bytes(b"x")
    mgr.manifest_path.write_text(json.dumps(["a.pak"]))
    assert mgr.list_mods()[0]["installed"] is True


def test_manifest_missing_or_corrupt_treated_as_empty(mgr):
    (mgr.mods_dir / "a.pak").write_bytes(b"x")
    assert mgr.list_mods()[0]["installed"] is False  # no manifest file
    mgr.manifest_path.write_text("{not json")
    assert mgr.list_mods()[0]["installed"] is False
