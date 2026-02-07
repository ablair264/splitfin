import React, { useState, useMemo } from 'react';
import {
  Bar, BarChart, Cell, Pie, PieChart,
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
  'var(--chart-4)', 'var(--chart-5)',
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

// Multi-series tooltip for bar charts where each Bar has dataKey = agent name
function MultiBarTooltip({ active, payload, label, formatValue }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; fill: string }>;
  label?: string;
  formatValue?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const fmt = formatValue ?? ((v: number) => v.toLocaleString());
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      {label && <div className="font-medium mb-1">{label}</div>}
      <div className="grid gap-1">
        {payload.filter(p => p.value > 0).map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ background: item.color || item.fill }}
              />
              <span className="text-muted-foreground">{item.name}</span>
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
// 3. Agent Activity — Grouped Bar Chart (orders per period per agent)
// ---------------------------------------------------------------------------

interface AgentActivityBarChartProps {
  data: Record<string, unknown>[];
  dataKeys: string[];
  title?: string;
}

export function AgentActivityBarChart({
  data,
  dataKeys,
  title = 'Agent Activity',
}: AgentActivityBarChartProps) {
  // Sum total orders across all agents & periods
  const totalOrders = useMemo(() => {
    let sum = 0;
    for (const row of data) {
      for (const key of dataKeys) {
        sum += (typeof row[key] === 'number' ? row[key] as number : 0);
      }
    }
    return sum;
  }, [data, dataKeys]);

  const chartConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {};
    dataKeys.forEach((key, i) => {
      cfg[key] = { label: key, color: CHART_COLORS[i % CHART_COLORS.length] };
    });
    return cfg;
  }, [dataKeys]);

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
          <BarChart
            accessibilityLayer
            data={data}
            margin={{ left: 4, right: 4, top: 4, bottom: 0 }}
          >
            <rect x="0" y="0" width="100%" height="85%" fill="url(#agent-activity-dots)" />
            <defs>
              <pattern id="agent-activity-dots" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                <circle className="dark:text-muted/40 text-muted" cx="2" cy="2" r="1" fill="currentColor" />
              </pattern>
            </defs>
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => (typeof v === 'string' ? v.slice(0, 3) : v)}
            />
            <ChartTooltip content={<MultiBarTooltip />} />
            {dataKeys.map((key, ki) => (
              <Bar key={key} dataKey={key} fill={CHART_COLORS[ki % CHART_COLORS.length]} radius={3} />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Brand Spread — Grouped Bar Chart (revenue per brand per agent)
// ---------------------------------------------------------------------------

interface BrandSpreadChartProps {
  data: Record<string, unknown>[];
  dataKeys: string[];
  title?: string;
}

export function BrandSpreadChart({
  data,
  dataKeys,
  title = 'Brand Spread',
}: BrandSpreadChartProps) {
  // Sum total revenue across brands
  const totalRevenue = useMemo(() => {
    let sum = 0;
    for (const row of data) {
      for (const key of dataKeys) {
        sum += (typeof row[key] === 'number' ? row[key] as number : 0);
      }
    }
    return sum;
  }, [data, dataKeys]);

  const chartConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {};
    dataKeys.forEach((key, i) => {
      cfg[key] = { label: key, color: CHART_COLORS[i % CHART_COLORS.length] };
    });
    return cfg;
  }, [dataKeys]);

  return (
    <Card className="py-4 gap-3 h-full">
      <CardHeader className="px-4 pb-0 gap-1">
        <CardDescription className="text-[11px] uppercase tracking-wider font-medium">{title}</CardDescription>
        <CardTitle className="text-xl tabular-nums">
          {formatGBP(totalRevenue)}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-0 mt-auto">
        <ChartContainer config={chartConfig} className="h-28 w-full">
          <BarChart
            accessibilityLayer
            data={data}
            layout="vertical"
            margin={{ left: 60, right: 4, top: 4, bottom: 0 }}
          >
            <rect x="0" y="0" width="100%" height="100%" fill="url(#brand-spread-dots)" />
            <defs>
              <pattern id="brand-spread-dots" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                <circle className="dark:text-muted/40 text-muted" cx="2" cy="2" r="1" fill="currentColor" />
              </pattern>
            </defs>
            <YAxis
              dataKey="brand"
              type="category"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => (typeof v === 'string' && v.length > 9 ? v.slice(0, 8) + '\u2026' : v)}
              width={56}
            />
            <XAxis type="number" hide />
            <ChartTooltip content={<MultiBarTooltip formatValue={formatGBP} />} />
            {dataKeys.map((key, ki) => (
              <Bar key={key} dataKey={key} fill={CHART_COLORS[ki % CHART_COLORS.length]} radius={3} />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
