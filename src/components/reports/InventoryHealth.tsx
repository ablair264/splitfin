import { useEffect, useState, useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, RadialBar, RadialBarChart, XAxis, YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { reportService } from '@/services/reportService';
import type { ReportDateRange, InventoryHealthData } from '@/types/domain';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const BAR_COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)',
  'var(--chart-4)', 'var(--chart-5)', 'var(--chart-1)',
];

const chartConfig = {
  in_stock: { label: 'In Stock', color: 'var(--chart-1)' },
  out_of_stock: { label: 'Out of Stock', color: 'var(--destructive)' },
} satisfies ChartConfig;

// ---------------------------------------------------------------------------
// Tooltips
// ---------------------------------------------------------------------------

function StockTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      {label && <p className="font-medium mb-1">{label}</p>}
      {payload.map((item: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: item.color || item.fill }} />
            <span className="text-muted-foreground">{item.name}</span>
          </div>
          <span className="font-mono font-medium tabular-nums text-foreground">{item.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function MiniTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ value: number; payload: Record<string, unknown> }>;
}) {
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

function ValueTooltip({ active, payload, formatValue }: {
  active?: boolean;
  payload?: Array<{ value: number; payload: Record<string, unknown> }>;
  formatValue?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const fmt = formatValue ?? ((v: number) => v.toLocaleString());
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      {payload.map((item, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{item.payload.name as string}</span>
          <span className="font-mono font-medium tabular-nums text-foreground">{fmt(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function InventoryHealth({ dateRange }: { dateRange: ReportDateRange }) {
  const [data, setData] = useState<InventoryHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportService.inventoryHealth(dateRange).then(result => {
      if (!cancelled) { setData(result); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateRange]);

  // -----------------------------------------------------------------------
  // Memoised chart data — BEFORE early returns
  // -----------------------------------------------------------------------

  const stockStatusData = useMemo(() => {
    if (!data) return [];
    const s = data.summary;
    const inStock = s.active_products - s.out_of_stock - s.low_stock;
    return [
      { name: 'In Stock', value: inStock, fill: 'var(--chart-1)' },
      { name: 'Out of Stock', value: s.out_of_stock, fill: 'var(--destructive)' },
      { name: 'Low Stock', value: s.low_stock, fill: 'var(--chart-4)' },
    ];
  }, [data]);

  const oosChartData = useMemo(() => {
    if (!data) return [];
    return data.brands
      .filter(b => b.out_of_stock > 0)
      .sort((a, b) => b.out_of_stock - a.out_of_stock)
      .slice(0, 6)
      .map(b => ({ name: b.brand.slice(0, 8), value: b.out_of_stock }));
  }, [data]);

  const lowStockChartData = useMemo(() => {
    if (!data) return [];
    return [...data.brands]
      .sort((a, b) => a.total_stock - b.total_stock)
      .slice(0, 6)
      .map(b => ({ name: b.brand.slice(0, 8), value: b.total_stock }));
  }, [data]);

  const stockValueChartData = useMemo(() => {
    if (!data) return [];
    return data.brands
      .slice(0, 6)
      .map(b => ({ name: b.brand.slice(0, 8), value: b.stock_value }));
  }, [data]);

  // -----------------------------------------------------------------------
  // Chart configs
  // -----------------------------------------------------------------------

  const stockStatusConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = { value: { label: 'Products' } };
    stockStatusData.forEach(d => { cfg[d.name] = { label: d.name, color: d.fill }; });
    return cfg;
  }, [stockStatusData]);

  const oosConfig = { value: { label: 'Out of Stock', color: 'var(--destructive)' } } satisfies ChartConfig;
  const lowStockAreaConfig = { value: { label: 'Stock', color: 'var(--chart-4)' } } satisfies ChartConfig;
  const stockValueBarConfig = { value: { label: 'Value', color: 'var(--chart-1)' } } satisfies ChartConfig;

  // -----------------------------------------------------------------------
  // Radial glow state
  // -----------------------------------------------------------------------

  const [activeRadialKey, setActiveRadialKey] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Early returns
  // -----------------------------------------------------------------------

  if (loading) return <Skeleton />;
  if (!data) return <p className="text-muted-foreground p-4">Failed to load report data.</p>;

  const { summary, brands, slow_movers } = data;

  // Brand stacked bar chart (existing section)
  const brandChartData = brands.slice(0, 10).map(b => ({
    brand: b.brand,
    in_stock: b.total_stock,
    out_of_stock: b.out_of_stock,
  }));

  return (
    <div className="space-y-4 mt-4">
      {/* ----------------------------------------------------------------- */}
      {/* Metric cards with embedded charts                                 */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Card 1: Active Products — Radial stock status */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Active Products</CardDescription>
            <CardTitle className="text-xl tabular-nums">{summary.active_products.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto flex items-center justify-center">
            <ChartContainer config={stockStatusConfig} className="h-28 w-full max-w-[160px]">
              <RadialBarChart
                data={stockStatusData}
                innerRadius={20}
                outerRadius={52}
                onMouseMove={(state) => {
                  if (state?.activePayload?.[0]) {
                    setActiveRadialKey(state.activePayload[0].payload.name);
                  }
                }}
                onMouseLeave={() => setActiveRadialKey(null)}
              >
                <ChartTooltip cursor={false} content={<MiniTooltip />} />
                <RadialBar cornerRadius={8} dataKey="value" background className="drop-shadow-lg">
                  {stockStatusData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.fill}
                      filter={activeRadialKey === entry.name ? `url(#inv-glow-${i})` : undefined}
                      opacity={activeRadialKey === null || activeRadialKey === entry.name ? 1 : 0.3}
                    />
                  ))}
                </RadialBar>
                <defs>
                  {stockStatusData.map((_, i) => (
                    <filter key={i} id={`inv-glow-${i}`} x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="6" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  ))}
                </defs>
              </RadialBarChart>
            </ChartContainer>
            {/* Legend */}
            <div className="flex flex-col gap-1 pr-2">
              {stockStatusData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5 text-[10px]">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
                  <span className="text-muted-foreground whitespace-nowrap">{d.name}</span>
                  <span className="font-medium text-foreground tabular-nums ml-auto">{d.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Out of Stock — Bar chart by brand */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Out of Stock</CardDescription>
            <CardTitle className="text-xl tabular-nums text-red-400">{summary.out_of_stock.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto">
            <ChartContainer config={oosConfig} className="h-28 w-full">
              <BarChart
                data={oosChartData}
                margin={{ left: 0, right: 0, top: 4, bottom: 0 }}
              >
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  tick={{ fontSize: 9 }}
                />
                <ChartTooltip cursor={false} content={<ValueTooltip />} />
                <Bar dataKey="value" radius={3}>
                  {oosChartData.map((_, i) => (
                    <Cell
                      key={i}
                      fill="var(--destructive)"
                      opacity={1 - i * 0.12}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Card 3: Low Stock — Area chart by brand */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Low Stock</CardDescription>
            <CardTitle className="text-xl tabular-nums text-amber-400">{summary.low_stock.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto">
            <ChartContainer config={lowStockAreaConfig} className="h-28 w-full">
              <AreaChart
                data={lowStockChartData}
                margin={{ left: 0, right: 0, top: 4, bottom: 0 }}
              >
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  tick={{ fontSize: 9 }}
                />
                <ChartTooltip cursor={false} content={<ValueTooltip />} />
                <Area
                  dataKey="value"
                  type="monotone"
                  fill="url(#low-stock-gradient)"
                  fillOpacity={0.4}
                  stroke="var(--chart-4)"
                  strokeWidth={2}
                />
                <defs>
                  <linearGradient id="low-stock-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-4)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--chart-4)" stopOpacity={0} />
                  </linearGradient>
                </defs>
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Card 4: Stock Value — Bar chart by brand */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Stock Value</CardDescription>
            <CardTitle className="text-xl tabular-nums">{formatGBP(summary.stock_value)}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto">
            <ChartContainer config={stockValueBarConfig} className="h-28 w-full">
              <BarChart
                data={stockValueChartData}
                margin={{ left: 0, right: 0, top: 4, bottom: 0 }}
              >
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  tick={{ fontSize: 9 }}
                />
                <ChartTooltip cursor={false} content={<ValueTooltip formatValue={formatGBP} />} />
                <Bar dataKey="value" radius={3}>
                  {stockValueChartData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={BAR_COLORS[i % BAR_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Stock Status by Brand (Top 10) — stacked bar chart                */}
      {/* ----------------------------------------------------------------- */}
      {brandChartData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Stock Status by Brand (Top 10)</h3>
            <ChartContainer config={chartConfig} className="h-[220px] w-full">
              <BarChart data={brandChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="brand" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={50} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<StockTooltip />} />
                <Legend />
                <Bar dataKey="in_stock" name="In Stock" fill="var(--color-in_stock)" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="out_of_stock" name="Out of Stock" fill="var(--color-out_of_stock)" stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Slow Movers table                                                 */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Slow Movers (In stock, not sold in 90+ days)</h3>
          {slow_movers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No slow movers found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Product</th>
                    <th className="pb-2 font-medium text-muted-foreground">SKU</th>
                    <th className="pb-2 font-medium text-muted-foreground">Brand</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Stock</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Price</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Last Sold</th>
                  </tr>
                </thead>
                <tbody>
                  {slow_movers.map((p, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4 max-w-[200px] truncate">{p.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground font-mono text-xs">{p.sku}</td>
                      <td className="py-2 pr-4">{p.brand}</td>
                      <td className="py-2 text-right tabular-nums">{p.stock_on_hand}</td>
                      <td className="py-2 text-right tabular-nums">{formatGBP(p.rate)}</td>
                      <td className="py-2 text-right">
                        {p.last_sold ? (
                          <span className="text-muted-foreground">{p.last_sold}</span>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-400 border-red-500/20">Never</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-[180px] rounded-lg bg-muted/50" />)}
      </div>
      <div className="h-[260px] rounded-lg bg-muted/50" />
      <div className="h-[200px] rounded-lg bg-muted/50" />
    </div>
  );
}
