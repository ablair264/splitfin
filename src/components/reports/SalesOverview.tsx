import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Download, DollarSign, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { reportService } from '@/services/reportService';
import type { ReportDateRange, SalesOverviewData } from '@/types/domain';

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

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

  if (loading) return <ReportSkeleton />;
  if (!data) return <p className="text-muted-foreground p-4">Failed to load report data.</p>;

  const { summary, monthly_trend, top_products } = data;

  return (
    <div className="space-y-6 mt-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={formatGBP(summary.total_revenue)} icon={DollarSign} color="emerald" />
        <StatCard label="Total Orders" value={summary.total_orders.toLocaleString()} icon={ShoppingCart} color="blue" />
        <StatCard label="Avg Order Value" value={formatGBP(summary.avg_order_value)} icon={TrendingUp} color="purple" />
        <StatCard label="Unique Customers" value={summary.unique_customers.toLocaleString()} icon={Users} color="amber" />
      </div>

      {/* Revenue Trend Chart */}
      {monthly_trend.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Monthly Revenue Trend</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={monthly_trend}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip formatter={(value: number) => [formatGBP(value), 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" fill="url(#revenueGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Products Table */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Top Products by Revenue</h3>
            <Button intent="outline" size="sm" onPress={() => reportService.exportCsv('sales-overview', dateRange)}>
              <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
            </Button>
          </div>
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

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'border-emerald-500/20 text-emerald-400',
    blue: 'border-blue-500/20 text-blue-400',
    purple: 'border-purple-500/20 text-purple-400',
    amber: 'border-amber-500/20 text-amber-400',
    red: 'border-red-500/20 text-red-400',
    zinc: 'border-zinc-500/20 text-zinc-400',
  };
  const cls = colorMap[color] || colorMap.zinc;
  const [borderCls, iconCls] = cls.split(' ');

  return (
    <Card className={borderCls}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
        </div>
        <Icon className={`h-5 w-5 ${iconCls}`} />
      </CardContent>
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6 mt-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-muted/50" />
        ))}
      </div>
      <div className="h-[320px] rounded-lg bg-muted/50" />
      <div className="h-[300px] rounded-lg bg-muted/50" />
    </div>
  );
}
