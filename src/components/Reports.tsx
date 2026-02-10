import { useState } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import PageHeader from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { reportService } from '@/services/reportService';
import type { ReportDateRange } from '@/types/domain';
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Generate and export business reports"
      />

      {/* Controls Row */}
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

      {/* Tabs */}
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
          <SalesOverview dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="agent-performance">
          <AgentPerformance dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="agent-commission">
          <AgentCommission dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="brand-analysis">
          <BrandAnalysis dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="customer-insights">
          <CustomerInsights dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="inventory-health">
          <InventoryHealth dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="financial">
          <FinancialReport dateRange={dateRange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
