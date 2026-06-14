import re
from pathlib import Path
from typing import Any

try:
    from palworld_pal_editor.core.save_manager import SaveManager as PPESaveManager
except ImportError:
    PPESaveManager = None

class PalEditError(Exception):
    """Raised when a Pal edit is rejected by the library (list full, duplicate, unknown)."""


SAVE_BASE = Path("/palworld/Pal/Saved/SaveGames/0")
# Palworld dedicated servers name save dirs as 32 hex chars with no dashes
# (e.g. 01FA6B67A43540259077D0C69D58B4D1); other tools may use the dashed
# UUID form. Accept either by making the dashes optional.
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$",
    re.IGNORECASE,
)


def find_save_path(base: Path = SAVE_BASE) -> Path | None:
    if not base.exists():
        return None
    for entry in base.iterdir():
        if entry.is_dir() and UUID_PATTERN.match(entry.name):
            return entry
    return None


class SaveManager:
    def __init__(self, save_base: Path = SAVE_BASE):
        save_path = find_save_path(save_base)
        if save_path is None:
            raise RuntimeError(f"No save directory found under {save_base}")
        if PPESaveManager is None:
            raise RuntimeError("palworld-pal-editor is not installed")
        self._save_path = save_path
        self._manager = PPESaveManager()
        self._manager.open(str(save_path))

    def get_players(self) -> list[Any]:
        return self._manager.get_players()

    def get_working_pals(self) -> list[Any]:
        return self._manager.get_working_pals()

    def get_player(self, uid: str) -> Any:
        return self._manager.get_player(uid)

    def get_working_pal(self, guid: str):
        return self._manager.get_working_pal(guid)

    def delete_pal(self, guid: str) -> bool:
        return self._manager.delete_pal(guid)

    def set_pal_attr(self, player_uid: str, instance_id: str, key: str, value: Any) -> None:
        if player_uid == "PAL_BASE_WORKER_BTN":
            pal = self._manager.get_working_pal(instance_id)
        else:
            player = self._manager.get_player(player_uid)
            if player is None:
                raise ValueError(f"Player {player_uid} not found")
            pal = player.get_pal(instance_id)
        if pal is None:
            raise ValueError(f"Pal {instance_id} not found")

        match key:
            case "add_PassiveSkillList":
                if not pal.add_PassiveSkillList(value, True):
                    raise PalEditError(
                        f"Cannot add passive '{value}': already has 4, duplicate, or unknown skill."
                    )
            case "pop_PassiveSkillList":
                pal.pop_PassiveSkillList(item=value)
            case "add_EquipWaza":
                if not pal.add_EquipWaza(value, True):
                    raise PalEditError(
                        f"Cannot equip '{value}': already has 3 equipped, duplicate, or unknown skill."
                    )
            case "pop_EquipWaza":
                pal.pop_EquipWaza(item=value)
            case "add_MasteredWaza":
                if not pal.add_MasteredWaza(value):
                    raise PalEditError(
                        f"Cannot add mastered skill '{value}': duplicate or unknown skill."
                    )
            case "pop_MasteredWaza":
                pal.pop_MasteredWaza(item=value)
            case "set_Suitability":
                pal.set_WorkSuitability(value["name"], value["level"])
            case "HasWorkerSick" | "IsFaintedPal" | "heal_pal":
                pal.heal_pal()
            case _:
                setattr(pal, key, value)

    def commit(self) -> None:
        self._manager.save(str(self._save_path))
