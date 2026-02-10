import { useState, useEffect, useCallback, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import {
  ShoppingCart, Users, Settings, ChevronDown,
  Pin, Bell, Mail, Sun, Moon, Globe, BookOpen, TrendingUp,
  LogOut, Check,
} from "lucide-react"

// Animated icons
import { HomeIcon } from "@/components/icons/home"
import { BoxesIcon } from "@/components/icons/boxes"
import { ShipIcon } from "@/components/icons/ship"
import { BoxIcon } from "@/components/icons/box"
import { MailCheckIcon } from "@/components/icons/mail-check"
import { TruckIcon } from "@/components/icons/truck"
import { PoundSterlingIcon } from "@/components/icons/pound-sterling"
import { ClipboardCheckIcon } from "@/components/icons/clipboard-check"
import { HandCoinsIcon } from "@/components/icons/hand-coins"
import { UsersIcon } from "@/components/icons/users"
import { GalleryThumbnailsIcon } from "@/components/icons/gallery-thumbnails"
import { MessageCircleMoreIcon } from "@/components/icons/message-circle-more"
import { ChartLineIcon } from "@/components/ui/chart-line"
import { UserIcon } from "@/components/ui/user"

// Sidebar sub-components
import { SidebarBadge } from "./sidebar-badge"
import { SidebarKbd } from "./sidebar-kbd"
import { SearchTrigger, CommandPalette } from "./sidebar-search"
// Intent UI sidebar primitives
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar"
import { authService } from "@/services/authService"
import type { Agent, Notification } from "@/types/domain"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: Agent | null
  unreadNotifications?: number
  unreadMessages?: number
  notifications?: Notification[]
  onMarkRead?: (id: number) => void
  onMarkAllRead?: () => void
}

// ---------- Nav item definition ----------

interface NavItemDef {
  id: string
  label: string
  icon: React.ReactNode
  path: string
  badge?: number
  badgeVariant?: "accent" | "warning" | "default"
}

// ---------- Collapsed tooltip ----------

