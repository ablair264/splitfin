import { useEffect, useState, useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  RadialBar, RadialBarChart, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { reportService } from '@/services/reportService';
import type { ReportDateRange, FinancialData } from '@/types/domain';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

// ---------------------------------------------------------------------------
// Ageing colour map
// ---------------------------------------------------------------------------

const AGEING_COLORS: Record<string, string> = {
  'Current': 'var(--chart-1)',
  '1-30 days': 'var(--chart-2)',
  '31-60 days': 'var(--chart-3)',
  '61-90 days': 'var(--chart-4)',
  '90+ days': 'var(--destructive)',
};

// ---------------------------------------------------------------------------
// Chart configs
// ---------------------------------------------------------------------------

const ageingAreaConfig = {
  value: { label: 'Amount', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const ageingBarConfig = {
  value: { label: 'Amount', color: 'var(--chart-2)' },
} satisfies ChartConfig;

const ageingFullConfig = {
  amount: { label: 'Amount', color: 'var(--chart-1)' },
} satisfies ChartConfig;

// ---------------------------------------------------------------------------
// Short bucket labels
// ---------------------------------------------------------------------------

const SHORT_LABELS: Record<string, string> = {
  'Current': 'Cur',
  '1-30 days': '1-30',
  '31-60 days': '31-60',
  '61-90 days': '61-90',
  '90+ days': '90+',
};

// ---------------------------------------------------------------------------
// Tooltips
// ---------------------------------------------------------------------------

function AgeingTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      {label && <p className="font-medium mb-1">{label}</p>}
      <p className="font-mono font-medium tabular-nums text-foreground">{formatGBP(payload[0].value)}</p>
    </div>
  );
}

function RadialTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <div className="grid gap-1">
        {payload.map((item: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ background: item.payload.fill || 'var(--chart-1)' }}
              />
              <span className="text-muted-foreground">{item.payload.name}</span>
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function FinancialReport({ dateRange }: { dateRange: ReportDateRange }) {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportService.financial(dateRange).then(result => {
      if (!cancelled) { setData(result); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateRange]);

  // -------------------------------------------------------------------------
  // All useMemo hooks BEFORE any early returns
  // -------------------------------------------------------------------------

  const ageingAreaData = useMemo(() => {
    if (!data) return [];
    return data.ageing.map(a => ({ name: a.bucket.replace(' days', ''), value: a.amount }));
  }, [data]);

  const ageingBarData = useMemo(() => {
    if (!data) return [];
    return data.ageing.map(a => ({
      name: SHORT_LABELS[a.bucket] || a.bucket,
      bucket: a.bucket,
      value: a.amount,
    }));
  }, [data]);

  const overdueRadialData = useMemo(() => {
    if (!data) return [];
    const s = data.summary;
    return [
      { name: 'Current', value: s.total_invoices - s.overdue_count, fill: 'var(--chart-1)' },
      { name: 'Overdue', value: s.overdue_count, fill: 'var(--destructive)' },
    ];
  }, [data]);

  const overdueRadialConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = { value: { label: 'Invoices' } };
    overdueRadialData.forEach(d => {
      cfg[d.name] = { label: d.name, color: d.fill };
    });
    return cfg;
  }, [overdueRadialData]);

  // -------------------------------------------------------------------------
  // Early returns
  // -------------------------------------------------------------------------

  if (loading) return <Skeleton />;
  if (!data) return <p className="text-muted-foreground p-4">Failed to load report data.</p>;

  const { summary, ageing } = data;

  return (
    <div className="space-y-4 mt-4">
      {/* ----------------------------------------------------------------- */}
      {/* Metric cards with embedded mini charts                            */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Card 1 — Total Invoiced — Area Chart */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Total Invoiced</CardDescription>
            <CardTitle className="text-xl tabular-nums">{formatGBP(summary.total_invoiced)}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto">
            <ChartContainer config={ageingAreaConfig} className="h-28 w-full">
              <AreaChart
                data={ageingAreaData}
                margin={{ left: 0, right: 0, top: 4, bottom: 0 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  tick={{ fontSize: 10 }}
                />
                <ChartTooltip cursor={false} content={<AgeingTooltip />} />
                <Area
                  dataKey="value"
                  type="monotone"
                  fill="url(#financial-area-gradient)"
                  fillOpacity={0.4}
                  stroke="var(--color-value)"
                  strokeWidth={2}
                />
                <defs>
                  <linearGradient id="financial-area-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0} />
                  </linearGradient>
                </defs>
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Card 2 — Outstanding — Bar Chart with ageing colours */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Outstanding</CardDescription>
            <CardTitle className="text-xl tabular-nums text-amber-400">{formatGBP(summary.total_outstanding)}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto">
            <ChartContainer config={ageingBarConfig} className="h-28 w-full">
              <BarChart
                data={ageingBarData}
                margin={{ left: 4, right: 4, top: 4, bottom: 0 }}
              >
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  tick={{ fontSize: 10 }}
                />
                <ChartTooltip cursor={false} content={<AgeingTooltip />} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {ageingBarData.map((entry, i) => (
                    <Cell key={i} fill={AGEING_COLORS[entry.bucket] || 'var(--chart-5)'} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Card 3 — Overdue Count — Radial Chart */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Overdue Count</CardDescription>
            <CardTitle className="text-xl tabular-nums text-red-400">{summary.overdue_count.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto flex items-center justify-center">
            <ChartContainer config={overdueRadialConfig} className="h-28 w-full max-w-[200px]">
              <RadialBarChart
                data={overdueRadialData}
                innerRadius={20}
                outerRadius={52}
              >
                <ChartTooltip cursor={false} content={<RadialTooltip />} />
                <RadialBar cornerRadius={8} dataKey="value" background className="drop-shadow-lg">
                  {overdueRadialData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.fill}
                      filter={`url(#overdue-glow-${i})`}
                    />
                  ))}
                </RadialBar>
                <defs>
                  {overdueRadialData.map((_, i) => (
                    <filter key={i} id={`overdue-glow-${i}`} x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="6" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  ))}
                </defs>
              </RadialBarChart>
            </ChartContainer>
            {/* Legend */}
            <div className="flex flex-col gap-1 pr-2">
              {overdueRadialData.map(d => (
                <div key={d.name} className="flex items-center gap-2 text-[11px]">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="font-medium text-foreground tabular-nums ml-auto">{d.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Card 4 — Overdue Amount — Bar Chart with 90+ in red */}
        <Card className="py-4 gap-3 h-full hover:border-primary/30 transition-colors">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Overdue Amount</CardDescription>
            <CardTitle className="text-xl tabular-nums text-red-400">{formatGBP(summary.overdue_amount)}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-0 mt-auto">
            <ChartContainer config={ageingBarConfig} className="h-28 w-full">
              <BarChart
                data={ageingBarData}
                margin={{ left: 4, right: 4, top: 4, bottom: 0 }}
              >
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  tick={{ fontSize: 10 }}
                />
                <ChartTooltip cursor={false} content={<AgeingTooltip />} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {ageingBarData.map((entry, i) => (
                    <Cell key={i} fill={AGEING_COLORS[entry.bucket] || 'var(--chart-5)'} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Invoice Ageing — full-width bar chart                             */}
      {/* ----------------------------------------------------------------- */}
      {ageing.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Invoice Ageing</h3>
            <ChartContainer config={ageingFullConfig} className="h-[200px] w-full">
              <BarChart data={ageing}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<AgeingTooltip />} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {ageing.map((entry, i) => (
                    <Cell key={i} fill={AGEING_COLORS[entry.bucket] || 'var(--chart-5)'} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Ageing Breakdown — table                                          */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Ageing Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Bucket</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Invoices</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {ageing.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-4 font-medium">{row.bucket}</td>
                    <td className="py-2 text-right tabular-nums">{row.invoice_count.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{formatGBP(row.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2 pr-4">Total Outstanding</td>
                  <td className="py-2 text-right tabular-nums">{ageing.reduce((s, r) => s + r.invoice_count, 0).toLocaleString()}</td>
                  <td className="py-2 text-right tabular-nums">{formatGBP(ageing.reduce((s, r) => s + r.amount, 0))}</td>
                </tr>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-[180px] rounded-lg bg-muted/50" />)}
      </div>
      <div className="h-[240px] rounded-lg bg-muted/50" />
      <div className="h-[200px] rounded-lg bg-muted/50" />
    </div>
  );
}
