from fastapi import APIRouter, HTTPException, Query
from backend.models.server import ServerState
from backend.models.saves import PlayersResponse, PlayerSummary, PalSummary, PalPatch

router = APIRouter(prefix="/api/saves", tags=["saves"])


def _assert_stopped():
    from backend.main import server_manager
    if server_manager.state != ServerState.STOPPED:
        raise HTTPException(status_code=409, detail="Server must be stopped to edit saves")


def _get_save_manager():
    import backend.main as _main
    if _main.save_manager is None:
        try:
            from backend.services.save_manager import SaveManager as _SM
            _main.save_manager = _SM()
        except RuntimeError:
            raise HTTPException(status_code=503, detail="No save file found")
    return _main.save_manager


@router.get("/players", response_model=PlayersResponse)
def get_players():
    sm = _get_save_manager()
    players = sm.get_players()
    has_working = len(sm.get_working_pals()) > 0
    return PlayersResponse(
        players=[
            PlayerSummary(
                uid=str(p.PlayerUId),
                nickname=p.NickName or str(p.PlayerUId),
                level=p.Level or 1,
            )
            for p in players
        ],
        has_working_pals=has_working,
    )


@router.get("/pals", response_model=list[PalSummary])
def get_pals(player_uid: str = Query(...)):
    sm = _get_save_manager()
    if player_uid == "PAL_BASE_WORKER_BTN":
        pals = sm.get_working_pals()
        owner_uid = None
    else:
        player = sm.get_player(player_uid)
        if player is None:
            raise HTTPException(status_code=404, detail="Player not found")
        pals = player.get_sorted_pals()
        owner_uid = player_uid

    return [
        PalSummary(
            instance_id=str(p.InstanceId),
            player_uid=owner_uid,
            display_name=p.DisplayName,
            nickname=p.NickName or "",
            level=p.Level or 1,
            gender=p.Gender.value if p.Gender else None,
            is_unref=p.is_unreferenced_pal,
            in_owner_palbox=p.in_owner_palbox,
        )
        for p in pals
    ]


@router.get("/pals/{instance_id}")
def get_pal(instance_id: str, player_uid: str = Query(...)):
    sm = _get_save_manager()
    if player_uid == "PAL_BASE_WORKER_BTN":
        pal = sm.get_working_pal(instance_id)
    else:
        player = sm.get_player(player_uid)
        if player is None:
            raise HTTPException(status_code=404, detail="Player not found")
        pal = player.get_pal(instance_id)
    if pal is None:
        raise HTTPException(status_code=404, detail="Pal not found")
    return {
        "instance_id": str(pal.InstanceId),
        "character_id": pal.CharacterID,
        "display_name": pal.DisplayName,
        "nickname": pal.NickName or "",
        "level": pal.Level or 1,
        "gender": pal.Gender.value if pal.Gender else None,
        "rank": pal.Rank if pal.Rank else 1,
        "rank_hp": pal.Rank_HP or 0,
        "rank_attack": pal.Rank_Attack or 0,
        "rank_defence": pal.Rank_Defence or 0,
        "rank_craft_speed": pal.Rank_CraftSpeed or 0,
        "talent_hp": pal.Talent_HP or 0,
        "talent_melee": pal.Talent_Melee or 0,
        "talent_shot": pal.Talent_Shot or 0,
        "talent_defense": pal.Talent_Defense or 0,
        "passive_skills": pal.PassiveSkillList or [],
        "mastered_waza": pal.MasteredWaza or [],
        "equip_waza": pal.EquipWaza or [],
        "has_worker_sick": pal.HasWorkerSick,
        "is_fainted": pal.IsFaintedPal,
        "computed_max_hp": pal.ComputedMaxHP,
        "computed_attack": pal.ComputedAttack,
        "computed_defense": pal.ComputedDefense,
    }


@router.patch("/pals/{instance_id}")
def patch_pal(instance_id: str, body: PalPatch):
    _assert_stopped()
    sm = _get_save_manager()
    try:
        sm.set_pal_attr(body.player_uid or "PAL_BASE_WORKER_BTN", instance_id, body.key, body.value)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True}


@router.delete("/pals/{instance_id}")
def delete_pal(instance_id: str):
    _assert_stopped()
    sm = _get_save_manager()
    if not sm.delete_pal(instance_id):
        raise HTTPException(status_code=404, detail="Pal not found")
    return {"ok": True}


@router.post("/commit")
def commit_save():
    _assert_stopped()
    sm = _get_save_manager()
    sm.commit()
    return {"ok": True}
