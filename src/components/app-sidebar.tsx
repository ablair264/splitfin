"use client"

import { useLocation, useNavigate } from "react-router-dom"
import {
  Home,
  Cart,
  UsersGroup,
  Package,
  Truck,
  Dollar,
  User,
  Image,
  MessageDots,
  Cog,
  QuestionCircle,
  Logout,
  ChevronsUpDown,
  Users,
  MapPin,
  ChatDots,
  Box,
  Building,
  Send,
  FileText,
  Clipboard,
  UserPlus,
} from "@mynaui/icons-react"
import { Avatar } from "@/components/ui/avatar"
import { Link } from "@/components/ui/link"
import {
  Menu,
  MenuContent,
  MenuHeader,
  MenuItem,
  MenuSection,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import {
  Sidebar,
  SidebarContent,
  SidebarDisclosure,
  SidebarDisclosureGroup,
  SidebarDisclosurePanel,
  SidebarDisclosureTrigger,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarRail,
  SidebarSection,
  SidebarSectionGroup,
  useSidebar,
} from "@/components/ui/sidebar"
import { authService } from "@/services/authService"
import type { Agent } from "@/types/domain"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: Agent | null
}

// Shared class for disclosure panel sub-items: smaller icons, vertical spacing
const panelClass = "pl-2.5 space-y-0.5 [&_[data-slot=icon]]:!me-3"

