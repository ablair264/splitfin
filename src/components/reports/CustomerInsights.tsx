import { useEffect, useState, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { reportService, type ReportFilters } from '@/services/reportService';
import type { ReportDateRange, CustomerInsightsData } from '@/types/domain';

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const SEGMENT_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
const BAR_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

const regionConfig = {
  revenue: { label: 'Revenue', color: 'var(--chart-4)' },
} satisfies ChartConfig;

function GBPTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      {label && <p className="font-medium mb-1">{label}</p>}
      {payload.map((item: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: item.color || item.payload?.fill || 'var(--chart-1)' }} />
            <span className="text-muted-foreground">{item.payload?.segment || item.name}</span>
          </div>
          <span className="font-mono font-medium tabular-nums text-foreground">{formatGBP(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function CustomerInsights({ dateRange, filters }: { dateRange: ReportDateRange; filters?: ReportFilters }) {
  const [data, setData] = useState<CustomerInsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportService.customerInsights(dateRange, filters).then(result => {
      if (!cancelled) { setData(result); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateRange, filters?.region]);

  // Hooks MUST run before early returns (React rules of hooks)
  const segmentConfig = useMemo<ChartConfig>(() => {
    if (!data) return { total_revenue: { label: 'Revenue' } };
    const cfg: ChartConfig = { total_revenue: { label: 'Revenue' } };
    data.segments.forEach((s, i) => {
      cfg[s.segment] = { label: s.segment, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] };
    });
    return cfg;
  }, [data]);

  if (loading) return <Skeleton />;
  if (!data) return <p className="text-muted-foreground p-4">Failed to load report data.</p>;

  const { segments, regions, top_customers } = data;
  const totalCustomers = segments.reduce((sum, s) => sum + s.customer_count, 0);
  const totalRevenue = segments.reduce((sum, s) => sum + s.total_revenue, 0);
  const avgRevenue = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Active Customers</CardDescription>
            <CardTitle className="text-xl tabular-nums">{totalCustomers.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Avg Revenue / Customer</CardDescription>
            <CardTitle className="text-xl tabular-nums">{formatGBP(avgRevenue)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {segments.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Revenue by Segment</h3>
              <ChartContainer config={segmentConfig} className="h-[200px] w-full">
                <PieChart>
                  <Pie
                    data={segments}
                    dataKey="total_revenue"
                    nameKey="segment"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={75}
                    paddingAngle={2}
                    label={({ segment, percent }) => `${segment} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {segments.map((_, i) => (
                      <Cell key={i} fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip cursor={false} content={<GBPTooltip />} />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {regions.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Revenue by Region</h3>
              <ChartContainer config={regionConfig} className="h-[200px] w-full">
                <BarChart data={regions.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="region" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={50} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <ChartTooltip cursor={false} content={<GBPTooltip />} />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                    {regions.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Top Customers by Revenue</h3>
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

function Skeleton() {
  return (
    <div className="space-y-4 mt-4 animate-pulse">
      <div className="grid grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted/50" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-[240px] rounded-lg bg-muted/50" />
        <div className="h-[240px] rounded-lg bg-muted/50" />
      </div>
      <div className="h-[200px] rounded-lg bg-muted/50" />
    </div>
  );
}
