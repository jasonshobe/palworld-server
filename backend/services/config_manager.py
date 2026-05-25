from pathlib import Path
from typing import Any

SETTINGS_PATH = Path("/palworld/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini")
SECTION_HEADER = "[/Script/Pal.PalGameWorldSettings]"

# These fields are stored with surrounding double-quotes in the INI file
STRING_FIELDS = {
    "ServerName", "ServerDescription", "AdminPassword", "ServerPassword",
    "PublicIP", "BanListURL", "Region",
}


def _find_option_content(text: str) -> str | None:
    marker = "OptionSettings=("
    start = text.find(marker)
    if start == -1:
        return None
    pos = start + len(marker)
    depth = 1
    while pos < len(text) and depth > 0:
        if text[pos] == "(":
            depth += 1
        elif text[pos] == ")":
            depth -= 1
        pos += 1
    return text[start + len(marker): pos - 1]


def _parse_pairs(content: str) -> dict[str, Any]:
    pairs: dict[str, Any] = {}
    depth = 0
    in_string = False
    current = ""

    for ch in content:
        if ch == '"':
            in_string = not in_string
            current += ch
        elif not in_string and ch == "(":
            depth += 1
            current += ch
        elif not in_string and ch == ")":
            depth -= 1
            current += ch
        elif not in_string and ch == "," and depth == 0:
            if "=" in current:
                k, _, v = current.partition("=")
                pairs[k.strip()] = _parse_value(v.strip())
            current = ""
        else:
            current += ch

    if current and "=" in current:
        k, _, v = current.partition("=")
        pairs[k.strip()] = _parse_value(v.strip())

    return pairs


def _parse_value(raw: str) -> Any:
    if raw.startswith('"') and raw.endswith('"'):
        return raw[1:-1]
    if raw.startswith("("):
        return raw  # nested structure (e.g., CrossplayPlatforms), keep as-is
    if raw.lower() == "true":
        return True
    if raw.lower() == "false":
        return False
    try:
        if "." in raw:
            return float(raw)
        return int(raw)
    except ValueError:
        return raw  # enum value (e.g., "All", "None", "ItemAndEquipment")


def _format_value(key: str, value: Any) -> str:
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, float):
        return f"{value:.6f}"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str):
        if key in STRING_FIELDS:
            return f'"{value}"'
        return value  # enum or nested structure
    return str(value)


def read_config(path: Path = SETTINGS_PATH) -> dict[str, Any]:
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8")
    content = _find_option_content(text)
    if content is None:
        return {}
    return _parse_pairs(content)


def write_config(settings: dict[str, Any], path: Path = SETTINGS_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    options = ",".join(f"{k}={_format_value(k, v)}" for k, v in settings.items())
    text = f"{SECTION_HEADER}\nOptionSettings=({options})\n"
    path.write_text(text, encoding="utf-8")
