import React, { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Truck, Search, Filter, Eye, CheckCircle, Clock, MapPin, Calendar } from 'lucide-react';

interface Delivery {
  id: string;
  order_id: string;
  customer_id: string;
  courier_id: string;
  tracking_number?: string;
  shipping_status: 'processing' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' | 'returned';
  shipped_date?: string;
  estimated_delivery_date?: string;
  delivered_date?: string;
  delivery_address: {
    line1: string;
    line2?: string;
    city: string;
    postal_code: string;
    country: string;
  };
  shipping_notes?: string;
  created_at: string;
  updated_at: string;

  // Related data
  customers?: {
    company_name: string;
  };
  orders?: {
    legacy_order_number?: string;
    total: number;
  };
  couriers?: {
    name: string;
    logo_url?: string;
  };
}

type FilterStatus = 'all' | 'processing' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' | 'returned';
type SortField = 'created_at' | 'shipped_date' | 'delivered_date' | 'customer_name';
type SortDirection = 'asc' | 'desc';

const Deliveries: React.FC = () => {
  usePageTitle('Deliveries');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [filteredDeliveries, setFilteredDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadDeliveries();
  }, []);

  useEffect(() => {
    filterAndSortDeliveries();
  }, [deliveries, searchTerm, statusFilter, sortField, sortDirection]);

  const loadDeliveries = async () => {
    try {
      const agent = authService.getCachedAgent();
      if (!agent) {
        setLoading(false);
        return;
      }

      // TODO: Implement /api/v1/deliveries or /api/v1/shipments backend endpoint
      console.warn('TODO: Implement GET /api/v1/deliveries backend endpoint');

      // Return empty data since deliveries/shipments table is not in the new backend yet
      setDeliveries([]);
    } catch (error) {
      console.error('Error loading deliveries:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortDeliveries = () => {
    let filtered = [...deliveries];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(delivery => {
        const customerName = delivery.customers?.company_name || '';
        const orderNumber = delivery.orders?.legacy_order_number || '';
        const trackingNumber = delivery.tracking_number || '';

        return (
          customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          trackingNumber.toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(delivery => delivery.shipping_status === statusFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'customer_name':
          aValue = a.customers?.company_name || '';
          bValue = b.customers?.company_name || '';
          break;
        case 'shipped_date':
          aValue = a.shipped_date || '';
          bValue = b.shipped_date || '';
          break;
        case 'delivered_date':
          aValue = a.delivered_date || '';
          bValue = b.delivered_date || '';
          break;
        default:
          aValue = a.created_at;
          bValue = b.created_at;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredDeliveries(filtered);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing':
        return 'var(--warning)';
      case 'shipped':
      case 'in_transit':
        return 'var(--info)';
      case 'out_for_delivery':
        return 'var(--warning)';
      case 'delivered':
        return 'var(--success)';
      case 'failed':
      case 'returned':
        return 'var(--destructive)';
      default:
        return 'var(--muted-foreground)';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'processing':
        return 'Processing';
      case 'shipped':
        return 'Shipped';
      case 'in_transit':
        return 'In Transit';
      case 'out_for_delivery':
        return 'Out for Delivery';
      case 'delivered':
        return 'Delivered';
      case 'failed':
        return 'Failed';
      case 'returned':
        return 'Returned';
      default:
        return 'Unknown';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleViewDetails = (delivery: Delivery) => {
    setSelectedDelivery(delivery);
    setShowModal(true);
  };

  const getDeliveryStats = () => {
    const stats = {
      total: deliveries.length,
      delivered: 0,
      in_transit: 0,
      processing: 0,
      failed: 0
    };

    deliveries.forEach(delivery => {
      switch (delivery.shipping_status) {
        case 'delivered':
          stats.delivered++;
          break;
        case 'shipped':
        case 'in_transit':
        case 'out_for_delivery':
          stats.in_transit++;
          break;
        case 'processing':
          stats.processing++;
          break;
        case 'failed':
        case 'returned':
          stats.failed++;
          break;
      }
    });

    return stats;
  };

  const stats = getDeliveryStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-lg text-muted-foreground">
        Loading deliveries...
      </div>
    );
  }

  return (
    <div className="p-8 md:p-4 min-h-screen bg-gradient-to-br from-background via-card to-card text-foreground">
      <div className="flex justify-between items-start mb-8 bg-card/90 p-8 rounded-2xl border border-primary/20 shadow-md md:flex-col md:gap-6 md:items-stretch">
        <div>
          <h1 className="text-3xl font-bold text-primary mb-2">Delivery Management</h1>
          <p className="text-muted-foreground text-lg">Track and manage all your shipments</p>
        </div>

        <div className="flex gap-8 md:justify-between">
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold text-primary">{stats.total}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Total</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold text-success">{stats.delivered}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Delivered</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold text-info">{stats.in_transit}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">In Transit</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold text-warning">{stats.processing}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Processing</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold text-destructive">{stats.failed}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Issues</span>
          </div>
        </div>
      </div>

      <div className="flex gap-4 mb-8 items-center md:flex-col md:gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm" />
          <input
            type="text"
            placeholder="Search by customer, order number, or tracking number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full py-3 pl-10 pr-4 bg-card/90 border border-primary/20 rounded-lg text-foreground text-sm transition-all duration-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex gap-2 md:flex-col md:gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
            className="py-3 px-4 bg-card/90 border border-primary/20 rounded-lg text-foreground text-sm cursor-pointer transition-all duration-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">All Statuses</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="in_transit">In Transit</option>
            <option value="out_for_delivery">Out for Delivery</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
            <option value="returned">Returned</option>
          </select>

          <select
            value={`${sortField}-${sortDirection}`}
            onChange={(e) => {
              const [field, direction] = e.target.value.split('-');
              setSortField(field as SortField);
              setSortDirection(direction as SortDirection);
            }}
            className="py-3 px-4 bg-card/90 border border-primary/20 rounded-lg text-foreground text-sm cursor-pointer transition-all duration-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="created_at-desc">Newest First</option>
            <option value="created_at-asc">Oldest First</option>
            <option value="customer_name-asc">Customer A-Z</option>
            <option value="customer_name-desc">Customer Z-A</option>
            <option value="shipped_date-desc">Recently Shipped</option>
            <option value="delivered_date-desc">Recently Delivered</option>
          </select>
        </div>
      </div>

      <div className="bg-card/90 border border-primary/20 rounded-2xl overflow-hidden shadow-md">
        <div className="hidden md:hidden lg:grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1.5fr_1.5fr_1fr] gap-4 px-8 py-6 bg-black/20 border-b border-white/10">
          <div className="font-semibold text-primary text-sm uppercase tracking-wide">Customer</div>
          <div className="font-semibold text-primary text-sm uppercase tracking-wide">Order</div>
          <div className="font-semibold text-primary text-sm uppercase tracking-wide">Courier</div>
          <div className="font-semibold text-primary text-sm uppercase tracking-wide">Status</div>
          <div className="font-semibold text-primary text-sm uppercase tracking-wide">Shipped</div>
          <div className="font-semibold text-primary text-sm uppercase tracking-wide">Delivered</div>
          <div className="font-semibold text-primary text-sm uppercase tracking-wide">Actions</div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {filteredDeliveries.map((delivery) => {
            const customerName = delivery.customers?.company_name || 'Unknown Customer';

            return (
              <div
                key={delivery.id}
                className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1.5fr_1.5fr_1fr] md:flex md:flex-col md:items-stretch md:bg-black/20 md:mb-4 md:rounded-lg md:border md:border-white/10 gap-4 px-8 py-6 border-b border-white/5 transition-all duration-200 items-center hover:bg-primary/5"
              >
                <div className="flex items-center md:py-2 md:border-b md:border-white/5">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-foreground text-sm">{customerName}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {delivery.tracking_number ? `#${delivery.tracking_number}` : 'No tracking'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center md:py-2 md:border-b md:border-white/5">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-foreground text-sm">
                      {delivery.orders?.legacy_order_number || `#${delivery.order_id.slice(0, 8)}`}
                    </span>
                    <span className="text-xs text-success font-semibold">
                      {delivery.orders?.total?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center md:py-2 md:border-b md:border-white/5">
                  <div className="flex items-center gap-3">
                    {delivery.couriers?.logo_url ? (
                      <img
                        src={delivery.couriers.logo_url}
                        alt={delivery.couriers.name}
                        className="w-8 h-8 rounded object-contain bg-foreground p-0.5"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary text-sm">
                        <Truck />
                      </div>
                    )}
                    <span className="text-sm text-foreground font-medium">
                      {delivery.couriers?.name || 'Unknown Courier'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center md:py-2 md:border-b md:border-white/5">
                  <span
                    className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide text-foreground whitespace-nowrap"
                    style={{ backgroundColor: getStatusColor(delivery.shipping_status) }}
                  >
                    {getStatusLabel(delivery.shipping_status)}
                  </span>
                </div>

                <div className="flex items-center md:py-2 md:border-b md:border-white/5">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    {delivery.shipping_status === 'delivered' ? (
                      <CheckCircle className="text-success text-xs" />
                    ) : (
                      <Clock className="text-warning text-xs" />
                    )}
                    <span>{formatDate(delivery.shipped_date)}</span>
                  </div>
                </div>

                <div className="flex items-center md:py-2 md:border-b md:border-white/5">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    {delivery.delivered_date ? (
                      <>
                        <CheckCircle className="text-success text-xs" />
                        <span>{formatDate(delivery.delivered_date)}</span>
                      </>
                    ) : delivery.estimated_delivery_date ? (
                      <>
                        <Calendar className="text-info text-xs" />
                        <span>Est: {formatDate(delivery.estimated_delivery_date)}</span>
                      </>
                    ) : (
                      <span>-</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center md:py-2">
                  <button
                    onClick={() => handleViewDetails(delivery)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-lg text-primary text-xs cursor-pointer transition-all duration-200 hover:bg-primary/20 hover:border-primary/30"
                  >
                    <Eye />
                    View
                  </button>
                </div>
              </div>
            );
          })}

          {filteredDeliveries.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 px-8 text-center text-muted-foreground">
              <Truck size={48} />
              <h3 className="mt-4 mb-2 text-foreground text-xl">No Deliveries Found</h3>
              <p className="m-0 text-base">No deliveries match your current filters. The deliveries feature is being migrated.</p>
            </div>
          )}
        </div>
      </div>

      {/* Delivery Details Modal */}
      {showModal && selectedDelivery && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-8 md:p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-card rounded-2xl border border-primary/20 w-full max-w-[600px] max-h-[90vh] md:max-h-[95vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-8 py-6 border-b border-white/10">
              <h2 className="m-0 text-primary text-xl font-semibold">Delivery Details</h2>
              <button
                onClick={() => setShowModal(false)}
                className="bg-transparent border-none text-muted-foreground text-2xl cursor-pointer p-1 transition-colors duration-200 hover:text-foreground"
              >
                x
              </button>
            </div>

            <div className="p-8">
              <div className="flex justify-between items-start mb-8 pb-6 border-b border-white/10 md:flex-col md:gap-4 md:items-stretch">
                <div>
                  <h3 className="mb-2 text-foreground text-xl font-semibold">{selectedDelivery.customers?.company_name}</h3>
                  <p className="my-1 text-muted-foreground text-sm">
                    Order: {selectedDelivery.orders?.legacy_order_number || `#${selectedDelivery.order_id.slice(0, 8)}`}
                  </p>
                  {selectedDelivery.tracking_number && (
                    <p className="my-1 text-muted-foreground text-sm">
                      Tracking: <strong>{selectedDelivery.tracking_number}</strong>
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-center gap-2">
                  {selectedDelivery.couriers?.logo_url ? (
                    <img
                      src={selectedDelivery.couriers.logo_url}
                      alt={selectedDelivery.couriers.name}
                      className="w-12 h-12 rounded-lg object-contain bg-foreground p-1"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xl">
                      <Truck />
                    </div>
                  )}
                  <span>{selectedDelivery.couriers?.name || 'Unknown Courier'}</span>
                </div>
              </div>

              <div className="mb-8 text-center">
                <div>
                  <span
                    className="inline-block px-6 py-3 rounded-full text-base font-semibold uppercase tracking-wide text-foreground"
                    style={{ backgroundColor: getStatusColor(selectedDelivery.shipping_status) }}
                  >
                    {getStatusLabel(selectedDelivery.shipping_status)}
                  </span>
                </div>
              </div>

              <div className="mb-8">
                <h4 className="mb-4 text-primary text-base font-semibold">Delivery Timeline</h4>
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-base shrink-0">
                      Box
                    </div>
                    <div className="flex flex-col gap-1">
                      <strong className="text-foreground text-sm">Order Created</strong>
                      <span className="text-muted-foreground text-xs">{formatDate(selectedDelivery.created_at)}</span>
                    </div>
                  </div>

                  {selectedDelivery.shipped_date && (
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-base shrink-0">
                        Truck
                      </div>
                      <div className="flex flex-col gap-1">
                        <strong className="text-foreground text-sm">Shipped</strong>
                        <span className="text-muted-foreground text-xs">{formatDate(selectedDelivery.shipped_date)}</span>
                      </div>
                    </div>
                  )}

                  {selectedDelivery.delivered_date && (
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-base shrink-0">
                        Check
                      </div>
                      <div className="flex flex-col gap-1">
                        <strong className="text-foreground text-sm">Delivered</strong>
                        <span className="text-muted-foreground text-xs">{formatDate(selectedDelivery.delivered_date)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-8">
                <h4 className="mb-4 text-primary text-base font-semibold flex items-center gap-2">
                  <MapPin /> Delivery Address
                </h4>
                <div className="bg-black/20 p-4 rounded-lg border border-white/10">
                  <p className="my-1 text-foreground text-sm">{selectedDelivery.delivery_address.line1}</p>
                  {selectedDelivery.delivery_address.line2 && (
                    <p className="my-1 text-foreground text-sm">{selectedDelivery.delivery_address.line2}</p>
                  )}
                  <p className="my-1 text-foreground text-sm">{selectedDelivery.delivery_address.city}</p>
                  <p className="my-1 text-foreground text-sm">{selectedDelivery.delivery_address.postal_code}</p>
                  <p className="my-1 text-foreground text-sm">{selectedDelivery.delivery_address.country}</p>
                </div>
              </div>

              {selectedDelivery.shipping_notes && (
                <div>
                  <h4 className="mb-4 text-primary text-base font-semibold">Notes</h4>
                  <p className="bg-black/20 p-4 rounded-lg border border-white/10 text-foreground text-sm leading-relaxed m-0">
                    {selectedDelivery.shipping_notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Deliveries;
