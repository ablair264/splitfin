import { WidgetConfig } from '../components/analytics/CustomizableDashboard/CustomizableDashboard';

export interface AnalyticsPage {
  id: string;
  name: string;
  icon: string;
  template: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  widgets?: WidgetConfig[];
  layouts?: any;
}

export interface CreatePageRequest {
  name: string;
  icon: string;
  template: string;
}

// Template widget configurations
const templateWidgets: Record<string, WidgetConfig[]> = {
  customers: [
    {
      id: 'customers-total',
      title: 'Total Customers',
      subtitle: 'All registered customers',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'customers',
      config: {
        metric: 'totalCustomers',
        displayMode: 'medium',
        showTrend: true,
        color: '#79d5e9',
        variant: 'variant1'
      }
    },
    {
      id: 'customers-new',
      title: 'New Customers',
      subtitle: 'Recently joined customers',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'customers',
      config: {
        metric: 'newCustomers',
        displayMode: 'medium',
        showTrend: true,
        color: '#4daeac',
        variant: 'variant2'
      }
    },
    {
      id: 'customers-active',
      title: 'Active Customers',
      subtitle: 'Customers with recent orders',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'customers',
      config: {
        metric: 'activeCustomers',
        displayMode: 'medium',
        showTrend: true,
        color: '#61bc8e',
        variant: 'variant3'
      }
    },
    {
      id: 'customers-growth-chart',
      title: 'Customer Growth',
      subtitle: 'Customer acquisition over time',
      type: 'chart',
      displayFormat: 'FullGraph',
      dataSource: 'customers',
      config: {
        chartType: 'line',
        size: 'full',
        color: '#79d5e9',
        showLegend: true
      }
    },
    {
      id: 'customers-table',
      title: 'Top Customers',
      subtitle: 'Customers by revenue',
      type: 'table',
      displayFormat: 'DataTable',
      dataSource: 'customers',
      config: {
        size: 'full',
        maxRows: 10,
        columns: [
          { key: 'name', header: 'Customer', width: '40%', format: 'text' },
          { key: 'orders', header: 'Orders', width: '20%', format: 'number' },
          { key: 'revenue', header: 'Revenue', width: '25%', format: 'currency' },
          { key: 'status', header: 'Status', width: '15%', format: 'text' }
        ]
      }
    }
  ],
  orders: [
    {
      id: 'orders-total',
      title: 'Total Orders',
      subtitle: '',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'orders',
      config: {
        metric: 'totalOrders',
        displayMode: 'medium',
        showTrend: true,
        color: '#79d5e9',
        variant: 'variant1'
      }
    },
    {
      id: 'orders-pending',
      title: 'Pending Orders',
      subtitle: '',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'orders',
      config: {
        metric: 'pendingOrders',
        displayMode: 'medium',
        showTrend: false,
        color: '#fbbf24',
        variant: 'variant2'
      }
    },
    {
      id: 'orders-conversion',
      title: 'Order Conversion',
      subtitle: '',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'orders',
      config: {
        metric: 'orderConversion',
        displayMode: 'medium',
        showTrend: true,
        color: '#61bc8e',
        variant: 'variant3'
      }
    },
    {
      id: 'orders-chart',
      title: 'Orders Over Time',
      subtitle: '',
      type: 'chart',
      displayFormat: 'FullGraph',
      dataSource: 'orders',
      config: {
        chartType: 'bar',
        size: 'full',
        color: '#79d5e9'
      }
    },
    {
      id: 'orders-table',
      title: 'Recent Orders',
      subtitle: '',
      type: 'table',
      displayFormat: 'DataTable',
      dataSource: 'orders',
      config: {
        size: 'full',
        maxRows: 10
      }
    }
  ],
  invoices: [
    {
      id: 'invoices-revenue',
      title: 'Total Revenue',
      subtitle: 'Revenue from all invoices',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'orders',
      config: {
        metric: 'totalRevenue',
        displayMode: 'medium',
        showTrend: true,
        color: '#79d5e9',
        variant: 'variant1'
      }
    },
    {
      id: 'invoices-outstanding',
      title: 'Outstanding Invoices',
      subtitle: 'Unpaid invoices',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'orders',
      config: {
        metric: 'outstandingInvoices',
        displayMode: 'medium',
        showTrend: false,
        color: '#dc2626',
        variant: 'variant2'
      }
    },
    {
      id: 'invoices-paid',
      title: 'Paid Invoices',
      subtitle: 'Successfully collected payments',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'orders',
      config: {
        metric: 'paidInvoices',
        displayMode: 'medium',
        showTrend: true,
        color: '#61bc8e',
        variant: 'variant3'
      }
    },
    {
      id: 'invoices-chart',
      title: 'Revenue Trend',
      subtitle: 'Monthly revenue progression',
      type: 'chart',
      displayFormat: 'FullGraph',
      dataSource: 'orders',
      config: {
        chartType: 'area',
        size: 'full',
        color: '#79d5e9'
      }
    },
    {
      id: 'invoices-table',
      title: 'Recent Invoices',
      subtitle: 'Latest invoice activity',
      type: 'activity',
      displayFormat: 'ActivityFeed',
      dataSource: 'activities',
      config: {
        size: 'full',
        maxActivities: 8,
        showFilters: true
      }
    }
  ],
  'sales-team': [
    {
      id: 'sales-performance',
      title: 'Team Performance',
      subtitle: '',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'sales_team',
      config: {
        metric: 'teamPerformance',
        displayMode: 'medium',
        showTrend: true,
        color: '#79d5e9',
        variant: 'variant1'
      }
    },
    {
      id: 'sales-targets',
      title: 'Monthly Targets',
      subtitle: '',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'sales_team',
      config: {
        metric: 'monthlyTargets',
        displayMode: 'medium',
        showTrend: false,
        color: '#fbbf24',
        variant: 'variant2'
      }
    },
    {
      id: 'sales-conversion',
      title: 'Conversion Rate',
      subtitle: '',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'sales_team',
      config: {
        metric: 'conversionRate',
        displayMode: 'medium',
        showTrend: true,
        color: '#61bc8e',
        variant: 'variant3'
      }
    },
    {
      id: 'sales-chart',
      title: 'Sales Performance',
      subtitle: '',
      type: 'chart',
      displayFormat: 'FullGraph',
      dataSource: 'sales_team',
      config: {
        chartType: 'bar',
        size: 'full',
        color: '#79d5e9'
      }
    },
    {
      id: 'sales-table',
      title: 'Sales Team Leaderboard',
      subtitle: '',
      type: 'table',
      displayFormat: 'DataTable',
      dataSource: 'sales_team',
      config: {
        size: 'full',
        maxRows: 10,
        columns: [
          { key: 'name', header: 'Name', width: '40%', format: 'text' },
          { key: 'orders', header: 'Orders', width: '30%', format: 'number' },
          { key: 'revenue', header: 'Revenue', width: '30%', format: 'currency' }
        ]
      }
    }
  ],
  admin: [
    {
      id: 'admin-health',
      title: 'System Health',
      subtitle: 'Overall system performance',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'orders',
      config: {
        metric: 'systemHealth',
        displayMode: 'medium',
        showTrend: false,
        color: '#61bc8e',
        variant: 'variant1'
      }
    },
    {
      id: 'admin-users',
      title: 'Active Users',
      subtitle: 'Currently active system users',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'customers',
      config: {
        metric: 'activeUsers',
        displayMode: 'medium',
        showTrend: true,
        color: '#79d5e9',
        variant: 'variant2'
      }
    },
    {
      id: 'admin-storage',
      title: 'Storage Usage',
      subtitle: 'System storage utilization',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'orders',
      config: {
        metric: 'storageUsage',
        displayMode: 'medium',
        showTrend: false,
        color: '#fbbf24',
        variant: 'variant3'
      }
    },
    {
      id: 'admin-chart',
      title: 'System Activity',
      subtitle: 'Daily system usage metrics',
      type: 'chart',
      displayFormat: 'FullGraph',
      dataSource: 'orders',
      config: {
        chartType: 'line',
        size: 'full',
        color: '#79d5e9'
      }
    },
    {
      id: 'admin-activities',
      title: 'Recent Admin Actions',
      subtitle: 'Latest system activities',
      type: 'activity',
      displayFormat: 'ActivityFeed',
      dataSource: 'activities',
      config: {
        size: 'full',
        maxActivities: 10,
        showFilters: true
      }
    }
  ],
  finance: [
    {
      id: 'finance-revenue',
      title: 'Total Revenue',
      subtitle: '',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'orders',
      config: {
        metric: 'totalRevenue',
        displayMode: 'medium',
        showTrend: true,
        color: '#79d5e9',
        variant: 'variant1'
      }
    },
    {
      id: 'finance-expenses',
      title: 'Monthly Expenses',
      subtitle: '',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'orders',
      config: {
        metric: 'monthlyExpenses',
        displayMode: 'medium',
        showTrend: true,
        color: '#dc2626',
        variant: 'variant2'
      }
    },
    {
      id: 'finance-profit',
      title: 'Profit Margin',
      subtitle: '',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'orders',
      config: {
        metric: 'profitMargin',
        displayMode: 'medium',
        showTrend: true,
        color: '#61bc8e',
        variant: 'variant3'
      }
    },
    {
      id: 'finance-chart',
      title: 'Financial Trend',
      subtitle: '',
      type: 'chart',
      displayFormat: 'FullGraph',
      dataSource: 'orders',
      config: {
        chartType: 'area',
        size: 'full',
        color: '#79d5e9'
      }
    },
    {
      id: 'finance-table',
      title: 'Budget vs Actual',
      subtitle: '',
      type: 'table',
      displayFormat: 'DataTable',
      dataSource: 'orders',
      config: {
        size: 'full',
        maxRows: 10
      }
    }
  ],
  overview: [
    {
      id: 'overview-revenue',
      title: 'Total Revenue',
      subtitle: '',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'orders',
      config: {
        metric: 'totalRevenue',
        displayMode: 'medium',
        showTrend: true,
        color: '#79d5e9',
        variant: 'variant1'
      }
    },
    {
      id: 'overview-orders',
      title: 'Total Orders',
      subtitle: '',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'orders',
      config: {
        metric: 'totalOrders',
        displayMode: 'medium',
        showTrend: true,
        color: '#4daeac',
        variant: 'variant2'
      }
    },
    {
      id: 'overview-customers',
      title: 'Active Customers',
      subtitle: '',
      type: 'metric',
      displayFormat: 'MetricCard',
      dataSource: 'customers',
      config: {
        metric: 'activeCustomers',
        displayMode: 'medium',
        showTrend: true,
        color: '#61bc8e',
        variant: 'variant3'
      }
    },
    {
      id: 'overview-chart',
      title: 'Business Overview',
      subtitle: '',
      type: 'chart',
      displayFormat: 'FullGraph',
      dataSource: 'orders',
      config: {
        chartType: 'area',
        size: 'full',
        color: '#79d5e9'
      }
    },
    {
      id: 'overview-activity',
      title: 'Recent Activity',
      subtitle: '',
      type: 'activity',
      displayFormat: 'ActivityFeed',
      dataSource: 'activities',
      config: {
        size: 'full',
        maxActivities: 6,
        showFilters: true
      }
    }
  ]
};

