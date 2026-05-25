import { Outlet } from "react-router-dom"
import NavBar from "./NavBar"
import { useAuth } from "@/hooks/useAuth"
import { useServerStatus } from "@/hooks/useServerStatus"

export default function Layout() {
  const { required, logout } = useAuth()
  const { data } = useServerStatus()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NavBar
        serverState={data?.state ?? "stopped"}
        authRequired={required}
        onLogout={logout}
      />
      <main className="container mx-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
