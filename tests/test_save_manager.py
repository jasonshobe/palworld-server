import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from backend.services.save_manager import SaveManager, find_save_path


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
