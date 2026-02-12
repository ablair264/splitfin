import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ShoppingCart, Users, Package } from 'lucide-react';
import { motion } from 'motion/react';
import { type ColumnDef } from '@tanstack/react-table';
import { apiClient } from '../api/client';
import SplitfinTable from './shared/SplitfinTable';
import CompactAISummary from './CompactAISummary';
import { RevenueChart, OrdersChart, StockChart, AgentChart } from './dashboard/DashboardCharts';

interface TopAgent {
  id?: string;
  name: string;
  orderCount: number;
  revenue: number;
}

interface DashboardMetrics {
  ordersCount: number;
  ordersRevenue: number;
  stockTotal: number;
  topAgent: TopAgent;
  pendingOrders: number;
  newCustomers: number;
  lowStockItems: number;
  avgOrderValue: number;
  orderCountChartData: Array<{ name: string; value: number }>;
  orderRevenueChartData: Array<{ name: string; value: number }>;
  stockChartData: Array<{ name: string; value: number }>;
  topAgentChartData: Array<{ name: string; value: number }>;
}

type DateRange = '7_days' | '30_days' | '90_days' | 'this_year' | 'all_time';

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '7_days', label: 'Last 7 Days' },
  { value: '30_days', label: 'Last 30 Days' },
  { value: '90_days', label: 'Last 90 Days' },
  { value: 'this_year', label: 'This Year' },
  { value: 'all_time', label: 'All Time' },
];

interface RecentOrder {
  id: number;
  orderNumber: string;
  referenceNumber: string | null;
  customer: string;
  date: string;
  status: string;
  total: number;
}

interface RecentProduct {
  id: number;
  sku: string;
  name: string;
  brand: string;
  price: number;
  stock: number;
  imageUrl: string | null;
  addedAt: string;
}

interface RecentCustomer {
  id: number;
  companyName: string;
  contactName: string;
  email: string;
  status: string;
  totalSpent: number;
  orderCount: number;
  addedAt: string;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    draft: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    confirmed: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    pending: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    shipped: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    invoiced: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    delivered: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    fulfilled: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    active: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    inactive: 'bg-destructive/20 text-destructive border border-destructive/30',
  };
  return colors[status] || 'bg-muted-foreground/10 text-muted-foreground border border-muted-foreground/20';
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span className={`px-2.5 py-0.5 rounded-md text-xs font-medium capitalize ${getStatusColor(status)}`}>
    {status}
  </span>
);

