import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { reportService } from '@/services/reportService';
import type { ReportDateRange, BrandAnalysisData } from '@/types/domain';

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const chartConfig = {
  revenue: { label: 'Revenue', color: 'var(--chart-3)' },
} satisfies ChartConfig;

function GBPTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      {label && <p className="font-medium mb-1">{label}</p>}
      <p className="font-mono font-medium tabular-nums text-foreground">{formatGBP(payload[0].value)}</p>
    </div>
  );
}

export default function BrandAnalysis({ dateRange }: { dateRange: ReportDateRange }) {
  const [data, setData] = useState<BrandAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);

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
  const totalRevenue = brands.reduce((sum, b) => sum + b.revenue, 0);
  const totalUnits = brands.reduce((sum, b) => sum + b.units_sold, 0);
  const chartData = brands.slice(0, 10);

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Active Brands</CardDescription>
            <CardTitle className="text-xl tabular-nums">{brands.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Total Units Sold</CardDescription>
            <CardTitle className="text-xl tabular-nums">{totalUnits.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Total Revenue</CardDescription>
            <CardTitle className="text-xl tabular-nums">{formatGBP(totalRevenue)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Top 10 Brands by Revenue</h3>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="brand" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<GBPTooltip />} />
                <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">All Brands</h3>
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

function Skeleton() {
  return (
    <div className="space-y-6 mt-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted/50" />)}
      </div>
      <div className="h-[340px] rounded-lg bg-muted/50" />
      <div className="h-[300px] rounded-lg bg-muted/50" />
    </div>
  );
}
