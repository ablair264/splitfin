import { useEffect, useState, useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, Cell, CartesianGrid,
  RadialBar, RadialBarChart, ReferenceLine, XAxis, YAxis,
} from 'recharts';
import { useSpring, useMotionValueEvent } from 'motion/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { reportService } from '@/services/reportService';
import type { ReportDateRange, BrandAnalysisData } from '@/types/domain';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const BAR_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

const CHART_MARGIN = 30;

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

// ---------------------------------------------------------------------------
// Chart configs
// ---------------------------------------------------------------------------

const ordersConfig = {
  value: { label: 'Orders', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const unitsConfig = {
  value: { label: 'Units', color: 'var(--chart-2)' },
} satisfies ChartConfig;

const revenueBarConfig = {
  revenue: { label: 'Revenue', color: 'var(--chart-3)' },
} satisfies ChartConfig;

// ---------------------------------------------------------------------------
// Tooltip components
// ---------------------------------------------------------------------------

function GBPTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      {label && <p className="font-medium mb-1">{label}</p>}
      <p className="font-mono font-medium tabular-nums text-foreground">{formatGBP(payload[0].value)}</p>
    </div>
  );
}

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
// Orders bar reference label (ValueLineBar style)
// ---------------------------------------------------------------------------

function OrdersRefLabel({ viewBox, value }: { viewBox?: { x?: number; y?: number }; value: number }) {
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;
  const w = value.toString().length * 7 + 10;
  return (
    <>
      <rect x={x - CHART_MARGIN} y={y - 8} width={w} height={16} fill="var(--chart-1)" rx={3} />
      <text fontWeight={600} x={x - CHART_MARGIN + 5} y={y + 4} fill="var(--primary-foreground)" fontSize={10}>
        {value}
      </text>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function BrandAnalysis({ dateRange }: { dateRange: ReportDateRange }) {
  const [data, setData] = useState<BrandAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);

  // --- Chart-card interactive state (must be before any early return) ---
  const [activeBarIndex, setActiveBarIndex] = useState<number | undefined>(undefined);
  const [activeRadialKey, setActiveRadialKey] = useState<string | null>(null);

  // --- Derived chart data (useMemo before early returns) ---
  const ordersChartData = useMemo(
    () => data ? data.brands.slice(0, 6).map(b => ({ name: b.brand.slice(0, 8), value: b.order_count })) : [],
    [data],
  );

  const unitsChartData = useMemo(
    () => data
      ? [...data.brands].sort((a, b) => a.units_sold - b.units_sold).slice(-6).map(b => ({ name: b.brand.slice(0, 8), value: b.units_sold }))
      : [],
    [data],
  );

  const revenueRadialData = useMemo(
    () => data
      ? data.brands.slice(0, 5).map((b, i) => ({ name: b.brand, value: b.revenue, fill: BAR_COLORS[i % BAR_COLORS.length] }))
      : [],
    [data],
  );

  const radialConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = { value: { label: 'Revenue' } };
    revenueRadialData.forEach(d => {
      cfg[d.name] = { label: d.name, color: d.fill };
    });
    return cfg;
  }, [revenueRadialData]);

  // --- Orders card ValueLineBar highlight logic ---
  const highlighted = useMemo(() => {
    if (activeBarIndex !== undefined) return { index: activeBarIndex, value: ordersChartData[activeBarIndex]?.value ?? 0 };
    return ordersChartData.reduce(
      (max, d, i) => (d.value > max.value ? { index: i, value: d.value } : max),
      { index: 0, value: 0 },
    );
  }, [activeBarIndex, ordersChartData]);

  const springVal = useSpring(highlighted.value, { stiffness: 100, damping: 20 });
  const [springy, setSpringy] = useState(highlighted.value);

  useMotionValueEvent(springVal, 'change', (v) => setSpringy(Number(v.toFixed(0))));
  useEffect(() => { springVal.set(highlighted.value); }, [highlighted.value]);

  // --- Totals ---
  const totalRevenue = data ? data.brands.reduce((sum, b) => sum + b.revenue, 0) : 0;
  const totalUnits = data ? data.brands.reduce((sum, b) => sum + b.units_sold, 0) : 0;
  const brandCount = data ? data.brands.length : 0;

  // --- Data fetching ---
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportService.brandAnalysis(dateRange).then(result => {
      if (!cancelled) { setData(result); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateRange]);

  if (loading) return <Skeleton />;
  if (!data) return <p className="text-muted-foreground p-4">Failed to load report data.</p>;

  const { brands } = data;
  const chartData = brands.slice(0, 10);

  return (
    <div className="space-y-4 mt-4">
      {/* ----------------------------------------------------------------- */}
      {/* Metric cards with embedded charts                                 */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Card 1 — Active Brands (ValueLineBar style) */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Active Brands</CardDescription>
            <CardTitle className="text-xl tabular-nums">{brandCount}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto">
            <ChartContainer config={ordersConfig} className="h-28 w-full">
              <BarChart
                accessibilityLayer
                data={ordersChartData}
                onMouseLeave={() => setActiveBarIndex(undefined)}
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
                  {ordersChartData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={BAR_COLORS[i % BAR_COLORS.length]}
                      className="duration-200"
                      opacity={i === highlighted.index ? 1 : 0.2}
                      onMouseEnter={() => setActiveBarIndex(i)}
                    />
                  ))}
                </Bar>
                <ReferenceLine
                  opacity={0.4}
                  y={springy}
                  stroke="var(--chart-1)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  label={<OrdersRefLabel value={highlighted.value} />}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Card 2 — Total Units Sold (ClippedArea style) */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Total Units Sold</CardDescription>
            <CardTitle className="text-xl tabular-nums">{totalUnits.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto">
            <ChartContainer config={unitsConfig} className="h-28 w-full">
              <AreaChart
                accessibilityLayer
                data={unitsChartData}
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
                <ChartTooltip cursor={false} content={<DataTooltip />} />
                {/* Ghost line behind filled area */}
                <Area
                  dataKey="value"
                  type="monotone"
                  fill="none"
                  stroke="var(--color-value)"
                  strokeOpacity={0.1}
                />
                <Area
                  dataKey="value"
                  type="monotone"
                  fill="url(#brand-units-grad)"
                  fillOpacity={0.4}
                  stroke="var(--color-value)"
                  strokeWidth={2}
                />
                <defs>
                  <linearGradient id="brand-units-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Card 3 — Total Revenue (GlowingRadial style) */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Total Revenue</CardDescription>
            <CardTitle className="text-xl tabular-nums">{formatGBP(totalRevenue)}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto flex items-center justify-center">
            <ChartContainer config={radialConfig} className="h-28 w-full max-w-[200px]">
              <RadialBarChart
                data={revenueRadialData}
                innerRadius={20}
                outerRadius={52}
                onMouseMove={(state) => {
                  if (state?.activePayload?.[0]) {
                    setActiveRadialKey(state.activePayload[0].payload.name);
                  }
                }}
                onMouseLeave={() => setActiveRadialKey(null)}
              >
                <ChartTooltip cursor={false} content={<DataTooltip formatValue={formatGBP} />} />
                <RadialBar cornerRadius={8} dataKey="value" background className="drop-shadow-lg">
                  {revenueRadialData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.fill}
                      filter={activeRadialKey === entry.name ? `url(#brand-rev-glow-${i})` : undefined}
                      opacity={activeRadialKey === null || activeRadialKey === entry.name ? 1 : 0.3}
                    />
                  ))}
                </RadialBar>
                <defs>
                  {revenueRadialData.map((_, i) => (
                    <filter key={i} id={`brand-rev-glow-${i}`} x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="6" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  ))}
                </defs>
              </RadialBarChart>
            </ChartContainer>
            {/* Legend */}
            <div className="flex flex-col gap-1 pr-4">
              {revenueRadialData.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-[11px]">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
                  <span className="text-muted-foreground truncate max-w-[60px]">{d.name}</span>
                  <span className="font-medium text-foreground tabular-nums ml-auto">{formatCompact(d.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Top 10 Brands by Revenue bar chart                                */}
      {/* ----------------------------------------------------------------- */}
      {chartData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Top 10 Brands by Revenue</h3>
            <ChartContainer config={revenueBarConfig} className="h-[200px] w-full">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="brand" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={50} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<GBPTooltip />} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* All Brands table                                                  */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">All Brands</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Brand</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Orders</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Units Sold</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Revenue</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Avg Price</th>
                </tr>
              </thead>
              <tbody>
                {brands.map((b, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-4 font-medium">{b.brand}</td>
                    <td className="py-2 text-right tabular-nums">{b.order_count.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">{b.units_sold.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{formatGBP(b.revenue)}</td>
                    <td className="py-2 text-right tabular-nums">{formatGBP(b.avg_unit_price)}</td>
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

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <div className="space-y-4 mt-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-[180px] rounded-lg bg-muted/50" />)}
      </div>
      <div className="h-[240px] rounded-lg bg-muted/50" />
      <div className="h-[200px] rounded-lg bg-muted/50" />
    </div>
  );
}
