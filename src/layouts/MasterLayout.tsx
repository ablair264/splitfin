import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Routes, Route } from 'react-router-dom';
import { authService } from '../services/authService';
import { notificationService } from '../services/notificationService';
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
import ImageManagement from '../components/ImageManagement/ImageManagement';
import Settings from '../components/Settings/Settings';
import AgentManagement from '../components/agents/AgentManagement';
import Messaging from '../components/Messaging/Messaging';
import Warehouse from '../components/Warehouse';
import Couriers from '../components/Couriers';
import Deliveries from '../components/Deliveries';

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

// Notifications Panel Component
function NotificationsPanel({
  notifications,
  onClose,
}: {
  notifications: Notification[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="absolute right-4 top-16 w-80 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Notifications</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl"
          >
            ×
          </button>
        </div>
        <div className="divide-y divide-border">
          {notifications.length > 0 ? (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 ${!notification.is_read ? 'bg-primary/5' : ''}`}
              >
                <h4 className="font-medium text-foreground text-sm">
                  {notification.title}
                </h4>
                <p className="text-muted-foreground text-sm mt-1">
                  {notification.body}
                </p>
                <span className="text-xs text-muted-foreground mt-2 block">
                  {new Date(notification.created_at).toLocaleString()}
                </span>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              No notifications
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MasterLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<Agent | null>(DEV_MODE ? DEV_USER : null);
  const [loading, setLoading] = useState(!DEV_MODE);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

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

  // Fetch notifications
  useEffect(() => {
    if (user && !DEV_MODE) {
      fetchNotifications();
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

  // Handle notification click
  const handleNotificationsClick = () => {
    setShowNotifications(!showNotifications);
  };

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
        onNotificationsClick={handleNotificationsClick}
      />
      <SidebarInset className="dark:bg-gradient-to-br dark:from-[#0f1419] dark:via-[#1a1f2a] dark:to-[#2c3e50]">

        {/* Notifications Panel */}
        {showNotifications && (
          <NotificationsPanel
            notifications={notifications}
            onClose={() => setShowNotifications(false)}
          />
        )}

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
