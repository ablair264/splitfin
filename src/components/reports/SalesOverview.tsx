import { useEffect, useState, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { RevenueChart, OrdersChart } from '../dashboard/DashboardCharts';
import { reportService } from '@/services/reportService';
import type { ReportDateRange, SalesOverviewData } from '@/types/domain';

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const trendConfig = {
  revenue: { label: 'Revenue', color: 'var(--chart-1)' },
} satisfies ChartConfig;

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      {label && <p className="font-medium mb-1">{label}</p>}
      <p className="font-mono font-medium tabular-nums text-foreground">{formatGBP(payload[0].value)}</p>
    </div>
  );
}

export default function SalesOverview({ dateRange }: { dateRange: ReportDateRange }) {
  const [data, setData] = useState<SalesOverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportService.salesOverview(dateRange).then(result => {
      if (!cancelled) { setData(result); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateRange]);

  if (loading) return <Skeleton />;
  if (!data) return <p className="text-muted-foreground p-4">Failed to load report data.</p>;

  const { summary, monthly_trend, top_products } = data;

  const revenueData = useMemo(() =>
    monthly_trend.map(m => ({ name: m.month, value: m.revenue })), [monthly_trend]);
  const ordersData = useMemo(() =>
    monthly_trend.map(m => ({ name: m.month, value: m.order_count })), [monthly_trend]);

  return (
    <div className="space-y-6 mt-4">
      {/* Metric Cards — first two use Evil Charts sparklines */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <RevenueChart data={revenueData} total={summary.total_revenue} />
        <OrdersChart data={ordersData} total={summary.total_orders} />
        <Card className="py-4 gap-3 h-full">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Avg Order Value</CardDescription>
            <CardTitle className="text-xl tabular-nums">{formatGBP(summary.avg_order_value)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="py-4 gap-3 h-full">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Unique Customers</CardDescription>
            <CardTitle className="text-xl tabular-nums">{summary.unique_customers.toLocaleString('en-GB')}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Revenue Trend — ChartContainer with gradient area */}
      {monthly_trend.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Monthly Revenue Trend</h3>
            <ChartContainer config={trendConfig} className="h-[280px] w-full">
              <AreaChart data={monthly_trend}>
                <defs>
                  <linearGradient id="salesTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <ChartTooltip cursor={false} content={<TrendTooltip />} />
                <Area type="monotone" dataKey="revenue" stroke="var(--color-revenue)" fill="url(#salesTrendGrad)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Products Table */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Top Products by Revenue</h3>
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
                    <td className="py-2 text-right tabular-nums">{p.units_sold.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{formatGBP(p.revenue)}</td>
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

function Skeleton() {
  return (
    <div className="space-y-6 mt-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-[180px] rounded-xl bg-muted/50" />)}
      </div>
      <div className="h-[320px] rounded-xl bg-muted/50" />
      <div className="h-[300px] rounded-xl bg-muted/50" />
    </div>
  );
}
