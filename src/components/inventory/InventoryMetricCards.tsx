import React, { useEffect, useState } from 'react';
import { productService } from '../../services/productService';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, ResponsiveContainer } from 'recharts';
import styles from './InventoryMetricCards.module.css';

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
      <div className={styles.container}>
        <div className={styles.loading}>Loading metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Total Surplus Card */}
      <div className={styles.card}>
        <div className={`${styles.accent} ${styles.accentRed}`} />
        <div className={styles.content}>
          <div className={styles.header}>
            <h3 className={styles.title}>Total Surplus</h3>
            <p className={styles.subtitle}>All Suppliers</p>
          </div>
          <div className={styles.chartArea}>
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
          <div className={`${styles.value} ${styles.valueRed}`}>
            {formatNumber(metrics.totalSurplus)}
          </div>
        </div>
      </div>

      {/* Total Items Card */}
      <div className={styles.card}>
        <div className={`${styles.accent} ${styles.accentCyan}`} />
        <div className={styles.content}>
          <div className={styles.header}>
            <h3 className={styles.title}>Total Items</h3>
            <p className={styles.subtitle}>All Suppliers</p>
          </div>
          <div className={styles.chartArea}>
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
          <div className={`${styles.value} ${styles.valueCyan}`}>
            {formatNumber(metrics.totalItems)}
          </div>
        </div>
      </div>

      {/* New Items Card */}
      <div className={styles.card}>
        <div className={`${styles.accent} ${styles.accentGreen}`} />
        <div className={styles.content}>
          <div className={styles.header}>
            <h3 className={styles.title}>New Items</h3>
            <p className={styles.subtitle}>This Week</p>
          </div>
          <div className={styles.chartArea}>
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
          <div className={`${styles.value} ${styles.valueGreen}`}>
            {formatNumber(metrics.newItemsThisWeek)}
          </div>
        </div>
      </div>

      {/* Low Stock Items Card */}
      <div className={styles.card}>
        <div className={`${styles.accent} ${styles.accentOrange}`} />
        <div className={styles.content}>
          <div className={styles.header}>
            <h3 className={styles.title}>Low Stock Alert</h3>
            <p className={styles.subtitle}>Items Below Reorder</p>
          </div>
          <div className={styles.chartArea}>
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
          <div className={`${styles.value} ${styles.valueOrange}`}>
            {formatNumber(metrics.lowStockItems)}
          </div>
        </div>
      </div>

      {/* Total Value Card */}
      <div className={styles.card}>
        <div className={`${styles.accent} ${styles.accentPurple}`} />
        <div className={styles.content}>
          <div className={styles.header}>
            <h3 className={styles.title}>Total Value</h3>
            <p className={styles.subtitle}>Stock Worth</p>
          </div>
          <div className={styles.chartArea}>
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
          <div className={`${styles.value} ${styles.valuePurple}`}>
            £{formatNumber(metrics.totalValue)}
          </div>
        </div>
      </div>

      {/* Top Selling Brands Card */}
      <div className={styles.card}>
        <div className={`${styles.accent} ${styles.accentBlue}`} />
        <div className={styles.content}>
          <div className={styles.header}>
            <h3 className={styles.title}>Active Brands</h3>
            <p className={styles.subtitle}>In Catalog</p>
          </div>
          <div className={styles.chartArea}>
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
          <div className={`${styles.value} ${styles.valueBlue}`}>
            {formatNumber(metrics.topSellingBrands)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InventoryMetricCards;