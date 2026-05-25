from pydantic import BaseModel


class PlayerSummary(BaseModel):
    uid: str
    nickname: str
    level: int


class PlayersResponse(BaseModel):
    players: list[PlayerSummary]
    has_working_pals: bool


class PalSummary(BaseModel):
    instance_id: str
    player_uid: str | None
    display_name: str | None
    nickname: str
    level: int
    gender: str | None
    is_unref: bool
    in_owner_palbox: bool


class PalPatch(BaseModel):
    player_uid: str | None = None
    key: str
    value: object
