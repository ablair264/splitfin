import * as React from "react"
import { useNavigate } from "react-router-dom"
import { cn } from "@/lib/utils"
import { Settings, LogOut, Bell, MessageSquare } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ProfileDropdownProps extends React.HTMLAttributes<HTMLDivElement> {
  userName: string
  userRole: string
  onLogout: () => void
}

export default function ProfileDropdown({
  userName,
  userRole,
  onLogout,
  className,
  ...props
}: ProfileDropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const navigate = useNavigate()

  const menuItems = [
    {
      label: "Settings",
      path: "/settings",
      icon: <Settings className="w-4 h-4" />,
    },
    {
      label: "Notifications",
      path: "/settings",
      icon: <Bell className="w-4 h-4" />,
    },
    {
      label: "Messages",
      path: "/messaging",
      icon: <MessageSquare className="w-4 h-4" />,
    },
  ]

  return (
    <div className={cn("relative", className)} {...props}>
      <DropdownMenu onOpenChange={setIsOpen}>
        <div className="group relative">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-3 w-full p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60 hover:border-zinc-700 hover:bg-zinc-800/40 transition-all duration-200 focus:outline-none"
            >
              <div className="text-left flex-1 min-w-0">
                <div className="text-[13px] font-medium text-zinc-100 tracking-tight leading-tight truncate">
                  {userName}
                </div>
                <div className="text-[11px] text-zinc-500 tracking-tight leading-tight truncate">
                  {userRole} &middot; SplitFin
                </div>
              </div>
              <div className="relative shrink-0">
                <div className="size-9 rounded-full bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-600 p-0.5">
                  <div className="size-full rounded-full bg-zinc-900 flex items-center justify-center text-[13px] font-semibold text-white">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                </div>
              </div>
            </button>
          </DropdownMenuTrigger>

          {/* Bending line indicator */}
          <div
            className={cn(
              "absolute -right-3 top-1/2 -translate-y-1/2 transition-all duration-200",
              isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          >
            <svg
              width="12"
              height="24"
              viewBox="0 0 12 24"
              fill="none"
              className={cn(
                "transition-all duration-200",
                isOpen
                  ? "text-teal-400 scale-110"
                  : "text-zinc-500 group-hover:text-zinc-400"
              )}
              aria-hidden="true"
            >
              <path
                d="M2 4C6 8 6 16 2 20"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>

          <DropdownMenuContent
            align="start"
            side="top"
            sideOffset={8}
            className="w-56 p-2 bg-zinc-900/95 backdrop-blur-sm border border-zinc-800/60 rounded-xl shadow-xl shadow-zinc-950/30"
          >
            <div className="space-y-1">
              {menuItems.map((item) => (
                <DropdownMenuItem
                  key={item.label}
                  className="flex items-center gap-3 p-2.5 hover:bg-zinc-800/60 rounded-lg transition-all duration-200 cursor-pointer group border border-transparent hover:border-zinc-700/50 focus:bg-zinc-800/60 focus:text-zinc-100"
                  onSelect={() => navigate(item.path)}
                >
                  <span className="text-zinc-500 group-hover:text-zinc-400 transition-colors">
                    {item.icon}
                  </span>
                  <span className="text-[13px] font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors">
                    {item.label}
                  </span>
                </DropdownMenuItem>
              ))}
            </div>

            <DropdownMenuSeparator className="my-2 bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

            <DropdownMenuItem
              className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer group bg-red-500/10 hover:bg-red-500/20 border border-transparent hover:border-red-500/30 transition-all duration-200 focus:bg-red-500/20 focus:text-red-400"
              onSelect={onLogout}
            >
              <LogOut className="w-4 h-4 text-red-400/70 group-hover:text-red-400" />
              <span className="text-[13px] font-medium text-red-400/70 group-hover:text-red-400">
                Sign Out
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </div>
      </DropdownMenu>
    </div>
  )
}
