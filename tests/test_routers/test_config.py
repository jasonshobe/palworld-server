from unittest.mock import MagicMock, patch, call
import pytest
from backend.models.server import ServerState


def test_get_config_returns_dict(client):
    sample = {"DayTimeSpeedRate": 1.0, "ServerName": "Test"}
    with patch("backend.routers.config.read_config", return_value=sample):
        resp = client.get("/api/config")
    assert resp.status_code == 200
    assert resp.json()["DayTimeSpeedRate"] == pytest.approx(1.0)


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
