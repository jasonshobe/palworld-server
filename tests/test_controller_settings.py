import json
from backend.services import controller_settings as cs


def test_read_returns_defaults_when_file_absent(tmp_path):
    settings = cs.read_settings(tmp_path / "nope.json")
    assert settings == {"community": False, "query_port": None}


def test_read_returns_defaults_when_file_corrupt(tmp_path):
    p = tmp_path / "controller-settings.json"
    p.write_text("{ not json", encoding="utf-8")
    assert cs.read_settings(p) == {"community": False, "query_port": None}


def test_write_then_read_round_trip(tmp_path):
    p = tmp_path / "controller-settings.json"
    cs.write_settings({"community": True, "query_port": 27015}, p)
    assert cs.read_settings(p) == {"community": True, "query_port": 27015}


def test_write_drops_unrecognized_keys(tmp_path):
    p = tmp_path / "controller-settings.json"
    cs.write_settings({"community": True, "ServerName": "hax"}, p)
    on_disk = json.loads(p.read_text(encoding="utf-8"))
    assert "ServerName" not in on_disk
    assert on_disk["community"] is True


def test_write_normalizes_blank_query_port_to_none(tmp_path):
    p = tmp_path / "controller-settings.json"
    cs.write_settings({"query_port": ""}, p)
    assert cs.read_settings(p)["query_port"] is None


def test_write_coerces_numeric_string_query_port_to_int(tmp_path):
    p = tmp_path / "controller-settings.json"
    cs.write_settings({"query_port": "27015"}, p)
    assert cs.read_settings(p)["query_port"] == 27015


def test_build_launch_args_empty_when_defaults():
    assert cs.build_launch_args({"community": False, "query_port": None}) == []


def test_build_launch_args_community_adds_publiclobby():
    assert cs.build_launch_args({"community": True, "query_port": None}) == ["-publiclobby"]


def test_build_launch_args_query_port_adds_flag():
    assert cs.build_launch_args({"community": False, "query_port": 27015}) == ["-queryport=27015"]


def test_build_launch_args_both():
    args = cs.build_launch_args({"community": True, "query_port": 27015})
    assert args == ["-publiclobby", "-queryport=27015"]


def test_build_launch_args_ignores_blank_query_port():
    assert cs.build_launch_args({"community": False, "query_port": ""}) == []
