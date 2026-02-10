import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { type ColumnDef } from '@tanstack/react-table';
import { Users, Download, FileSpreadsheet } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiClient } from '@/api/client';
import { reportService } from '@/services/reportService';
import { Card, CardContent } from '@/components/ui/card';
import SplitfinTable from '@/components/shared/SplitfinTable';
import type { AgentCommissionData } from '@/types/domain';
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

type DateRange = '7_days' | '30_days' | '90_days' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'all_time';

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '7_days', label: '7 Days' },
  { value: '30_days', label: '30 Days' },
  { value: '90_days', label: '90 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
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
  const [commissionData, setCommissionData] = useState<AgentCommissionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [analyticsRes, commissionRes] = await Promise.all([
        apiClient.get<AgentAnalytics>(`/analytics/agents?date_range=${dateRange}`),
        reportService.agentCommission(dateRange),
      ]);
      setData(analyticsRes.data);
      setCommissionData(commissionRes);
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
        <div className="flex items-center justify-between gap-4">
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => reportService.exportFile('agent-commission', dateRange, 'csv')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />CSV
            </button>
            <button
              onClick={() => reportService.exportFile('agent-commission', dateRange, 'xlsx')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />Excel
            </button>
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

      {/* Commission Breakdown */}
      {commissionData && commissionData.agents.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut', delay: 0.4 }}
          className="mt-6"
        >
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Commission Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Agent</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Rate</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Orders</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Revenue</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Commission</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Customers</th>
                      <th className="pb-2 font-medium text-muted-foreground text-center w-28"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissionData.agents.map((a) => (
                      <tr key={a.id} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-4 font-medium">{a.name}</td>
                        <td className="py-2 text-right tabular-nums">{(a.commission_rate * 100).toFixed(1)}%</td>
                        <td className="py-2 text-right tabular-nums">{a.order_count.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums">{formatGBP(a.revenue)}</td>
                        <td className="py-2 text-right tabular-nums font-medium">{formatGBP(a.commission_earned)}</td>
                        <td className="py-2 text-right tabular-nums">{a.customer_count.toLocaleString()}</td>
                        <td className="py-2 text-center">
                          <button
                            onClick={() => reportService.exportFile('agent-commission', dateRange, 'xlsx', { agent_id: a.id })}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                          >
                            <Download className="h-3 w-3" />
                            Export
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border font-medium">
                      <td className="pt-3 pr-4">Total</td>
                      <td className="pt-3 text-right" />
                      <td className="pt-3 text-right tabular-nums">{commissionData.totals.total_orders.toLocaleString()}</td>
                      <td className="pt-3 text-right tabular-nums">{formatGBP(commissionData.totals.total_revenue)}</td>
                      <td className="pt-3 text-right tabular-nums">{formatGBP(commissionData.totals.total_commission)}</td>
                      <td className="pt-3 text-right" />
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
};

export default AgentManagement;
