import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, Routes, Route } from 'react-router-dom';
import { authService } from '../services/authService';
import { notificationService } from '../services/notificationService';
import { messageService } from '../services/messageService';
import { orderService } from '../services/orderService';
import type { Agent, Notification } from '../types/domain';

// New Intent UI Sidebar
import AppSidebar from '../components/app-sidebar';
import { SidebarProvider, SidebarInset } from '../components/ui/sidebar';

// Components
import Dashboard from '../components/Dashboard';
import CustomersTable from '../components/customers/CustomersTable';
import CustomerDetail from '../components/CustomerDetail';
import CustomerMap from '../components/CustomerMap';
import EnquiryList from '../components/EnquiryList';
import ViewEnquiry from '../components/ViewEnquiry';
import OfflineStatus from '../components/OfflineStatus';
import { ProgressLoader } from '../components/ProgressLoader';
import { useLoader } from '../contexts/LoaderContext';
import OrderDetail from '../components/OrderDetail';
import OrdersTable from '../components/orders/OrdersTable';
import OrderManagement from '../components/OrderManagement';
import ViewOrder from '../components/ViewOrder';
import ProductsTable from '../components/inventory/ProductsTable';
import WebsiteProductsTable from '../components/website/WebsiteProductsTable';
import JournalPostsTable from '../components/journal/JournalPostsTable';
import JournalPostEditor from '../components/journal/JournalPostEditor';
import ProductIntelligence from '../components/website/ProductIntelligence';
import SiteContentPage from '../components/website/SiteContentPage';
import PurchaseOrders from '../components/purchase-orders/PurchaseOrders';
import ImageManagement from '../components/ImageManagement/ImageManagement';
import Reports from '../components/Reports';
import Settings from '../components/Settings/Settings';
import AgentManagement from '../components/agents/AgentManagement';
import Messaging from '../components/Messaging/Messaging';
import Warehouse from '../components/Warehouse';
import Couriers from '../components/Couriers';
import Deliveries from '../components/Deliveries';
import InvoicesTable from '../components/invoices/InvoicesTable';
import ViewInvoice from '../components/invoices/ViewInvoice';