// Generate default layouts for widgets
function generateDefaultLayouts(widgets: WidgetConfig[]) {
  const lg: any[] = [];
  const md: any[] = [];
  const sm: any[] = [];
  
  let currentY = 0;
  let currentX = 0;
  
  widgets.forEach((widget, index) => {
    const isFullWidth = widget.config.size === 'full' || 
      ['FullGraph', 'DataTable', 'ActivityFeed'].includes(widget.displayFormat);
    
    const widgetWidth = isFullWidth ? 9 : 3;
    const widgetHeight = ['FullGraph'].includes(widget.displayFormat) ? 5 : 
                        ['DataTable', 'ActivityFeed'].includes(widget.displayFormat) ? 4 : 3;
    
    // Large screens (lg)
    if (isFullWidth || currentX + widgetWidth > 12) {
      currentY += widgetHeight;
      currentX = 0;
    }
    
    lg.push({
      i: widget.id,
      x: currentX,
      y: currentY,
      w: widgetWidth,
      h: widgetHeight
    });
    
    if (isFullWidth) {
      currentX = 0;
      currentY += widgetHeight;
    } else {
      currentX += widgetWidth;
    }
    
    // Medium screens (md) - adjust width
    md.push({
      i: widget.id,
      x: currentX > 0 ? Math.min(currentX, 4) : 0,
      y: currentY,
      w: widgetWidth === 9 ? 8 : (widgetWidth === 3 ? 4 : widgetWidth),
      h: widgetHeight
    });
    
    // Small screens (sm) - all full width
    sm.push({
      i: widget.id,
      x: 0,
      y: index * widgetHeight,
      w: 6,
      h: widgetHeight
    });
  });
  
  return { lg, md, sm };
}

