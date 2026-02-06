import { useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  UsersGroup,
  Mail,
  Clipboard,
  Package,
  Truck,
  CreditCard,
  User,
  Image,
  MessageDots,
  Cog,
  Logout,
  ChevronDown,
} from '@mynaui/icons-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { authService } from '@/services/authService';
import type { Agent } from '@/types/domain';

interface AppSidebarProps {
  user: Agent;
}

// Navigation structure
const getNavItems = (isAdmin: boolean) => {
  const items = [
    {
      title: 'Dashboard',
      icon: Home,
      path: '/dashboard',
    },
    {
      title: 'Customers',
      icon: UsersGroup,
      path: '/customers',
      children: [
        { title: 'View Customers', path: '/customers' },
        { title: 'Customer Map', path: '/customers/map' },
      ],
    },
    {
      title: 'Enquiries',
      icon: Mail,
      path: '/enquiries',
      children: [
        { title: 'View Enquiries', path: '/enquiries' },
      ],
    },
    {
      title: 'Orders',
      icon: Clipboard,
      path: '/orders',
      children: [
        { title: 'Start New Order', path: '/orders/new' },
        { title: 'View Orders', path: '/orders' },
        { title: 'Order Management', path: '/orders/management' },
      ],
    },
  ];

  if (isAdmin) {
    items.push(
      {
        title: 'Inventory',
        icon: Package,
        path: '/inventory',
        children: [
          { title: 'Inventory Management', path: '/inventory/products' },
          { title: 'Stocklists', path: '/inventory/stocklists' },
        ],
      },
      {
        title: 'Shipping',
        icon: Truck,
        path: '/shipping',
        children: [
          { title: 'Warehouse', path: '/shipping/warehouse' },
          { title: 'Couriers', path: '/shipping/couriers' },
          { title: 'Deliveries', path: '/shipping/deliveries' },
        ],
      },
      {
        title: 'Finance',
        icon: CreditCard,
        path: '/finance',
        children: [
          { title: 'Invoices', path: '/finance/invoices' },
          { title: 'Purchase Orders', path: '/finance/purchase-orders' },
          { title: 'Debt Management', path: '/finance/debt' },
        ],
      },
      {
        title: 'Suppliers',
        icon: User,
        path: '/suppliers',
        children: [
          { title: 'Supplier Management', path: '/suppliers' },
          { title: 'Add New Supplier', path: '/suppliers/new' },
          { title: 'Catalogues', path: '/catalogues' },
        ],
      },
      {
        title: 'Image Management',
        icon: Image,
        path: '/image-management',
      }
    );
  }

  items.push(
    {
      title: 'Messaging',
      icon: MessageDots,
      path: '/messaging',
    },
    {
      title: 'Settings',
      icon: Cog,
      path: '/settings',
      children: [
        { title: 'General Settings', path: '/settings' },
        { title: 'Profile', path: '/settings/profile' },
        { title: 'Help', path: '/settings/help' },
      ],
    }
  );

  return items;
};

export function AppSidebar({ user }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = getNavItems(user.is_admin);

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

  const isPathActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 bg-primary">
            <AvatarFallback className="bg-primary text-white font-semibold">
              {(user.name || user.id).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-white">{user.name || user.id}</span>
            <span className="text-xs text-white/60">{user.is_admin ? 'Admin' : 'Sales Agent'}</span>
          </div>
        </div>
      </SidebarHeader>

      <Separator className="bg-white/10" />

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = isPathActive(item.path);
                const hasChildren = item.children && item.children.length > 0;

                if (hasChildren) {
                  return (
                    <Collapsible key={item.title} defaultOpen={isActive}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            className={`w-full justify-between ${isActive ? 'bg-sidebar-primary text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                          >
                            <span className="flex items-center gap-3">
                              <Icon size={18} />
                              <span>{item.title}</span>
                            </span>
                            <ChevronDown size={16} className="transition-transform duration-200 group-data-[state=open]:rotate-180" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.children.map((child) => (
                              <SidebarMenuSubItem key={child.path}>
                                <SidebarMenuSubButton
                                  onClick={() => navigate(child.path)}
                                  className={`${location.pathname === child.path ? 'text-primary' : 'text-white/60 hover:text-white'}`}
                                >
                                  {child.title}
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      onClick={() => navigate(item.path)}
                      className={`${isActive ? 'bg-sidebar-primary text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                    >
                      <Icon size={18} />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              className="text-red-400 hover:bg-red-500/20 hover:text-red-300"
            >
              <Logout size={18} />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