// Dev mode - bypass auth
const DEV_MODE = import.meta.env.DEV;
const DEV_USER: Agent = {
  id: 'dev-admin',
  name: 'Dev Admin',
  is_admin: true,
  commission_rate: 0,
  brands: [],
  active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export default function MasterLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<Agent | null>(DEV_MODE ? DEV_USER : null);
  const [loading, setLoading] = useState(!DEV_MODE);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const { isLoading, message } = useLoader();

  // Check authentication on mount (skip in dev mode)
  useEffect(() => {
    if (DEV_MODE) {
      setLoading(false);
      return;
    }

    const checkAuth = async () => {
      try {
        const currentUser = await authService.getCurrentAgent();
        if (currentUser) {
          setUser(currentUser);
        } else {
          navigate('/login');
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, [navigate]);

  // Fetch notifications + unread messages
  useEffect(() => {
    if (user && !DEV_MODE) {
      fetchNotifications();
      fetchUnreadMessages();
    }
  }, [user]);

  const fetchNotifications = async () => {
    try {
      const result = await notificationService.list({ limit: 20 });
      if (result?.notifications) {
        setNotifications(result.notifications);
        setUnreadCount(result.notifications.filter((n) => !n.is_read).length);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  const fetchUnreadMessages = async () => {
    try {
      const result = await messageService.getUnreadCount();
      setUnreadMessages(result.total || 0);
    } catch {
      // Endpoint may not exist yet — silently ignore
    }
  };

  const handleMarkRead = useCallback(async (id: number) => {
    try {
      await notificationService.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await notificationService.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  }, []);

  const handleNotificationClick = useCallback(async (notification: Notification) => {
    const data = notification.data as Record<string, string | number> | null;
    if (notification.type === 'order_placed' && data?.order_number) {
      // Search by order number to get the internal DB id
      try {
        const result = await orderService.list({ search: String(data.order_number), limit: 1 });
        if (result.data?.length > 0) {
          navigate(`/order/${result.data[0].id}`);
          return;
        }
      } catch {
        // Fall through to fallback
      }
    }
    if (notification.type === 'customer_created' && data?.customer_id) {
      navigate(`/customers/${data.customer_id}`);
    } else if (notification.type === 'lead_captured') {
      navigate('/enquiries');
    }
  }, [navigate]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return null;
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar
        user={user}
        collapsible="dock"
        intent="inset"
        unreadNotifications={unreadCount}
        unreadMessages={unreadMessages}
        notifications={notifications}
        onMarkRead={handleMarkRead}
        onMarkAllRead={handleMarkAllRead}
        onNotificationClick={handleNotificationClick}
      />
      <SidebarInset className="dark:bg-gradient-to-br dark:from-[#0f1419] dark:via-[#1a1f2a] dark:to-[#2c3e50]">

        {/* Main Content */}
        <div className="flex-1 overflow-auto p-4 lg:p-6 min-h-screen text-foreground relative">
          <Routes>
            {/* Dashboard */}
            <Route path="/dashboard" element={<Dashboard />} />

            {/* Customer Routes */}
            <Route path="/customers" element={<CustomersTable />} />
            <Route path="/customers/map" element={<CustomerMap />} />
            <Route path="/customers/:customerId" element={<CustomerDetail />} />

            {/* Enquiry Routes */}
            <Route path="/enquiries" element={<EnquiryList />} />
            <Route path="/enquiries/:enquiryId" element={<ViewEnquiry />} />

            {/* Order Management Routes */}
            <Route path="/orders" element={<OrdersTable />} />
            <Route path="/orders/management" element={<OrderManagement />} />
            <Route path="/order/:orderId" element={<ViewOrder />} />
            <Route path="/order-detail/:orderId" element={<OrderDetail />} />

            {/* Agent Performance */}
            <Route path="/agents" element={<AgentManagement />} />

            {/* Inventory Management Routes */}
            <Route path="/inventory/products" element={<ProductsTable />} />

            {/* Website Management Routes */}
            <Route path="/website/products" element={<WebsiteProductsTable />} />
            <Route path="/website/journal" element={<JournalPostsTable />} />
            <Route path="/website/journal/new" element={<JournalPostEditor />} />
            <Route path="/website/journal/:id" element={<JournalPostEditor />} />
            <Route path="/website/site-content" element={<SiteContentPage />} />
            <Route path="/website/intelligence" element={<ProductIntelligence />} />
            {/* Reports */}
            <Route path="/reports" element={<Reports />} />

            {/* Finance */}
            <Route path="/finance/invoices" element={<InvoicesTable />} />
            <Route path="/finance/invoices/:invoiceId" element={<ViewInvoice />} />
            <Route path="/finance/purchase-orders" element={<PurchaseOrders />} />

            {/* Shipping Routes */}
            <Route path="/shipping/warehouse" element={<Warehouse />} />
            <Route path="/shipping/couriers" element={<Couriers />} />
            <Route path="/shipping/deliveries" element={<Deliveries />} />

            {/* Image Management */}
            <Route path="/image-management" element={<ImageManagement />} />

            {/* Messaging Routes */}
            <Route path="/messaging" element={<Messaging />} />

            {/* Settings Routes */}
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/*" element={<Settings />} />

            {/* Default Routes */}
            <Route index element={<Dashboard />} />
            <Route
              path="*"
              element={
                <div className="text-foreground p-8">Page not found</div>
              }
            />
          </Routes>
        </div>
      </SidebarInset>

      {/* Offline Status Indicator */}
      <OfflineStatus />

      {/* Global Progress Loader */}
      <ProgressLoader isVisible={isLoading} message={message} />
    </SidebarProvider>
  );
}
