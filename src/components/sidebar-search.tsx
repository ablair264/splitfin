import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "motion/react"
import { Search, Loader2 } from "lucide-react"
import { SidebarKbd } from "./sidebar-kbd"
import { HomeIcon } from "@/components/icons/home"
import { BoxesIcon } from "@/components/icons/boxes"
import { TruckIcon } from "@/components/icons/truck"
import { UsersIcon } from "@/components/icons/users"
import { GalleryThumbnailsIcon } from "@/components/icons/gallery-thumbnails"
import { MessageCircleMoreIcon } from "@/components/icons/message-circle-more"
import {
  ShoppingCart, Users, MapPin, MessageSquare, Settings, Bell,
  FileText, ClipboardCheck, Warehouse, Send, Plus,
  Package, User,
} from "lucide-react"
import { customerService } from "@/services/customerService"
import { orderService } from "@/services/orderService"
import { productService } from "@/services/productService"
import type { Customer, Order, Product } from "@/types/domain"

interface CommandItem {
  id: string
  section: string
  label: string
  sublabel?: string
  icon: React.ReactNode
  path?: string
}

const NAV_ITEMS: CommandItem[] = [
  { id: "nav-dashboard", section: "Navigation", label: "Dashboard", icon: <HomeIcon size={16} />, path: "/dashboard" },
  { id: "nav-orders", section: "Navigation", label: "Orders", icon: <ShoppingCart size={16} />, path: "/orders" },
  { id: "nav-customers", section: "Navigation", label: "Customers", icon: <Users size={16} />, path: "/customers" },
  { id: "nav-map", section: "Navigation", label: "Customer Map", icon: <MapPin size={16} />, path: "/customers/map" },
  { id: "nav-enquiries", section: "Navigation", label: "Enquiries", icon: <MessageSquare size={16} />, path: "/enquiries" },
  { id: "nav-inventory", section: "Navigation", label: "Inventory Management", icon: <BoxesIcon size={16} />, path: "/inventory/products" },
  { id: "nav-warehouse", section: "Navigation", label: "Warehouse", icon: <Warehouse size={16} />, path: "/shipping/warehouse" },
  { id: "nav-couriers", section: "Navigation", label: "Couriers", icon: <Send size={16} />, path: "/shipping/couriers" },
  { id: "nav-deliveries", section: "Navigation", label: "Deliveries", icon: <TruckIcon size={16} />, path: "/shipping/deliveries" },
  { id: "nav-invoices", section: "Navigation", label: "Invoices", icon: <FileText size={16} />, path: "/finance/invoices" },
  { id: "nav-po", section: "Navigation", label: "Purchase Orders", icon: <ClipboardCheck size={16} />, path: "/finance/purchase-orders" },
  { id: "nav-suppliers", section: "Navigation", label: "Supplier Management", icon: <UsersIcon size={16} />, path: "/suppliers" },
  { id: "nav-images", section: "Navigation", label: "Image Management", icon: <GalleryThumbnailsIcon size={16} />, path: "/image-management" },
  { id: "nav-messages", section: "Navigation", label: "Team Messages", icon: <MessageCircleMoreIcon size={16} />, path: "/messaging" },
  { id: "qa-invoice", section: "Quick Actions", label: "Create Invoice", icon: <Plus size={16} />, path: "/finance/invoices" },
  { id: "qa-supplier", section: "Quick Actions", label: "Add New Supplier", icon: <Plus size={16} />, path: "/suppliers/new" },
  { id: "set-settings", section: "Settings", label: "Settings", icon: <Settings size={16} />, path: "/settings" },
  { id: "set-notifs", section: "Settings", label: "Notifications", icon: <Bell size={16} />, path: "/settings" },
]

