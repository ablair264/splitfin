import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { type ColumnDef } from '@tanstack/react-table';
import { Users } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiClient } from '@/api/client';
import SplitfinTable from '@/components/shared/SplitfinTable';
import {
  AgentOrdersPieChart,
  AgentRevenueRadialChart,
  AgentAOVChart,
  MonthlyTrendChart,
} from './AgentCharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentData {
  id: string;
  name: string;
  orderCount: number;
  revenue: number;
  newCustomers: number;
  commission: number;
  commissionRate: number;
}

interface AgentAnalytics {
  agents: AgentData[];
  ordersByAgentChart: { name: string; value: number }[];
  revenueByAgentChart: { name: string; value: number }[];
  activityChart: Record<string, unknown>[];
}

type DateRange = '7_days' | '30_days' | '90_days' | 'this_year' | 'all_time';

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '7_days', label: 'Last 7 Days' },
  { value: '30_days', label: 'Last 30 Days' },
  { value: '90_days', label: 'Last 90 Days' },
  { value: 'this_year', label: 'This Year' },
  { value: 'all_time', label: 'All Time' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);

// Ranked table row
interface RankedAgent {
  rank: number;
  name: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const AgentManagement: React.FC = () => {
  usePageTitle('Agent Performance');
  const [dateRange, setDateRange] = useState<DateRange>('30_days');
  const [data, setData] = useState<AgentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<AgentAnalytics>(`/analytics/agents?date_range=${dateRange}`);
      setData(res.data);
    } catch (error) {
      console.error('Error loading agent analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  // AOV data derived from agents
  const aovData = useMemo(() =>
    (data?.agents ?? []).map((a) => ({
      name: a.name,
      revenue: a.revenue,
      orders: a.orderCount,
    })),
    [data?.agents],
  );

  // Ranked table data
  const byOrders = useMemo<RankedAgent[]>(() =>
    (data?.agents ?? [])
      .sort((a, b) => b.orderCount - a.orderCount)
      .map((a, i) => ({ rank: i + 1, name: a.name, value: a.orderCount.toLocaleString('en-GB') })),
    [data?.agents],
  );

  const byRevenue = useMemo<RankedAgent[]>(() =>
    (data?.agents ?? [])
      .sort((a, b) => b.revenue - a.revenue)
      .map((a, i) => ({ rank: i + 1, name: a.name, value: formatGBP(a.revenue) })),
    [data?.agents],
  );

  const byCustomers = useMemo<RankedAgent[]>(() =>
    (data?.agents ?? [])
      .sort((a, b) => b.newCustomers - a.newCustomers)
      .map((a, i) => ({ rank: i + 1, name: a.name, value: a.newCustomers.toLocaleString('en-GB') })),
    [data?.agents],
  );

  const byCommission = useMemo<RankedAgent[]>(() =>
    (data?.agents ?? [])
      .sort((a, b) => b.commission - a.commission)
      .map((a, i) => ({
        rank: i + 1,
        name: a.name,
        value: `${formatGBP(a.commission)} (${(a.commissionRate * 100).toFixed(0)}%)`,
      })),
    [data?.agents],
  );

  // Column defs for ranked tables
  const rankedColumns = useMemo<ColumnDef<RankedAgent>[]>(() => [
    {
      accessorKey: 'rank',
      header: '#',
      size: 40,
      cell: ({ row }) => (
        <span className="text-muted-foreground tabular-nums">{row.original.rank}</span>
      ),
    },
    { accessorKey: 'name', header: 'Agent', size: 160 },
    {
      accessorKey: 'value',
      header: 'Value',
      size: 120,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">{row.original.value}</span>
      ),
    },
  ], []);

  // Loading skeleton
  if (loading && !data) {
    return (
      <div className="p-6">
        <div className="h-8 w-56 bg-muted/50 rounded-lg animate-pulse mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header + date filter */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="mb-6"
      >
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Agent Performance</h1>
          <div className="flex items-center gap-0.5 bg-muted/40 border border-border/60 rounded-lg p-0.5">
            {DATE_RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setDateRange(option.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                  dateRange === option.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <motion.div className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0 }}>
          <AgentOrdersPieChart
            data={data?.ordersByAgentChart ?? []}
            title="Orders by Agent"
          />
        </motion.div>

        <motion.div className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.05 }}>
          <AgentRevenueRadialChart
            data={data?.revenueByAgentChart ?? []}
            title="Revenue by Agent"
          />
        </motion.div>

        <motion.div className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.1 }}>
          <AgentAOVChart
            data={aovData}
            title="Avg Order Value"
          />
        </motion.div>

        <motion.div className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.15 }}>
          <MonthlyTrendChart
            data={data?.activityChart ?? []}
            title="Order Trend"
          />
        </motion.div>
      </div>

      {/* Summary Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.2 }}>
          <SplitfinTable
            title="By Order Count"
            columns={rankedColumns}
            data={byOrders}
            emptyState={{
              icon: <Users size={32} />,
              title: 'No agent data',
              description: 'Agent orders will appear here',
            }}
          />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.25 }}>
          <SplitfinTable
            title="By Revenue"
            columns={rankedColumns}
            data={byRevenue}
            emptyState={{
              icon: <Users size={32} />,
              title: 'No agent data',
              description: 'Agent revenue will appear here',
            }}
          />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.3 }}>
          <SplitfinTable
            title="By New Customers"
            columns={rankedColumns}
            data={byCustomers}
            emptyState={{
              icon: <Users size={32} />,
              title: 'No agent data',
              description: 'Agent customer data will appear here',
            }}
          />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.35 }}>
          <SplitfinTable
            title="By Commission"
            columns={rankedColumns}
            data={byCommission}
            emptyState={{
              icon: <Users size={32} />,
              title: 'No agent data',
              description: 'Agent commission data will appear here',
            }}
          />
        </motion.div>
      </div>
    </div>
  );
};

export default AgentManagement;
