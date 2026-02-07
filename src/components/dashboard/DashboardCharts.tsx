import React, { useRef, useState, useMemo, useEffect } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  RadialBar, RadialBarChart, ReferenceLine, XAxis,
} from 'recharts';
import { useSpring, useMotionValueEvent } from 'motion/react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  ChartConfig, ChartContainer, ChartTooltip,
} from '@/components/ui/chart';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface ChartDataPoint {
  name: string;
  value: number;
}

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

// Custom tooltip that reads the data point's name from payload directly,
// bypassing the shadcn nameKey lookup bug where item.name (= dataKey)
// shadows payload.name (= actual data field).
function DataTooltip({ active, payload, formatValue }: {
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
                style={{ background: (item.payload.fill as string) || 'var(--chart-1)' }}
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
// 1. Revenue Card — Clipped Area Chart
// ---------------------------------------------------------------------------

const revenueConfig = {
  value: { label: 'Revenue', color: 'var(--chart-1)' },
} satisfies ChartConfig;

interface RevenueChartProps {
  data: ChartDataPoint[];
  total: number;
  onClick?: () => void;
}

export function RevenueChart({ data, total, onClick }: RevenueChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [axis, setAxis] = useState(0);

  const springX = useSpring(0, { damping: 30, stiffness: 100 });
  const springY = useSpring(0, { damping: 30, stiffness: 100 });

  useMotionValueEvent(springX, 'change', (latest) => setAxis(latest));

  // Initialise spring to chart width on mount
  useEffect(() => {
    const w = chartRef.current?.getBoundingClientRect().width;
    if (w) springX.jump(w);
  }, []);

  return (
    <Card
      className="cursor-pointer hover:border-primary/30 transition-colors py-4 gap-3 h-full"
      onClick={onClick}
    >
      <CardHeader className="px-4 pb-0 gap-1">
        <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Revenue</CardDescription>
        <CardTitle className="flex items-center gap-2 text-xl tabular-nums">
          {formatGBP(total)}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-0 mt-auto">
        <ChartContainer ref={chartRef} className="h-28 w-full" config={revenueConfig}>
          <AreaChart
            className="overflow-visible"
            accessibilityLayer
            data={data}
            onMouseMove={(state) => {
              const x = state.activeCoordinate?.x;
              const v = state.activePayload?.[0]?.value;
              if (x !== undefined && v !== undefined) {
                springX.set(x);
                springY.set(v as number);
              }
            }}
            onMouseLeave={() => {
              springX.set(chartRef.current?.getBoundingClientRect().width || 0);
              if (data.length > 0) springY.jump(data[data.length - 1].value);
            }}
            margin={{ right: 0, left: 0, top: 4, bottom: 0 }}
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
            <Area
              dataKey="value"
              type="monotone"
              fill="url(#revenue-gradient)"
              fillOpacity={0.4}
              stroke="var(--color-value)"
              clipPath={`inset(0 ${
                Number(chartRef.current?.getBoundingClientRect().width) - axis
              } 0 0)`}
            />
            <line
              x1={axis}
              y1={0}
              x2={axis}
              y2="85%"
              stroke="var(--color-value)"
              strokeDasharray="3 3"
              strokeLinecap="round"
              strokeOpacity={0.2}
            />
            <rect x={axis - 50} y={0} width={50} height={16} fill="var(--color-value)" rx={3} />
            <text
              x={axis - 25}
              fontWeight={600}
              y={12}
              textAnchor="middle"
              fill="var(--primary-foreground)"
              fontSize={10}
            >
              {formatCompact(springY.get())}
            </text>
            {/* Ghost line behind clipped area */}
            <Area
              dataKey="value"
              type="monotone"
              fill="none"
              stroke="var(--color-value)"
              strokeOpacity={0.1}
            />
            <defs>
              <linearGradient id="revenue-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0} />
              </linearGradient>
            </defs>
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Orders Card — Value Line Bar Chart
// ---------------------------------------------------------------------------

const ordersConfig = {
  value: { label: 'Orders', color: 'var(--chart-2)' },
} satisfies ChartConfig;

const CHART_MARGIN = 30;

interface OrdersChartProps {
  data: ChartDataPoint[];
  total: number;
  onClick?: () => void;
}

function OrdersRefLabel({ viewBox, value }: { viewBox?: { x?: number; y?: number }; value: number }) {
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;
  const w = value.toString().length * 7 + 10;
  return (
    <>
      <rect x={x - CHART_MARGIN} y={y - 8} width={w} height={16} fill="var(--chart-2)" rx={3} />
      <text fontWeight={600} x={x - CHART_MARGIN + 5} y={y + 4} fill="var(--primary-foreground)" fontSize={10}>
        {value}
      </text>
    </>
  );
}

export function OrdersChart({ data, total, onClick }: OrdersChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const highlighted = useMemo(() => {
    if (activeIndex !== undefined) return { index: activeIndex, value: data[activeIndex]?.value ?? 0 };
    return data.reduce(
      (max, d, i) => (d.value > max.value ? { index: i, value: d.value } : max),
      { index: 0, value: 0 },
    );
  }, [activeIndex, data]);

  const springVal = useSpring(highlighted.value, { stiffness: 100, damping: 20 });
  const [springy, setSpringy] = useState(highlighted.value);

  useMotionValueEvent(springVal, 'change', (v) => setSpringy(Number(v.toFixed(0))));
  useEffect(() => { springVal.set(highlighted.value); }, [highlighted.value]);

  return (
    <Card
      className="cursor-pointer hover:border-primary/30 transition-colors py-4 gap-3 h-full"
      onClick={onClick}
    >
      <CardHeader className="px-4 pb-0 gap-1">
        <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Orders</CardDescription>
        <CardTitle className="flex items-center gap-2 text-xl tabular-nums">
          {total.toLocaleString('en-GB')}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-0 mt-auto">
        <ChartContainer config={ordersConfig} className="h-28 w-full">
          <BarChart
            accessibilityLayer
            data={data}
            onMouseLeave={() => setActiveIndex(undefined)}
            margin={{ left: CHART_MARGIN, right: 4, top: 4, bottom: 0 }}
          >
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tick={{ fontSize: 10 }}
            />
            <Bar dataKey="value" fill="var(--color-value)" radius={3}>
              {data.map((_, i) => (
                <Cell
                  key={i}
                  className="duration-200"
                  opacity={i === highlighted.index ? 1 : 0.2}
                  onMouseEnter={() => setActiveIndex(i)}
                />
              ))}
            </Bar>
            <ReferenceLine
              opacity={0.4}
              y={springy}
              stroke="var(--chart-2)"
              strokeWidth={1}
              strokeDasharray="3 3"
              label={<OrdersRefLabel value={highlighted.value} />}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Stock Card — Glowing Radial Chart
// ---------------------------------------------------------------------------

const STOCK_COLORS = ['var(--chart-1)', 'var(--chart-4)', 'var(--chart-5)'] as const;

interface StockChartProps {
  data: ChartDataPoint[];
  total: number;
  onClick?: () => void;
}

export function StockChart({ data, total, onClick }: StockChartProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const chartData = useMemo(
    () =>
      data.map((d, i) => ({
        name: d.name,
        value: d.value,
        fill: STOCK_COLORS[i % STOCK_COLORS.length],
      })),
    [data],
  );

  const stockConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = { value: { label: 'Stock' } };
    chartData.forEach((d) => {
      cfg[d.name] = { label: d.name, color: d.fill };
    });
    return cfg;
  }, [chartData]);

  return (
    <Card
      className="cursor-pointer hover:border-primary/30 transition-colors py-4 gap-3 h-full"
      onClick={onClick}
    >
      <CardHeader className="px-4 pb-0 gap-1">
        <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Stock Total</CardDescription>
        <CardTitle className="text-xl tabular-nums">
          {total.toLocaleString('en-GB')}
          <span className="text-sm font-normal text-muted-foreground ml-1.5">units</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-0 mt-auto flex items-center justify-center">
        <ChartContainer config={stockConfig} className="h-28 w-full max-w-[200px]">
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
            <ChartTooltip cursor={false} content={<DataTooltip />} />
            <RadialBar cornerRadius={8} dataKey="value" background className="drop-shadow-lg">
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.fill}
                  filter={activeKey === entry.name ? `url(#stock-glow-${i})` : undefined}
                  opacity={activeKey === null || activeKey === entry.name ? 1 : 0.3}
                />
              ))}
            </RadialBar>
            <defs>
              {chartData.map((_, i) => (
                <filter key={i} id={`stock-glow-${i}`} x="-50%" y="-50%" width="200%" height="200%">
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
              <span className="text-muted-foreground">{d.name}</span>
              <span className="font-medium text-foreground tabular-nums ml-auto">{d.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Top Agent Card — Glowing Line Chart
// ---------------------------------------------------------------------------

const agentConfig = {
  value: { label: 'Orders', color: 'var(--chart-3)' },
} satisfies ChartConfig;

interface AgentChartProps {
  data: ChartDataPoint[];
  agentName: string;
  orderCount: number;
  revenue: number;
  onClick?: () => void;
}

export function AgentChart({ data, agentName, orderCount, revenue, onClick }: AgentChartProps) {
  const formatGBPShort = (n: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', notation: 'compact', maximumFractionDigits: 1 }).format(n);

  return (
    <Card
      className="cursor-pointer hover:border-primary/30 transition-colors py-4 gap-3 h-full"
      onClick={onClick}
    >
      <CardHeader className="px-4 pb-0 gap-1">
        <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Top Agent</CardDescription>
        <CardTitle className="text-xl">{agentName}</CardTitle>
        <CardDescription className="text-xs tabular-nums">
          {orderCount} orders &middot; {formatGBPShort(revenue)}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-0 mt-auto">
        <ChartContainer config={agentConfig} className="h-28 w-full">
          <LineChart
            accessibilityLayer
            data={data}
            margin={{ left: 12, right: 12, top: 4, bottom: 0 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tick={{ fontSize: 10 }}
            />
            <ChartTooltip cursor={false} content={<DataTooltip />} />
            <Line
              dataKey="value"
              type="bump"
              stroke="var(--color-value)"
              dot={false}
              strokeWidth={2}
              filter="url(#agent-glow)"
            />
            <defs>
              <filter id="agent-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
