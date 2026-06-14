from functools import lru_cache

# Fixed set of Palworld work suitabilities (PalSuitability enum names upstream).
SUITABILITIES = [
    "EmitFlame", "Watering", "Seeding", "GenerateElectricity", "Handcraft",
    "Collection", "Deforest", "Mining", "OilExtraction", "ProductMedicine",
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
