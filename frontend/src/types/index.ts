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
