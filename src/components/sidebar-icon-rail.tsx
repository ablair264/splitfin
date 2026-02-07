import { useState, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ShoppingCart, Users, PanelLeft } from "lucide-react"
import { HomeIcon } from "@/components/icons/home"
import { BoxesIcon } from "@/components/icons/boxes"
import { ShipIcon } from "@/components/icons/ship"
import { PoundSterlingIcon } from "@/components/icons/pound-sterling"
import { UsersIcon } from "@/components/icons/users"
import { GalleryThumbnailsIcon } from "@/components/icons/gallery-thumbnails"
import { MessageCircleMoreIcon } from "@/components/icons/message-circle-more"
import { SidebarBadge } from "./sidebar-badge"

interface RailTooltipProps {
  children: React.ReactNode
  label: string
  badge?: { count: number; variant: "accent" | "warning" | "default" }
}

function RailTooltip({ children, label, badge }: RailTooltipProps) {
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement>(null)

  const handleEnter = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect()
      setCoords({ top: r.top + r.height / 2, left: r.right + 12 })
    }
    setShow(true)
  }

  return (
    <div ref={ref} onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)} className="relative">
      {children}
      {show && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ top: coords.top, left: coords.left, transform: "translateY(-50%)" }}
        >
          <div className="bg-zinc-800 border border-zinc-700/50 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-xl whitespace-nowrap flex items-center gap-2.5">
            {label}
            {badge && (
              <span
                className={`text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md ${
                  badge.variant === "warning"
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-teal-500/20 text-teal-400"
                }`}
              >
                {badge.count}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface IconRailProps {
  userName: string
  onExpand: () => void
}

interface RailItem {
  id: string
  icon: React.ReactNode
  label: string
  path?: string
  badge?: { count: number; variant: "accent" | "warning" | "default" }
  hasDot?: boolean
  divider?: boolean
}

export function IconRail({ userName, onExpand }: IconRailProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const items: RailItem[] = [
    { id: "dashboard", icon: <HomeIcon size={18} />, label: "Dashboard", path: "/dashboard" },
    { id: "orders", icon: <ShoppingCart size={18} />, label: "Orders", path: "/orders" },
    { id: "customers", icon: <Users size={18} />, label: "Customers", path: "/customers" },
    { id: "d0", divider: true, icon: null, label: "" },
    { id: "inventory", icon: <BoxesIcon size={18} />, label: "Inventory", path: "/inventory/products" },
    { id: "shipping", icon: <ShipIcon size={18} />, label: "Shipping", path: "/shipping/warehouse" },
    { id: "finance", icon: <PoundSterlingIcon size={18} />, label: "Finance", path: "/finance/invoices" },
    { id: "suppliers", icon: <UsersIcon size={18} />, label: "Suppliers", path: "/suppliers" },
    { id: "d1", divider: true, icon: null, label: "" },
    { id: "images", icon: <GalleryThumbnailsIcon size={18} />, label: "Image Management", path: "/image-management" },
    { id: "messages", icon: <MessageCircleMoreIcon size={18} />, label: "Team Messages", path: "/messaging" },
  ]

  const isActive = (path?: string) => {
    if (!path) return false
    return location.pathname === path || location.pathname.startsWith(path + "/")
  }

  return (
    <div className="flex flex-col items-center w-16 bg-zinc-950 border-r border-zinc-800/50 py-5 gap-2">
      {/* Logo icon */}
      <div className="flex items-center justify-center size-10 mb-5">
        <img src="/logos/splitfin-white.png" alt="Splitfin" className="h-7 w-7" />
      </div>

      {items.map((item) => {
        if (item.divider) return <div key={item.id} className="w-6 my-2 border-t border-zinc-800/60" />
        const active = isActive(item.path)
        return (
          <RailTooltip key={item.id} label={item.label} badge={item.badge}>
            <button
              onClick={() => item.path && navigate(item.path)}
              className={`relative flex items-center justify-center size-10 rounded-lg ${
                active ? "bg-zinc-800 text-teal-400" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              }`}
              aria-label={item.label}
            >
              {item.icon}
              {item.hasDot && (
                <span className="absolute top-1 right-1 size-2 bg-teal-400 rounded-full ring-2 ring-zinc-950" />
              )}
            </button>
          </RailTooltip>
        )
      })}

      <div className="flex-1" />

      {/* User avatar */}
      <RailTooltip label={`${userName}`}>
        <div className="size-10 rounded-full bg-teal-600 flex items-center justify-center text-[13px] font-semibold text-white ring-2 ring-teal-500/20 mb-2 cursor-pointer hover:ring-teal-500/40">
          {userName.charAt(0).toUpperCase()}
        </div>
      </RailTooltip>

      {/* Expand button */}
      <RailTooltip label="Expand sidebar">
        <button
          onClick={onExpand}
          className="flex items-center justify-center size-10 rounded-lg text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50"
          aria-label="Expand sidebar"
        >
          <PanelLeft size={16} />
        </button>
      </RailTooltip>
    </div>
  )
}