const DashboardContent: React.FC = () => {
  usePageTitle('Dashboard');
  const [dateRange, setDateRange] = useState<DateRange>('30_days');
  const [showOneDriveConnected, setShowOneDriveConnected] = useState(false);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    ordersCount: 0,
    ordersRevenue: 0,
    stockTotal: 0,
    topAgent: { name: 'N/A', orderCount: 0, revenue: 0 },
    pendingOrders: 0,
    newCustomers: 0,
    lowStockItems: 0,
    avgOrderValue: 0,
    orderCountChartData: [],
    orderRevenueChartData: [],
    stockChartData: [],
    topAgentChartData: [],
  });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [recentProducts, setRecentProducts] = useState<RecentProduct[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<RecentCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [tablesLoading, setTablesLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    loadDashboardData();
  }, [dateRange]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('onedrive') === 'connected') {
      setShowOneDriveConnected(true);
      params.delete('onedrive');
      const cleaned = params.toString();
      const nextUrl = cleaned ? `${location.pathname}?${cleaned}` : location.pathname;
      navigate(nextUrl, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const metricsResponse = await apiClient.get(`/analytics/dashboard?date_range=${dateRange}`);
      setMetrics(metricsResponse.data);
      setLoading(false);

      const [ordersRes, productsRes, customersRes] = await Promise.all([
        apiClient.get('/analytics/recent-orders?limit=5'),
        apiClient.get('/analytics/recent-products?limit=5'),
        apiClient.get('/analytics/recent-customers?limit=5'),
      ]);

      setRecentOrders(ordersRes.data);
      setRecentProducts(productsRes.data);
      setRecentCustomers(customersRes.data);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setTablesLoading(false);
    }
  };

  const orderColumns = useMemo<ColumnDef<RecentOrder>[]>(() => [
    {
      accessorKey: 'orderNumber',
      header: 'Order #',
      size: 140,
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.orderNumber}</div>
          {row.original.referenceNumber && (
            <div className="text-[11px] text-muted-foreground">{row.original.referenceNumber}</div>
          )}
        </div>
      ),
    },
    { accessorKey: 'customer', header: 'Customer', size: 180 },
    {
      accessorKey: 'date',
      header: 'Date',
      size: 100,
      cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.date)}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 100,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'total',
      header: 'Total',
      size: 90,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">{formatCurrency(row.original.total)}</span>
      ),
    },
  ], []);

  const customerColumns = useMemo<ColumnDef<RecentCustomer>[]>(() => [
    { accessorKey: 'companyName', header: 'Customer', size: 200 },
    { accessorKey: 'email', header: 'Email', size: 200 },
    {
      accessorKey: 'orderCount',
      header: 'Orders',
      size: 70,
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">{row.original.orderCount}</span>
      ),
    },
    {
      accessorKey: 'totalSpent',
      header: 'Spent',
      size: 90,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">{formatCurrency(row.original.totalSpent)}</span>
      ),
    },
  ], []);

  const productColumns = useMemo<ColumnDef<RecentProduct>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Product',
      size: 240,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          {row.original.imageUrl ? (
            <img
              src={row.original.imageUrl}
              alt=""
              className="w-7 h-7 rounded object-cover bg-muted shrink-0"
            />
          ) : (
            <div className="w-7 h-7 rounded bg-muted/60 shrink-0 flex items-center justify-center">
              <Package size={14} className="text-muted-foreground/40" />
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.name}</div>
            <div className="text-[11px] text-muted-foreground">{row.original.sku}</div>
          </div>
        </div>
      ),
    },
    { accessorKey: 'brand', header: 'Brand', size: 120 },
    {
      accessorKey: 'price',
      header: 'Price',
      size: 90,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">{formatCurrency(row.original.price)}</span>
      ),
    },
    {
      accessorKey: 'stock',
      header: 'Stock',
      size: 70,
      cell: ({ row }) => <span className="tabular-nums">{row.original.stock}</span>,
    },
  ], []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-muted/50 rounded-lg animate-pulse mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-card border border-border rounded-xl animate-pulse" />
          <div className="h-64 bg-card border border-border rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header Section */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="mb-6"
      >
        {showOneDriveConnected && (
          <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-200 text-sm flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-emerald-100">OneDrive connected</div>
              <div className="text-emerald-200/80">Your OneDrive is now linked to Splitfin.</div>
            </div>
            <button
              className="text-emerald-200/80 hover:text-emerald-100"
              onClick={() => setShowOneDriveConnected(false)}
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
            <div className="flex items-center gap-0.5 bg-muted/40 border border-border/60 rounded-lg p-0.5">
              {DATE_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setDateRange(option.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap ${dateRange === option.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                    }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <CompactAISummary companyId="dm-brands" />
      </motion.div>

      {/* Main Metrics Row — Evil Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <motion.div className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0 }}>
          <RevenueChart
            data={metrics.orderRevenueChartData}
            total={metrics.ordersRevenue}
            onClick={() => navigate('/orders')}
          />
        </motion.div>

        <motion.div className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.05 }}>
          <OrdersChart
            data={metrics.orderCountChartData}
            total={metrics.ordersCount}
            onClick={() => navigate('/orders')}
          />
        </motion.div>

        <motion.div className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.1 }}>
          <StockChart
            data={metrics.stockChartData}
            total={metrics.stockTotal}
            onClick={() => navigate('/inventory/products')}
          />
        </motion.div>

        <motion.div className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.15 }}>
          <AgentChart
            data={metrics.topAgentChartData}
            agentName={metrics.topAgent.name}
            orderCount={metrics.topAgent.orderCount}
            revenue={metrics.topAgent.revenue}
            onClick={() => navigate('/agents')}
          />
        </motion.div>
      </div>

      {/* Data Tables Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.2 }}>
          <SplitfinTable
            title="Latest Orders"
            viewAllLink={{ onClick: () => navigate('/order') }}
            columns={orderColumns}
            data={recentOrders}
            onRowClick={(item) => navigate(`/order/${item.id}`)}
            loading={tablesLoading}
            emptyState={{
              icon: <ShoppingCart size={32} />,
              title: 'No orders yet',
              description: 'Orders will appear here once created',
            }}
          />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.25 }}>
          <SplitfinTable
            title="New Customers"
            viewAllLink={{ onClick: () => navigate('/customers') }}
            columns={customerColumns}
            data={recentCustomers}
            onRowClick={(item) => navigate(`/customers/${item.id}`)}
            loading={tablesLoading}
            emptyState={{
              icon: <Users size={32} />,
              title: 'No customers yet',
              description: 'Customers will appear here once added',
            }}
          />
        </motion.div>
      </div>

      {/* Recently Added Products - Full Width */}
      <div className="border-t border-border/40 mb-6" />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.3 }}>
        <SplitfinTable
          className="mb-6"
          title="Recently Added Products"
          viewAllLink={{ onClick: () => navigate('/inventory/products') }}
          columns={productColumns}
          data={recentProducts}
          onRowClick={(item) => navigate(`/inventory/products/?page=1&status=active&search=${item.sku}`)}
          loading={tablesLoading}
          emptyState={{
            icon: <Package size={32} />,
            title: 'No products yet',
            description: 'Products will appear here once added',
          }}
        />
      </motion.div>
    </div>
  );
};

export default DashboardContent;
