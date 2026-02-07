import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import PageHeader from '@/components/shared/PageHeader';
import { Plus, Search, User, Eye, Grid3x3, List, ChevronLeft, ChevronRight } from 'lucide-react';
import { customerService } from '../services/customerService';
import type { Customer as DomainCustomer } from '../types/domain';
import CreateCustomer from './CreateCustomer';
import { useComponentLoader } from '../hoc/withLoader';
import { cn } from '@/lib/utils';

type SortBy = 'name' | 'date' | 'value' | 'last_order';
type ViewMode = 'list' | 'grid';

function CustomersManagement() {
  usePageTitle('Customers');
  const [customers, setCustomers] = useState<DomainCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataProcessing, setDataProcessing] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const customersPerPage = 25;
  const navigate = useNavigate();
  const { showLoader, hideLoader, setProgress } = useComponentLoader();

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setDataProcessing(true);
      showLoader('Fetching Customer Data...');
      setProgress(10);
      setProgress(20);

      const response = await customerService.list({ status: 'active', limit: 5000 });
      const customersData = response.data || [];

      setProgress(90);
      setCustomers(customersData);
      setProgress(100);

      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error('Error in fetchCustomers:', err);
    } finally {
      setDataProcessing(false);
      setLoading(false);
      hideLoader();
    }
  };

  const filteredAndSortedCustomers = useMemo(() => {
    let filtered = customers.filter(customer =>
      customer.company_name?.toLowerCase().includes(search.toLowerCase())
    );

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.company_name || '').localeCompare(b.company_name || '');
        case 'date':
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case 'value':
          return (b.total_spent || 0) - (a.total_spent || 0);
        case 'last_order':
          return new Date(b.last_order_date || 0).getTime() - new Date(a.last_order_date || 0).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [customers, search, sortBy]);

  const totalPages = Math.ceil(filteredAndSortedCustomers.length / customersPerPage);
  const currentCustomers = filteredAndSortedCustomers.slice(
    (currentPage - 1) * customersPerPage,
    currentPage * customersPerPage
  );

  const handleViewCustomer = (customer: DomainCustomer) => {
    navigate(`/customers/${customer.id}`);
  };

  const handleViewOrders = (customer: DomainCustomer) => {
    navigate('/orders', {
      state: {
        customerId: customer.id,
        customerName: customer.company_name
      }
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | undefined | null) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '-';
    }
  };

  const renderListView = () => (
    <div>
      {/* Table Header */}
      <div className="hidden lg:grid grid-cols-[1fr_1.2fr_70px_55px_78px_68px_auto] gap-2 px-4 py-3 bg-muted border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider items-center">
        <div>Customer</div>
        <div>Contact</div>
        <div>Spent</div>
        <div>Owed</div>
        <div>Last Order</div>
        <div>Terms</div>
        <div>Actions</div>
      </div>

      {/* Table Body */}
      <div>
        {currentCustomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="text-4xl mb-3 opacity-50">👥</div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No customers found</h3>
            <p className="text-sm text-muted-foreground">Try adjusting your search criteria or add a new customer.</p>
          </div>
        ) : (
          currentCustomers.map((customer) => {
            const email = customer.contact_persons?.[0]?.email || customer.email || '';
            const phone = customer.phone || '';
            const outstanding = customer.outstanding_receivable || 0;
            const hasLoggedIn = !!customer.last_login_at;

            return (
              <div
                key={customer.id}
                className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr_70px_55px_78px_68px_auto] gap-2 px-4 py-3 border-b border-border/40 hover:bg-white/[0.02] transition-colors items-center group cursor-pointer"
                onClick={() => handleViewCustomer(customer)}
              >
                {/* Customer */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative shrink-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary flex items-center justify-center text-white font-semibold text-xs">
                      {customer.company_name.charAt(0).toUpperCase()}
                    </div>
                    {hasLoggedIn && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-card" title="Has logged in" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {customer.company_name}
                    </div>
                    {customer.location_region && (
                      <div className="text-[11px] text-muted-foreground truncate">{customer.location_region}</div>
                    )}
                  </div>
                </div>

                {/* Contact */}
                <div className="hidden lg:flex flex-col min-w-0">
                  <span className="text-[13px] text-foreground truncate">{email || 'No email'}</span>
                  {phone && <span className="text-[11px] text-muted-foreground">{phone}</span>}
                </div>

                {/* Total Spent */}
                <div className="text-[13px] font-medium text-foreground tabular-nums">
                  <span className="lg:hidden text-xs text-muted-foreground mr-2">Spent:</span>
                  {formatCurrency(customer.total_spent || 0)}
                </div>

                {/* Outstanding */}
                <div className={cn(
                  'text-[13px] font-medium tabular-nums',
                  outstanding > 0 ? 'text-warning' : 'text-muted-foreground'
                )}>
                  <span className="lg:hidden text-xs text-muted-foreground mr-2">Owed:</span>
                  {outstanding > 0 ? formatCurrency(outstanding) : '-'}
                </div>

                {/* Last Order */}
                <div className="hidden lg:block text-[11px] text-muted-foreground tabular-nums">
                  {formatDate(customer.last_order_date)}
                </div>

                {/* Payment Terms */}
                <div className="hidden lg:block">
                  {customer.payment_terms_label ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 leading-tight">
                      {customer.payment_terms_label}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleViewCustomer(customer)}
                    className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-primary/80 border border-primary/25 bg-primary/5 rounded-md hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-all"
                    title="View Customer"
                  >
                    <User size={11} />
                    View
                  </button>
                  <button
                    onClick={() => handleViewOrders(customer)}
                    className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-success/80 border border-success/20 bg-success/5 rounded-md hover:text-success hover:border-success/20 hover:bg-success/10 transition-all"
                    title="View Orders"
                  >
                    <Eye size={11} />
                    Orders
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const renderGridView = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
      {currentCustomers.length === 0 ? (
        <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
          <div className="text-4xl mb-3 opacity-50">👥</div>
          <h3 className="text-lg font-semibold text-foreground mb-1">No customers found</h3>
          <p className="text-sm text-muted-foreground">Try adjusting your search criteria or add a new customer.</p>
        </div>
      ) : (
        currentCustomers.map((customer) => {
          const email = customer.contact_persons?.[0]?.email || customer.email || '';
          const outstanding = customer.outstanding_receivable || 0;
          const hasLoggedIn = !!customer.last_login_at;

          return (
            <div
              key={customer.id}
              className="bg-background border border-border/60 rounded-xl p-5 hover:border-border hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 transition-all cursor-pointer group"
              onClick={() => handleViewCustomer(customer)}
            >
              {/* Card Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary flex items-center justify-center text-white font-semibold text-sm">
                    {customer.company_name.charAt(0).toUpperCase()}
                  </div>
                  {hasLoggedIn && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-background" title="Has logged in" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {customer.company_name}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {email || 'No email'}
                  </p>
                </div>
              </div>

              {/* Card Stats */}
              <div className="grid grid-cols-4 gap-2 mb-4 p-3 bg-card rounded-lg border border-border/40">
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Spent</div>
                  <div className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(customer.total_spent || 0)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Owed</div>
                  <div className={cn(
                    'text-sm font-semibold tabular-nums',
                    outstanding > 0 ? 'text-warning' : 'text-muted-foreground'
                  )}>
                    {outstanding > 0 ? formatCurrency(outstanding) : '-'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Last Order</div>
                  <div className="text-[11px] font-medium text-muted-foreground tabular-nums">{formatDate(customer.last_order_date)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Terms</div>
                  <div className="text-sm font-medium text-muted-foreground">{customer.payment_terms_label || '-'}</div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {customer.location_region || 'No region'}
                </span>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleViewCustomer(customer)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground border border-border rounded-md hover:text-primary hover:border-primary/40 transition-all"
                  >
                    <User size={11} /> View
                  </button>
                  <button
                    onClick={() => handleViewOrders(customer)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground border border-border rounded-md hover:text-success hover:border-success/20 transition-all"
                  >
                    <Eye size={11} /> Orders
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="min-h-screen text-foreground p-6 relative overflow-hidden">
      <PageHeader
        title="Customers"
        count={customers.length}
        subtitle="customers"
        actions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} />
            New Customer
          </button>
        }
      />

      {/* Table Card */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {/* Integrated Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {/* View Toggle */}
          <div className="flex bg-background border border-border rounded-lg overflow-hidden">
            <button
              className={cn(
                'p-2 transition-all',
                viewMode === 'list'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              <List size={16} />
            </button>
            <button
              className={cn(
                'p-2 transition-all',
                viewMode === 'grid'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              <Grid3x3 size={16} />
            </button>
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value as SortBy); setCurrentPage(1); }}
            className="px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm cursor-pointer transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
          >
            <option value="name">Sort by Name</option>
            <option value="date">Sort by Date Created</option>
            <option value="value">Sort by Total Value</option>
            <option value="last_order">Sort by Last Order</option>
          </select>

        </div>

        {/* Results count */}
        <div className="px-5 py-2 text-xs text-muted-foreground border-b border-border/40">
          {filteredAndSortedCustomers.length} customer{filteredAndSortedCustomers.length !== 1 ? 's' : ''}
          {search && ` matching "${search}"`}
        </div>

        {/* Content */}
        {viewMode === 'list' ? renderListView() : renderGridView()}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="text-sm text-muted-foreground">
              {(currentPage - 1) * customersPerPage + 1}–{Math.min(currentPage * customersPerPage, filteredAndSortedCustomers.length)} of {filteredAndSortedCustomers.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-2 text-muted-foreground border border-border rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-foreground font-medium px-2">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="p-2 text-muted-foreground border border-border rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Customer Modal */}
      <CreateCustomer
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchCustomers}
      />
    </div>
  );
}

export default CustomersManagement;
