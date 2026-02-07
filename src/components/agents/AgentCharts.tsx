import React, { useState, useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart,
  RadialBar, RadialBarChart, XAxis, YAxis,
} from 'recharts';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  ChartConfig, ChartContainer, ChartTooltip,
} from '@/components/ui/chart';

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const CHART_COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)',
  'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)',
  'var(--chart-7)', 'var(--chart-8)',
] as const;

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);

// Custom tooltip that reads agent name from the data payload directly,
// bypassing the shadcn nameKey lookup bug where item.name (= dataKey)
// shadows payload.name (= actual data field).
function AgentTooltip({ active, payload, formatValue }: {
  active?: boolean;
  payload?: Array<{ value: number; payload: Record<string, unknown> }>;
  formatValue?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const fmt = formatValue ?? ((v: number) => v.toLocaleString());
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <div className="grid gap-1">
        {payload.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ background: (item.payload.fill as string) || CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="text-muted-foreground">{item.payload.name as string}</span>
            </div>
            <span className="font-mono font-medium tabular-nums text-foreground">
              {fmt(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Agent Orders — Donut Pie Chart
// ---------------------------------------------------------------------------

interface AgentOrdersPieChartProps {
  data: { name: string; value: number }[];
  title?: string;
}

export function AgentOrdersPieChart({
  data,
  title = 'Orders by Agent',
}: AgentOrdersPieChartProps) {
  const chartData = useMemo(
    () => data
      .filter(d => d.value > 0)
      .map((d, i) => ({ ...d, fill: CHART_COLORS[i % CHART_COLORS.length] })),
    [data],
  );

  const total = useMemo(() => chartData.reduce((s, d) => s + d.value, 0), [chartData]);

  const chartConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {};
    chartData.forEach((d) => { cfg[d.name] = { label: d.name, color: d.fill }; });
    return cfg;
  }, [chartData]);

  return (
    <Card className="py-4 gap-3 h-full">
      <CardHeader className="px-4 pb-0 gap-1">
        <CardDescription className="text-[11px] uppercase tracking-wider font-medium">{title}</CardDescription>
        <CardTitle className="text-xl tabular-nums">{total.toLocaleString('en-GB')}</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-0 mt-auto">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[160px]">
          <PieChart>
            <ChartTooltip content={<AgentTooltip />} />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={28}
              outerRadius={65}
              paddingAngle={2}
              cornerRadius={4}
            >
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Agent Revenue — Glowing Radial Chart
// ---------------------------------------------------------------------------

interface AgentRevenueRadialChartProps {
  data: { name: string; value: number }[];
  title?: string;
}

export function AgentRevenueRadialChart({
  data,
  title = 'Revenue by Agent',
}: AgentRevenueRadialChartProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const chartData = useMemo(
    () => data.map((d, i) => ({
      name: d.name,
      value: d.value,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    })),
    [data],
  );

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  const chartConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {};
    chartData.forEach((d) => { cfg[d.name] = { label: d.name, color: d.fill }; });
    return cfg;
  }, [chartData]);

  return (
    <Card className="py-4 gap-3 h-full">
      <CardHeader className="px-4 pb-0 gap-1">
        <CardDescription className="text-[11px] uppercase tracking-wider font-medium">{title}</CardDescription>
        <CardTitle className="text-xl tabular-nums">{formatGBP(total)}</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-0 mt-auto flex items-center justify-center">
        <ChartContainer config={chartConfig} className="h-28 w-full max-w-[200px]">
          <RadialBarChart
            data={chartData}
            innerRadius={24}
            outerRadius={56}
            onMouseMove={(state) => {
              if (state?.activePayload?.[0]) {
                setActiveKey(state.activePayload[0].payload.name);
              }
            }}
            onMouseLeave={() => setActiveKey(null)}
          >
            <ChartTooltip cursor={false} content={<AgentTooltip formatValue={formatGBP} />} />
            <RadialBar cornerRadius={8} dataKey="value" background className="drop-shadow-lg">
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.fill}
                  filter={activeKey === entry.name ? `url(#agent-rev-glow-${i})` : undefined}
                  opacity={activeKey === null || activeKey === entry.name ? 1 : 0.3}
                />
              ))}
            </RadialBar>
            <defs>
              {chartData.map((_, i) => (
                <filter key={i} id={`agent-rev-glow-${i}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              ))}
            </defs>
          </RadialBarChart>
        </ChartContainer>
        {/* Legend */}
        <div className="flex flex-col gap-1 pr-4">
          {chartData.filter(d => d.value > 0).map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-[11px]">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
              <span className="text-muted-foreground truncate max-w-[80px]">{d.name}</span>
              <span className="font-medium text-foreground tabular-nums ml-auto">{formatGBP(d.value)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Average Order Value — Horizontal Bar Chart per Agent
// ---------------------------------------------------------------------------

interface AgentAOVChartProps {
  data: { name: string; revenue: number; orders: number }[];
  title?: string;
}

export function AgentAOVChart({
  data,
  title = 'Avg Order Value',
}: AgentAOVChartProps) {
  const chartData = useMemo(
    () => data
      .filter(d => d.orders > 0)
      .map((d, i) => ({
        name: d.name,
        aov: Math.round(d.revenue / d.orders),
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }))
      .sort((a, b) => b.aov - a.aov),
    [data],
  );

  const overallAOV = useMemo(() => {
    const totRev = data.reduce((s, d) => s + d.revenue, 0);
    const totOrd = data.reduce((s, d) => s + d.orders, 0);
    return totOrd > 0 ? Math.round(totRev / totOrd) : 0;
  }, [data]);

  const chartConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {};
    chartData.forEach((d) => { cfg[d.name] = { label: d.name, color: d.fill }; });
    return cfg;
  }, [chartData]);

  return (
    <Card className="py-4 gap-3 h-full">
      <CardHeader className="px-4 pb-0 gap-1">
        <CardDescription className="text-[11px] uppercase tracking-wider font-medium">{title}</CardDescription>
        <CardTitle className="text-xl tabular-nums">
          {formatGBP(overallAOV)} <span className="text-sm font-normal text-muted-foreground">avg</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-0 mt-auto">
        <ChartContainer config={chartConfig} className="h-28 w-full">
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            margin={{ left: 4, right: 4, top: 4, bottom: 0 }}
          >
            <YAxis
              dataKey="name"
              type="category"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => (typeof v === 'string' && v.length > 10 ? v.split(' ')[0] : v)}
              width={56}
            />
            <XAxis type="number" hide />
            <ChartTooltip content={<AgentTooltip formatValue={formatGBP} />} />
            <Bar dataKey="aov" radius={3}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Monthly Order Trend — Area Chart
// ---------------------------------------------------------------------------

interface MonthlyTrendChartProps {
  /** Time-bucketed rows with a `name` key (period label) and agent-name keys (order counts) */
  data: Record<string, unknown>[];
  title?: string;
}

export function MonthlyTrendChart({
  data,
  title = 'Order Trend',
}: MonthlyTrendChartProps) {
  // Collapse multi-agent rows into a single total per period
  const chartData = useMemo(() => {
    return data.map((row) => {
      let total = 0;
      for (const [key, val] of Object.entries(row)) {
        if (key !== 'name' && typeof val === 'number') total += val;
      }
      return { name: row.name as string, total };
    });
  }, [data]);

  const totalOrders = useMemo(
    () => chartData.reduce((s, d) => s + d.total, 0),
    [chartData],
  );

  const chartConfig = useMemo<ChartConfig>(
    () => ({ total: { label: 'Orders', color: CHART_COLORS[0] } }),
    [],
  );

  return (
    <Card className="py-4 gap-3 h-full">
      <CardHeader className="px-4 pb-0 gap-1">
        <CardDescription className="text-[11px] uppercase tracking-wider font-medium">{title}</CardDescription>
        <CardTitle className="text-xl tabular-nums">
          {totalOrders.toLocaleString('en-GB')} <span className="text-sm font-normal text-muted-foreground">orders</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-0 mt-auto">
        <ChartContainer config={chartConfig} className="h-28 w-full">
          <AreaChart
            accessibilityLayer
            data={chartData}
            margin={{ left: 4, right: 4, top: 4, bottom: 0 }}
          >
            <defs>
              <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tick={{ fontSize: 10 }}
            />
            <ChartTooltip
              content={<AgentTooltip />}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#trend-fill)"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: 'var(--chart-1)' }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
