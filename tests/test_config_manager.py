from pathlib import Path
import pytest
from backend.services.config_manager import read_config, write_config

SAMPLE_INI = """\
[/Script/Pal.PalGameWorldSettings]
OptionSettings=(DayTimeSpeedRate=1.000000,NightTimeSpeedRate=2.000000,ExpRate=3.000000,bEnablePlayerToPlayerDamage=False,ServerName="My Server",DeathPenalty=All,ServerPlayerMaxNum=32)
"""


@pytest.fixture
def ini_file(tmp_path):
    p = tmp_path / "PalWorldSettings.ini"
    p.write_text(SAMPLE_INI, encoding="utf-8")
    return p


def test_read_returns_float(ini_file):
    cfg = read_config(ini_file)
    assert cfg["DayTimeSpeedRate"] == pytest.approx(1.0)
    assert cfg["NightTimeSpeedRate"] == pytest.approx(2.0)


def test_read_returns_int(ini_file):
    cfg = read_config(ini_file)
    assert cfg["ServerPlayerMaxNum"] == 32


def test_read_returns_bool_false(ini_file):
    cfg = read_config(ini_file)
    assert cfg["bEnablePlayerToPlayerDamage"] is False


def test_read_returns_unquoted_string_as_enum(ini_file):
    cfg = read_config(ini_file)
    assert cfg["DeathPenalty"] == "All"


def test_read_returns_quoted_string_without_quotes(ini_file):
    cfg = read_config(ini_file)
    assert cfg["ServerName"] == "My Server"


def test_read_returns_empty_dict_for_missing_file(tmp_path):
    cfg = read_config(tmp_path / "nonexistent.ini")
    assert cfg == {}


def test_round_trip(ini_file, tmp_path):
    cfg = read_config(ini_file)
    out = tmp_path / "out.ini"
    write_config(cfg, out)
    cfg2 = read_config(out)
    assert cfg2["DayTimeSpeedRate"] == pytest.approx(cfg["DayTimeSpeedRate"])
    assert cfg2["ServerName"] == cfg["ServerName"]
    assert cfg2["bEnablePlayerToPlayerDamage"] == cfg["bEnablePlayerToPlayerDamage"]
    assert cfg2["DeathPenalty"] == cfg["DeathPenalty"]
    assert cfg2["ServerPlayerMaxNum"] == cfg["ServerPlayerMaxNum"]


def test_write_creates_parent_dirs(tmp_path):
    cfg = {"DayTimeSpeedRate": 1.0}
    path = tmp_path / "deep" / "nested" / "PalWorldSettings.ini"
    write_config(cfg, path)
    assert path.exists()
