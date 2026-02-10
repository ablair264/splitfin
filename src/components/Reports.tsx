import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import PageHeader from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { reportService, type ReportFilters } from '@/services/reportService';
import type { ReportDateRange, ReportFilterOptions } from '@/types/domain';
import SalesOverview from './reports/SalesOverview';
import AgentPerformance from './reports/AgentPerformance';
import AgentCommission from './reports/AgentCommission';
import BrandAnalysis from './reports/BrandAnalysis';
import CustomerInsights from './reports/CustomerInsights';
import InventoryHealth from './reports/InventoryHealth';
import FinancialReport from './reports/FinancialReport';

const DATE_RANGES: { value: ReportDateRange; label: string }[] = [
  { value: '7_days', label: '7 Days' },
  { value: '30_days', label: '30 Days' },
  { value: '90_days', label: '90 Days' },
  { value: 'this_year', label: 'This Year' },
  { value: 'all_time', label: 'All Time' },
];

const TAB_EXPORTS: Record<string, string> = {
  'sales-overview': 'sales-overview',
  'agent-performance': 'agent-performance',
  'agent-commission': 'agent-commission',
  'brand-analysis': 'brand-analysis',
  'customer-insights': 'customer-insights',
  'inventory-health': 'inventory-health',
  'financial': 'financial',
};

export default function Reports() {
  usePageTitle('Reports');
  const [dateRange, setDateRange] = useState<ReportDateRange>('this_year');
  const [activeTab, setActiveTab] = useState('sales-overview');
  const [options, setOptions] = useState<ReportFilterOptions | null>(null);
  const [agentId, setAgentId] = useState('all');
  const [brand, setBrand] = useState('all');
  const [region, setRegion] = useState('all');

  useEffect(() => {
    reportService.filterOptions().then(setOptions).catch(() => {});
  }, []);

  const filters: ReportFilters = {
    agent_id: agentId !== 'all' ? agentId : undefined,
    brand: brand !== 'all' ? brand : undefined,
    region: region !== 'all' ? region : undefined,
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Generate and export business reports" />

      <div className="flex flex-wrap items-center gap-3">
        {/* Date Range Pills */}
        <div className="flex items-center gap-1.5">
          {DATE_RANGES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setDateRange(value)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                dateRange === value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filter Dropdowns */}
        {options && (
          <div className="flex items-center gap-2">
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {options.agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {options.brands.map(b => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                {options.regions.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            intent="outline"
            size="sm"
            onPress={() => reportService.exportFile(TAB_EXPORTS[activeTab], dateRange, 'csv')}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />CSV
          </Button>
          <Button
            intent="outline"
            size="sm"
            onPress={() => reportService.exportFile(TAB_EXPORTS[activeTab], dateRange, 'xlsx')}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />Excel
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start bg-muted/50 overflow-x-auto">
          <TabsTrigger value="sales-overview">Sales</TabsTrigger>
          <TabsTrigger value="agent-performance">Performance</TabsTrigger>
          <TabsTrigger value="agent-commission">Commission</TabsTrigger>
          <TabsTrigger value="brand-analysis">Brands</TabsTrigger>
          <TabsTrigger value="customer-insights">Customers</TabsTrigger>
          <TabsTrigger value="inventory-health">Inventory</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
        </TabsList>

        <TabsContent value="sales-overview">
          <SalesOverview dateRange={dateRange} filters={filters} />
        </TabsContent>
        <TabsContent value="agent-performance">
          <AgentPerformance dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="agent-commission">
          <AgentCommission dateRange={dateRange} filters={filters} />
        </TabsContent>
        <TabsContent value="brand-analysis">
          <BrandAnalysis dateRange={dateRange} filters={filters} />
        </TabsContent>
        <TabsContent value="customer-insights">
          <CustomerInsights dateRange={dateRange} filters={filters} />
        </TabsContent>
        <TabsContent value="inventory-health">
          <InventoryHealth dateRange={dateRange} filters={filters} />
        </TabsContent>
        <TabsContent value="financial">
          <FinancialReport dateRange={dateRange} filters={filters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
