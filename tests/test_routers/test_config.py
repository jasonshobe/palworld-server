from unittest.mock import MagicMock, patch
import pytest
from backend.models.server import ServerState


def test_get_config_returns_dict(client):
    sample = {"DayTimeSpeedRate": 1.0, "ServerName": "Test"}
    with patch("backend.routers.config.read_config", return_value=sample):
        resp = client.get("/api/config")
    assert resp.status_code == 200
    assert resp.json()["DayTimeSpeedRate"] == pytest.approx(1.0)


def test_put_config_calls_write(client):
    with patch("backend.routers.config.read_config", return_value={}), \
         patch("backend.routers.config.write_config") as mock_write:
        resp = client.put("/api/config", json={"settings": {"DayTimeSpeedRate": 2.0}})
    assert resp.status_code == 200
    mock_write.assert_called_once()


def test_put_config_returns_409_when_server_running(client):
    import backend.main as main_mod
    from backend.services.server_manager import ServerManager
    from backend.models.server import ServerState
    m = MagicMock()
    m.state = ServerState.RUNNING
    main_mod.server_manager = m
    resp = client.put("/api/config", json={"settings": {}})
    assert resp.status_code == 409
