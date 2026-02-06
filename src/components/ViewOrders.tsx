import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { orderService } from '../services/orderService';
import { useLoader } from '../contexts/LoaderContext';
import type { Order as DomainOrder } from '../types/domain';
import { Search, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface LocationState {
  customerId?: string;
  customerName?: string;
}

const PAGE_SIZE = 50;
const CACHE_DURATION = 5 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 500;

function SkeletonRow() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[120px_1fr_100px_130px_90px] gap-2 px-4 py-3 border-b border-border/40 items-center animate-pulse">
      <div className="h-4 w-20 bg-muted rounded" />
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-muted" />
        <div className="h-4 w-40 bg-muted rounded" />
      </div>
      <div className="h-4 w-16 bg-muted rounded" />
      <div className="flex flex-col gap-1">
        <div className="h-5 w-16 bg-muted rounded" />
        <div className="h-3 w-24 bg-muted rounded" />
      </div>
      <div className="h-4 w-16 bg-muted rounded" />
    </div>
  );
}

function ViewOrders() {
  const [orders, setOrders] = useState<DomainOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const location = useLocation();
  const locationState = location.state as LocationState;
  const [customerFilter, setCustomerFilter] = useState<string>('');
  const [customerFilterName, setCustomerFilterName] = useState<string>('');

  const cacheRef = useRef<{
    data: DomainOrder[];
    timestamp: number;
    search: string;
    statusFilter: string;
  } | null>(null);

  const navigate = useNavigate();
  const { showLoader, hideLoader } = useLoader();

  // Handle customer filter from navigation state
  useEffect(() => {
    if (locationState?.customerId) {
      setCustomerFilter(locationState.customerId);
      setCustomerFilterName(locationState.customerName || 'Selected Customer');
    }
  }, [locationState]);

  // Debounce search input
  useEffect(() => {
    if (search !== debouncedSearch) {
      setIsSearching(true);
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setIsSearching(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Load orders when search, filter, or page changes
  useEffect(() => {
    if (
      currentPage === 1 &&
      cacheRef.current &&
      Date.now() - cacheRef.current.timestamp < CACHE_DURATION &&
      cacheRef.current.search === debouncedSearch &&
      cacheRef.current.statusFilter === statusFilter &&
      !customerFilter
    ) {
      setOrders(cacheRef.current.data);
      setLoading(false);
      return;
    }

    if (currentPage === 1) {
      setOrders([]);
    }

    fetchOrders(currentPage === 1);
  }, [debouncedSearch, statusFilter, currentPage, customerFilter]);

  const fetchOrders = async (isInitialLoad = false) => {
    setLoading(true);
    if (isInitialLoad) showLoader('Fetching Orders...');
    try {
      setError(null);

      const filters: {
        limit: number;
        offset: number;
        search?: string;
        status?: string;
        customer_id?: string;
      } = {
        limit: PAGE_SIZE,
        offset: (currentPage - 1) * PAGE_SIZE,
      };

      if (debouncedSearch) filters.search = debouncedSearch;
      if (statusFilter !== 'all') filters.status = statusFilter;
      if (customerFilter) filters.customer_id = customerFilter;

      const result = await orderService.list(filters);
      const newOrders = result.data;

      setOrders(newOrders);
      setHasMore(newOrders.length === PAGE_SIZE);
      if (result.count > 0) {
        setTotalCount(result.count);
      }

      if (isInitialLoad) {
        cacheRef.current = {
          data: newOrders,
          timestamp: Date.now(),
          search: debouncedSearch,
          statusFilter,
        };
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch orders');
    } finally {
      setLoading(false);
      hideLoader();
    }
  };

  const clearCustomerFilter = () => {
    setCustomerFilter('');
    setCustomerFilterName('');
    window.history.replaceState({}, '', '/orders');
    setCurrentPage(1);
    setOrders([]);
    cacheRef.current = null;
  };

  const handlePageChange = (newPage: number) => {
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    if (newPage < 1 || (newPage > totalPages && totalPages > 0)) return;
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleViewOrder = (order: DomainOrder) => {
    navigate(`/order/${order.id}`);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-GB');
    } catch {
      return 'Invalid Date';
    }
  };

  const getCustomerInitials = (name: string): string => {
    if (!name) return '??';
    const words = name.split(' ');
    if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'shipped':
      case 'delivered':
      case 'fulfilled':
      case 'closed':
        return 'bg-success/10 text-success border-success/20';
      case 'pending':
      case 'open':
      case 'draft':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'cancelled':
      case 'void':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      default:
        return 'bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20';
    }
  };

  const getShippedLabel = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'shipped': return { text: 'Shipped', color: 'text-success' };
      case 'partially_shipped':
      case 'partial': return { text: 'Partial', color: 'text-warning' };
      default: return { text: 'Not Shipped', color: 'text-muted-foreground' };
    }
  };

  const getInvoicedLabel = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'invoiced': return { text: 'Invoiced', color: 'text-success' };
      case 'partially_invoiced':
      case 'partial': return { text: 'Partial', color: 'text-warning' };
      default: return { text: 'Not Invoiced', color: 'text-muted-foreground' };
    }
  };

  // Reset page on search/filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter]);

  const totalPages = totalCount > 0 ? Math.ceil(totalCount / PAGE_SIZE) : 1;

  // Build page numbers with ellipsis
  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | '...')[] = [];
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  // Initial loading is handled by ProgressLoader via useLoader
  if (loading && orders.length === 0 && !error) {
    return null;
  }

  if (error && orders.length === 0) {
    return (
      <div className="min-h-screen text-white bg-gradient-to-br from-background via-card to-surface p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 opacity-50">&#x26A0;&#xFE0F;</div>
          <h3 className="text-xl font-semibold text-foreground mb-2">Error loading orders</h3>
          <p className="text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => fetchOrders(true)}
            className="px-4 py-2 bg-brand-300/20 text-brand-300 border border-brand-300/30 rounded-lg hover:bg-brand-300/30 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white bg-gradient-to-br from-background via-card to-surface p-4 relative overflow-hidden">
      {/* Animated dot pattern background */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, var(--primary) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

      {/* Card */}
      <div className="bg-card rounded-xl border border-border overflow-hidden relative">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-wrap">
          {/* Customer filter indicator */}
          {customerFilter && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-300/10 border border-brand-300/30 rounded-lg text-sm text-brand-300">
              <span>Orders for: <strong>{customerFilterName}</strong></span>
              <button
                onClick={clearCustomerFilter}
                className="p-0.5 hover:bg-brand-300/20 rounded transition-colors"
                title="Show all orders"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input
              type="text"
              placeholder="Search by order #, customer, or reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-20 py-2 bg-background border border-border rounded-lg text-white text-sm placeholder-muted-foreground transition-colors focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-300/30"
            />
            {isSearching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-300/70 animate-pulse">
                Searching...
              </span>
            )}
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-white text-sm cursor-pointer transition-colors focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-300/30"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="shipped">Shipped</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {/* Results count */}
        <div className="px-5 py-2 text-xs text-muted-foreground border-b border-border/40">
          {totalCount > 0 ? `${totalCount} order${totalCount !== 1 ? 's' : ''}` : `${orders.length} order${orders.length !== 1 ? 's' : ''}`}
          {debouncedSearch && ` matching "${debouncedSearch}"`}
          {statusFilter !== 'all' && ` (${statusFilter})`}
        </div>

        {/* Table Header */}
        <div className="hidden lg:grid grid-cols-[120px_1fr_100px_130px_90px] gap-2 px-4 py-3 bg-gradient-to-r from-muted to-card border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider items-center">
          <div>Order #</div>
          <div>Customer</div>
          <div>Date</div>
          <div>Status</div>
          <div>Total</div>
        </div>

        {/* Table Body */}
        <div>
          {orders.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="text-4xl mb-3 opacity-50">&#x1F4E6;</div>
              <h3 className="text-lg font-semibold text-foreground mb-1">No orders found</h3>
              <p className="text-sm text-muted-foreground">
                {debouncedSearch || statusFilter !== 'all'
                  ? 'Try adjusting your search or filter criteria.'
                  : 'No orders to display.'}
              </p>
            </div>
          ) : (
            orders.map((order) => {
              const shipped = getShippedLabel(order.shipped_status || order.shipment_status);
              const invoiced = getInvoicedLabel(order.invoiced_status);

              return (
                <div
                  key={order.id}
                  className="grid grid-cols-1 lg:grid-cols-[120px_1fr_100px_130px_90px] gap-2 px-4 py-3 border-b border-border/40 hover:bg-white/[0.04] transition-colors items-center cursor-pointer"
                  onClick={() => handleViewOrder(order)}
                >
                  {/* Order # */}
                  <div className="font-mono text-sm font-medium text-brand-300">
                    <span className="lg:hidden text-xs text-muted-foreground mr-2 font-sans">Order:</span>
                    {order.salesorder_number || 'N/A'}
                  </div>

                  {/* Customer */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-300 to-primary flex items-center justify-center text-white font-semibold text-xs shrink-0">
                      {getCustomerInitials(order.customer_name || 'Unknown')}
                    </div>
                    <span className="text-sm font-medium text-white truncate">
                      {order.customer_name || 'Unknown'}
                    </span>
                  </div>

                  {/* Date */}
                  <div className="text-[13px] text-muted-foreground tabular-nums">
                    <span className="lg:hidden text-xs text-muted-foreground mr-2">Date:</span>
                    {formatDate(order.date || order.created_at)}
                  </div>

                  {/* Status + fulfillment */}
                  <div className="flex flex-col gap-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border capitalize w-fit ${getStatusColor(order.status)}`}>
                      {order.status || 'unknown'}
                    </span>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className={shipped.color}>{shipped.text}</span>
                      <span className="text-border">|</span>
                      <span className={invoiced.color}>{invoiced.text}</span>
                    </div>
                  </div>

                  {/* Total */}
                  <div className="text-sm font-semibold text-success tabular-nums">
                    <span className="lg:hidden text-xs text-muted-foreground mr-2 font-normal">Total:</span>
                    {formatCurrency(order.total || 0)}
                  </div>
                </div>
              );
            })
          )}

          {/* Inline loading skeleton when paginating */}
          {loading && orders.length > 0 && (
            <>
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonRow key={`loading-${i}`} />
              ))}
            </>
          )}
        </div>

        {/* Pagination with page numbers */}
        {orders.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="text-sm text-muted-foreground">
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount || orders.length)} of {totalCount || orders.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || loading}
                className="p-2 text-muted-foreground border border-border rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>

              {getPageNumbers().map((page, idx) =>
                page === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-sm text-muted-foreground">
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    disabled={loading}
                    className={`min-w-[32px] h-8 px-2 text-sm font-medium rounded-md transition-colors ${
                      page === currentPage
                        ? 'bg-brand-300/20 text-brand-300 border border-brand-300/30'
                        : 'text-muted-foreground border border-border hover:bg-muted'
                    } disabled:cursor-not-allowed`}
                  >
                    {page}
                  </button>
                )
              )}

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={!hasMore || loading}
                className="p-2 text-muted-foreground border border-border rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ViewOrders;
