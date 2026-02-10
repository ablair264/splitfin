import { useEffect, useState, useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  RadialBar, RadialBarChart, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { reportService } from '@/services/reportService';
import type { ReportDateRange, AgentCommissionData } from '@/types/domain';

// ---------------------------------------------------------------------------
// Constants & formatters
// ---------------------------------------------------------------------------

const BAR_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

// ---------------------------------------------------------------------------
// Chart configs
// ---------------------------------------------------------------------------

const ordersConfig = { value: { label: 'Orders', color: 'var(--chart-2)' } } satisfies ChartConfig;
const revenueAreaConfig = { value: { label: 'Revenue', color: 'var(--chart-1)' } } satisfies ChartConfig;
const avgConfig = { value: { label: 'Avg Value', color: 'var(--chart-3)' } } satisfies ChartConfig;

const revenueBarConfig = {
  revenue: { label: 'Revenue', color: 'var(--chart-2)' },
} satisfies ChartConfig;

// ---------------------------------------------------------------------------
// Tooltips
// ---------------------------------------------------------------------------

function GBPTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium mb-1">{item.payload?.name}</p>
      <p className="font-mono font-medium tabular-nums text-foreground">{formatGBP(item.value)}</p>
    </div>
  );
}

function CountTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium mb-1">{item.payload?.name}</p>
      <p className="font-mono font-medium tabular-nums text-foreground">{item.value.toLocaleString()}</p>
    </div>
  );
}

function RadialTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <div className="flex items-center gap-2">
        <div
          className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
          style={{ background: (item.payload.fill as string) || 'var(--chart-1)' }}
        />
        <span className="text-muted-foreground">{item.payload.name as string}</span>
        <span className="font-mono font-medium tabular-nums text-foreground ml-auto">
          {formatGBP(item.value)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AgentOverview({ dateRange }: { dateRange: ReportDateRange }) {
  const [data, setData] = useState<AgentCommissionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportService.agentCommission(dateRange).then(result => {
      if (!cancelled) { setData(result); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateRange]);

  // Derive chart data (all useMemo BEFORE any early returns)
  const agents = data?.agents ?? [];
  const totals = data?.totals ?? { total_revenue: 0, total_commission: 0, total_orders: 0 };
  const avgRevenue = agents.length > 0 ? totals.total_revenue / agents.length : 0;

  const ordersChartData = useMemo(
    () => agents.slice(0, 8).map(a => ({ name: a.name.split(' ')[0], value: a.order_count })),
    [agents],
  );

  const revenueChartData = useMemo(
    () => [...agents].sort((a, b) => a.revenue - b.revenue).slice(-8).map(a => ({ name: a.name.split(' ')[0], value: a.revenue })),
    [agents],
  );

  const commissionRadialData = useMemo(() => {
    const filtered = agents
      .filter(a => a.commission_earned > 0)
      .sort((a, b) => b.commission_earned - a.commission_earned)
      .slice(0, 5);
    return filtered.map((a, i) => ({
      name: a.name.split(' ')[0],
      value: a.commission_earned,
      fill: BAR_COLORS[i % BAR_COLORS.length],
    }));
  }, [agents]);

  const commissionRadialConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = { value: { label: 'Commission' } };
    commissionRadialData.forEach(d => {
      cfg[d.name] = { label: d.name, color: d.fill };
    });
    return cfg;
  }, [commissionRadialData]);

  const avgChartData = useMemo(
    () => agents.slice(0, 8).map(a => ({ name: a.name.split(' ')[0], value: Math.round(a.avg_order_value) })),
    [agents],
  );

  if (loading) return <Skeleton />;
  if (!data) return <p className="text-muted-foreground p-4">Failed to load report data.</p>;

  return (
    <div className="space-y-4 mt-4">
      {/* Metric Cards with embedded charts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Agents — Bar chart of order counts */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Active Agents</CardDescription>
            <CardTitle className="text-xl tabular-nums">{agents.length}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto">
            <ChartContainer config={ordersConfig} className="h-28 w-full">
              <BarChart
                accessibilityLayer
                data={ordersChartData}
                margin={{ left: 4, right: 4, top: 4, bottom: 0 }}
              >
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  tick={{ fontSize: 10 }}
                />
                <ChartTooltip cursor={false} content={<CountTooltip />} />
                <Bar dataKey="value" radius={3}>
                  {ordersChartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Card 2: Combined Revenue — Area chart */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Combined Revenue</CardDescription>
            <CardTitle className="text-xl tabular-nums">{formatGBP(totals.total_revenue)}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto">
            <ChartContainer config={revenueAreaConfig} className="h-28 w-full">
              <AreaChart
                accessibilityLayer
                data={revenueChartData}
                margin={{ left: 0, right: 0, top: 4, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  horizontalCoordinatesGenerator={({ height }) => [0, height - 20]}
                />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  tick={{ fontSize: 10 }}
                />
                <ChartTooltip cursor={false} content={<GBPTooltip />} />
                <Area
                  dataKey="value"
                  type="monotone"
                  fill="url(#agent-rev-grad)"
                  fillOpacity={0.4}
                  stroke="var(--chart-1)"
                  strokeWidth={1.5}
                />
                <defs>
                  <linearGradient id="agent-rev-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Card 3: Total Commission — Radial bar chart */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Total Commission</CardDescription>
            <CardTitle className="text-xl tabular-nums">{formatGBP(totals.total_commission)}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto flex items-center justify-center">
            <ChartContainer config={commissionRadialConfig} className="h-28 w-full max-w-[200px]">
              <RadialBarChart
                data={commissionRadialData}
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
                  {commissionRadialData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.fill}
                      filter={activeKey === entry.name ? `url(#commission-glow-${i})` : undefined}
                      opacity={activeKey === null || activeKey === entry.name ? 1 : 0.3}
                    />
                  ))}
                </RadialBar>
                <defs>
                  {commissionRadialData.map((_, i) => (
                    <filter key={i} id={`commission-glow-${i}`} x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="6" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  ))}
                </defs>
              </RadialBarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Card 4: Avg Revenue / Agent — Bar chart of avg order values */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Avg Revenue / Agent</CardDescription>
            <CardTitle className="text-xl tabular-nums">{formatGBP(avgRevenue)}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto">
            <ChartContainer config={avgConfig} className="h-28 w-full">
              <BarChart
                accessibilityLayer
                data={avgChartData}
                margin={{ left: 4, right: 4, top: 4, bottom: 0 }}
              >
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  tick={{ fontSize: 10 }}
                />
                <ChartTooltip cursor={false} content={<GBPTooltip />} />
                <Bar dataKey="value" radius={3}>
                  {avgChartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[(i + 2) % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Revenue by Agent Chart */}
      {agents.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Revenue by Agent</h3>
            <ChartContainer config={revenueBarConfig} className="w-full" style={{ height: Math.min(260, Math.max(150, agents.length * 36)) }}>
              <BarChart data={agents} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                <ChartTooltip cursor={false} content={<GBPTooltip />} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  {agents.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Commission Breakdown Table */}
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
                {agents.map((a) => (
                  <tr key={a.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-4 font-medium">{a.name}</td>
                    <td className="py-2 text-right tabular-nums">{(a.commission_rate * 100).toFixed(1)}%</td>
                    <td className="py-2 text-right tabular-nums">{a.order_count.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">{formatGBP(a.revenue)}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{formatGBP(a.commission_earned)}</td>
                    <td className="py-2 text-right tabular-nums">{a.customer_count.toLocaleString()}</td>
                    <td className="py-2 text-center">
                      <Button
                        intent="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onPress={async () => {
                          try {
                            await reportService.exportFile('agent-commission', dateRange, 'xlsx', { agent_id: a.id });
                          } catch (err) {
                            console.error('Export failed:', err);
                          }
                        }}
                      >
                        <Download className="h-3 w-3" />
                        Export
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-medium">
                  <td className="pt-3 pr-4">Total</td>
                  <td className="pt-3 text-right" />
                  <td className="pt-3 text-right tabular-nums">{totals.total_orders.toLocaleString()}</td>
                  <td className="pt-3 text-right tabular-nums">{formatGBP(totals.total_revenue)}</td>
                  <td className="pt-3 text-right tabular-nums">{formatGBP(totals.total_commission)}</td>
                  <td className="pt-3 text-right" />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <div className="space-y-4 mt-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-[180px] rounded-lg bg-muted/50" />)}
      </div>
      <div className="h-[200px] rounded-lg bg-muted/50" />
      <div className="h-[200px] rounded-lg bg-muted/50" />
    </div>
  );
}
