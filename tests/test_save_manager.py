import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from backend.services.save_manager import SaveManager, find_save_path, PalEditError


@pytest.fixture
def save_dir(tmp_path):
    server_id = str(uuid.uuid4())
    save_path = tmp_path / "SaveGames" / "0" / server_id
    save_path.mkdir(parents=True)
    (save_path / "Level.sav").touch()
    return tmp_path / "SaveGames" / "0", server_id


def test_find_save_path_returns_uuid_dir(save_dir):
    base, server_id = save_dir
    found = find_save_path(base)
    assert found is not None
    assert found.name == server_id


def test_find_save_path_returns_none_when_empty(tmp_path):
    base = tmp_path / "SaveGames" / "0"
    base.mkdir(parents=True)
    assert find_save_path(base) is None


def test_find_save_path_skips_non_uuid_dirs(tmp_path):
    base = tmp_path / "SaveGames" / "0"
    base.mkdir(parents=True)
    (base / "not-a-uuid").mkdir()
    assert find_save_path(base) is None


def test_find_save_path_returns_dashless_hex_dir(tmp_path):
    # Palworld dedicated servers name save dirs as 32 hex chars without dashes
    base = tmp_path / "SaveGames" / "0"
    server_id = "01FA6B67A43540259077D0C69D58B4D1"
    save_path = base / server_id
    save_path.mkdir(parents=True)
    (save_path / "Level.sav").touch()
    found = find_save_path(base)
    assert found is not None
    assert found.name == server_id


def test_save_manager_init_raises_when_no_save(tmp_path):
    base = tmp_path / "SaveGames" / "0"
    base.mkdir(parents=True)
    with pytest.raises(RuntimeError, match="No save"):
        SaveManager(save_base=base)


def test_save_manager_get_players_calls_library(save_dir):
    base, server_id = save_dir
    mock_ppe_manager = MagicMock()
    mock_ppe_manager.get_players.return_value = []

    with patch("backend.services.save_manager.PPESaveManager", return_value=mock_ppe_manager), \
         patch("backend.services.save_manager.PPESaveManager.__call__", return_value=mock_ppe_manager):
        sm = SaveManager.__new__(SaveManager)
        sm._manager = mock_ppe_manager
        sm._save_path = base / server_id
        players = sm.get_players()

    mock_ppe_manager.get_players.assert_called_once()
    assert players == []


def _sm_with_pal(pal):
    """Build a SaveManager bypassing __init__, wired to a mock library manager."""
    sm = SaveManager.__new__(SaveManager)
    manager = MagicMock()
    player = MagicMock()
    player.get_pal.return_value = pal
    manager.get_player.return_value = player
    manager.get_working_pal.return_value = pal
    sm._manager = manager
    return sm


def test_set_pal_attr_scalar_uses_setattr():
    pal = MagicMock()
    sm = _sm_with_pal(pal)
    sm.set_pal_attr("uid-1", "pal-1", "Level", 42)
    assert pal.Level == 42


def test_set_pal_attr_add_passive_calls_method():
    pal = MagicMock()
    pal.add_PassiveSkillList.return_value = True
    sm = _sm_with_pal(pal)
    sm.set_pal_attr("uid-1", "pal-1", "add_PassiveSkillList", "PassiveSkill_Legend")
    pal.add_PassiveSkillList.assert_called_once_with("PassiveSkill_Legend", True)


def test_set_pal_attr_add_passive_full_raises_pal_edit_error():
    pal = MagicMock()
    pal.add_PassiveSkillList.return_value = False
    sm = _sm_with_pal(pal)
    with pytest.raises(PalEditError):
        sm.set_pal_attr("uid-1", "pal-1", "add_PassiveSkillList", "PassiveSkill_Legend")


def test_set_pal_attr_pop_equip_waza_calls_method():
    pal = MagicMock()
    sm = _sm_with_pal(pal)
    sm.set_pal_attr("uid-1", "pal-1", "pop_EquipWaza", "EPalWazaID::Fire_FlareArrow")
    pal.pop_EquipWaza.assert_called_once_with(item="EPalWazaID::Fire_FlareArrow")


def test_set_pal_attr_set_suitability_uses_prefixed_enum_value():
    # The library's set_WorkSuitability resolves the suitability via the full
    # EPalWorkSuitability:: enum value; the bare name silently no-ops.
    pal = MagicMock()
    sm = _sm_with_pal(pal)
    sm.set_pal_attr("uid-1", "pal-1", "set_Suitability", {"name": "Watering", "level": 3})
    pal.set_WorkSuitability.assert_called_once_with("EPalWorkSuitability::Watering", 3)


def test_set_pal_attr_heal_calls_heal_pal():
    pal = MagicMock()
    sm = _sm_with_pal(pal)
    sm.set_pal_attr("uid-1", "pal-1", "IsFaintedPal", False)
    pal.heal_pal.assert_called_once()


def test_set_pal_attr_unknown_player_raises_value_error():
    sm = SaveManager.__new__(SaveManager)
    manager = MagicMock()
    manager.get_player.return_value = None
    sm._manager = manager
    with pytest.raises(ValueError, match="Player"):
        sm.set_pal_attr("uid-x", "pal-1", "Level", 1)


