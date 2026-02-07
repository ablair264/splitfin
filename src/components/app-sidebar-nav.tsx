"use client"

import { useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import { Cog, Bell, Mail, Sun, Moon } from "@mynaui/icons-react"
import { Breadcrumbs, BreadcrumbsItem } from "@/components/ui/breadcrumbs"
import { SidebarNav, SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Link } from "@/components/ui/link"
import { Tooltip, TooltipContent } from "@/components/ui/tooltip"
import { Switch } from "@/components/animate-ui/components/radix/switch"

interface AppSidebarNavProps {
  customerNames?: Record<string, string>
  unreadNotifications?: number
  onNotificationsClick?: () => void
}

export default function AppSidebarNav({
  customerNames = {},
  unreadNotifications = 0,
  onNotificationsClick,
}: AppSidebarNavProps) {
  const location = useLocation()
  const [isDark, setIsDark] = useState(true)

  // Initialize theme from document
  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark')
    setIsDark(isDarkMode)
  }, [])

  // Toggle theme
  const handleThemeToggle = (checked: boolean) => {
    setIsDark(checked)
    if (checked) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  const generateBreadcrumbs = () => {
    const pathnames = location.pathname.split('/').filter((x) => x)

    // On dashboard, just show "Home"
    if (pathnames.length === 0 || (pathnames.length === 1 && pathnames[0] === 'dashboard')) {
      return [{ name: 'Home', to: '/dashboard', isLast: true }]
    }

    const breadcrumbNameMap: Record<string, string> = {
      dashboard: 'Dashboard',
      customers: 'Customers',
      enquiries: 'Enquiries',
      new: 'Create',
      orders: 'Orders',
      order: 'Order',
      invoices: 'Invoices',
      inventory: 'Inventory',
      products: 'Products',
      'product-list': 'Product List',
      overview: 'Overview',
      images: 'Image Management',
      'image-management': 'Image Management',
      shipping: 'Shipping',
      warehouse: 'Warehouse',
      couriers: 'Couriers',
      deliveries: 'Deliveries',
      finance: 'Finance',
      'purchase-orders': 'Purchase Orders',
      suppliers: 'Suppliers',
      catalogues: 'Catalogues',
      analytics: 'Analytics',
      messaging: 'Messaging',
      settings: 'Settings',
      profile: 'Profile',
      help: 'Help',
      map: 'Customer Map',
    }

    return pathnames.map((value, index) => {
      const to = `/${pathnames.slice(0, index + 1).join('/')}`
      const isLast = index === pathnames.length - 1

      // Default name from map or capitalize
      let name = breadcrumbNameMap[value] || value.charAt(0).toUpperCase() + value.slice(1)

      // If this looks like a customer ID
      if (pathnames[0] === 'customers' && index === 1 && value.length > 10) {
        const customerName = customerNames[value]
        if (customerName) {
          name = customerName
        } else {
          name = 'Customer'
        }
      }

      // If this looks like an order ID
      if ((pathnames[0] === 'order' || pathnames[0] === 'orders') && index === 1 && !isNaN(Number(value))) {
        name = `#${value}`
      }

      return { name, to, isLast }
    })
  }

  const breadcrumbs = generateBreadcrumbs()

  return (
    <SidebarNav>
      {/* Left: Page title / breadcrumbs */}
      <Breadcrumbs className="hidden md:flex">
        {breadcrumbs.map((crumb) => (
          <BreadcrumbsItem
            key={crumb.to}
            href={crumb.isLast ? undefined : crumb.to}
          >
            {crumb.name}
          </BreadcrumbsItem>
        ))}
      </Breadcrumbs>

      {/* Right: sidebar toggle + actions */}
      <div className="ml-auto flex items-center gap-3">
        <SidebarTrigger className="-mr-1" />

        <Tooltip delay={0}>
          <Switch
            checked={isDark}
            onCheckedChange={handleThemeToggle}
            startIcon={<Sun />}
            endIcon={<Moon />}
            aria-label="Toggle theme"
          />
          <TooltipContent placement="bottom">{isDark ? 'Switch to light mode' : 'Switch to dark mode'}</TooltipContent>
        </Tooltip>

        <Tooltip delay={0}>
          <Button
            intent="plain"
            size="sq-sm"
            aria-label="Notifications"
            className="relative"
            onPress={onNotificationsClick}
          >
            <Bell className="size-5" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-white">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </Button>
          <TooltipContent placement="bottom">Notifications</TooltipContent>
        </Tooltip>
        <Tooltip delay={0}>
          <Link href="/messaging" className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Mail className="size-5" />
            <span className="sr-only">Messages</span>
          </Link>
          <TooltipContent placement="bottom">Messages</TooltipContent>
        </Tooltip>
        <Tooltip delay={0}>
          <Link href="/settings" className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Cog className="size-5" />
            <span className="sr-only">Settings</span>
          </Link>
          <TooltipContent placement="bottom">Settings</TooltipContent>
        </Tooltip>
      </div>
    </SidebarNav>
  )
}
