from functools import lru_cache

# Fixed set of Palworld work suitabilities (PalSuitability enum names upstream).
# OilExtraction is intentionally omitted — it exists in the enum but is unused by the game.
SUITABILITIES = [
    "EmitFlame", "Watering", "Seeding", "GenerateElectricity", "Handcraft",
    "Collection", "Deforest", "Mining", "ProductMedicine",
    "Cool", "Transport", "MonsterFarm",
]


def _provider():
    from palworld_pal_editor.utils import DataProvider
    return DataProvider


@lru_cache(maxsize=1)
def get_passives() -> list[dict]:
    dp = _provider()
    out = []
    for p in dp.get_sorted_passives():
        name = p["InternalName"]
        i18n = dp.get_passive_i18n(name)
        out.append({
            "internal_name": name,
            "label": i18n[0] if i18n else name,
            "rating": p["Rating"],
        })
    return out


@lru_cache(maxsize=1)
def get_active_skills() -> list[dict]:
    dp = _provider()
    out = []
    for a in dp.get_sorted_attacks():
        name = a["InternalName"]
        i18n = dp.get_attack_i18n(name)
        out.append({
            "internal_name": name,
            "label": i18n[0] if i18n else name,
            "element": a["Element"],
            "power": a["Power"],
            "has_fruit": dp.has_skill_fruit(name),
            "is_unique": dp.is_unique_attacks(name),
            "invalid": a.get("Invalid", False),
        })
    return out


def get_suitabilities() -> list[str]:
    return list(SUITABILITIES)


# The library keys WorkSuitabilities by the full enum value
# (e.g. "EPalWorkSuitability::EmitFlame") and resolves writes via the same
# value; the rest of this app uses the bare name ("EmitFlame").
SUITABILITY_PREFIX = "EPalWorkSuitability::"


def suitabilities_to_names(raw: dict[str, int] | None) -> dict[str, int]:
    """Strip the EPalWorkSuitability:: prefix from library suitability keys."""
    return {k.removeprefix(SUITABILITY_PREFIX): v for k, v in (raw or {}).items()}


def suitability_to_internal(name: str) -> str:
    """Add the enum prefix the library requires when setting a suitability."""
    if name.startswith(SUITABILITY_PREFIX):
        return name
    return SUITABILITY_PREFIX + name


# Per-species max Full Stomach (the pal's FOOD stat). Falls back to 150 — the
# same default the library uses when a species has no FOOD stat.
def get_pal_food_max(data_access_key: str | None) -> int:
    if not data_access_key:
        return 150
    return _provider().get_pal_stats(data_access_key, "FOOD") or 150