export default function AppSidebar({ user, ...props }: AppSidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  const isPathActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  const handleLogout = async () => {
    try {
      await authService.logout()
      navigate('/login')
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  const isAdmin = user?.is_admin ?? false

  const getItemClass = (isActive: boolean) => {
    const base = "min-h-11"
    if (isActive) {
      return `${base} border-l-2 border-l-primary bg-sidebar-primary text-sidebar-primary-foreground [&_[data-slot=icon]]:text-sidebar-primary-foreground`
    }
    return base
  }

  const getTriggerClass = (isActive: boolean) => {
    return isActive ? '[&_[data-slot=icon]]:text-primary text-primary font-semibold' : ''
  }

  return (
    <Sidebar {...props}>
      <SidebarHeader className="pb-2">
        <Link href="/dashboard" className="flex items-center justify-center px-2 overflow-hidden">
          {/* Expanded: full wordmark - hidden when collapsed via CSS */}
          <img src="/logos/splitfinrow.png" alt="Splitfin" className="h-7 w-auto shrink-0 hidden dark:in-data-[state=expanded]:block in-data-[state=collapsed]:!hidden" />
          <img src="/logos/splitfinrow.png" alt="Splitfin" className="h-7 w-auto shrink-0 in-data-[state=expanded]:block dark:!hidden in-data-[state=collapsed]:!hidden brightness-0" />
          {/* Collapsed: icon-only logo - hidden when expanded via CSS */}
          <img src="/logos/splitfin-white.png" alt="Splitfin" className="h-7 w-7 shrink-0 hidden dark:in-data-[state=collapsed]:block in-data-[state=expanded]:!hidden" />
          <img src="/logos/splitfin.png" alt="Splitfin" className="h-7 w-7 shrink-0 in-data-[state=collapsed]:block dark:!hidden in-data-[state=expanded]:!hidden" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarSectionGroup className="gap-y-1">
          {/* Primary Navigation */}
          <SidebarSection className="py-2">
            <SidebarItem
              tooltip="Dashboard"
              isCurrent={isPathActive('/dashboard')}
              href="/dashboard"
              className={getItemClass(isPathActive('/dashboard'))}
            >
              <Home data-slot="icon" />
              <SidebarLabel>Dashboard</SidebarLabel>
            </SidebarItem>

            <SidebarItem
              tooltip="Orders"
              isCurrent={isPathActive('/orders')}
              href="/orders"
              className={getItemClass(isPathActive('/orders'))}
            >
              <Cart data-slot="icon" />
              <SidebarLabel>Orders</SidebarLabel>
            </SidebarItem>
          </SidebarSection>

          {/* Expandable Sections */}
          <SidebarDisclosureGroup
            className="py-1"
            defaultExpandedKeys={
              isPathActive('/customers') || isPathActive('/enquiries') ? [1] :
              isPathActive('/inventory') ? [2] :
              isPathActive('/shipping') ? [3] :
              isPathActive('/finance') ? [4] :
              isPathActive('/suppliers') ? [5] :
              []
            }
          >
            {/* Customers */}
            <SidebarDisclosure id={1}>
              <SidebarDisclosureTrigger className={getTriggerClass(isPathActive('/customers') || isPathActive('/enquiries'))}>
                <UsersGroup data-slot="icon" />
                <SidebarLabel>Customers</SidebarLabel>
              </SidebarDisclosureTrigger>
              <SidebarDisclosurePanel className={panelClass}>
                <SidebarItem
                  tooltip="View Customers"
                  isCurrent={location.pathname === '/customers'}
                  href="/customers"
                  className={getItemClass(location.pathname === '/customers')}
                >
                  <Users data-slot="icon" className="size-3.5" />
                  <SidebarLabel>View Customers</SidebarLabel>
                </SidebarItem>
                <SidebarItem
                  tooltip="Customer Map"
                  isCurrent={isPathActive('/customers/map')}
                  href="/customers/map"
                  className={getItemClass(isPathActive('/customers/map'))}
                >
                  <MapPin data-slot="icon" className="size-3.5" />
                  <SidebarLabel>Customer Map</SidebarLabel>
                </SidebarItem>
                <SidebarItem
                  tooltip="Enquiries"
                  isCurrent={isPathActive('/enquiries')}
                  href="/enquiries"
                  className={getItemClass(isPathActive('/enquiries'))}
                >
                  <ChatDots data-slot="icon" className="size-3.5" />
                  <SidebarLabel>Enquiries</SidebarLabel>
                </SidebarItem>
              </SidebarDisclosurePanel>
            </SidebarDisclosure>

            {/* Inventory - Admin only */}
            {isAdmin && (
              <SidebarDisclosure id={2}>
                <SidebarDisclosureTrigger className={getTriggerClass(isPathActive('/inventory'))}>
                  <Package data-slot="icon" />
                  <SidebarLabel>Inventory</SidebarLabel>
                </SidebarDisclosureTrigger>
                <SidebarDisclosurePanel className={panelClass}>
                  <SidebarItem
                    tooltip="Inventory Management"
                    isCurrent={isPathActive('/inventory/products')}
                    href="/inventory/products"
                    className={getItemClass(isPathActive('/inventory/products'))}
                  >
                    <Box data-slot="icon" className="size-3.5" />
                    <SidebarLabel>Inventory Management</SidebarLabel>
                  </SidebarItem>
                </SidebarDisclosurePanel>
              </SidebarDisclosure>
            )}

            {/* Shipping - Admin only */}
            {isAdmin && (
              <SidebarDisclosure id={3}>
                <SidebarDisclosureTrigger className={getTriggerClass(isPathActive('/shipping'))}>
                  <Truck data-slot="icon" />
                  <SidebarLabel>Shipping</SidebarLabel>
                </SidebarDisclosureTrigger>
                <SidebarDisclosurePanel className={panelClass}>
                  <SidebarItem
                    tooltip="Warehouse"
                    isCurrent={isPathActive('/shipping/warehouse')}
                    href="/shipping/warehouse"
                    className={getItemClass(isPathActive('/shipping/warehouse'))}
                  >
                    <Building data-slot="icon" className="size-3.5" />
                    <SidebarLabel>Warehouse</SidebarLabel>
                  </SidebarItem>
                  <SidebarItem
                    tooltip="Couriers"
                    isCurrent={isPathActive('/shipping/couriers')}
                    href="/shipping/couriers"
                    className={getItemClass(isPathActive('/shipping/couriers'))}
                  >
                    <Send data-slot="icon" className="size-3.5" />
                    <SidebarLabel>Couriers</SidebarLabel>
                  </SidebarItem>
                  <SidebarItem
                    tooltip="Deliveries"
                    isCurrent={isPathActive('/shipping/deliveries')}
                    href="/shipping/deliveries"
                    className={getItemClass(isPathActive('/shipping/deliveries'))}
                  >
                    <Package data-slot="icon" className="size-3.5" />
                    <SidebarLabel>Deliveries</SidebarLabel>
                  </SidebarItem>
                </SidebarDisclosurePanel>
              </SidebarDisclosure>
            )}

            {/* Finance - Admin only */}
            {isAdmin && (
              <SidebarDisclosure id={4}>
                <SidebarDisclosureTrigger className={getTriggerClass(isPathActive('/finance'))}>
                  <Dollar data-slot="icon" />
                  <SidebarLabel>Finance</SidebarLabel>
                </SidebarDisclosureTrigger>
                <SidebarDisclosurePanel className={panelClass}>
                  <SidebarItem
                    tooltip="Invoices"
                    isCurrent={isPathActive('/finance/invoices')}
                    href="/finance/invoices"
                    className={getItemClass(isPathActive('/finance/invoices'))}
                  >
                    <FileText data-slot="icon" className="size-3.5" />
                    <SidebarLabel>Invoices</SidebarLabel>
                  </SidebarItem>
                  <SidebarItem
                    tooltip="Purchase Orders"
                    isCurrent={isPathActive('/finance/purchase-orders')}
                    href="/finance/purchase-orders"
                    className={getItemClass(isPathActive('/finance/purchase-orders'))}
                  >
                    <Clipboard data-slot="icon" className="size-3.5" />
                    <SidebarLabel>Purchase Orders</SidebarLabel>
                  </SidebarItem>
                </SidebarDisclosurePanel>
              </SidebarDisclosure>
            )}

            {/* Suppliers - Admin only */}
            {isAdmin && (
              <SidebarDisclosure id={5}>
                <SidebarDisclosureTrigger className={getTriggerClass(isPathActive('/suppliers'))}>
                  <User data-slot="icon" />
                  <SidebarLabel>Suppliers</SidebarLabel>
                </SidebarDisclosureTrigger>
                <SidebarDisclosurePanel className={panelClass}>
                  <SidebarItem
                    tooltip="Supplier Management"
                    isCurrent={location.pathname === '/suppliers'}
                    href="/suppliers"
                    className={getItemClass(location.pathname === '/suppliers')}
                  >
                    <Users data-slot="icon" className="size-3.5" />
                    <SidebarLabel>Supplier Management</SidebarLabel>
                  </SidebarItem>
                  <SidebarItem
                    tooltip="Add Supplier"
                    isCurrent={isPathActive('/suppliers/new')}
                    href="/suppliers/new"
                    className={getItemClass(isPathActive('/suppliers/new'))}
                  >
                    <UserPlus data-slot="icon" className="size-3.5" />
                    <SidebarLabel>Add New Supplier</SidebarLabel>
                  </SidebarItem>
                </SidebarDisclosurePanel>
              </SidebarDisclosure>
            )}
          </SidebarDisclosureGroup>

          {/* Tools Section - Admin only */}
          {isAdmin && (
            <SidebarSection label="Tools" className="pt-6 border-t border-sidebar-border/30">
              <SidebarItem
                tooltip="Image Management"
                isCurrent={isPathActive('/image-management')}
                href="/image-management"
                className={getItemClass(isPathActive('/image-management'))}
              >
                <Image data-slot="icon" />
                <SidebarLabel>Image Management</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
          )}

          {/* Communication */}
          <SidebarSection label="Communication" className="pt-6 border-t border-sidebar-border/30">
            <SidebarItem
              tooltip="Messaging"
              isCurrent={isPathActive('/messaging')}
              href="/messaging"
              className={getItemClass(isPathActive('/messaging'))}
            >
              <MessageDots data-slot="icon" />
              <SidebarLabel>Team Messages</SidebarLabel>
            </SidebarItem>
          </SidebarSection>

          {/* Settings — Phase 1.6 */}
          <SidebarSection className="pt-6 border-t border-sidebar-border/30">
            <SidebarItem
              tooltip="Settings"
              isCurrent={isPathActive('/settings')}
              href="/settings"
              className={getItemClass(isPathActive('/settings'))}
            >
              <Cog data-slot="icon" />
              <SidebarLabel>Settings</SidebarLabel>
            </SidebarItem>
          </SidebarSection>
        </SidebarSectionGroup>
      </SidebarContent>

      <SidebarFooter>
        <Menu>
          <MenuTrigger
            className={`flex w-full items-center rounded-lg p-2 hover:bg-sidebar-accent ${isCollapsed ? 'justify-center' : 'justify-between'}`}
            aria-label="Profile"
          >
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-x-3'}`}>
              <Avatar className="size-9 bg-primary text-primary-foreground">
                {(user?.name || user?.id || 'U').charAt(0).toUpperCase()}
              </Avatar>
              {!isCollapsed && (
                <div className="text-sm text-left">
                  <div className="font-medium text-sidebar-fg">{user?.name || user?.id || 'User'}</div>
                  <div className="text-xs text-muted-fg">
                    {user?.is_admin ? 'Admin' : 'Sales Agent'}
                  </div>
                </div>
              )}
            </div>
            {!isCollapsed && (
              <ChevronsUpDown data-slot="chevron" className="size-4 text-muted-fg" />
            )}
          </MenuTrigger>
          <MenuContent
            className="min-w-56"
            placement="top"
          >
            <MenuSection>
              <MenuHeader separator>
                <span className="block font-medium">{user?.name || user?.id || 'User'}</span>
                <span className="font-normal text-muted-fg">
                  {user?.is_admin ? 'Administrator' : 'Sales Agent'}
                </span>
              </MenuHeader>
            </MenuSection>

            <MenuItem href="/dashboard">
              <Home />
              Dashboard
            </MenuItem>
            <MenuItem href="/settings">
              <Cog />
              Settings
            </MenuItem>
            <MenuSeparator />
            <MenuItem href="/settings/help">
              <QuestionCircle />
              Help & Support
            </MenuItem>
            <MenuSeparator />
            <MenuItem onAction={handleLogout} className="text-destructive">
              <Logout />
              Log out
            </MenuItem>
          </MenuContent>
        </Menu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
