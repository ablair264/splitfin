import React, { useState, useMemo } from 'react';
import {
  Bar, BarChart, Cell, LabelList, Pie, PieChart,
  RadialBar, RadialBarChart, XAxis,
} from 'recharts';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent,
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

// ---------------------------------------------------------------------------
// 1. Agent Orders — Increase-Size Pie Chart
// ---------------------------------------------------------------------------

interface AgentOrdersPieChartProps {
  data: { name: string; value: number }[];
  title?: string;
  description?: string;
}

const BASE_RADIUS = 50;
const SIZE_INCREMENT = 10;

export function AgentOrdersPieChart({
  data,
  title = 'Orders by Agent',
  description,
}: AgentOrdersPieChartProps) {
  const sorted = useMemo(
    () => [...data]
      .sort((a, b) => a.value - b.value)
      .map((d, i) => ({ ...d, fill: CHART_COLORS[i % CHART_COLORS.length] })),
    [data],
  );

  const total = useMemo(() => sorted.reduce((s, d) => s + d.value, 0), [sorted]);

  const chartConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = { value: { label: 'Orders' } };
    sorted.forEach((d) => { cfg[d.name] = { label: d.name, color: d.fill }; });
    return cfg;
  }, [sorted]);

  return (
    <Card className="py-4 gap-3 h-full">
      <CardHeader className="px-4 pb-0 gap-1">
        <CardDescription className="text-[11px] uppercase tracking-wider font-medium">{title}</CardDescription>
        <CardTitle className="text-xl tabular-nums">{total.toLocaleString('en-GB')}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="px-2 pb-0 mt-auto">
        <ChartContainer
          config={chartConfig}
          className="[&_.recharts-text]:fill-background mx-auto aspect-square max-h-[160px]"
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="value" hideLabel />} />
            {sorted.map((entry, index) => (
              <Pie
                key={`pie-${index}`}
                data={[entry]}
                innerRadius={24}
                outerRadius={BASE_RADIUS + index * SIZE_INCREMENT}
                dataKey="value"
                nameKey="name"
                cornerRadius={4}
                startAngle={
                  (sorted.slice(0, index).reduce((sum, d) => sum + d.value, 0) / total) * 360
                }
                endAngle={
                  (sorted.slice(0, index + 1).reduce((sum, d) => sum + d.value, 0) / total) * 360
                }
              >
                <Cell fill={entry.fill} />
                <LabelList
                  dataKey="value"
                  stroke="none"
                  fontSize={11}
                  fontWeight={500}
                  fill="currentColor"
                  formatter={(v: number) => v.toString()}
                />
              </Pie>
            ))}
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
    const cfg: ChartConfig = { value: { label: 'Revenue' } };
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
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="name" />} />
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
          {chartData.map((d) => (
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
// 3. Agent Activity — Multi-series Bar Chart
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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
          {dataKeys.length} <span className="text-sm font-normal text-muted-foreground">agents</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-0 mt-auto">
        <ChartContainer config={chartConfig} className="h-28 w-full">
          <BarChart
            accessibilityLayer
            data={data}
            onMouseLeave={() => setActiveIndex(null)}
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
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" />} />
            {dataKeys.map((key, ki) => (
              <Bar key={key} dataKey={key} fill={`var(--color-${key.replace(/\s+/g, '-')})`} radius={3} stackId="a">
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${key}-${index}`}
                    fillOpacity={activeIndex === null ? 1 : activeIndex === index ? 1 : 0.3}
                    fill={CHART_COLORS[ki % CHART_COLORS.length]}
                    onMouseEnter={() => setActiveIndex(index)}
                    className="duration-200"
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Brand Spread — Highlighted Multiple Bar Chart
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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
          {data.length} <span className="text-sm font-normal text-muted-foreground">brands</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-0 mt-auto">
        <ChartContainer config={chartConfig} className="h-28 w-full">
          <BarChart
            accessibilityLayer
            data={data}
            onMouseLeave={() => setActiveIndex(null)}
            margin={{ left: 4, right: 4, top: 4, bottom: 0 }}
          >
            <rect x="0" y="0" width="100%" height="85%" fill="url(#brand-spread-dots)" />
            <defs>
              <pattern id="brand-spread-dots" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                <circle className="dark:text-muted/40 text-muted" cx="2" cy="2" r="1" fill="currentColor" />
              </pattern>
            </defs>
            <XAxis
              dataKey="brand"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => (typeof v === 'string' && v.length > 8 ? v.slice(0, 7) + '\u2026' : v)}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" />} />
            {dataKeys.map((key, ki) => (
              <Bar key={key} dataKey={key} fill={CHART_COLORS[ki % CHART_COLORS.length]} radius={3}>
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${key}-${index}`}
                    fillOpacity={activeIndex === null ? 1 : activeIndex === index ? 1 : 0.3}
                    fill={CHART_COLORS[ki % CHART_COLORS.length]}
                    stroke={activeIndex === index ? CHART_COLORS[ki % CHART_COLORS.length] : ''}
                    onMouseEnter={() => setActiveIndex(index)}
                    className="duration-200"
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
