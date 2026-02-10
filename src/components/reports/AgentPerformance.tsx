import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Download, Users, DollarSign, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { reportService } from '@/services/reportService';
import type { ReportDateRange, AgentPerformanceData } from '@/types/domain';

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export default function AgentPerformance({ dateRange }: { dateRange: ReportDateRange }) {
  const [data, setData] = useState<AgentPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportService.agentPerformance(dateRange).then(result => {
      if (!cancelled) { setData(result); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateRange]);

  if (loading) return <Skeleton />;
  if (!data) return <p className="text-muted-foreground p-4">Failed to load report data.</p>;

  const { agents } = data;
  const totalRevenue = agents.reduce((sum, a) => sum + a.revenue, 0);
  const avgRevenue = agents.length > 0 ? totalRevenue / agents.length : 0;

  return (
    <div className="space-y-6 mt-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Active Agents" value={agents.length.toString()} icon={Users} color="blue" />
        <StatCard label="Combined Revenue" value={formatGBP(totalRevenue)} icon={DollarSign} color="emerald" />
        <StatCard label="Avg Revenue / Agent" value={formatGBP(avgRevenue)} icon={TrendingUp} color="purple" />
      </div>

      {/* Revenue by Agent Chart */}
      {agents.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Revenue by Agent</h3>
            <ResponsiveContainer width="100%" height={Math.max(200, agents.length * 48)}>
              <BarChart data={agents} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} width={80} />
                <Tooltip formatter={(value: number) => [formatGBP(value), 'Revenue']} />
                <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Agent Table */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Agent Breakdown</h3>
            <Button intent="outline" size="sm" onPress={() => reportService.exportCsv('agent-performance', dateRange)}>
              <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Agent</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Orders</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Revenue</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Avg Order</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Customers</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-4 font-medium">{a.name}</td>
                    <td className="py-2 text-right tabular-nums">{a.order_count.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{formatGBP(a.revenue)}</td>
                    <td className="py-2 text-right tabular-nums">{formatGBP(a.avg_order_value)}</td>
                    <td className="py-2 text-right tabular-nums">{a.customer_count.toLocaleString()}</td>
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

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'border-emerald-500/20 text-emerald-400',
    blue: 'border-blue-500/20 text-blue-400',
    purple: 'border-purple-500/20 text-purple-400',
  };
  const cls = colorMap[color] || 'border-zinc-500/20 text-zinc-400';
  const [borderCls, iconCls] = cls.split(' ');
  return (
    <Card className={borderCls}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
        </div>
        <Icon className={`h-5 w-5 ${iconCls}`} />
      </CardContent>
    </Card>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6 mt-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted/50" />)}
      </div>
      <div className="h-[300px] rounded-lg bg-muted/50" />
      <div className="h-[200px] rounded-lg bg-muted/50" />
    </div>
  );
}
