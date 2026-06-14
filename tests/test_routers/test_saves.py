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


def _make_pal():
    pal = MagicMock()
    pal.InstanceId = "pal-1"
    pal.CharacterID = "Lamball"
    pal.DisplayName = "Lamball"
    pal.NickName = ""
    pal.Level = 5
    pal.Gender = MagicMock(value="Male")
    pal.Rank = 1
    pal.Rank_HP = 0
    pal.Rank_Attack = 0
    pal.Rank_Defence = 0
    pal.Rank_CraftSpeed = 0
    pal.Talent_HP = 50
    pal.Talent_Melee = 50
    pal.Talent_Shot = 50
    pal.Talent_Defense = 50
    pal.PassiveSkillList = ["PassiveSkill_Legend"]
    pal.MasteredWaza = []
    pal.EquipWaza = []
    pal.HasWorkerSick = False
    pal.IsFaintedPal = False
    pal.ComputedMaxHP = 100
    pal.ComputedAttack = 80
    pal.ComputedDefense = 70
    pal.FriendshipLevel = 2
    pal.SanityValue = 100.0
    pal.FullStomach = 150.0
    pal.IsRarePal = False
    pal.IsBOSS = False
    pal.IsTower = False
    pal.IsFavoritePal = True
    pal.WorkSuitabilities = {"Watering": 2}
    return pal


def test_get_pal_returns_extended_fields(client, mock_save_manager, monkeypatch):
    from backend.services import pal_data
    monkeypatch.setattr(pal_data, "get_pal_food_max", lambda key: 300)
    pal = _make_pal()
    player = mock_save_manager.get_player.return_value
    player.get_pal.return_value = pal
    resp = client.get("/api/saves/pals/pal-1?player_uid=uid-1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["friendship_level"] == 2
    assert data["sanity"] == 100.0
    assert data["full_stomach"] == 150.0
    assert data["max_full_stomach"] == 300
    assert data["is_favorite"] is True
    assert data["suitabilities"] == {"Watering": 2}


def test_patch_pal_maps_pal_edit_error_to_409(client, mock_save_manager):
    from backend.services.save_manager import PalEditError
    mock_save_manager.set_pal_attr.side_effect = PalEditError("list full")
    resp = client.patch(
        "/api/saves/pals/pal-1",
        json={"player_uid": "uid-1", "key": "add_PassiveSkillList", "value": "X"},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "list full"


def test_patch_pal_maps_value_error_to_404(client, mock_save_manager):
    mock_save_manager.set_pal_attr.side_effect = ValueError("Pal not found")
    resp = client.patch(
        "/api/saves/pals/pal-1",
        json={"player_uid": "uid-1", "key": "Level", "value": 5},
    )
    assert resp.status_code == 404


def test_data_passives_endpoint(client, monkeypatch):
    from backend.services import pal_data
    monkeypatch.setattr(
        pal_data, "get_passives",
        lambda: [{"internal_name": "PassiveSkill_Legend", "label": "Legend", "rating": 3}],
    )
    resp = client.get("/api/saves/data/passives")
    assert resp.status_code == 200
    assert resp.json()[0]["internal_name"] == "PassiveSkill_Legend"
    assert resp.json()[0]["rating"] == 3


def test_data_active_skills_endpoint(client, monkeypatch):
    from backend.services import pal_data
    monkeypatch.setattr(
        pal_data, "get_active_skills",
        lambda: [{
            "internal_name": "EPalWazaID::Fire_FlareArrow", "label": "Flare Arrow",
            "element": "Fire", "power": 35, "has_fruit": True, "is_unique": False, "invalid": False,
        }],
    )
    resp = client.get("/api/saves/data/active-skills")
    assert resp.status_code == 200
    assert resp.json()[0]["element"] == "Fire"


def test_data_suitabilities_endpoint(client, monkeypatch):
    from backend.services import pal_data
    monkeypatch.setattr(pal_data, "get_suitabilities", lambda: ["Watering", "Mining"])
    resp = client.get("/api/saves/data/suitabilities")
    assert resp.status_code == 200
    assert resp.json() == ["Watering", "Mining"]
