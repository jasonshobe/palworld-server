import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"
import type { ServerState } from "@/types"

interface NavBarProps {
  serverState: ServerState
  onLogout?: () => void
  authRequired: boolean
}

const EDITING_BLOCKED: ServerState[] = ["starting", "running", "stopping", "updating"]

export default function NavBar({ serverState, onLogout, authRequired }: NavBarProps) {
  const editingBlocked = EDITING_BLOCKED.includes(serverState)

  return (
    <nav className="border-b bg-slate-900 text-slate-100">
      <div className="container mx-auto flex items-center gap-6 h-14 px-4">
        <span className="font-semibold text-sm">Palworld Controller</span>
        <div className="flex gap-2">
          <NavLink
            to="/server"
            className={({ isActive }) =>
              cn("px-3 py-1.5 rounded text-sm transition-colors",
                isActive ? "bg-slate-700" : "hover:bg-slate-800")
            }
          >
            Server
          </NavLink>
          {(["config", "saves"] as const).map((tab) => (
            <NavLink
              key={tab}
              to={`/${tab}`}
              className={({ isActive }) =>
                cn("px-3 py-1.5 rounded text-sm transition-colors capitalize",
                  editingBlocked ? "opacity-40 pointer-events-none" : "hover:bg-slate-800",
                  isActive ? "bg-slate-700" : "")
              }
              title={editingBlocked ? "Stop the server to edit" : undefined}
            >
              {tab === "config" ? "Configuration" : "Saves"}
            </NavLink>
          ))}
        </div>
        {authRequired && (
          <button
            onClick={onLogout}
            className="ml-auto text-xs text-slate-400 hover:text-slate-200"
          >
            Sign out
          </button>
        )}
      </div>
    </nav>
  )
}
