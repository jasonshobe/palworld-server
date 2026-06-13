import json
from pathlib import Path
from typing import Any

CONTROLLER_SETTINGS_PATH = Path("/palworld/controller-settings.json")

# Keys this store owns. The config router uses this to split them out of the
# PalWorldSettings.ini payload so they are never written to the .ini.
CONTROLLER_KEYS = {"community", "query_port"}

DEFAULTS: dict[str, Any] = {"community": False, "query_port": None}


def _normalize(settings: dict[str, Any]) -> dict[str, Any]:
    result = {k: settings[k] for k in CONTROLLER_KEYS if k in settings}
    if "community" in result:
        result["community"] = bool(result["community"])
    if "query_port" in result:
        qp = result["query_port"]
        if qp in (None, ""):
            result["query_port"] = None
        else:
            try:
                result["query_port"] = int(qp)
            except (TypeError, ValueError):
                result["query_port"] = None
    return result


def read_settings(path: Path = CONTROLLER_SETTINGS_PATH) -> dict[str, Any]:
    settings = dict(DEFAULTS)
    if path.exists():
        try:
            on_disk = json.loads(path.read_text(encoding="utf-8"))
            settings.update(_normalize(on_disk))
        except (json.JSONDecodeError, OSError):
            pass
    return settings


def write_settings(settings: dict[str, Any], path: Path = CONTROLLER_SETTINGS_PATH) -> None:
    merged = {**DEFAULTS, **_normalize(settings)}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(merged), encoding="utf-8")


def build_launch_args(settings: dict[str, Any]) -> list[str]:
    args: list[str] = []
    if settings.get("community"):
        args.append("-publiclobby")
    qp = settings.get("query_port")
    if qp not in (None, ""):
        args.append(f"-queryport={int(qp)}")
    return args
