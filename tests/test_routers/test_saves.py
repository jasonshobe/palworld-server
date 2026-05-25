from unittest.mock import MagicMock, patch
import pytest
from backend.models.server import ServerState


@pytest.fixture(autouse=True)
def mock_save_manager():
    mock_sm = MagicMock()
    player = MagicMock()
    player.PlayerUId = "uid-1"
    player.NickName = "Player1"
    player.Level = 10
    mock_sm.get_players.return_value = [player]
    mock_sm.get_player.return_value = player
    mock_sm.get_working_pals.return_value = []
    with patch("backend.routers.saves._get_save_manager", return_value=mock_sm):
        yield mock_sm


def test_get_players_returns_list(client):
    resp = client.get("/api/saves/players")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["players"]) == 1
    assert data["players"][0]["nickname"] == "Player1"


def test_get_pals_returns_list(client, mock_save_manager):
    pal = MagicMock()
    pal.InstanceId = "pal-1"
    pal.DisplayName = "Lamball"
    pal.NickName = ""
    pal.Level = 5
    pal.Gender = MagicMock(value="Male")
    pal.is_unreferenced_pal = False
    pal.in_owner_palbox = True
    player = mock_save_manager.get_players.return_value[0]
    player.get_sorted_pals.return_value = [pal]
    resp = client.get("/api/saves/pals?player_uid=uid-1")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_patch_pal_returns_409_when_server_running(client):
    import backend.main as main_mod
    m = MagicMock()
    m.state = ServerState.RUNNING
    main_mod.server_manager = m
    resp = client.patch("/api/saves/pals/pal-1", json={"player_uid": "uid-1", "key": "NickName", "value": "Fluffy"})
    assert resp.status_code == 409


def test_commit_saves_file(client, mock_save_manager):
    resp = client.post("/api/saves/commit")
    assert resp.status_code == 200
    mock_save_manager.commit.assert_called_once()
