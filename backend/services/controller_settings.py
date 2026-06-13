import json
from pathlib import Path
from typing import Any

CONTROLLER_SETTINGS_PATH = Path("/palworld/controller-settings.json")

DEFAULTS: dict[str, Any] = {"community": False, "query_port": None}

# Keys this store owns, derived from DEFAULTS so the two can't drift. The config
# router uses this to split them out of the PalWorldSettings.ini payload so they
# are never written to the .ini.
CONTROLLER_KEYS = set(DEFAULTS)


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
                qp = int(qp)
            except (TypeError, ValueError):
                qp = None
            result["query_port"] = qp if (qp is not None and qp >= 1) else None
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
        args.append(f"-queryport={qp}")
    return args
