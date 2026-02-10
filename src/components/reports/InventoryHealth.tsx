import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { reportService, type ReportFilters } from '@/services/reportService';
import type { ReportDateRange, InventoryHealthData } from '@/types/domain';

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const chartConfig = {
  in_stock: { label: 'In Stock', color: 'var(--chart-1)' },
  out_of_stock: { label: 'Out of Stock', color: 'var(--destructive)' },
} satisfies ChartConfig;

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

export default function InventoryHealth({ dateRange, filters }: { dateRange: ReportDateRange; filters?: ReportFilters }) {
  const [data, setData] = useState<InventoryHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportService.inventoryHealth(dateRange, filters).then(result => {
      if (!cancelled) { setData(result); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateRange, filters?.brand]);

  if (loading) return <Skeleton />;
  if (!data) return <p className="text-muted-foreground p-4">Failed to load report data.</p>;

  const { summary, brands, slow_movers } = data;
  const chartData = brands.slice(0, 10).map(b => ({
    brand: b.brand,
    in_stock: b.total_stock,
    out_of_stock: b.out_of_stock,
  }));

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Active Products</CardDescription>
            <CardTitle className="text-xl tabular-nums">{summary.active_products.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Out of Stock</CardDescription>
            <CardTitle className="text-xl tabular-nums text-red-400">{summary.out_of_stock.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Low Stock</CardDescription>
            <CardTitle className="text-xl tabular-nums text-amber-400">{summary.low_stock.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Stock Value</CardDescription>
            <CardTitle className="text-xl tabular-nums">{formatGBP(summary.stock_value)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Stock Status by Brand (Top 10)</h3>
            <ChartContainer config={chartConfig} className="h-[220px] w-full">
              <BarChart data={chartData}>
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

function Skeleton() {
  return (
    <div className="space-y-4 mt-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted/50" />)}
      </div>
      <div className="h-[260px] rounded-lg bg-muted/50" />
      <div className="h-[200px] rounded-lg bg-muted/50" />
    </div>
  );
}
