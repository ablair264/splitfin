import React, { useEffect, useState } from 'react';
import { productService } from '../../services/productService';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, ResponsiveContainer } from 'recharts';

interface InventoryMetrics {
  totalSurplus: number;
  totalItems: number;
  newItemsThisWeek: number;
  lowStockItems: number;
  totalValue: number;
  topSellingBrands: number;
}

interface InventoryMetricCardsProps {
  companyId: string;
}

const InventoryMetricCards: React.FC<InventoryMetricCardsProps> = ({ companyId }) => {
  const [metrics, setMetrics] = useState<InventoryMetrics>({
    totalSurplus: 0,
    totalItems: 0,
    newItemsThisWeek: 0,
    lowStockItems: 0,
    totalValue: 0,
    topSellingBrands: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInventoryMetrics();
  }, [companyId]);

  const fetchInventoryMetrics = async () => {
    try {
      setLoading(true);
      setError(null);

      // TODO: brands table not available in Neon backend - using productService instead
      // Get products with active status
      const { data: products, total } = await productService.list({ status: 'active', limit: 1000 });

      if (!products || products.length === 0) {
        setMetrics({
          totalSurplus: 0,
          totalItems: 0,
          newItemsThisWeek: 0,
          lowStockItems: 0,
          totalValue: 0,
          topSellingBrands: 0
        });
        return;
      }

      // Calculate metrics from products
      const totalItems = total || products.length;

      // Calculate surplus items (items above reorder level)
      // TODO: stock_level and reorder_level fields may need mapping from Product type
      const totalSurplus = products.reduce((sum, item: any) => {
        const stockLevel = item.stock_level || item.gross_stock_level || 0;
        const reorderLevel = item.reorder_level || 0;
        const surplus = Math.max(0, stockLevel - reorderLevel);
        return sum + surplus;
      }, 0);

      // Calculate new items this week
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const newItemsThisWeek = products.filter((item: any) => {
        const createdDate = item.created_at || item.created_date;
        if (!createdDate) return false;
        return new Date(createdDate) >= oneWeekAgo;
      }).length;

      // Calculate additional metrics
      const lowStockItems = products.filter((item: any) => {
        const stockLevel = item.stock_level || item.gross_stock_level || 0;
        const reorderLevel = item.reorder_level || 0;
        return stockLevel <= reorderLevel && reorderLevel > 0;
      }).length;

      // Calculate total inventory value
      const totalValue = products.reduce((sum, item: any) => {
        const stockLevel = item.stock_level || item.gross_stock_level || 0;
        const price = item.cost_price || item.price || 10; // Default to 10 if no price
        return sum + (stockLevel * price);
      }, 0);

      // Count unique brands
      const uniqueBrands = new Set(products.map((p: any) => p.brand).filter(Boolean));
      const topSellingBrands = uniqueBrands.size || 0;

      setMetrics({
        totalSurplus,
        totalItems,
        newItemsThisWeek,
        lowStockItems,
        totalValue,
        topSellingBrands
      });

    } catch (err) {
      console.error('Error fetching inventory metrics:', err);
      setError('Failed to load inventory metrics');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-GB').format(num);
  };

  // Generate chart data based on metrics
  const generateSurplusChartData = () => {
    const baseValue = metrics.totalSurplus;
    return Array.from({ length: 7 }, (_, i) => ({
      day: i + 1,
      value: Math.max(0, baseValue + Math.random() * 200 - 100)
    }));
  };

  const generateItemsChartData = () => {
    const baseValue = metrics.totalItems;
    return Array.from({ length: 30 }, (_, i) => ({
      day: i + 1,
      value: Math.max(0, baseValue + Math.sin(i * 0.2) * 50 + Math.random() * 20 - 10)
    }));
  };

  const generateNewItemsChartData = () => {
    return Array.from({ length: 7 }, (_, i) => ({
      day: `Day ${i + 1}`,
      value: Math.floor(Math.random() * (metrics.newItemsThisWeek + 5))
    }));
  };

  const generateLowStockChartData = () => {
    return Array.from({ length: 7 }, (_, i) => ({
      day: i + 1,
      value: Math.max(0, metrics.lowStockItems + Math.random() * 10 - 5)
    }));
  };

  const generateValueChartData = () => {
    const baseValue = metrics.totalValue;
    return Array.from({ length: 30 }, (_, i) => ({
      day: i + 1,
      value: Math.max(0, baseValue + Math.sin(i * 0.3) * (baseValue * 0.1) + Math.random() * (baseValue * 0.05) - (baseValue * 0.025))
    }));
  };

  const generateBrandsChartData = () => {
    const baseValue = metrics.topSellingBrands;
    return Array.from({ length: 30 }, (_, i) => ({
      day: i + 1,
      value: Math.max(0, baseValue + Math.random() * 3 - 1.5)
    }));
  };

  if (loading) {
    return (
      <div className="grid grid-cols-3 grid-rows-2 gap-3 w-full max-md:grid-cols-1 max-md:gap-4">
        <div className="flex items-center justify-center min-h-[180px] text-muted-foreground text-sm col-span-full bg-card rounded-xl">Loading metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid grid-cols-3 grid-rows-2 gap-3 w-full max-md:grid-cols-1 max-md:gap-4">
        <div className="flex items-center justify-center min-h-[180px] text-destructive text-sm col-span-full bg-card rounded-xl">{error}</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 grid-rows-2 gap-3 w-full max-md:grid-cols-1 max-md:gap-4">
      {/* Total Surplus Card */}
      <div className="bg-card rounded-xl relative flex flex-col min-h-[100px] overflow-hidden shadow-md max-md:min-h-[140px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-destructive" />
        <div className="flex-1 px-4 py-3.5 flex flex-col justify-center text-center gap-1.5">
          <div className="flex flex-col gap-0.5">
            <h3 className="m-0 text-[0.8rem] font-medium text-card-foreground leading-tight">Total Surplus</h3>
            <p className="m-0 text-[0.7rem] text-muted-foreground font-normal opacity-80 leading-tight">All Suppliers</p>
          </div>
          <div className="hidden">
            <ResponsiveContainer width="100%" height={60}>
              <LineChart data={generateSurplusChartData()}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#ef4444' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[1.75rem] font-bold leading-none mt-1 text-destructive">
            {formatNumber(metrics.totalSurplus)}
          </div>
        </div>
      </div>

      {/* Total Items Card */}
      <div className="bg-card rounded-xl relative flex flex-col min-h-[100px] overflow-hidden shadow-md max-md:min-h-[140px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#06b6d4]" />
        <div className="flex-1 px-4 py-3.5 flex flex-col justify-center text-center gap-1.5">
          <div className="flex flex-col gap-0.5">
            <h3 className="m-0 text-[0.8rem] font-medium text-card-foreground leading-tight">Total Items</h3>
            <p className="m-0 text-[0.7rem] text-muted-foreground font-normal opacity-80 leading-tight">All Suppliers</p>
          </div>
          <div className="hidden">
            <ResponsiveContainer width="100%" height={60}>
              <AreaChart data={generateItemsChartData()}>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  fill="#06b6d4"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[1.75rem] font-bold leading-none mt-1 text-[#06b6d4]">
            {formatNumber(metrics.totalItems)}
          </div>
        </div>
      </div>

      {/* New Items Card */}
      <div className="bg-card rounded-xl relative flex flex-col min-h-[100px] overflow-hidden shadow-md max-md:min-h-[140px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-success" />
        <div className="flex-1 px-4 py-3.5 flex flex-col justify-center text-center gap-1.5">
          <div className="flex flex-col gap-0.5">
            <h3 className="m-0 text-[0.8rem] font-medium text-card-foreground leading-tight">New Items</h3>
            <p className="m-0 text-[0.7rem] text-muted-foreground font-normal opacity-80 leading-tight">This Week</p>
          </div>
          <div className="hidden">
            <ResponsiveContainer width="100%" height={60}>
              <BarChart data={generateNewItemsChartData()}>
                <Bar
                  dataKey="value"
                  fill="#10b981"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[1.75rem] font-bold leading-none mt-1 text-success">
            {formatNumber(metrics.newItemsThisWeek)}
          </div>
        </div>
      </div>

      {/* Low Stock Items Card */}
      <div className="bg-card rounded-xl relative flex flex-col min-h-[100px] overflow-hidden shadow-md max-md:min-h-[140px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-warning" />
        <div className="flex-1 px-4 py-3.5 flex flex-col justify-center text-center gap-1.5">
          <div className="flex flex-col gap-0.5">
            <h3 className="m-0 text-[0.8rem] font-medium text-card-foreground leading-tight">Low Stock Alert</h3>
            <p className="m-0 text-[0.7rem] text-muted-foreground font-normal opacity-80 leading-tight">Items Below Reorder</p>
          </div>
          <div className="hidden">
            <ResponsiveContainer width="100%" height={60}>
              <BarChart data={generateLowStockChartData()}>
                <Bar
                  dataKey="value"
                  fill="#f59e0b"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[1.75rem] font-bold leading-none mt-1 text-warning">
            {formatNumber(metrics.lowStockItems)}
          </div>
        </div>
      </div>

      {/* Total Value Card */}
      <div className="bg-card rounded-xl relative flex flex-col min-h-[100px] overflow-hidden shadow-md max-md:min-h-[140px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#8b5cf6]" />
        <div className="flex-1 px-4 py-3.5 flex flex-col justify-center text-center gap-1.5">
          <div className="flex flex-col gap-0.5">
            <h3 className="m-0 text-[0.8rem] font-medium text-card-foreground leading-tight">Total Value</h3>
            <p className="m-0 text-[0.7rem] text-muted-foreground font-normal opacity-80 leading-tight">Stock Worth</p>
          </div>
          <div className="hidden">
            <ResponsiveContainer width="100%" height={60}>
              <LineChart data={generateValueChartData()}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#8b5cf6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[1.75rem] font-bold leading-none mt-1 text-[#8b5cf6]">
            £{formatNumber(metrics.totalValue)}
          </div>
        </div>
      </div>

      {/* Top Selling Brands Card */}
      <div className="bg-card rounded-xl relative flex flex-col min-h-[100px] overflow-hidden shadow-md max-md:min-h-[140px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--info)]" />
        <div className="flex-1 px-4 py-3.5 flex flex-col justify-center text-center gap-1.5">
          <div className="flex flex-col gap-0.5">
            <h3 className="m-0 text-[0.8rem] font-medium text-card-foreground leading-tight">Active Brands</h3>
            <p className="m-0 text-[0.7rem] text-muted-foreground font-normal opacity-80 leading-tight">In Catalog</p>
          </div>
          <div className="hidden">
            <ResponsiveContainer width="100%" height={60}>
              <AreaChart data={generateBrandsChartData()}>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="#3b82f6"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[1.75rem] font-bold leading-none mt-1 text-[var(--info)]">
            {formatNumber(metrics.topSellingBrands)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InventoryMetricCards;
