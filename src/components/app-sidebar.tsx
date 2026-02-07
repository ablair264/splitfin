import { useState, useEffect, useCallback, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import {
  ShoppingCart, Users, MapPin, MessageSquare, Settings, ChevronDown,
  Pin, UserPlus,
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

// Sidebar sub-components
import { SidebarBadge } from "./sidebar-badge"
import { SidebarKbd } from "./sidebar-kbd"
import { SearchTrigger, CommandPalette } from "./sidebar-search"
import ProfileDropdown from "./kokonutui/profile-dropdown"

// Intent UI sidebar primitives
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar"
import { authService } from "@/services/authService"
import type { Agent } from "@/types/domain"

// ---------- Constants ----------

const HOVER_EXPAND_DELAY = 200
const HOVER_COLLAPSE_DELAY = 400

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: Agent | null
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
          <div className="bg-zinc-800 border border-zinc-700/50 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-xl whitespace-nowrap">
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
              ? "bg-zinc-800 text-teal-400"
              : "bg-zinc-800/80 text-white"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
        }`}
      >
        <span className={`flex-shrink-0 ${isActive ? "text-teal-400" : "text-zinc-500 group-hover:text-zinc-400"}`}>
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
            className={`ml-auto opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-teal-400 cursor-pointer ${
              pinned ? "!opacity-100 text-teal-400/60 hover:text-teal-400" : ""
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
        className="group flex items-center gap-3 w-full rounded-lg px-3 h-10 text-left text-[13px] font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800/40"
      >
        <span className="flex-shrink-0 text-zinc-500 group-hover:text-zinc-400">{icon}</span>
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="truncate whitespace-pre"
        >
          {title}
        </motion.span>
        <span className={`ml-auto text-zinc-600 transition-transform ${isOpen ? "" : "-rotate-90"}`}>
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
        className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600"
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
  orders: { id: "orders", label: "Orders", icon: <ShoppingCart size={18} />, path: "/orders" },
  customers: { id: "customers", label: "View Customers", icon: <Users size={18} />, path: "/customers" },
  customerMap: { id: "customerMap", label: "Customer Map", icon: <MapPin size={18} />, path: "/customers/map" },
  enquiries: { id: "enquiries", label: "Enquiries", icon: <MessageSquare size={18} />, path: "/enquiries" },
  inventory: { id: "inventory", label: "Inventory Management", icon: <BoxesIcon size={18} />, path: "/inventory/products" },
  warehouse: { id: "warehouse", label: "Warehouse", icon: <BoxIcon size={18} />, path: "/shipping/warehouse" },
  couriers: { id: "couriers", label: "Couriers", icon: <MailCheckIcon size={18} />, path: "/shipping/couriers" },
  deliveries: { id: "deliveries", label: "Deliveries", icon: <TruckIcon size={18} />, path: "/shipping/deliveries" },
  invoices: { id: "invoices", label: "Invoices", icon: <PoundSterlingIcon size={18} />, path: "/finance/invoices" },
  purchaseOrders: { id: "purchaseOrders", label: "Purchase Orders", icon: <HandCoinsIcon size={18} />, path: "/finance/purchase-orders" },
  supplierMgmt: { id: "supplierMgmt", label: "Supplier Management", icon: <UsersIcon size={18} />, path: "/suppliers" },
  supplierAdd: { id: "supplierAdd", label: "Add New Supplier", icon: <UserPlus size={18} />, path: "/suppliers/new" },
  images: { id: "images", label: "Image Management", icon: <GalleryThumbnailsIcon size={18} />, path: "/image-management" },
  messages: { id: "messages", label: "Team Messages", icon: <MessageCircleMoreIcon size={18} />, path: "/messaging" },
  settings: { id: "settings", label: "Settings", icon: <Settings size={18} />, path: "/settings" },
}

// Collapsed-mode items: just the top-level section icons
const COLLAPSED_ITEMS: { id: string; item: NavItemDef; divider?: boolean }[] = [
  { id: "dashboard", item: ALL_NAV_ITEMS.dashboard },
  { id: "orders", item: ALL_NAV_ITEMS.orders },
  { id: "customers", item: ALL_NAV_ITEMS.customers },
  { id: "d0", item: ALL_NAV_ITEMS.customers, divider: true },
  { id: "inventory", item: ALL_NAV_ITEMS.inventory },
  { id: "shipping", item: ALL_NAV_ITEMS.warehouse },
  { id: "finance", item: ALL_NAV_ITEMS.invoices },
  { id: "suppliers", item: ALL_NAV_ITEMS.supplierMgmt },
  { id: "d1", item: ALL_NAV_ITEMS.supplierMgmt, divider: true },
  { id: "images", item: ALL_NAV_ITEMS.images },
  { id: "messages", item: ALL_NAV_ITEMS.messages },
  { id: "settings", item: ALL_NAV_ITEMS.settings },
]

// ---------- Main Sidebar ----------

export default function AppSidebar({ user, ...props }: AppSidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { state, setOpen } = useSidebar()
  const isCollapsed = state === "collapsed"

  const [commandOpen, setCommandOpen] = useState(false)
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("splitfin_pinned")
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  // Accordion: track which section is open
  const [openSection, setOpenSection] = useState<string | null>(() => {
    const p = location.pathname
    if (p.startsWith("/customers") || p.startsWith("/enquiries")) return "customers"
    if (p.startsWith("/inventory")) return "inventory"
    if (p.startsWith("/shipping")) return "shipping"
    if (p.startsWith("/finance")) return "finance"
    if (p.startsWith("/suppliers")) return "suppliers"
    return null
  })

  // Hover expand/collapse timers
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = useCallback(() => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
    expandTimer.current = setTimeout(() => {
      setOpen(true)
    }, HOVER_EXPAND_DELAY)
  }, [setOpen])

  const handleMouseLeave = useCallback(() => {
    if (expandTimer.current) {
      clearTimeout(expandTimer.current)
      expandTimer.current = null
    }
    collapseTimer.current = setTimeout(() => {
      setOpen(false)
    }, HOVER_COLLAPSE_DELAY)
  }, [setOpen])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (expandTimer.current) clearTimeout(expandTimer.current)
      if (collapseTimer.current) clearTimeout(collapseTimer.current)
    }
  }, [])

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

  const isAdmin = user?.is_admin ?? false
  const userName = user?.name || user?.id || "User"
  const userRole = user?.is_admin ? "Admin" : "Sales Agent"

  const toggleSection = (id: string) => setOpenSection((prev) => (prev === id ? null : id))

  return (
    <>
      <Sidebar
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <SidebarHeader className={`pt-5 pb-4 space-y-4 ${isCollapsed ? "px-2 items-center" : "px-4"}`}>
          {/* Logo */}
          <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-start gap-2.5"}`}>
            {isCollapsed ? (
              <img src="/logos/splitfin-white.png" alt="Splitfin" className="h-7 w-7 shrink-0" />
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <img src="/logos/splitfinrow.png" alt="Splitfin" className="h-7 w-auto shrink-0 hidden dark:block" />
                <img src="/logos/splitfinrow.png" alt="Splitfin" className="h-7 w-auto shrink-0 dark:hidden brightness-0" />
              </motion.div>
            )}
          </div>

          {/* Search trigger - expanded only */}
          {!isCollapsed && <SearchTrigger onClick={() => setCommandOpen(true)} />}
        </SidebarHeader>

        <SidebarContent>
          <nav className={`flex-1 overflow-y-auto pb-3 ${isCollapsed ? "px-1 pt-2 space-y-1" : "px-3"}`}>
            {isCollapsed ? (
              /* ---- Collapsed: icon-only nav ---- */
              <>
                {COLLAPSED_ITEMS.map((entry) => {
                  if (entry.divider) return <div key={entry.id} className="w-6 mx-auto my-2 border-t border-zinc-800/60" />
                  if (entry.id === "inventory" && !isAdmin) return null
                  if (entry.id === "shipping" && !isAdmin) return null
                  if (entry.id === "finance" && !isAdmin) return null
                  if (entry.id === "suppliers" && !isAdmin) return null
                  if (entry.id === "images" && !isAdmin) return null
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

                {/* Orders */}
                <NavItem item={ALL_NAV_ITEMS.orders} isActive={isPathActive("/orders")} isCollapsed={false} />

                {/* Pinned Favourites */}
                {pinnedIds.length > 0 && (
                  <>
                    <SectionLabel
                      label="Pinned"
                      action={<span className="text-zinc-600 text-[10px] tabular-nums">{pinnedIds.length}</span>}
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
                  </>
                )}

                {/* Divider */}
                <div className="mx-0 my-4 border-t border-zinc-800/60" />

                {/* Accordion sections */}
                <div className="space-y-1">
                  {/* Customers */}
                  <AccordionSection
                    icon={<Users size={18} />}
                    title="Customers"
                    isOpen={openSection === "customers"}
                    onToggle={() => toggleSection("customers")}
                  >
                    <NavItem indent item={ALL_NAV_ITEMS.customers} isActive={isPathActive("/customers") && !isPathActive("/customers/map")} isCollapsed={false} onPin={() => togglePin("customers")} pinned={pinnedIds.includes("customers")} />
                    <NavItem indent item={ALL_NAV_ITEMS.customerMap} isActive={isPathActive("/customers/map")} isCollapsed={false} onPin={() => togglePin("customerMap")} pinned={pinnedIds.includes("customerMap")} />
                    <NavItem indent item={ALL_NAV_ITEMS.enquiries} isActive={isPathActive("/enquiries")} isCollapsed={false} onPin={() => togglePin("enquiries")} pinned={pinnedIds.includes("enquiries")} />
                  </AccordionSection>

                  {/* Inventory - Admin only */}
                  {isAdmin && (
                    <AccordionSection
                      icon={<BoxesIcon size={18} />}
                      title="Inventory"
                      isOpen={openSection === "inventory"}
                      onToggle={() => toggleSection("inventory")}
                    >
                      <NavItem indent item={ALL_NAV_ITEMS.inventory} isActive={isPathActive("/inventory/products")} isCollapsed={false} onPin={() => togglePin("inventory")} pinned={pinnedIds.includes("inventory")} />
                    </AccordionSection>
                  )}

                  {/* Shipping - Admin only */}
                  {isAdmin && (
                    <AccordionSection
                      icon={<ShipIcon size={18} />}
                      title="Shipping"
                      isOpen={openSection === "shipping"}
                      onToggle={() => toggleSection("shipping")}
                    >
                      <NavItem indent item={ALL_NAV_ITEMS.warehouse} isActive={isPathActive("/shipping/warehouse")} isCollapsed={false} onPin={() => togglePin("warehouse")} pinned={pinnedIds.includes("warehouse")} />
                      <NavItem indent item={ALL_NAV_ITEMS.couriers} isActive={isPathActive("/shipping/couriers")} isCollapsed={false} onPin={() => togglePin("couriers")} pinned={pinnedIds.includes("couriers")} />
                      <NavItem indent item={ALL_NAV_ITEMS.deliveries} isActive={isPathActive("/shipping/deliveries")} isCollapsed={false} onPin={() => togglePin("deliveries")} pinned={pinnedIds.includes("deliveries")} />
                    </AccordionSection>
                  )}

                  {/* Finance - Admin only */}
                  {isAdmin && (
                    <AccordionSection
                      icon={<PoundSterlingIcon size={18} />}
                      title="Finance"
                      isOpen={openSection === "finance"}
                      onToggle={() => toggleSection("finance")}
                    >
                      <NavItem indent item={ALL_NAV_ITEMS.invoices} isActive={isPathActive("/finance/invoices")} isCollapsed={false} onPin={() => togglePin("invoices")} pinned={pinnedIds.includes("invoices")} />
                      <NavItem indent item={ALL_NAV_ITEMS.purchaseOrders} isActive={isPathActive("/finance/purchase-orders")} isCollapsed={false} onPin={() => togglePin("purchaseOrders")} pinned={pinnedIds.includes("purchaseOrders")} />
                    </AccordionSection>
                  )}

                  {/* Suppliers - Admin only */}
                  {isAdmin && (
                    <AccordionSection
                      icon={<UsersIcon size={18} />}
                      title="Suppliers"
                      isOpen={openSection === "suppliers"}
                      onToggle={() => toggleSection("suppliers")}
                    >
                      <NavItem indent item={ALL_NAV_ITEMS.supplierMgmt} isActive={isPathActive("/suppliers") && !isPathActive("/suppliers/new")} isCollapsed={false} onPin={() => togglePin("supplierMgmt")} pinned={pinnedIds.includes("supplierMgmt")} />
                      <NavItem indent item={ALL_NAV_ITEMS.supplierAdd} isActive={isPathActive("/suppliers/new")} isCollapsed={false} />
                    </AccordionSection>
                  )}
                </div>

                {/* Tools */}
                {isAdmin && (
                  <>
                    <SectionLabel label="Tools" />
                    <NavItem item={ALL_NAV_ITEMS.images} isActive={isPathActive("/image-management")} isCollapsed={false} />
                  </>
                )}

                {/* Communication */}
                <SectionLabel label="Communication" />
                <NavItem item={ALL_NAV_ITEMS.messages} isActive={isPathActive("/messaging")} isCollapsed={false} />

                {/* Settings */}
                <SectionLabel label="" />
                <NavItem item={ALL_NAV_ITEMS.settings} isActive={isPathActive("/settings")} isCollapsed={false} />
              </>
            )}
          </nav>
        </SidebarContent>

        {/* Footer: User */}
        <SidebarFooter>
          <div className={`relative pt-3 border-t border-zinc-800/50 ${isCollapsed ? "px-1 pb-2" : "px-1 pb-1"}`}>
            {isCollapsed ? (
              <CollapsedTooltip label={userName}>
                <div className="flex items-center justify-center">
                  <div className="size-9 rounded-full bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-600 p-0.5 cursor-pointer">
                    <div className="size-full rounded-full bg-zinc-900 flex items-center justify-center text-[13px] font-semibold text-white">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                  </div>
                </div>
              </CollapsedTooltip>
            ) : (
              <ProfileDropdown
                userName={userName}
                userRole={userRole}
                onLogout={handleLogout}
              />
            )}
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Command Palette overlay */}
      <CommandPalette isOpen={commandOpen} onClose={() => setCommandOpen(false)} />
    </>
  )
}
