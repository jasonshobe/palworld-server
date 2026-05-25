import { apiFetch } from "./client"
import type { AuthStatus } from "@/types"

export const getAuthStatus = () => apiFetch<AuthStatus>("/auth/status")
export const login = (password: string) =>
  apiFetch<{ ok: boolean }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  })
export const logout = () => apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" })