function CollapsedTooltip({ children, label }: { children: React.ReactNode; label: string }) {
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
          <div className="bg-zinc-800 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-xl whitespace-nowrap">
            {label}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- NavItem component ----------

function NavItem({
  item,
  isActive,
  isCollapsed,
  indent = false,
  pinned = false,
  onPin,
}: {
  item: NavItemDef
  isActive: boolean
  isCollapsed: boolean
  indent?: boolean
  pinned?: boolean
  onPin?: () => void
}) {
  const navigate = useNavigate()
  const prefersReduced = useReducedMotion()

  const button = (
    <div className="relative">
      {isActive && !isCollapsed && (
        <motion.div
          layoutId="sidebar-active-indicator"
          className="absolute left-0 top-0 bottom-0 w-0.5 bg-teal-400 rounded-full"
          transition={prefersReduced ? { duration: 0 } : { type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
      <button
        onClick={() => navigate(item.path)}
        className={`group flex items-center rounded-lg text-left text-[13px] font-medium ${
          isCollapsed
            ? "justify-center size-10 mx-auto"
            : `gap-3 w-full h-10 ${indent ? "pl-11 pr-3" : "px-3"}`
        } ${
          isActive
            ? isCollapsed
              ? "bg-teal-50 dark:bg-zinc-800 text-teal-600 dark:text-teal-400"
              : "bg-teal-50 dark:bg-zinc-800/80 text-teal-700 dark:text-white"
            : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/40"
        }`}
      >
        <span className={`flex-shrink-0 ${isActive ? "text-teal-500 dark:text-teal-400" : "text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-500 dark:group-hover:text-zinc-400"}`}>
          {item.icon}
        </span>
        {!isCollapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            className="truncate whitespace-pre"
          >
            {item.label}
          </motion.span>
        )}
        {!isCollapsed && item.badge != null && item.badge > 0 && (
          <SidebarBadge count={item.badge} variant={item.badgeVariant} />
        )}
        {!isCollapsed && onPin && (
          <span
            onClick={(e) => { e.stopPropagation(); onPin() }}
            className={`ml-auto opacity-0 group-hover:opacity-100 text-zinc-400 dark:text-zinc-600 hover:text-teal-500 dark:hover:text-teal-400 cursor-pointer ${
              pinned ? "!opacity-100 text-teal-500/60 dark:text-teal-400/60 hover:text-teal-500 dark:hover:text-teal-400" : ""
            }`}
            role="button"
            aria-label={pinned ? "Unpin" : "Pin"}
          >
            <Pin size={14} />
          </span>
        )}
      </button>
    </div>
  )

  if (isCollapsed) {
    return <CollapsedTooltip label={item.label}>{button}</CollapsedTooltip>
  }

  return button
}

// ---------- Accordion Section ----------

function AccordionSection({
  icon,
  title,
  isOpen,
  onToggle,
  children,
}: {
  icon: React.ReactNode
  title: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const prefersReduced = useReducedMotion()
  return (
    <div>
      <button
        onClick={onToggle}
        className="group flex items-center gap-3 w-full rounded-lg px-3 h-10 text-left text-[13px] font-semibold text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/40"
      >
        <span className="flex-shrink-0 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-500 dark:group-hover:text-zinc-400">{icon}</span>
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="truncate whitespace-pre"
        >
          {title}
        </motion.span>
        <span className={`ml-auto text-zinc-400 dark:text-zinc-600 transition-transform ${isOpen ? "" : "-rotate-90"}`}>
          <ChevronDown size={14} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={prefersReduced ? { duration: 0 } : { duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-0.5 space-y-0.5 pb-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------- Section Label ----------

function SectionLabel({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-6 pb-2">
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-600"
      >
        {label}
      </motion.span>
      {action}
    </div>
  )
}

// ---------- All nav items ----------

const ALL_NAV_ITEMS: Record<string, NavItemDef> = {
  dashboard: { id: "dashboard", label: "Dashboard", icon: <HomeIcon size={18} />, path: "/dashboard" },
  // Sales
  customers: { id: "customers", label: "Customers", icon: <Users size={18} />, path: "/customers" },
  orders: { id: "orders", label: "Orders", icon: <ShoppingCart size={18} />, path: "/orders" },
  enquiries: { id: "enquiries", label: "Enquiries", icon: <MessageCircleMoreIcon size={18} />, path: "/enquiries" },
  invoices: { id: "invoices", label: "Invoices", icon: <PoundSterlingIcon size={18} />, path: "/finance/invoices" },
  // Inventory
  products: { id: "products", label: "Products", icon: <BoxesIcon size={18} />, path: "/inventory/products" },
  purchaseOrders: { id: "purchaseOrders", label: "Purchase Orders", icon: <HandCoinsIcon size={18} />, path: "/finance/purchase-orders" },
  imageBank: { id: "imageBank", label: "Image Bank", icon: <GalleryThumbnailsIcon size={18} />, path: "/image-management" },
  // Website
  websiteProducts: { id: "websiteProducts", label: "Products", icon: <BoxesIcon size={18} />, path: "/website/products" },
  journal: { id: "journal", label: "Journal", icon: <BookOpen size={18} />, path: "/website/journal" },
  intelligence: { id: "intelligence", label: "Intelligence", icon: <TrendingUp size={18} />, path: "/website/intelligence" },
  // Warehouse
  pipeline: { id: "pipeline", label: "Pipeline", icon: <BoxIcon size={18} />, path: "/shipping/warehouse" },
  couriers: { id: "couriers", label: "Couriers", icon: <MailCheckIcon size={18} />, path: "/shipping/couriers" },
  deliveries: { id: "deliveries", label: "Deliveries", icon: <TruckIcon size={18} />, path: "/shipping/deliveries" },
  // Management
  agents: { id: "agents", label: "Agents", icon: <ClipboardCheckIcon size={18} />, path: "/agents" },
  reportSuite: { id: "reportSuite", label: "Report Suite", icon: <ChartLineIcon size={18} />, path: "/reports" },
  suppliers: { id: "suppliers", label: "Suppliers", icon: <UsersIcon size={18} />, path: "/suppliers" },
  users: { id: "users", label: "Users", icon: <UserIcon size={18} />, path: "/settings/users" },
}

// Collapsed-mode items: just the top-level section icons
const COLLAPSED_ITEMS: { id: string; item: NavItemDef; divider?: boolean; adminOnly?: boolean }[] = [
  { id: "dashboard", item: ALL_NAV_ITEMS.dashboard },
  { id: "d0", item: ALL_NAV_ITEMS.dashboard, divider: true },
  // Sales
  { id: "customers", item: ALL_NAV_ITEMS.customers },
  { id: "orders", item: ALL_NAV_ITEMS.orders },
  { id: "enquiries", item: ALL_NAV_ITEMS.enquiries },
  { id: "invoices", item: ALL_NAV_ITEMS.invoices, adminOnly: true },
  { id: "d1", item: ALL_NAV_ITEMS.dashboard, divider: true },
  // Inventory
  { id: "products", item: ALL_NAV_ITEMS.products, adminOnly: true },
  { id: "purchaseOrders", item: ALL_NAV_ITEMS.purchaseOrders, adminOnly: true },
  { id: "imageBank", item: ALL_NAV_ITEMS.imageBank, adminOnly: true },
  { id: "d1b", item: ALL_NAV_ITEMS.dashboard, divider: true },
  // Website
  { id: "websiteProducts", item: ALL_NAV_ITEMS.websiteProducts, adminOnly: true },
  { id: "journal", item: ALL_NAV_ITEMS.journal, adminOnly: true },
  { id: "intelligence", item: ALL_NAV_ITEMS.intelligence, adminOnly: true },
  { id: "d2", item: ALL_NAV_ITEMS.dashboard, divider: true },
  // Warehouse
  { id: "pipeline", item: ALL_NAV_ITEMS.pipeline, adminOnly: true },
  { id: "couriers", item: ALL_NAV_ITEMS.couriers, adminOnly: true },
  { id: "deliveries", item: ALL_NAV_ITEMS.deliveries, adminOnly: true },
  { id: "d3", item: ALL_NAV_ITEMS.dashboard, divider: true },
  // Management
  { id: "agents", item: ALL_NAV_ITEMS.agents, adminOnly: true },
  { id: "suppliers", item: ALL_NAV_ITEMS.suppliers, adminOnly: true },
  { id: "users", item: ALL_NAV_ITEMS.users, adminOnly: true },
]

// ---------- Main Sidebar ----------

export default function AppSidebar({ user, unreadNotifications = 0, unreadMessages = 0, notifications = [], onMarkRead, onMarkAllRead, ...props }: AppSidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { state, toggleSidebar } = useSidebar()
  const isCollapsed = state === "collapsed"

  const [commandOpen, setCommandOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("splitfin_pinned")
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  // Accordion: track which section is open
  const [openSection, setOpenSection] = useState<string | null>(() => {
    const p = location.pathname
    if (p.startsWith("/customers") || p.startsWith("/orders") || p.startsWith("/enquiries") || p.startsWith("/finance/invoices")) return "sales"
    if (p.startsWith("/inventory") || p.startsWith("/finance/purchase-orders") || p.startsWith("/image-management")) return "inventory"
    if (p.startsWith("/website")) return "website"
    if (p.startsWith("/shipping")) return "warehouse"
    if (p.startsWith("/agents") || p.startsWith("/reports") || p.startsWith("/suppliers") || p.startsWith("/settings/users")) return "management"
    return null
  })

  // Persist pinned items
  useEffect(() => {
    localStorage.setItem("splitfin_pinned", JSON.stringify(pinnedIds))
  }, [pinnedIds])

  // Cmd+K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])
  }, [])

  const isPathActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/")

  const handleLogout = async () => {
    try {
      await authService.logout()
      navigate("/login")
    } catch (error) {
      console.error("Logout failed:", error)
    }
  }

  // Dark mode state
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark')
    }
    return true
  })

  const handleThemeToggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev
      if (next) {
        document.documentElement.classList.add('dark')
        localStorage.setItem('theme', 'dark')
      } else {
        document.documentElement.classList.remove('dark')
        localStorage.setItem('theme', 'light')
      }
      return next
    })
  }, [])

  // Reduced motion preference
  const prefersReduced = useReducedMotion()

  // Notification accordion state
  const [notificationsExpanded, setNotificationsExpanded] = useState(false)
  const hasUnread = unreadNotifications > 0 || unreadMessages > 0

  // Close profile panel when sidebar collapses
  useEffect(() => {
    if (isCollapsed) {
      setProfileOpen(false)
      setNotificationsExpanded(false)
    }
  }, [isCollapsed])

  // Navigate to relevant page on notification click
  const handleNotificationClick = (notification: Notification) => {
    onMarkRead?.(notification.id)
    const data = notification.data as Record<string, string | number> | null
    if (notification.type === 'order_placed' && data?.order_id) {
      navigate(`/orders/${data.order_id}`)
    } else if (notification.type === 'customer_created' && data?.customer_id) {
      navigate(`/customers/${data.customer_id}`)
    } else if (notification.type === 'lead_captured') {
      navigate('/enquiries')
    }
    setProfileOpen(false)
    setNotificationsExpanded(false)
  }

  const handleMarkAllRead = () => {
    onMarkAllRead?.()
  }

  const isAdmin = user?.is_admin ?? false
  const userName = user?.name || user?.id || "User"
  const userRole = user?.is_admin ? "Admin" : "Sales Agent"

  const toggleSection = (id: string) => setOpenSection((prev) => (prev === id ? null : id))

  return (
    <>
      <Sidebar {...props}>
        <SidebarHeader className={`pt-5 pb-2 space-y-3 ${isCollapsed ? "px-2 items-center" : "px-4"}`}>
          {/* Profile Badge */}
          {isCollapsed ? (
            <CollapsedTooltip label={userName}>
              <button
                onClick={() => { toggleSidebar(); setTimeout(() => setProfileOpen(true), 250) }}
                className="relative flex items-center justify-center mx-auto"
              >
                <div className="size-9 rounded-full bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-600 p-0.5">
                  <div className="size-full rounded-full bg-white dark:bg-zinc-900 flex items-center justify-center text-[13px] font-semibold text-teal-700 dark:text-white">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                </div>
                {hasUnread && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 rounded-full bg-teal-500 border-2 border-white dark:border-zinc-900" />
                )}
              </button>
            </CollapsedTooltip>
          ) : (
            <>
              <button
                onClick={() => setProfileOpen(prev => !prev)}
                className={`flex items-center gap-3 w-full p-3 rounded-xl border transition-all duration-200 ${
                  profileOpen
                    ? "bg-zinc-100 dark:bg-zinc-900/80 border-zinc-300 dark:border-zinc-700"
                    : "bg-zinc-100 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800/60 hover:border-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                <div className="relative shrink-0">
                  <div className="size-9 rounded-full bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-600 p-0.5">
                    <div className="size-full rounded-full bg-white dark:bg-zinc-900 flex items-center justify-center text-[13px] font-semibold text-teal-700 dark:text-white">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                  </div>
                  {hasUnread && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 rounded-full bg-teal-500 border-2 border-white dark:border-zinc-900" />
                  )}
                </div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="text-left flex-1 min-w-0"
                >
                  <div className="text-[13px] font-medium text-zinc-800 dark:text-zinc-100 tracking-tight leading-tight truncate">
                    {userName}
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500 tracking-tight leading-tight truncate">
                    {userRole} &middot; SplitFin
                  </div>
                </motion.div>
                <ChevronDown size={14} className={`shrink-0 text-zinc-400 dark:text-zinc-600 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Profile Expand Panel */}
              <AnimatePresence initial={false}>
                {profileOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={prefersReduced ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="pb-1 space-y-0.5">
                      {/* Messages */}
                      <button
                        onClick={() => { navigate('/messaging'); setProfileOpen(false) }}
                        className="flex items-center gap-3 w-full px-3 h-9 rounded-lg text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/40 transition-colors"
                      >
                        <Mail size={16} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
                        <span className="flex-1 text-left">Messages</span>
                        {unreadMessages > 0 && (
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-teal-500 px-1.5 text-[10px] font-medium text-white">
                            {unreadMessages > 99 ? '99+' : unreadMessages}
                          </span>
                        )}
                      </button>

                      {/* Notifications */}
                      <div>
                        <button
                          onClick={() => setNotificationsExpanded(prev => !prev)}
                          className="flex items-center gap-3 w-full px-3 h-9 rounded-lg text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          <Bell size={16} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
                          <span className="flex-1 text-left">Notifications</span>
                          {unreadNotifications > 0 && (
                            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-medium text-white">
                              {unreadNotifications > 99 ? '99+' : unreadNotifications}
                            </span>
                          )}
                          <ChevronDown size={14} className={`shrink-0 text-zinc-400 dark:text-zinc-600 transition-transform duration-200 ${notificationsExpanded ? '' : '-rotate-90'}`} />
                        </button>

                        <AnimatePresence initial={false}>
                          {notificationsExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={prefersReduced ? { duration: 0 } : { duration: 0.15, ease: "easeOut" }}
                              className="overflow-hidden"
                            >
                              <div className="ml-7 mr-1 py-1 space-y-0.5">
                                {notifications.length > 0 ? (
                                  <>
                                    {notifications.slice(0, 5).map(n => (
                                      <button
                                        key={n.id}
                                        onClick={() => handleNotificationClick(n)}
                                        className={`flex flex-col w-full px-2.5 py-2 rounded-md text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/40 transition-colors ${!n.is_read ? 'bg-teal-500/5 dark:bg-teal-900/10' : ''}`}
                                      >
                                        <span className={`text-[12px] font-medium truncate ${!n.is_read ? 'text-zinc-800 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'}`}>
                                          {n.title}
                                        </span>
                                        <span className="text-[11px] text-zinc-400 dark:text-zinc-600 truncate">
                                          {n.body}
                                        </span>
                                      </button>
                                    ))}
                                    {unreadNotifications > 0 && (
                                      <button
                                        onClick={handleMarkAllRead}
                                        className="flex items-center gap-1.5 w-full px-2.5 py-1.5 rounded-md text-[11px] font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/10 transition-colors"
                                      >
                                        <Check size={12} />
                                        Mark all as read
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <div className="px-2.5 py-2 text-[12px] text-zinc-400 dark:text-zinc-600">
                                    No notifications
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Divider */}
                      <div className="mx-3 my-1 border-t border-zinc-200 dark:border-zinc-800/60" />

                      {/* Light / Dark Mode */}
                      <button
                        onClick={handleThemeToggle}
                        className="flex items-center gap-3 w-full px-3 h-9 rounded-lg text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/40 transition-colors"
                      >
                        {isDark ? <Sun size={16} className="shrink-0 text-zinc-400 dark:text-zinc-500" /> : <Moon size={16} className="shrink-0 text-zinc-400 dark:text-zinc-500" />}
                        <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
                      </button>

                      {/* Settings */}
                      <button
                        onClick={() => { navigate('/settings'); setProfileOpen(false) }}
                        className="flex items-center gap-3 w-full px-3 h-9 rounded-lg text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/40 transition-colors"
                      >
                        <Settings size={16} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
                        <span>Settings</span>
                      </button>

                      {/* Divider */}
                      <div className="mx-3 my-1 border-t border-zinc-200 dark:border-zinc-800/60" />

                      {/* Sign Out */}
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-3 h-9 rounded-lg text-[13px] text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <LogOut size={16} className="shrink-0" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {/* Search trigger - expanded only */}
          {!isCollapsed && <SearchTrigger onClick={() => setCommandOpen(true)} />}
        </SidebarHeader>

        <SidebarContent>
          <nav className={`flex-1 overflow-y-auto pb-3 ${isCollapsed ? "px-1 pt-2 space-y-1" : "px-3"}`}>
            {isCollapsed ? (
              /* ---- Collapsed: icon-only nav ---- */
              <>
                {COLLAPSED_ITEMS.map((entry) => {
                  if (entry.adminOnly && !isAdmin) return null
                  if (entry.divider) return <div key={entry.id} className="w-6 mx-auto my-2 border-t border-zinc-200 dark:border-zinc-800/60" />
                  return (
                    <NavItem
                      key={entry.id}
                      item={entry.item}
                      isActive={isPathActive(entry.item.path)}
                      isCollapsed
                    />
                  )
                })}
              </>
            ) : (
              /* ---- Expanded: full nav ---- */
              <>
                {/* Dashboard */}
                <div className="relative flex items-center">
                  <div className="flex-1">
                    <NavItem item={ALL_NAV_ITEMS.dashboard} isActive={isPathActive("/dashboard")} isCollapsed={false} />
                  </div>
                  <SidebarKbd>&#8984;D</SidebarKbd>
                </div>

                {/* Divider */}
                <div className="mx-0 my-4 border-t border-zinc-200 dark:border-zinc-800/60" />

                {/* Pinned Favourites */}
                {pinnedIds.length > 0 && (
                  <>
                    <SectionLabel
                      label="Pinned"
                      action={<span className="text-zinc-400 dark:text-zinc-600 text-[10px] tabular-nums">{pinnedIds.length}</span>}
                    />
                    <div className="space-y-0.5">
                      {pinnedIds.map((id) => {
                        const item = ALL_NAV_ITEMS[id]
                        if (!item) return null
                        return (
                          <NavItem
                            key={id}
                            item={item}
                            isActive={isPathActive(item.path)}
                            isCollapsed={false}
                            pinned
                            onPin={() => togglePin(id)}
                          />
                        )
                      })}
                    </div>
                    {/* Divider after pinned */}
                    <div className="mx-0 my-4 border-t border-zinc-200 dark:border-zinc-800/60" />
                  </>
                )}

                {/* Accordion sections */}
                <div className="space-y-1">
                  {/* Sales */}
                  <AccordionSection
                    icon={<ShoppingCart size={18} />}
                    title="Sales"
                    isOpen={openSection === "sales"}
                    onToggle={() => toggleSection("sales")}
                  >
                    <NavItem indent item={ALL_NAV_ITEMS.customers} isActive={isPathActive("/customers")} isCollapsed={false} onPin={() => togglePin("customers")} pinned={pinnedIds.includes("customers")} />
                    <NavItem indent item={ALL_NAV_ITEMS.orders} isActive={isPathActive("/orders")} isCollapsed={false} onPin={() => togglePin("orders")} pinned={pinnedIds.includes("orders")} />
                    <NavItem indent item={ALL_NAV_ITEMS.enquiries} isActive={isPathActive("/enquiries")} isCollapsed={false} onPin={() => togglePin("enquiries")} pinned={pinnedIds.includes("enquiries")} />
                    <NavItem indent item={ALL_NAV_ITEMS.invoices} isActive={isPathActive("/finance/invoices")} isCollapsed={false} onPin={() => togglePin("invoices")} pinned={pinnedIds.includes("invoices")} />
                  </AccordionSection>

                  {/* Inventory - Admin only */}
                  {isAdmin && (
                    <AccordionSection
                      icon={<BoxesIcon size={18} />}
                      title="Inventory"
                      isOpen={openSection === "inventory"}
                      onToggle={() => toggleSection("inventory")}
                    >
                      <NavItem indent item={ALL_NAV_ITEMS.products} isActive={isPathActive("/inventory/products")} isCollapsed={false} onPin={() => togglePin("products")} pinned={pinnedIds.includes("products")} />
                      <NavItem indent item={ALL_NAV_ITEMS.purchaseOrders} isActive={isPathActive("/finance/purchase-orders")} isCollapsed={false} onPin={() => togglePin("purchaseOrders")} pinned={pinnedIds.includes("purchaseOrders")} />
                      <NavItem indent item={ALL_NAV_ITEMS.imageBank} isActive={isPathActive("/image-management")} isCollapsed={false} onPin={() => togglePin("imageBank")} pinned={pinnedIds.includes("imageBank")} />
                    </AccordionSection>
                  )}

                  {/* Website - Admin only */}
                  {isAdmin && (
                    <AccordionSection
                      icon={<Globe size={18} />}
                      title="Website"
                      isOpen={openSection === "website"}
                      onToggle={() => toggleSection("website")}
                    >
                      <NavItem indent item={ALL_NAV_ITEMS.websiteProducts} isActive={isPathActive("/website/products")} isCollapsed={false} onPin={() => togglePin("websiteProducts")} pinned={pinnedIds.includes("websiteProducts")} />
                      <NavItem indent item={ALL_NAV_ITEMS.journal} isActive={isPathActive("/website/journal")} isCollapsed={false} onPin={() => togglePin("journal")} pinned={pinnedIds.includes("journal")} />
                      <NavItem indent item={ALL_NAV_ITEMS.intelligence} isActive={isPathActive("/website/intelligence")} isCollapsed={false} onPin={() => togglePin("intelligence")} pinned={pinnedIds.includes("intelligence")} />
                    </AccordionSection>
                  )}

                  {/* Warehouse - Admin only */}
                  {isAdmin && (
                    <AccordionSection
                      icon={<ShipIcon size={18} />}
                      title="Warehouse"
                      isOpen={openSection === "warehouse"}
                      onToggle={() => toggleSection("warehouse")}
                    >
                      <NavItem indent item={ALL_NAV_ITEMS.pipeline} isActive={isPathActive("/shipping/warehouse")} isCollapsed={false} onPin={() => togglePin("pipeline")} pinned={pinnedIds.includes("pipeline")} />
                      <NavItem indent item={ALL_NAV_ITEMS.couriers} isActive={isPathActive("/shipping/couriers")} isCollapsed={false} onPin={() => togglePin("couriers")} pinned={pinnedIds.includes("couriers")} />
                      <NavItem indent item={ALL_NAV_ITEMS.deliveries} isActive={isPathActive("/shipping/deliveries")} isCollapsed={false} onPin={() => togglePin("deliveries")} pinned={pinnedIds.includes("deliveries")} />
                    </AccordionSection>
                  )}

                  {/* Management - Admin only */}
                  {isAdmin && (
                    <AccordionSection
                      icon={<ClipboardCheckIcon size={18} />}
                      title="Management"
                      isOpen={openSection === "management"}
                      onToggle={() => toggleSection("management")}
                    >
                      <NavItem indent item={ALL_NAV_ITEMS.agents} isActive={isPathActive("/agents")} isCollapsed={false} onPin={() => togglePin("agents")} pinned={pinnedIds.includes("agents")} />
                      <NavItem indent item={ALL_NAV_ITEMS.reportSuite} isActive={isPathActive("/reports")} isCollapsed={false} onPin={() => togglePin("reportSuite")} pinned={pinnedIds.includes("reportSuite")} />
                      <NavItem indent item={ALL_NAV_ITEMS.suppliers} isActive={isPathActive("/suppliers")} isCollapsed={false} onPin={() => togglePin("suppliers")} pinned={pinnedIds.includes("suppliers")} />
                      <NavItem indent item={ALL_NAV_ITEMS.users} isActive={isPathActive("/settings/users")} isCollapsed={false} onPin={() => togglePin("users")} pinned={pinnedIds.includes("users")} />
                    </AccordionSection>
                  )}
                </div>
              </>
            )}
          </nav>
        </SidebarContent>

        {/* Footer: Centered Logo */}
        <SidebarFooter className={isCollapsed ? "p-2" : "px-4 py-3"}>
          <div className={`flex justify-center ${!isCollapsed ? 'border-t border-zinc-200 dark:border-zinc-800/60 pt-3' : ''}`}>
            {isCollapsed ? (
              <img src="/logos/splitfin-white.png" alt="Splitfin" className="h-6 w-6 shrink-0 opacity-40" />
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <img src="/logos/splitfinrow.png" alt="Splitfin" className="h-5 w-auto shrink-0 opacity-30 hidden dark:block" />
                <img src="/logos/splitfinrow.png" alt="Splitfin" className="h-5 w-auto shrink-0 opacity-30 dark:hidden brightness-0" />
              </motion.div>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Command Palette overlay */}
      <CommandPalette isOpen={commandOpen} onClose={() => setCommandOpen(false)} />
    </>
  )
}
