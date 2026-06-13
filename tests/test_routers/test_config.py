from unittest.mock import MagicMock, patch, call
import pytest
from backend.models.server import ServerState


def test_get_config_returns_dict(client):
    sample = {"DayTimeSpeedRate": 1.0, "ServerName": "Test"}
    with patch("backend.routers.config.read_config", return_value=sample):
        resp = client.get("/api/config")
    assert resp.status_code == 200
    assert resp.json()["DayTimeSpeedRate"] == pytest.approx(1.0)


def test_get_config_fills_defaults_when_no_file(client):
    with patch("backend.routers.config.read_config", return_value={}):
        resp = client.get("/api/config")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ServerName"] == "My PalWorld Server"
    assert body["ServerPassword"] == "changeme"
    assert body["AdminPassword"] == ""
    assert body["DayTimeSpeedRate"] == pytest.approx(1.0)


def test_get_config_disk_values_override_defaults(client):
    with patch("backend.routers.config.read_config", return_value={"ServerName": "On Disk"}):
        resp = client.get("/api/config")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ServerName"] == "On Disk"
    # keys absent on disk still come from defaults
    assert body["ServerPassword"] == "changeme"


def test_put_config_merges_and_writes(client):
    existing = {"DayTimeSpeedRate": 1.0, "ServerName": "Old Name"}
    update = {"ServerName": "New Name"}
    with patch("backend.routers.config.read_config", return_value=existing.copy()), \
         patch("backend.routers.config.write_config") as mock_write:
        resp = client.put("/api/config", json={"settings": update})
    assert resp.status_code == 200
    mock_write.assert_called_once()
    written = mock_write.call_args[0][0]
    assert written["ServerName"] == "New Name"
    assert written["DayTimeSpeedRate"] == pytest.approx(1.0)


def test_put_config_returns_409_when_server_running(client):
    import backend.main as main_mod
    from backend.models.server import ServerState
    m = MagicMock()
    m.state = ServerState.RUNNING
    main_mod.server_manager = m
    resp = client.put("/api/config", json={"settings": {}})
    assert resp.status_code == 409


def test_get_config_includes_controller_settings(client):
    with patch("backend.routers.config.read_config", return_value={}), \
         patch("backend.routers.config.read_settings",
               return_value={"community": True, "query_port": 27015}):
        resp = client.get("/api/config")
    assert resp.status_code == 200
    body = resp.json()
    assert body["community"] is True
    assert body["query_port"] == 27015


def test_put_config_routes_controller_keys_to_store_not_ini(client):
    update = {"ServerName": "New Name", "community": True, "query_port": 27015}
    with patch("backend.routers.config.read_config", return_value={}), \
         patch("backend.routers.config.write_config") as mock_write_config, \
         patch("backend.routers.config.read_settings",
               return_value={"community": False, "query_port": None}), \
         patch("backend.routers.config.write_settings") as mock_write_settings:
        resp = client.put("/api/config", json={"settings": update})
    assert resp.status_code == 200

    mock_write_settings.assert_called_once()
    stored = mock_write_settings.call_args[0][0]
    assert stored["community"] is True
    assert stored["query_port"] == 27015

    written_ini = mock_write_config.call_args[0][0]
    assert "community" not in written_ini
    assert "query_port" not in written_ini
    assert written_ini["ServerName"] == "New Name"


def test_put_config_without_controller_keys_skips_store_write(client):
    with patch("backend.routers.config.read_config", return_value={}), \
         patch("backend.routers.config.write_config"), \
         patch("backend.routers.config.write_settings") as mock_write_settings:
        resp = client.put("/api/config", json={"settings": {"ServerName": "X"}})
    assert resp.status_code == 200
    mock_write_settings.assert_not_called()
