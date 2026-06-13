from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from backend.models.server import ServerState


@pytest.fixture
def mock_manager():
    m = MagicMock()
    m.state = ServerState.STOPPED
    m.logs = []
    return m


def test_get_status_returns_stopped(client, mock_manager):
    import backend.main as main_mod
    main_mod.server_manager = mock_manager
    resp = client.get("/api/server/status")
    assert resp.status_code == 200
    assert resp.json()["state"] == "stopped"


def test_start_calls_manager(client, mock_manager):
    import backend.main as main_mod
    main_mod.server_manager = mock_manager
    mock_manager.start = AsyncMock()
    resp = client.post("/api/server/start")
    assert resp.status_code == 200
    mock_manager.start.assert_called_once()


def test_stop_calls_manager(client, mock_manager):
    import backend.main as main_mod
    main_mod.server_manager = mock_manager
    mock_manager.state = ServerState.RUNNING
    mock_manager.stop = AsyncMock()
    resp = client.post("/api/server/stop")
    assert resp.status_code == 200
    mock_manager.stop.assert_called_once()


def test_update_calls_manager(client, mock_manager):
    import backend.main as main_mod
    main_mod.server_manager = mock_manager
    mock_manager.update = AsyncMock()
    resp = client.post("/api/server/update")
    assert resp.status_code == 200
    mock_manager.update.assert_called_once()


def test_update_returns_409_when_running(client, mock_manager):
    import backend.main as main_mod
    main_mod.server_manager = mock_manager
    mock_manager.state = ServerState.RUNNING
    mock_manager.update = AsyncMock(side_effect=RuntimeError("must be stopped"))
    resp = client.post("/api/server/update")
    assert resp.status_code == 409


def test_start_passes_launch_args_from_controller_settings(client, mock_manager):
    import backend.main as main_mod
    main_mod.server_manager = mock_manager
    mock_manager.start = AsyncMock()
    with patch("backend.routers.server.read_settings",
               return_value={"community": True, "query_port": 27015}):
        resp = client.post("/api/server/start")
    assert resp.status_code == 200
    mock_manager.start.assert_called_once_with(["-publiclobby", "-queryport=27015"])


def test_start_passes_empty_args_when_no_options(client, mock_manager):
    import backend.main as main_mod
    main_mod.server_manager = mock_manager
    mock_manager.start = AsyncMock()
    with patch("backend.routers.server.read_settings",
               return_value={"community": False, "query_port": None}):
        resp = client.post("/api/server/start")
    assert resp.status_code == 200
    mock_manager.start.assert_called_once_with([])
