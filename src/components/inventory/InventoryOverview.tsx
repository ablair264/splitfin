import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, Link, Package2, Boxes, Warehouse, Truck, ClipboardList, BarChart3 } from 'lucide-react';
import { authService } from '../../services/authService';
import { withLoader } from '../../hoc/withLoader';
import BrandInventoryShare from './BrandInventoryShare';
import InventoryMetricCards from './InventoryMetricCards';
import BrandTrendChart from './BrandTrendChart';
import InventoryTableCard from './InventoryTableCard';

function InventoryOverview() {
  // TODO: companyId is no longer needed - JWT handles company context
  // Keeping for child component compatibility until they are also migrated
  const [companyId, setCompanyId] = useState<string | null>('default');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      const agent = authService.getCachedAgent();
      if (!agent) {
        console.error('No authenticated user');
        setLoading(false);
        return;
      }

      // TODO: Agent/company context is handled by JWT - companyId filter not needed
      // Setting a placeholder for child components that still expect companyId prop
      setCompanyId('default');
    } catch (error) {
      console.error('Error loading user info:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSingleItem = () => {
    navigate('/inventory/create-item');
  };

  const handleUploadFromFile = () => {
    navigate('/inventory/upload-items');
  };

  const handleExternalConnect = () => {
    navigate('/inventory/external-connect');
  };


  if (loading || !companyId) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen text-foreground p-6 relative overflow-hidden bg-gradient-to-br from-background via-card to-[var(--surface)] flex flex-col gap-6 max-w-[1400px] mx-auto">
      {/* Modern Header with Actions */}
      <div className="bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] border border-primary/20 rounded-xl p-6 backdrop-blur-[10px]">
        <div className="flex justify-between items-start gap-8 max-md:flex-col max-md:gap-6">
          <div className="flex-1">
            <h1 className="text-3xl font-bold m-0 mb-4 bg-gradient-to-br from-primary to-primary bg-clip-text text-transparent">Inventory Overview</h1>
            <p className="text-[0.95rem] text-muted-foreground m-0 mb-8 font-normal leading-relaxed">
              Complete inventory management with real-time insights
            </p>
          </div>

          {/* Compact Action Cards */}
          <div className="flex gap-4 shrink-0 max-md:w-full max-md:justify-between">
            <button
              className="flex items-center gap-3 p-4 bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] border border-primary/30 rounded-lg text-foreground cursor-pointer transition-all duration-200 text-left min-w-[140px] hover:bg-primary/10 hover:border-primary hover:-translate-y-px max-md:flex-1 max-md:min-w-0"
              onClick={handleCreateSingleItem}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-gradient-to-br from-primary to-primary">
                <Plus size={20} />
              </div>
              <div>
                <h4 className="text-sm font-semibold m-0 text-foreground">Create Item</h4>
                <span className="text-xs text-muted-foreground">Add single product</span>
              </div>
            </button>

            <button
              className="flex items-center gap-3 p-4 bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] border border-primary/30 rounded-lg text-foreground cursor-pointer transition-all duration-200 text-left min-w-[140px] hover:bg-primary/10 hover:border-primary hover:-translate-y-px max-md:flex-1 max-md:min-w-0"
              onClick={handleUploadFromFile}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-gradient-to-br from-primary to-primary">
                <Upload size={20} />
              </div>
              <div>
                <h4 className="text-sm font-semibold m-0 text-foreground">Bulk Upload</h4>
                <span className="text-xs text-muted-foreground">CSV/Excel file</span>
              </div>
            </button>

            <button
              className="flex items-center gap-3 p-4 bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] border border-primary/30 rounded-lg text-foreground cursor-pointer transition-all duration-200 text-left min-w-[140px] hover:bg-primary/10 hover:border-primary hover:-translate-y-px max-md:flex-1 max-md:min-w-0"
              onClick={handleExternalConnect}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-gradient-to-br from-primary to-primary">
                <Link size={20} />
              </div>
              <div>
                <h4 className="text-sm font-semibold m-0 text-foreground">Connect API</h4>
                <span className="text-xs text-muted-foreground">External systems</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Compact Metrics Grid */}
      <div>
        <InventoryMetricCards companyId={companyId} />
      </div>

      {/* Analytics Row - Brand Share + Trend Chart Side by Side */}
      <div className="grid grid-cols-[1fr_2fr] gap-6 max-md:grid-cols-1">
        <div className="bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] border border-primary/20 rounded-xl overflow-hidden">
          <BrandInventoryShare companyId={companyId} />
        </div>
        <div className="bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] border border-primary/20 rounded-xl overflow-hidden">
          <BrandTrendChart companyId={companyId} />
        </div>
      </div>

      {/* Inventory Table - Full Width but Compact */}
      <div className="bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] border border-primary/20 rounded-xl overflow-hidden">
        <InventoryTableCard companyId={companyId} />
      </div>

      {/* Compact Tools Grid */}
      <div className="bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] border border-primary/20 rounded-xl p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-primary m-0">Management Tools</h3>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-4 max-md:grid-cols-2">
          <button
            className="flex flex-col items-center gap-2 p-4 bg-primary/10 border border-primary/30 rounded-lg text-primary cursor-pointer transition-all duration-200 text-center hover:bg-primary/10 hover:border-primary hover:-translate-y-px"
            onClick={() => navigate('/inventory/products')}
          >
            <Package2 size={18} />
            <span className="text-sm font-medium">Products</span>
          </button>

          <button
            className="flex flex-col items-center gap-2 p-4 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] rounded-lg text-warning cursor-pointer transition-all duration-200 text-center hover:bg-primary/10 hover:border-primary hover:-translate-y-px"
            onClick={() => navigate('/inventory/warehousing')}
          >
            <Warehouse size={18} />
            <span className="text-sm font-medium">Warehousing</span>
          </button>

          <button
            className="flex flex-col items-center gap-2 p-4 bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] rounded-lg text-success cursor-pointer transition-all duration-200 text-center hover:bg-primary/10 hover:border-primary hover:-translate-y-px"
            onClick={() => navigate('/inventory/couriers')}
          >
            <Truck size={18} />
            <span className="text-sm font-medium">Couriers</span>
          </button>

          <button
            className="flex flex-col items-center gap-2 p-4 bg-[color-mix(in_srgb,var(--chart-5)_10%,transparent)] border border-[color-mix(in_srgb,var(--chart-5)_30%,transparent)] rounded-lg text-[var(--chart-5)] cursor-pointer transition-all duration-200 text-center hover:bg-primary/10 hover:border-primary hover:-translate-y-px"
            onClick={() => navigate('/inventory/stocklists')}
          >
            <ClipboardList size={18} />
            <span className="text-sm font-medium">Reports</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default withLoader(InventoryOverview);
