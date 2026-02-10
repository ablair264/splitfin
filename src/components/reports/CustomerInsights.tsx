import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Users, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { reportService } from '@/services/reportService';
import type { ReportDateRange, CustomerInsightsData } from '@/types/domain';

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const SEGMENT_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function CustomerInsights({ dateRange }: { dateRange: ReportDateRange }) {
  const [data, setData] = useState<CustomerInsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportService.customerInsights(dateRange).then(result => {
      if (!cancelled) { setData(result); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateRange]);

  if (loading) return <Skeleton />;
  if (!data) return <p className="text-muted-foreground p-4">Failed to load report data.</p>;

  const { segments, regions, top_customers } = data;
  const totalCustomers = segments.reduce((sum, s) => sum + s.customer_count, 0);
  const totalRevenue = segments.reduce((sum, s) => sum + s.total_revenue, 0);
  const avgRevenue = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

  return (
    <div className="space-y-6 mt-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Active Customers" value={totalCustomers.toLocaleString()} icon={Users} color="blue" />
        <StatCard label="Avg Revenue / Customer" value={formatGBP(avgRevenue)} icon={TrendingUp} color="emerald" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Segment Pie Chart */}
        {segments.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Revenue by Segment</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={segments}
                    dataKey="total_revenue"
                    nameKey="segment"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                    label={({ segment, percent }) => `${segment} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {segments.map((_, i) => (
                      <Cell key={i} fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [formatGBP(value), 'Revenue']} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Region Bar Chart */}
        {regions.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Revenue by Region</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={regions.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="region" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} angle={-25} textAnchor="end" height={60} />
                  <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip formatter={(value: number) => [formatGBP(value), 'Revenue']} />
                  <Bar dataKey="revenue" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Top Customers Table */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Top Customers by Revenue</h3>
            <Button intent="outline" size="sm" onPress={() => reportService.exportCsv('customer-insights', dateRange)}>
              <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Company</th>
                  <th className="pb-2 font-medium text-muted-foreground">Region</th>
                  <th className="pb-2 font-medium text-muted-foreground">Segment</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Orders</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {top_customers.map((c, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-4 font-medium max-w-[200px] truncate">{c.company_name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{c.region}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{c.segment}</td>
                    <td className="py-2 text-right tabular-nums">{c.order_count.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{formatGBP(c.revenue)}</td>
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
  };
  const cls = colorMap[color] || 'border-zinc-500/20 text-zinc-400';
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

function Skeleton() {
  return (
    <div className="space-y-6 mt-4 animate-pulse">
      <div className="grid grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted/50" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-[290px] rounded-lg bg-muted/50" />
        <div className="h-[290px] rounded-lg bg-muted/50" />
      </div>
      <div className="h-[300px] rounded-lg bg-muted/50" />
    </div>
  );
}
