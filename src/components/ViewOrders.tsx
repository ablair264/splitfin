import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { orderService } from '../services/orderService';
import { useLoader } from '../contexts/LoaderContext';
import type { Order as DomainOrder, OrderLineItem } from '../types/domain';
import { Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Eye, Pencil, X, CheckCircle, Clock, Ban } from 'lucide-react';

interface LocationState {
  customerId?: string;
  customerName?: string;
}

const PAGE_SIZE = 50;
const CACHE_DURATION = 5 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 500;

function SkeletonRow() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[120px_1fr_100px_100px_90px_48px] gap-2 px-4 py-3 border-b border-gray-700/40 items-center animate-pulse">
      <div className="h-4 w-20 bg-gray-700/50 rounded" />
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gray-700/50" />
        <div className="h-4 w-40 bg-gray-700/50 rounded" />
      </div>
      <div className="h-4 w-16 bg-gray-700/50 rounded" />
      <div className="h-5 w-16 bg-gray-700/50 rounded" />
      <div className="h-4 w-16 bg-gray-700/50 rounded" />
      <div className="h-4 w-4 bg-gray-700/50 rounded mx-auto" />
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
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<number>>(new Set());
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

  const lineItemsLoadedRef = useRef<Set<number>>(new Set());

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
    lineItemsLoadedRef.current.clear();
  };

  const handlePageChange = (newPage: number) => {
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    if (newPage < 1 || (newPage > totalPages && totalPages > 0)) return;
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadLineItemsForOrder = useCallback(async (orderId: number) => {
    if (lineItemsLoadedRef.current.has(orderId)) return;
    try {
      const order = await orderService.getById(orderId);
      const lineItems: OrderLineItem[] = order.line_items || [];
      setOrders(prev =>
        prev.map(o => o.id === orderId ? { ...o, line_items: lineItems } : o)
      );
      lineItemsLoadedRef.current.add(orderId);
    } catch (err) {
      console.error(`Error loading line items for order ${orderId}:`, err);
    }
  }, []);

  const toggleOrderExpansion = async (orderId: number) => {
    const order = orders.find(o => o.id === orderId);
    if (order && (!order.line_items || order.line_items.length === 0)) {
      await loadLineItemsForOrder(orderId);
    }
    setExpandedOrderIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const handleViewOrder = (order: DomainOrder) => {
    navigate(`/order/${order.id}`);
  };

  const handleEditOrder = (order: DomainOrder) => {
    navigate(`/order/${order.id}?edit=true`);
  };

  const handleCancelOrder = (order: DomainOrder) => {
    navigate(`/order/${order.id}?cancel=true`);
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
        return 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20';
      case 'pending':
      case 'open':
      case 'draft':
        return 'bg-amber-400/10 text-amber-400 border-amber-400/20';
      case 'cancelled':
      case 'void':
        return 'bg-red-400/10 text-red-400 border-red-400/20';
      default:
        return 'bg-gray-400/10 text-gray-400 border-gray-400/20';
    }
  };

  const getShippedBadge = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'shipped':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">Shipped</span>;
      case 'partially_shipped':
      case 'partial':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-400/10 text-amber-400 border border-amber-400/20">Partial Ship</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-gray-400/10 text-gray-400 border border-gray-400/20">Not Shipped</span>;
    }
  };

  const getInvoicedBadge = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'invoiced':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">Invoiced</span>;
      case 'partially_invoiced':
      case 'partial':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-400/10 text-amber-400 border border-amber-400/20">Partial</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-gray-400/10 text-gray-400 border border-gray-400/20">Not Invoiced</span>;
    }
  };

  const isOrderClosedOrShipped = (status: string) => {
    const s = status?.toLowerCase();
    return s === 'closed' || s === 'shipped' || s === 'delivered' || s === 'fulfilled';
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
      <div className="min-h-screen text-white bg-gradient-to-br from-[#0f1419] via-[#1a1f2a] to-[#2c3e50] p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 opacity-50">&#x26A0;&#xFE0F;</div>
          <h3 className="text-xl font-semibold text-gray-200 mb-2">Error loading orders</h3>
          <p className="text-gray-400 mb-4">{error}</p>
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
    <div className="min-h-screen text-white bg-gradient-to-br from-[#0f1419] via-[#1a1f2a] to-[#2c3e50] p-4 relative overflow-hidden">
      {/* Animated dot pattern background */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, #79d5e9 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

      {/* Card */}
      <div className="bg-[#1a1f2a] rounded-xl border border-gray-700 overflow-hidden relative">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 flex-wrap">
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by order #, customer, or reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-20 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 transition-colors focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-300/30"
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
            className="px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm cursor-pointer transition-colors focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-300/30"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="shipped">Shipped</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {/* Results count */}
        <div className="px-5 py-2 text-xs text-gray-500 border-b border-gray-700/40">
          {totalCount > 0 ? `${totalCount} order${totalCount !== 1 ? 's' : ''}` : `${orders.length} order${orders.length !== 1 ? 's' : ''}`}
          {debouncedSearch && ` matching "${debouncedSearch}"`}
          {statusFilter !== 'all' && ` (${statusFilter})`}
        </div>

        {/* Table Header */}
        <div className="hidden lg:grid grid-cols-[120px_1fr_100px_100px_90px_48px] gap-2 px-4 py-3 bg-gradient-to-r from-[#2a3441] to-[#1e2532] border-b border-gray-700 text-[11px] font-semibold text-gray-400 uppercase tracking-wider items-center">
          <div>Order #</div>
          <div>Customer</div>
          <div>Date</div>
          <div>Status</div>
          <div>Total</div>
          <div></div>
        </div>

        {/* Table Body */}
        <div>
          {orders.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <div className="text-4xl mb-3 opacity-50">&#x1F4E6;</div>
              <h3 className="text-lg font-semibold text-gray-300 mb-1">No orders found</h3>
              <p className="text-sm text-gray-500">
                {debouncedSearch || statusFilter !== 'all'
                  ? 'Try adjusting your search or filter criteria.'
                  : 'No orders to display.'}
              </p>
            </div>
          ) : (
            orders.map((order) => {
              const isExpanded = expandedOrderIds.has(order.id);

              return (
                <React.Fragment key={order.id}>
                  <div
                    className={`grid grid-cols-1 lg:grid-cols-[120px_1fr_100px_100px_90px_48px] gap-2 px-4 py-3 border-b border-gray-700/40 hover:bg-white/[0.02] transition-colors items-center cursor-pointer ${
                      isExpanded ? 'bg-brand-300/[0.03]' : ''
                    }`}
                    onClick={() => toggleOrderExpansion(order.id)}
                  >
                    {/* Order # */}
                    <div className="font-mono text-sm font-medium text-brand-300">
                      <span className="lg:hidden text-xs text-gray-500 mr-2 font-sans">Order:</span>
                      {order.salesorder_number || 'N/A'}
                    </div>

                    {/* Customer */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-300 to-[#4daeac] flex items-center justify-center text-white font-semibold text-xs shrink-0">
                        {getCustomerInitials(order.customer_name || 'Unknown')}
                      </div>
                      <span className="text-sm font-medium text-white truncate">
                        {order.customer_name || 'Unknown'}
                      </span>
                    </div>

                    {/* Date */}
                    <div className="text-[13px] text-gray-400 tabular-nums">
                      <span className="lg:hidden text-xs text-gray-500 mr-2">Date:</span>
                      {formatDate(order.date || order.created_at)}
                    </div>

                    {/* Status */}
                    <div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border capitalize ${getStatusColor(order.status)}`}>
                        {order.status || 'unknown'}
                      </span>
                    </div>

                    {/* Total */}
                    <div className="text-sm font-semibold text-emerald-400 tabular-nums">
                      <span className="lg:hidden text-xs text-gray-500 mr-2 font-normal">Total:</span>
                      {formatCurrency(order.total || 0)}
                    </div>

                    {/* Expand chevron */}
                    <div className="hidden lg:flex justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleOrderExpansion(order.id);
                        }}
                        className="p-1 text-gray-500 hover:text-brand-300 transition-colors"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Enhanced expanded row */}
                  {isExpanded && (
                    <div className="px-4 py-4 bg-[#0f1419]/50 border-b border-gray-700/40">
                      <div className="flex items-start gap-4">
                        {/* Status icon */}
                        <div className="shrink-0 pt-0.5">
                          {isOrderClosedOrShipped(order.status) ? (
                            <CheckCircle size={24} className="text-emerald-400" />
                          ) : (
                            <Clock size={24} className="text-pink-400" />
                          )}
                        </div>

                        <div className="flex-1 flex items-center gap-5 flex-wrap">
                          {order.delivery_date && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Shipped</span>
                              <span className="text-sm text-gray-200">{formatDate(order.delivery_date)}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Total</span>
                            <span className="text-sm font-medium text-emerald-400">{formatCurrency(order.total || 0)}</span>
                          </div>
                          {order.line_items && order.line_items.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Items</span>
                              <span className="text-sm text-gray-200">{order.line_items.length}</span>
                            </div>
                          )}
                          <div className="w-px h-4 bg-gray-700" />
                          {getShippedBadge(order.shipped_status || order.shipment_status)}
                          {getInvoicedBadge(order.invoiced_status)}
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditOrder(order);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-400/80 border border-amber-400/25 bg-amber-400/5 rounded-md hover:text-amber-400 hover:border-amber-400/40 hover:bg-amber-400/10 transition-all"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewOrder(order);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-300/80 border border-brand-300/25 bg-brand-300/5 rounded-md hover:text-brand-300 hover:border-brand-300/40 hover:bg-brand-300/10 transition-all"
                          >
                            <Eye size={12} />
                            View
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelOrder(order);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400/80 border border-red-400/25 bg-red-400/5 rounded-md hover:text-red-400 hover:border-red-400/40 hover:bg-red-400/10 transition-all"
                          >
                            <Ban size={12} />
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </React.Fragment>
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
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700">
            <span className="text-sm text-gray-500">
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount || orders.length)} of {totalCount || orders.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || loading}
                className="p-2 text-gray-400 border border-gray-700 rounded-md hover:bg-gray-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>

              {getPageNumbers().map((page, idx) =>
                page === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-sm text-gray-500">
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
                        : 'text-gray-400 border border-gray-700 hover:bg-gray-700/50'
                    } disabled:cursor-not-allowed`}
                  >
                    {page}
                  </button>
                )
              )}

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={!hasMore || loading}
                className="p-2 text-gray-400 border border-gray-700 rounded-md hover:bg-gray-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
