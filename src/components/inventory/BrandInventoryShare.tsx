import React, { useEffect, useState } from 'react';
import { productService } from '../../services/productService';

interface BrandInventoryData {
  brand_id: string;
  brand_name: string;
  total_stock: number;
  total_value: number;
  percentage: number;
  color: string;
}

interface BrandInventoryShareProps {
  companyId: string;
}

// Color palette for the chart
const COLORS = [
  '#61bc8e', // Green
  '#79d5e9', // Blue
  '#f77d11', // Orange
  '#fbbf24', // Yellow
  '#a78bfa', // Purple
  '#f87171', // Red
  '#34d399', // Emerald
  '#60a5fa', // Light Blue
];

const BrandInventoryShare: React.FC<BrandInventoryShareProps> = ({ companyId }) => {
  const [data, setData] = useState<BrandInventoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredBrand, setHoveredBrand] = useState<BrandInventoryData | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    fetchBrandInventoryData();
  }, [companyId]);

  const fetchBrandInventoryData = async () => {
    try {
      setLoading(true);
      setError(null);

      // TODO: brands table not available in Neon backend
      // Using productService to get products and aggregate by brand
      const { data: products } = await productService.list({ status: 'active', limit: 1000 });

      if (!products || products.length === 0) {
        setData([]);
        return;
      }

      // Aggregate inventory data by brand
      const brandMap = new Map<string, { total_stock: number; total_value: number }>();

      products.forEach((product: any) => {
        const brandName = product.brand || 'Unknown';
        const stockLevel = product.stock_level || product.gross_stock_level || 0;
        const costPrice = product.cost_price || 0;

        if (!brandMap.has(brandName)) {
          brandMap.set(brandName, { total_stock: 0, total_value: 0 });
        }

        const existing = brandMap.get(brandName)!;
        existing.total_stock += stockLevel;
        existing.total_value += stockLevel * costPrice;
      });

      // Convert map to array
      const brandInventoryData: Omit<BrandInventoryData, 'percentage' | 'color'>[] = Array.from(brandMap.entries()).map(
        ([brand_name, data], index) => ({
          brand_id: `brand-${index}`,
          brand_name,
          total_stock: data.total_stock,
          total_value: data.total_value,
        })
      );

      // Calculate percentages based on total stock count
      const totalInventoryStock = brandInventoryData.reduce((sum, brand) => sum + brand.total_stock, 0);

      const processedData: BrandInventoryData[] = brandInventoryData
        .map((brand, index) => ({
          ...brand,
          percentage: totalInventoryStock > 0 ? (brand.total_stock / totalInventoryStock) * 100 : 0,
          color: COLORS[index % COLORS.length],
        }))
        .filter(brand => brand.percentage > 0) // Only show brands with inventory
        .sort((a, b) => b.percentage - a.percentage); // Sort by percentage descending

      setData(processedData);
    } catch (err) {
      console.error('Error fetching brand inventory data:', err);
      setError('Failed to load brand inventory data');
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleBrandHover = (brand: BrandInventoryData) => {
    setHoveredBrand(brand);
  };

  const handleBrandLeave = () => {
    setHoveredBrand(null);
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-[var(--secondary)] to-card border border-border rounded-2xl relative flex min-h-[400px] w-full overflow-hidden shadow-md">
        <div className="flex items-center justify-center min-h-[120px] text-muted-foreground text-sm p-6">Loading inventory data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gradient-to-br from-[var(--secondary)] to-card border border-border rounded-2xl relative flex min-h-[400px] w-full overflow-hidden shadow-md">
        <div className="flex items-center justify-center min-h-[120px] text-destructive text-sm p-6">{error}</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-gradient-to-br from-[var(--secondary)] to-card border border-border rounded-2xl relative flex min-h-[400px] w-full overflow-hidden shadow-md">
        <div className="flex items-center justify-center min-h-[120px] text-muted-foreground text-sm p-6">No inventory data available</div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-[var(--secondary)] to-card border border-border rounded-2xl relative flex min-h-[400px] w-full overflow-hidden shadow-md max-md:min-h-[320px] max-[480px]:min-h-[140px]">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-success via-[#06b6d4] to-[#8b5cf6]" />
      <div className="flex-1 p-5 px-6 flex flex-col gap-4 min-h-0 max-md:p-4 max-md:px-5 max-md:gap-3 max-[480px]:p-3.5 max-[480px]:px-4 max-[480px]:gap-2.5">
        <h3 className="m-0 text-base font-semibold text-foreground max-md:text-[0.9rem] max-[480px]:text-[0.85rem]">Brand Inventory Share</h3>

        <div className="flex flex-col gap-2 flex-1 min-h-0 max-[480px]:gap-1.5">
          {data.map((brand, index) => (
            <div
              key={brand.brand_id}
              className="flex flex-col gap-1 cursor-pointer transition-all duration-200 py-1 rounded-md hover:bg-foreground/5 hover:px-2 max-[480px]:gap-[3px]"
              onMouseEnter={() => handleBrandHover(brand)}
              onMouseLeave={handleBrandLeave}
              onTouchStart={() => handleBrandHover(brand)}
            >
              <div className="flex justify-between items-center">
                <span className="text-[0.8rem] text-foreground/90 font-normal max-md:text-[0.75rem]">{brand.brand_name}</span>
                <span className="text-[0.75rem] text-muted-foreground font-medium max-md:text-[0.7rem]">{brand.percentage.toFixed(1)}%</span>
              </div>
              <div className="w-full">
                <div className="h-2 bg-foreground/10 rounded-full overflow-hidden relative w-full max-md:h-1.5">
                  <div
                    className="h-full transition-all duration-300 rounded-full relative hover:scale-y-[1.2]"
                    style={{
                      width: `${brand.percentage}%`,
                      backgroundColor: brand.color
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Fixed position tooltip at bottom */}
        <div className="mt-auto pt-4 border-t border-foreground/10 min-h-[60px]">
          {hoveredBrand && (
            <div className="bg-gradient-to-br from-success to-[#06b6d4] rounded-lg p-3 px-4 shadow-[0_4px_12px_rgba(16,185,129,0.2)]">
              <p className="m-0 mb-2 font-semibold text-white text-sm">{hoveredBrand.brand_name}</p>
              <div className="flex flex-col gap-1">
                <span className="m-0 text-xs text-white/90 font-medium">
                  Items: {hoveredBrand.total_stock.toLocaleString()}
                </span>
                <span className="m-0 text-xs text-white/90 font-medium">
                  {hoveredBrand.percentage.toFixed(1)}% share
                </span>
                <span className="m-0 text-xs text-white/90 font-medium">
                  {formatValue(hoveredBrand.total_value)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BrandInventoryShare;
