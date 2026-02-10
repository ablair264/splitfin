import { useEffect, useState, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, RadialBar, RadialBarChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { reportService } from '@/services/reportService';
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
            <span className="text-muted-foreground">{item.payload?.segment || item.payload?.name || item.name}</span>
          </div>
          <span className="font-mono font-medium tabular-nums text-foreground">{formatGBP(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

function RadialTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: Record<string, unknown> }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <div className="grid gap-1">
        {payload.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ background: (item.payload.fill as string) || 'var(--chart-1)' }}
              />
              <span className="text-muted-foreground">{item.payload.name as string}</span>
            </div>
            <span className="font-mono font-medium tabular-nums text-foreground">
              {item.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: Record<string, unknown> }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <div className="grid gap-1">
        {payload.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ background: (item.payload.fill as string) || 'var(--chart-2)' }}
              />
              <span className="text-muted-foreground">{item.payload.name as string}</span>
            </div>
            <span className="font-mono font-medium tabular-nums text-foreground">
              {formatGBP(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CustomerInsights({ dateRange }: { dateRange: ReportDateRange }) {
  const [data, setData] = useState<CustomerInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activeBarIndex, setActiveBarIndex] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportService.customerInsights(dateRange).then(result => {
      if (!cancelled) { setData(result); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateRange]);

  // All useMemo hooks MUST run before early returns (React rules of hooks)
  const segmentConfig = useMemo<ChartConfig>(() => {
    if (!data) return { total_revenue: { label: 'Revenue' } };
    const cfg: ChartConfig = { total_revenue: { label: 'Revenue' } };
    data.segments.forEach((s, i) => {
      cfg[s.segment] = { label: s.segment, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] };
    });
    return cfg;
  }, [data]);

  const segmentRadialData = useMemo(() => {
    if (!data) return [];
    return data.segments.slice(0, 5).map((s, i) => ({
      name: s.segment,
      value: s.customer_count,
      fill: BAR_COLORS[i % BAR_COLORS.length],
    }));
  }, [data]);

  const segmentRadialConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = { value: { label: 'Customers' } };
    segmentRadialData.forEach((d) => {
      cfg[d.name] = { label: d.name, color: d.fill };
    });
    return cfg;
  }, [segmentRadialData]);

  const regionChartData = useMemo(() => {
    if (!data) return [];
    return data.regions
      .map(r => ({
        name: r.region.length > 8 ? r.region.slice(0, 8) : r.region,
        fullName: r.region,
        value: Math.round(r.revenue / Math.max(r.customer_count, 1)),
        fill: BAR_COLORS[0],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
      .map((d, i) => ({ ...d, fill: BAR_COLORS[i % BAR_COLORS.length] }));
  }, [data]);

  const regionBarConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = { value: { label: 'Avg Revenue', color: 'var(--chart-2)' } };
    regionChartData.forEach((d) => {
      cfg[d.name] = { label: d.fullName, color: d.fill };
    });
    return cfg;
  }, [regionChartData]);

  const totalCustomers = useMemo(() => {
    if (!data) return 0;
    return data.segments.reduce((sum, s) => sum + s.customer_count, 0);
  }, [data]);

  const totalRevenue = useMemo(() => {
    if (!data) return 0;
    return data.segments.reduce((sum, s) => sum + s.total_revenue, 0);
  }, [data]);

  const avgRevenue = useMemo(() => {
    return totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
  }, [totalCustomers, totalRevenue]);

  if (loading) return <Skeleton />;
  if (!data) return <p className="text-muted-foreground p-4">Failed to load report data.</p>;

  const { segments, regions, top_customers } = data;

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Card 1: Active Customers -- GlowingRadial-style */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Active Customers</CardDescription>
            <CardTitle className="text-xl tabular-nums">{totalCustomers.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto flex items-center justify-center">
            <ChartContainer config={segmentRadialConfig} className="h-28 w-full max-w-[200px]">
              <RadialBarChart
                data={segmentRadialData}
                innerRadius={20}
                outerRadius={52}
                onMouseMove={(state) => {
                  if (state?.activePayload?.[0]) {
                    setActiveKey(state.activePayload[0].payload.name);
                  }
                }}
                onMouseLeave={() => setActiveKey(null)}
              >
                <ChartTooltip cursor={false} content={<RadialTooltip />} />
                <RadialBar cornerRadius={8} dataKey="value" background className="drop-shadow-lg">
                  {segmentRadialData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.fill}
                      filter={activeKey === entry.name ? `url(#segment-glow-${i})` : undefined}
                      opacity={activeKey === null || activeKey === entry.name ? 1 : 0.3}
                    />
                  ))}
                </RadialBar>
                <defs>
                  {segmentRadialData.map((_, i) => (
                    <filter key={i} id={`segment-glow-${i}`} x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="6" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  ))}
                </defs>
              </RadialBarChart>
            </ChartContainer>
            {/* Legend */}
            <div className="flex flex-col gap-1 pr-4">
              {segmentRadialData.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-[11px]">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="font-medium text-foreground tabular-nums ml-auto">{d.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Avg Revenue / Customer -- ValueLineBar-style */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Avg Revenue / Customer</CardDescription>
            <CardTitle className="text-xl tabular-nums">{formatGBP(avgRevenue)}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto">
            <ChartContainer config={regionBarConfig} className="h-28 w-full">
              <BarChart
                accessibilityLayer
                data={regionChartData}
                onMouseLeave={() => setActiveBarIndex(undefined)}
                margin={{ left: 4, right: 4, top: 4, bottom: 0 }}
              >
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  tick={{ fontSize: 10 }}
                />
                <ChartTooltip cursor={false} content={<BarTooltip />} />
                <Bar dataKey="value" radius={3}>
                  {regionChartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.fill}
                      className="duration-200"
                      opacity={activeBarIndex === undefined || activeBarIndex === i ? 1 : 0.2}
                      onMouseEnter={() => setActiveBarIndex(i)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
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
        {[...Array(2)].map((_, i) => <div key={i} className="h-[180px] rounded-lg bg-muted/50" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-[240px] rounded-lg bg-muted/50" />
        <div className="h-[240px] rounded-lg bg-muted/50" />
      </div>
      <div className="h-[200px] rounded-lg bg-muted/50" />
    </div>
  );
}