const ANIMATION = {
  overlay: {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.2 } },
    exit: { opacity: 0, transition: { duration: 0.15 } },
  },
  dialog: {
    hidden: { opacity: 0, scale: 0.96, y: -8 },
    show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
    exit: { opacity: 0, scale: 0.96, y: -8, transition: { duration: 0.15 } },
  },
  list: {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
    exit: { opacity: 0, transition: { duration: 0.1 } },
  },
  item: {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
    exit: { opacity: 0, y: -8, transition: { duration: 0.12 } },
  },
} as const

interface SearchResults {
  customers: Customer[]
  orders: Order[]
  products: Product[]
}

interface FlatItem {
  id: string
  label: string
  sublabel?: string
  icon: React.ReactNode
  path: string
  section: string
}

export function SearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full rounded-lg px-3 h-10 text-[13px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/40 border border-zinc-200 dark:border-teal-500/20 bg-zinc-50 dark:bg-zinc-900/40 dark:shadow-[0_0_10px_rgba(20,184,166,0.08)] hover:border-zinc-300 dark:hover:border-teal-500/30 dark:hover:shadow-[0_0_12px_rgba(20,184,166,0.12)] transition-all duration-200"
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
  const [loading, setLoading] = useState(false)
  const [apiResults, setApiResults] = useState<SearchResults | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const navigate = useNavigate()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery("")
      setApiResults(null)
      setLoading(false)
      setActiveIndex(-1)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Debounced API search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.length < 2) {
      setApiResults(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setActiveIndex(-1)
    debounceRef.current = setTimeout(async () => {
      try {
        const [customersRes, ordersRes, productsRes] = await Promise.all([
          customerService.list({ search: query, limit: 5 }),
          orderService.list({ search: query, limit: 5 }),
          productService.list({ search: query, limit: 5 }),
        ])
        setApiResults({
          customers: customersRes.data,
          orders: ordersRes.data,
          products: productsRes.data,
        })
      } catch {
        setApiResults({ customers: [], orders: [], products: [] })
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Build flat list of all selectable items for keyboard nav
  const flatItems: FlatItem[] = []

  if (apiResults) {
    for (const c of apiResults.customers) {
      flatItems.push({
        id: `customer-${c.id}`,
        label: c.company_name,
        sublabel: c.location_region ?? undefined,
        icon: <User size={16} />,
        path: `/customers/${c.id}`,
        section: "Customers",
      })
    }
    for (const o of apiResults.orders) {
      flatItems.push({
        id: `order-${o.id}`,
        label: `${o.salesorder_number}  ${o.customer_name}`,
        sublabel: formatCurrency(o.total),
        icon: <ShoppingCart size={16} />,
        path: `/order/${o.id}`,
        section: "Orders",
      })
    }
    for (const p of apiResults.products) {
      flatItems.push({
        id: `product-${p.id}`,
        label: p.name,
        sublabel: p.sku,
        icon: <Package size={16} />,
        path: `/inventory/products?search=${encodeURIComponent(p.name)}`,
        section: "Products",
      })
    }
  }

  // Filtered nav items
  const filteredNav = query
    ? NAV_ITEMS.filter((x) => x.label.toLowerCase().includes(query.toLowerCase()))
    : NAV_ITEMS

  for (const item of filteredNav) {
    if (item.path) {
      flatItems.push({
        id: item.id,
        label: item.label,
        icon: item.icon,
        path: item.path,
        section: item.section,
      })
    }
  }

  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onClose()
      }
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
      if (!isOpen) return
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((prev) => (prev < flatItems.length - 1 ? prev + 1 : 0))
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : flatItems.length - 1))
      }
      if (e.key === "Enter" && activeIndex >= 0 && flatItems[activeIndex]) {
        e.preventDefault()
        navigate(flatItems[activeIndex].path)
        onClose()
      }
    },
    [isOpen, onClose, activeIndex, flatItems, navigate]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [handleGlobalKeyDown])

  const handleNavigate = (path: string) => {
    navigate(path)
    onClose()
  }

  // Group flat items by section for rendering
  const grouped = flatItems.reduce<Record<string, FlatItem[]>>((acc, item) => {
    ;(acc[item.section] ??= []).push(item)
    return acc
  }, {})

  const hasResults = flatItems.length > 0

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          onClick={onClose}
          variants={ANIMATION.overlay}
          initial="hidden"
          animate="show"
          exit="exit"
        >
          <div className="absolute inset-0 bg-black/60" />
          <motion.div
            className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            variants={ANIMATION.dialog}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 h-12 border-b border-zinc-800">
              <AnimatePresence mode="popLayout">
                {loading ? (
                  <motion.div
                    key="loader"
                    initial={{ y: -16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 16, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Loader2 size={16} className="text-zinc-500 animate-spin" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="search"
                    initial={{ y: -16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 16, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Search size={16} className="text-zinc-500" />
                  </motion.div>
                )}
              </AnimatePresence>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customers, orders, products..."
                className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 outline-none"
                role="combobox"
                aria-expanded={hasResults}
                aria-autocomplete="list"
                aria-activedescendant={activeIndex >= 0 ? flatItems[activeIndex]?.id : undefined}
                autoComplete="off"
              />
              <kbd className="text-[10px] text-zinc-500 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-80 overflow-y-auto p-2" role="listbox">
              <AnimatePresence mode="wait">
                {hasResults ? (
                  <motion.div
                    key={query || "nav"}
                    variants={ANIMATION.list}
                    initial="hidden"
                    animate="show"
                    exit="exit"
                  >
                    {Object.entries(grouped).map(([section, items], sectionIdx) => (
                      <div key={section}>
                        {/* Separator before nav sections when API results are above */}
                        {sectionIdx > 0 && (apiResults?.customers.length || apiResults?.orders.length || apiResults?.products.length) && !["Customers", "Orders", "Products"].includes(section) && ["Customers", "Orders", "Products"].includes(Object.keys(grouped)[sectionIdx - 1]) && (
                          <div className="mx-3 my-2 border-t border-zinc-800/60" />
                        )}
                        <motion.div variants={ANIMATION.item} className="mb-1">
                          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                            {section}
                          </div>
                        </motion.div>
                        {items.map((item) => {
                          const idx = flatItems.indexOf(item)
                          const isActive = idx === activeIndex
                          return (
                            <motion.button
                              key={item.id}
                              id={item.id}
                              variants={ANIMATION.item}
                              layout
                              role="option"
                              aria-selected={isActive}
                              className={`flex items-center gap-3 w-full px-3 h-10 rounded-lg text-sm transition-colors ${
                                isActive
                                  ? "bg-zinc-800 text-white"
                                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                              }`}
                              onClick={() => handleNavigate(item.path)}
                              onMouseEnter={() => setActiveIndex(idx)}
                            >
                              <span className="text-zinc-500 shrink-0">{item.icon}</span>
                              <span className="truncate">{item.label}</span>
                              {item.sublabel && (
                                <span className="ml-auto text-[11px] text-zinc-600 font-mono shrink-0">
                                  {item.sublabel}
                                </span>
                              )}
                            </motion.button>
                          )
                        })}
                      </div>
                    ))}
                  </motion.div>
                ) : !loading && query.length >= 2 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="px-3 py-8 text-center text-sm text-zinc-500"
                  >
                    No results found
                  </motion.div>
                ) : query.length === 1 ? (
                  <motion.div
                    key="hint"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="px-3 py-8 text-center text-sm text-zinc-500"
                  >
                    Type at least 2 characters to search
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="border-t border-zinc-800 px-4 py-2 flex items-center justify-between text-[10px] text-zinc-600">
              <span>
                <kbd className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 mr-1">&uarr;</kbd>
                <kbd className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 mr-1">&darr;</kbd>
                navigate
              </span>
              <span>
                <kbd className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 mr-1">&crarr;</kbd>
                select
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 }).format(val)
}
