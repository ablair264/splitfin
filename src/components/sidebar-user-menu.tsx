import { Settings, LogOut, Bell } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { SidebarKbd } from "./sidebar-kbd"

interface UserMenuProps {
  isOpen: boolean
  userName: string
  userRole: string
  onLogout: () => void
  onClose: () => void
}

export function UserMenu({ isOpen, userName, userRole, onLogout, onClose }: UserMenuProps) {
  if (!isOpen) return null
  const navigate = useNavigate()

  return (
    <div className="absolute bottom-[72px] left-3 right-3 bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl overflow-hidden z-40">
      <div className="px-4 py-4 border-b border-zinc-800">
        <div className="text-sm font-semibold text-white">{userName}</div>
        <div className="text-xs text-zinc-500 mt-1">{userRole} &middot; SplitFin Ltd</div>
      </div>
      <div className="p-2 space-y-0.5">
        <button
          onClick={() => { navigate("/settings"); onClose() }}
          className="flex items-center gap-3 w-full px-3 h-10 rounded-lg text-[13px] text-zinc-400 hover:text-white hover:bg-zinc-800/60"
        >
          <Settings size={16} />
          <span>Settings</span>
          <SidebarKbd>&#8984;S</SidebarKbd>
        </button>
        <button
          onClick={() => { navigate("/settings"); onClose() }}
          className="flex items-center gap-3 w-full px-3 h-10 rounded-lg text-[13px] text-zinc-400 hover:text-white hover:bg-zinc-800/60"
        >
          <Bell size={16} />
          <span>Notifications</span>
        </button>
      </div>
      <div className="border-t border-zinc-800 p-2">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-3 h-10 rounded-lg text-[13px] text-red-400/70 hover:text-red-400 hover:bg-zinc-800/60"
        >
          <LogOut size={16} />
          <span>Log out</span>
        </button>
      </div>
    </div>
  )
}
