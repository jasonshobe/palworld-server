import json
import shutil
from pathlib import Path
from typing import Callable

MODS_DIR = "/mods"
PAKS_DIR = "/palworld/Pal/Content/Paks"
MANIFEST_PATH = "/palworld/.mods_manifest.json"
ACCEPTED_EXTS = {".pak", ".utoc", ".ucas"}


class ModManager:
    def __init__(self, mods_dir=MODS_DIR, paks_dir=PAKS_DIR, manifest_path=MANIFEST_PATH):
        self.mods_dir = Path(mods_dir)
        self.paks_dir = Path(paks_dir)
        self.manifest_path = Path(manifest_path)

    def _read_manifest(self) -> list[str]:
        try:
            data = json.loads(self.manifest_path.read_text())
            if isinstance(data, list):
                return [str(p) for p in data]
        except (FileNotFoundError, ValueError, OSError):
            pass
        return []

    def _write_manifest(self, paths: list[str]) -> None:
        self.manifest_path.parent.mkdir(parents=True, exist_ok=True)
        self.manifest_path.write_text(json.dumps(sorted(paths)))

    def _iter_mod_files(self):
        if not self.mods_dir.exists():
            return
        for p in sorted(self.mods_dir.rglob("*")):
            if p.is_file() and p.suffix.lower() in ACCEPTED_EXTS:
                yield p

    def list_mods(self) -> list[dict]:
        installed = set(self._read_manifest())
        out = []
        for p in self._iter_mod_files():
            rel = p.relative_to(self.mods_dir).as_posix()
            out.append({"path": rel, "size": p.stat().st_size, "installed": rel in installed})
        return out
