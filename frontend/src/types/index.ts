export type ServerState = "stopped" | "starting" | "running" | "stopping" | "updating"

export interface ServerStatus {
  state: ServerState
  logs: string[]
}

export interface PlayerSummary {
  uid: string
  nickname: string
  level: number
}

export interface PlayersResponse {
  players: PlayerSummary[]
  has_working_pals: boolean
}

export interface PalSummary {
  instance_id: string
  player_uid: string | null
  display_name: string | null
  nickname: string
  level: number
  gender: string | null
  is_unref: boolean
  in_owner_palbox: boolean
}

export interface AuthStatus {
  required: boolean
}

export interface PalDetailData {
  instance_id: string
  character_id: string | null
  display_name: string | null
  nickname: string
  level: number
  gender: string | null
  rank: number
  rank_hp: number
  rank_attack: number
  rank_defence: number
  rank_craft_speed: number
  talent_hp: number
  talent_melee: number
  talent_shot: number
  talent_defense: number
  passive_skills: string[]
  mastered_waza: string[]
  equip_waza: string[]
  has_worker_sick: boolean
  is_fainted: boolean
  computed_max_hp: number | null
  computed_attack: number | null
  computed_defense: number | null
  friendship_level: number
  sanity: number | null
  full_stomach: number | null
  max_full_stomach: number
  is_rare: boolean
  is_boss: boolean
  is_tower: boolean
  is_favorite: boolean
  suitabilities: Record<string, number>
}

export interface PassiveOption {
  internal_name: string
  label: string
  rating: number
}

export interface ActiveSkillOption {
  internal_name: string
  label: string
  element: string
  power: number
  has_fruit: boolean
  is_unique: boolean
  invalid: boolean
}

export interface SpeciesOption {
  internal_name: string
  label: string
}

export interface ModInfo {
  path: string
  size: number
  installed: boolean
}

export interface ModsResponse {
  mods: ModInfo[]
}
