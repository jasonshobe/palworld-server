import { createContext, useContext, useEffect, useState } from "react"
import { getAuthStatus, login as apiLogin, logout as apiLogout } from "@/api/auth"

interface AuthContextValue {
  required: boolean
  authenticated: boolean
  login: (password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [required, setRequired] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    getAuthStatus().then((s) => {
      setRequired(s.required)
      if (!s.required) setAuthenticated(true)
      else setAuthenticated(sessionStorage.getItem("authed") === "1")
    })

    const handler = () => { setAuthenticated(false); sessionStorage.removeItem("authed") }
    window.addEventListener("unauthorized", handler)
    return () => window.removeEventListener("unauthorized", handler)
  }, [])

  async function login(password: string) {
    await apiLogin(password)
    setAuthenticated(true)
    sessionStorage.setItem("authed", "1")
  }

  async function logout() {
    await apiLogout()
    setAuthenticated(false)
    sessionStorage.removeItem("authed")
  }

  return (
    <AuthContext.Provider value={{ required, authenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuthContext must be inside AuthProvider")
  return ctx
}
