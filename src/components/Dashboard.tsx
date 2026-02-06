import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, PoundSterling, Boxes, Trophy, Users, Package, Calendar } from 'lucide-react';
import { motion } from 'motion/react';
import { type ColumnDef } from '@tanstack/react-table';
import { apiClient } from '../api/client';
import { ColorProvider } from './analytics/shared/ColorProvider';
import MetricCard from './analytics/shared/MetricCard';
import SplitfinTable from './shared/SplitfinTable';
import CompactAISummary from './CompactAISummary';

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
    confirmed: 'bg-success/10 text-success',
    pending: 'bg-warning/10 text-warning',
    draft: 'bg-muted/30 text-muted-foreground',
    shipped: 'bg-info/10 text-info',
    delivered: 'bg-success/10 text-success',
    active: 'bg-success/10 text-success',
    inactive: 'bg-destructive/10 text-destructive',
  };
  return colors[status] || 'bg-muted/30 text-muted-foreground';
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
    {status}
  </span>
);

const DashboardContent: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange>('30_days');
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

  useEffect(() => {
    loadDashboardData();
  }, [dateRange]);

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
    { accessorKey: 'companyName', header: 'Company', size: 170 },
    { accessorKey: 'contactName', header: 'Contact', size: 130 },
    { accessorKey: 'email', header: 'Email', size: 150 },
    {
      accessorKey: 'orderCount',
      header: 'Orders',
      size: 65,
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">{row.original.orderCount}</span>
      ),
    },
    {
      accessorKey: 'totalSpent',
      header: 'Spent',
      size: 80,
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
      <div className="flex items-center justify-center p-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-3 text-muted-foreground">Loading dashboard...</span>
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
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-muted-foreground" />
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value as DateRange)}
                  className="bg-muted border border-border rounded-md px-2 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent cursor-pointer hover:bg-accent transition-colors"
                >
                  {DATE_RANGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <CompactAISummary companyId="dm-brands" />
          </div>
        </div>
      </motion.div>

      {/* Main Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0 }}>
        <MetricCard
          id="orders-count"
          title="Orders"
          value={metrics.ordersCount}
          subtitle="Total orders"
          format="number"
          displayMode="medium"
          design="variant1"
          icon={<ShoppingCart size={16} />}
          color="var(--primary)"
          cardIndex={0}
          chartData={metrics.orderCountChartData}
          onClick={() => navigate('/orders')}
        />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.05 }}>
        <MetricCard
          id="orders-revenue"
          title="Revenue"
          value={metrics.ordersRevenue}
          subtitle="Order value"
          format="currency"
          displayMode="medium"
          design="variant2"
          icon={<PoundSterling size={16} />}
          color="var(--success)"
          cardIndex={1}
          chartData={metrics.orderRevenueChartData}
          onClick={() => navigate('/orders')}
        />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.1 }}>
        <MetricCard
          id="stock-total"
          title="Stock Total"
          value={metrics.stockTotal}
          subtitle="Units in stock"
          format="number"
          displayMode="medium"
          design="variant3"
          icon={<Boxes size={16} />}
          color="var(--warning)"
          cardIndex={2}
          chartData={metrics.stockChartData}
          onClick={() => navigate('/inventory')}
        />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.15 }}>
        <MetricCard
          id="top-agent"
          title="Top Agent"
          value={metrics.topAgent.name}
          subtitle={`${metrics.topAgent.orderCount} orders • ${formatCurrency(metrics.topAgent.revenue)}`}
          format="number"
          displayMode="medium"
          design="variant1"
          icon={<Trophy size={16} />}
          color="var(--info)"
          cardIndex={3}
          chartData={metrics.topAgentChartData}
          onClick={() => navigate('/analytics')}
        />
        </motion.div>
      </div>

      {/* Data Tables Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.2 }}>
        <SplitfinTable
          title="Latest Orders"
          viewAllLink={{ onClick: () => navigate('/orders') }}
          columns={orderColumns}
          data={recentOrders}
          onRowClick={(item) => navigate(`/orders/${item.id}`)}
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
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.3 }}>
      <SplitfinTable
        className="mb-6"
        title="Recently Added Products"
        viewAllLink={{ onClick: () => navigate('/inventory') }}
        columns={productColumns}
        data={recentProducts}
        onRowClick={(item) => navigate(`/inventory/${item.id}`)}
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

const Dashboard: React.FC = () => {
  return (
    <ColorProvider
      barChartColors="multicolored"
      graphColors={{
        primary: 'var(--primary)',
        secondary: 'var(--success)',
        tertiary: 'var(--warning)'
      }}
    >
      <DashboardContent />
    </ColorProvider>
  );
};

export default Dashboard;
