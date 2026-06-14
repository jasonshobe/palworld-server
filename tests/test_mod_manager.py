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


def test_sync_copies_new_files_preserving_subfolders(mgr):
    (mgr.mods_dir / "a.pak").write_bytes(b"aaa")
    sub = mgr.mods_dir / "LogicMods"
    sub.mkdir()
    (sub / "b.pak").write_bytes(b"bb")
    count = mgr.sync()
    assert count == 2
    assert (mgr.paks_dir / "a.pak").read_bytes() == b"aaa"
    assert (mgr.paks_dir / "LogicMods" / "b.pak").read_bytes() == b"bb"


def test_sync_overwrites_changed_file(mgr):
    (mgr.mods_dir / "a.pak").write_bytes(b"old")
    mgr.sync()
    (mgr.mods_dir / "a.pak").write_bytes(b"newer-content")
    mgr.sync()
    assert (mgr.paks_dir / "a.pak").read_bytes() == b"newer-content"


def test_sync_removes_delisted_mod(mgr):
    (mgr.mods_dir / "a.pak").write_bytes(b"a")
    (mgr.mods_dir / "b.pak").write_bytes(b"b")
    mgr.sync()
    (mgr.mods_dir / "b.pak").unlink()
    mgr.sync()
    assert (mgr.paks_dir / "a.pak").exists()
    assert not (mgr.paks_dir / "b.pak").exists()


def test_sync_never_deletes_base_game_paks(mgr):
    (mgr.paks_dir / "Pal-Windows.pak").write_bytes(b"game")  # not from /mods
    (mgr.mods_dir / "mod.pak").write_bytes(b"m")
    mgr.sync()
    (mgr.mods_dir / "mod.pak").unlink()
    mgr.sync()
    assert (mgr.paks_dir / "Pal-Windows.pak").exists()


def test_sync_prunes_empty_mod_subdirs(mgr):
    sub = mgr.mods_dir / "LogicMods"
    sub.mkdir()
    (sub / "b.pak").write_bytes(b"b")
    mgr.sync()
    (sub / "b.pak").unlink()
    mgr.sync()
    assert not (mgr.paks_dir / "LogicMods").exists()


def test_sync_returns_zero_when_no_mods_dir(tmp_path):
    m = ModManager(
        mods_dir=str(tmp_path / "absent"),
        paks_dir=str(tmp_path / "paks"),
        manifest_path=str(tmp_path / "manifest.json"),
    )
    assert m.sync() == 0


def test_sync_skips_unchanged_files_on_resync(mgr):
    (mgr.mods_dir / "a.pak").write_bytes(b"data")
    mgr.sync()
    dest = mgr.paks_dir / "a.pak"
    marker = dest.stat().st_mtime_ns
    # Make source mtime differ by <2s; sync must NOT recopy (mtime stays the marker)
    import os, time
    src = mgr.mods_dir / "a.pak"
    os.utime(src, (time.time(), dest.stat().st_mtime + 1))
    mgr.sync()
    assert dest.stat().st_mtime_ns == marker