// Generate a UUID v4
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const STORAGE_KEY = 'splitfin_analytics_pages';

class AnalyticsPageService {
  private getPages(): AnalyticsPage[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private savePages(pages: AnalyticsPage[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  }

  private getUserId(): string {
    const agentId = localStorage.getItem('agent_id');
    if (!agentId) {
      throw new Error('User not authenticated');
    }
    return agentId;
  }

  async createPage(pageData: CreatePageRequest): Promise<AnalyticsPage> {
    const userId = this.getUserId();

    // Get template widgets
    const widgets = templateWidgets[pageData.template] || templateWidgets.overview;

    // Generate unique IDs for widgets
    const widgetsWithUniqueIds = widgets.map(widget => ({
      ...widget,
      id: `${pageData.template}-${widget.id.split('-').pop()}-${Date.now()}`
    }));

    // Generate default layouts
    const layouts = generateDefaultLayouts(widgetsWithUniqueIds);

    const now = new Date().toISOString();
    const newPage: AnalyticsPage = {
      id: generateUUID(),
      name: pageData.name,
      icon: pageData.icon,
      template: pageData.template,
      user_id: userId,
      created_at: now,
      updated_at: now,
      widgets: widgetsWithUniqueIds,
      layouts
    };

    const pages = this.getPages();
    pages.push(newPage);
    this.savePages(pages);

    return newPage;
  }

  async getUserPages(): Promise<AnalyticsPage[]> {
    const userId = this.getUserId();
    const pages = this.getPages();
    return pages
      .filter(p => p.user_id === userId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  async getPage(pageId: string): Promise<AnalyticsPage | null> {
    const userId = this.getUserId();
    const pages = this.getPages();
    return pages.find(p => p.id === pageId && p.user_id === userId) || null;
  }

  async updatePage(pageId: string, updates: Partial<AnalyticsPage>): Promise<AnalyticsPage> {
    const userId = this.getUserId();
    const pages = this.getPages();
    const index = pages.findIndex(p => p.id === pageId && p.user_id === userId);

    if (index === -1) {
      throw new Error('Failed to update analytics page: page not found');
    }

    const updatedPage: AnalyticsPage = {
      ...pages[index],
      ...updates,
      id: pages[index].id,
      user_id: pages[index].user_id,
      created_at: pages[index].created_at,
      updated_at: new Date().toISOString()
    };

    pages[index] = updatedPage;
    this.savePages(pages);

    return updatedPage;
  }

  async deletePage(pageId: string): Promise<void> {
    const userId = this.getUserId();
    const pages = this.getPages();
    const filtered = pages.filter(p => !(p.id === pageId && p.user_id === userId));

    if (filtered.length === pages.length) {
      throw new Error('Failed to delete analytics page: page not found');
    }

    this.savePages(filtered);
  }
}

export const analyticsPageService = new AnalyticsPageService();