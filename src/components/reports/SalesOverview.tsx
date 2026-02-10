import { useEffect, useState } from 'react';
import {
  Area, AreaChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import {
  Card, CardDescription, CardHeader, CardTitle, CardContent,
} from '@/components/ui/card';
import { reportService } from '@/services/reportService';
import type { ReportFilters } from '@/services/reportService';
import type { ReportDateRange, SalesOverviewData } from '@/types/domain';

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

interface SalesOverviewProps {
  dateRange: ReportDateRange;
  filters?: ReportFilters;
}

export default function SalesOverview({ dateRange, filters }: SalesOverviewProps) {
  const [data, setData] = useState<SalesOverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportService
      .salesOverview(dateRange, filters)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateRange, filters]);

  if (loading) return <ReportSkeleton />;
  if (!data) return <p className="text-muted-foreground p-4">Failed to load report data.</p>;

  const { summary, monthly_trend, top_products } = data;

  return (
    <div className="space-y-6 mt-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">
              Revenue
            </CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {formatGBP(summary.total_revenue)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">
              Orders
            </CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {summary.total_orders.toLocaleString('en-GB')}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">
              Avg Order Value
            </CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {formatGBP(summary.avg_order_value)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">
              Unique Customers
            </CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {summary.unique_customers.toLocaleString('en-GB')}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Revenue Trend Chart */}
      {monthly_trend.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              Monthly Revenue Trend
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={monthly_trend}>
                <defs>
                  <linearGradient id="salesRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatCompact(v)}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value: number) => [formatGBP(value), 'Revenue']}
                  contentStyle={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--chart-1)"
                  fill="url(#salesRevenueGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Products Table */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">
            Top Products by Revenue
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Product</th>
                  <th className="pb-2 font-medium text-muted-foreground">SKU</th>
                  <th className="pb-2 font-medium text-muted-foreground">Brand</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Units Sold</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {top_products.map((p, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-4 max-w-[200px] truncate">{p.name}</td>
                    <td className="py-2 pr-4 text-muted-foreground font-mono text-xs">{p.sku}</td>
                    <td className="py-2 pr-4">{p.brand}</td>
                    <td className="py-2 text-right tabular-nums">
                      {p.units_sold.toLocaleString()}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {formatGBP(p.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6 mt-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted/50" />
        ))}
      </div>
      <div className="h-[320px] rounded-xl bg-muted/50" />
      <div className="h-[300px] rounded-xl bg-muted/50" />
    </div>
  );
}