def test_commit_raises_when_library_save_fails():
    # The library's save() returns False (without raising) on several abort
    # conditions; commit() must surface that as an error, not silently succeed.
    sm = SaveManager.__new__(SaveManager)
    sm._manager = MagicMock()
    sm._manager.save.return_value = False
    sm._save_path = Path("/tmp/does-not-matter")
    with pytest.raises(RuntimeError, match="save"):
        sm.commit()


def test_commit_succeeds_when_library_save_returns_true():
    sm = SaveManager.__new__(SaveManager)
    sm._manager = MagicMock()
    sm._manager.save.return_value = True
    sm._save_path = Path("/tmp/does-not-matter")
    sm.commit()
    sm._manager.save.assert_called_once_with("/tmp/does-not-matter")


def _sm_for_duplicate(source_pal, add_pal_result):
    """SaveManager bypassing __init__, wired to a mock library manager."""
    sm = SaveManager.__new__(SaveManager)
    manager = MagicMock()
    player = MagicMock()
    player.get_pal.return_value = source_pal
    manager.get_player.return_value = player
    manager.add_pal.return_value = add_pal_result
    sm._manager = manager
    return sm, manager


def test_duplicate_pal_adds_copy_and_renames_with_nickname():
    source = MagicMock()
    source.NickName = "Sparky"
    source.DisplayName = "Foxparks"
    source._pal_obj = {"obj": "source"}
    new_pal = MagicMock()
    sm, manager = _sm_for_duplicate(source, new_pal)
    result = sm.duplicate_pal("uid-1", "pal-1")
    manager.add_pal.assert_called_once_with("uid-1", source._pal_obj)
    assert result is new_pal
    assert new_pal.NickName == "Sparky (copy)"


def test_duplicate_pal_uses_species_name_when_no_nickname():
    source = MagicMock()
    source.NickName = ""
    source.DisplayName = "Foxparks"
    source._pal_obj = {"obj": "source"}
    new_pal = MagicMock()
    sm, _ = _sm_for_duplicate(source, new_pal)
    sm.duplicate_pal("uid-1", "pal-1")
    assert new_pal.NickName == "Foxparks (copy)"


def test_duplicate_pal_base_worker_raises_pal_edit_error():
    sm = SaveManager.__new__(SaveManager)
    sm._manager = MagicMock()
    with pytest.raises(PalEditError):
        sm.duplicate_pal("PAL_BASE_WORKER_BTN", "pal-1")


def test_duplicate_pal_full_palbox_raises_pal_edit_error():
    source = MagicMock()
    source.NickName = "Sparky"
    source.DisplayName = "Foxparks"
    source._pal_obj = {"obj": "source"}
    sm, _ = _sm_for_duplicate(source, None)
    with pytest.raises(PalEditError, match="full"):
        sm.duplicate_pal("uid-1", "pal-1")


def test_duplicate_pal_unknown_player_raises_value_error():
    sm = SaveManager.__new__(SaveManager)
    manager = MagicMock()
    manager.get_player.return_value = None
    sm._manager = manager
    with pytest.raises(ValueError, match="Player"):
        sm.duplicate_pal("uid-x", "pal-1")


def test_duplicate_pal_unknown_pal_raises_value_error():
    sm = SaveManager.__new__(SaveManager)
    manager = MagicMock()
    player = MagicMock()
    player.get_pal.return_value = None
    manager.get_player.return_value = player
    sm._manager = manager
    with pytest.raises(ValueError, match="Pal"):
        sm.duplicate_pal("uid-1", "pal-x")


def _sm_for_create(add_pal_result):
    """SaveManager bypassing __init__, wired to a mock library manager."""
    sm = SaveManager.__new__(SaveManager)
    manager = MagicMock()
    manager.get_player.return_value = MagicMock()
    manager.add_pal.return_value = add_pal_result
    sm._manager = manager
    return sm, manager


def test_create_pal_sets_species_equips_skill_and_clears_name():
    new_pal = MagicMock()
    sm, manager = _sm_for_create(new_pal)
    result = sm.create_pal("uid-1", "Foxparks")
    manager.add_pal.assert_called_once_with("uid-1")
    assert new_pal.CharacterID == "Foxparks"
    new_pal.equip_all_pal_attacks.assert_called_once()
    assert new_pal.NickName is None
    assert result is new_pal


def test_create_pal_full_palbox_raises_pal_edit_error():
    sm, _ = _sm_for_create(None)
    with pytest.raises(PalEditError, match="full"):
        sm.create_pal("uid-1", "Foxparks")


def test_create_pal_base_worker_raises_pal_edit_error():
    sm = SaveManager.__new__(SaveManager)
    sm._manager = MagicMock()
    with pytest.raises(PalEditError):
        sm.create_pal("PAL_BASE_WORKER_BTN", "Foxparks")


def test_create_pal_unknown_player_raises_value_error():
    sm = SaveManager.__new__(SaveManager)
    manager = MagicMock()
    manager.get_player.return_value = None
    sm._manager = manager
    with pytest.raises(ValueError, match="Player"):
        sm.create_pal("uid-x", "Foxparks")
