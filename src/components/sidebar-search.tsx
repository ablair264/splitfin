import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Search } from "lucide-react"
import { SidebarKbd } from "./sidebar-kbd"
import { HomeIcon } from "@/components/icons/home"
import { BoxesIcon } from "@/components/icons/boxes"
import { ShipIcon } from "@/components/icons/ship"
import { TruckIcon } from "@/components/icons/truck"
import { PoundSterlingIcon } from "@/components/icons/pound-sterling"
import { UsersIcon } from "@/components/icons/users"
import { GalleryThumbnailsIcon } from "@/components/icons/gallery-thumbnails"
import { MessageCircleMoreIcon } from "@/components/icons/message-circle-more"
import {
  ShoppingCart, Users, MapPin, MessageSquare, Settings, Bell,
  FileText, ClipboardCheck, Warehouse, Send, UserPlus, Plus,
} from "lucide-react"

interface CommandItem {
  section: string
  label: string
  icon: React.ReactNode
  path?: string
}

const COMMAND_ITEMS: CommandItem[] = [
  { section: "Navigation", label: "Dashboard", icon: <HomeIcon size={16} />, path: "/dashboard" },
  { section: "Navigation", label: "Orders", icon: <ShoppingCart size={16} />, path: "/orders" },
  { section: "Navigation", label: "Customers", icon: <Users size={16} />, path: "/customers" },
  { section: "Navigation", label: "Customer Map", icon: <MapPin size={16} />, path: "/customers/map" },
  { section: "Navigation", label: "Enquiries", icon: <MessageSquare size={16} />, path: "/enquiries" },
  { section: "Navigation", label: "Inventory Management", icon: <BoxesIcon size={16} />, path: "/inventory/products" },
  { section: "Navigation", label: "Warehouse", icon: <Warehouse size={16} />, path: "/shipping/warehouse" },
  { section: "Navigation", label: "Couriers", icon: <Send size={16} />, path: "/shipping/couriers" },
  { section: "Navigation", label: "Deliveries", icon: <TruckIcon size={16} />, path: "/shipping/deliveries" },
  { section: "Navigation", label: "Invoices", icon: <FileText size={16} />, path: "/finance/invoices" },
  { section: "Navigation", label: "Purchase Orders", icon: <ClipboardCheck size={16} />, path: "/finance/purchase-orders" },
  { section: "Navigation", label: "Supplier Management", icon: <UsersIcon size={16} />, path: "/suppliers" },
  { section: "Navigation", label: "Image Management", icon: <GalleryThumbnailsIcon size={16} />, path: "/image-management" },
  { section: "Navigation", label: "Team Messages", icon: <MessageCircleMoreIcon size={16} />, path: "/messaging" },
  { section: "Quick Actions", label: "Create Invoice", icon: <Plus size={16} />, path: "/finance/invoices" },
  { section: "Quick Actions", label: "Add New Supplier", icon: <Plus size={16} />, path: "/suppliers/new" },
  { section: "Settings", label: "Settings", icon: <Settings size={16} />, path: "/settings" },
  { section: "Settings", label: "Notifications", icon: <Bell size={16} />, path: "/settings" },
]

export function SearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full rounded-lg px-3 h-10 text-[13px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 border border-zinc-800/60 bg-zinc-900/40"
    >
      <Search size={16} />
      <span>Search...</span>
      <SidebarKbd>&#8984;K</SidebarKbd>
    </button>
  )
}

export function CommandPalette({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const navigate = useNavigate()

  useEffect(() => {
    if (isOpen) {
      setQuery("")
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onClose()
      }
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    },
    [isOpen, onClose]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  if (!isOpen) return null

  const filtered = query
    ? COMMAND_ITEMS.filter((x) => x.label.toLowerCase().includes(query.toLowerCase()))
    : COMMAND_ITEMS

  const grouped = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    ;(acc[item.section] ??= []).push(item)
    return acc
  }, {})

  const handleSelect = (item: CommandItem) => {
    if (item.path) navigate(item.path)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-zinc-800">
          <Search size={16} className="text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, actions, settings..."
            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 outline-none"
          />
          <kbd className="text-[10px] text-zinc-500 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {Object.keys(grouped).length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">No results found</div>
          )}
          {Object.entries(grouped).map(([section, items]) => (
            <div key={section} className="mb-1">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                {section}
              </div>
              {items.map((item, i) => (
                <button
                  key={`${item.label}-${i}`}
                  className="flex items-center gap-3 w-full px-3 h-10 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  onClick={() => handleSelect(item)}
                >
                  <span className="text-zinc-500">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
