import { useState, useCallback } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "motion/react"
import { Bell, Mail, Sun, Moon, Settings } from "lucide-react"
import { useSidebar } from "@/components/ui/sidebar"

interface SidebarIconRailProps {
  unreadNotifications?: number
  onNotificationsClick?: () => void
}

function RailTooltip({ children, label }: { children: React.ReactNode; label: string }) {
  const [show, setShow] = useState(false)

  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 pointer-events-none"
          >
            <div className="bg-zinc-800 border border-zinc-700/50 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
              {label}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function SidebarIconRail({ unreadNotifications = 0, onNotificationsClick }: SidebarIconRailProps) {
  const { state } = useSidebar()
  const navigate = useNavigate()
  const location = useLocation()
  const isExpanded = state === "expanded"

  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark")
    }
    return true
  })

  const handleThemeToggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev
      if (next) {
        document.documentElement.classList.add("dark")
        localStorage.setItem("theme", "dark")
      } else {
        document.documentElement.classList.remove("dark")
        localStorage.setItem("theme", "light")
      }
      return next
    })
  }, [])

  const isPathActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/")

  const iconBtn =
    "flex items-center justify-center size-9 rounded-lg transition-colors cursor-pointer"
  const iconDefault = "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60"
  const iconActive = "text-teal-400 bg-zinc-800/80"

  return (
    <AnimatePresence>
      {isExpanded && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 48, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="h-screen shrink-0 overflow-hidden"
        >
          <div className="flex flex-col h-full w-12 border-r border-zinc-800/60 bg-zinc-950/80">
            {/* Spacer pushes icons to bottom */}
            <div className="flex-1" />

            {/* Icon stack at bottom */}
            <div className="flex flex-col items-center gap-1 pb-4">
              <RailTooltip label={isDark ? "Light mode" : "Dark mode"}>
                <button
                  onClick={handleThemeToggle}
                  className={`${iconBtn} ${iconDefault}`}
                  aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {isDark ? <Sun size={18} /> : <Moon size={18} />}
                </button>
              </RailTooltip>

              <RailTooltip label="Notifications">
                <button
                  onClick={onNotificationsClick}
                  className={`${iconBtn} ${iconDefault} relative`}
                  aria-label="Notifications"
                >
                  <Bell size={18} />
                  {unreadNotifications > 0 && (
                    <span className="absolute top-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-medium text-white">
                      {unreadNotifications > 9 ? "9+" : unreadNotifications}
                    </span>
                  )}
                </button>
              </RailTooltip>

              <RailTooltip label="Messages">
                <button
                  onClick={() => navigate("/messaging")}
                  className={`${iconBtn} ${isPathActive("/messaging") ? iconActive : iconDefault}`}
                  aria-label="Messages"
                >
                  <Mail size={18} />
                </button>
              </RailTooltip>

              <RailTooltip label="Settings">
                <button
                  onClick={() => navigate("/settings")}
                  className={`${iconBtn} ${isPathActive("/settings") ? iconActive : iconDefault}`}
                  aria-label="Settings"
                >
                  <Settings size={18} />
                </button>
              </RailTooltip>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
