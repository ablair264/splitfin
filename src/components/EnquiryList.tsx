import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  Plus,
  Search,
  MessageSquare,
  User,
  Eye,
  Calendar,
  Star,
  TrendingUp,
  Users,
  Mail,
  Phone,
  Building,
  Clock,
  Filter,
  Grid,
  List,
  Download,
  ChevronRight,
  AlertCircle,
  Target,
  DollarSign,
  Edit,
  MoreVertical,
  CheckCircle
} from 'lucide-react';
import { authService } from '../services/authService';
import { enquiryService } from '../services/enquiryService';
import { agentService } from '../services/agentService';
import NewEnquiryModal from './NewEnquiry';
import { useComponentLoader } from '../hoc/withLoader';
import { cn } from '@/lib/utils';

// Types based on enquiries schema
interface Enquiry {
  id: string;
  enquiry_number: string;
  status: string;
  priority: string;
  contact_name: string;
  company_name?: string;
  email: string;
  phone?: string;
  subject: string;
  description: string;
  product_interest?: string;
  estimated_value?: number;
  estimated_quantity?: number;
  expected_decision_date?: string;
  lead_source: string;
  referral_source?: string;
  next_follow_up_date?: string;
  follow_up_notes?: string;
  company_id?: string;
  assigned_to?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  last_contacted_at?: string;
  converted_to_customer: boolean;
  converted_customer_id?: string;
  conversion_date?: string;
  is_active: boolean;
  assigned_to_name?: string;
  created_by_name?: string;
}

type SortBy = 'date' | 'priority' | 'value' | 'status' | 'followup';
type ViewMode = 'list' | 'grid';
type FilterStatus = 'all' | 'new' | 'contacted' | 'quoted' | 'negotiating' | 'won' | 'lost';
type FilterPriority = 'all' | 'urgent' | 'high' | 'medium' | 'low';

const statusConfig = {
  new: { color: 'var(--info)', icon: Plus, label: 'New' },
  contacted: { color: 'var(--chart-5)', icon: Phone, label: 'Contacted' },
  quoted: { color: 'var(--warning)', icon: DollarSign, label: 'Quoted' },
  negotiating: { color: 'var(--success)', icon: Target, label: 'Negotiating' },
  won: { color: 'var(--success)', icon: CheckCircle, label: 'Won' },
  lost: { color: 'var(--destructive)', icon: AlertCircle, label: 'Lost' },
  cancelled: { color: 'var(--muted-foreground)', icon: AlertCircle, label: 'Cancelled' }
};

const priorityConfig = {
  urgent: { color: 'var(--destructive)', icon: AlertCircle },
  high: { color: 'var(--warning)', icon: AlertCircle },
  medium: { color: 'var(--info)', icon: Clock },
  low: { color: 'var(--muted-foreground)', icon: Clock }
};

function EnquiryList() {
  usePageTitle('Enquiries');
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataProcessing, setDataProcessing] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterPriority, setFilterPriority] = useState<FilterPriority>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [userRole, setUserRole] = useState<string>('');
  const [users, setUsers] = useState<any[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [showNewEnquiryModal, setShowNewEnquiryModal] = useState(false);

  const enquiriesPerPage = viewMode === 'grid' ? 12 : 20;
  const navigate = useNavigate();
  const { showLoader, hideLoader, setProgress } = useComponentLoader();

  useEffect(() => {
    fetchEnquiries();
    loadUsers();
  }, []);

  const fetchEnquiries = async () => {
    try {
      setLoading(true);
      setDataProcessing(true);
      showLoader('Fetching Enquiry Data...');
      setProgress(10);

      const agent = authService.getCachedAgent();
      if (!agent) {
        console.error('No authenticated user found');
        setDataProcessing(false);
        setLoading(false);
        hideLoader();
        return;
      }

      setUserRole(agent.is_admin ? 'admin' : 'user');
      setProgress(30);

      const filters: Record<string, string> = {};
      if (filterStatus !== 'all') filters.status = filterStatus;
      if (filterPriority !== 'all') filters.priority = filterPriority;
      if (search) filters.search = search;

      const result = await enquiryService.list(filters);
      setEnquiries((result.data || []) as any);
      setProgress(100);

      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error('Error in fetchEnquiries:', err);
    } finally {
      setDataProcessing(false);
      setLoading(false);
      hideLoader();
    }
  };

  const loadUsers = async () => {
    try {
      const agent = authService.getCachedAgent();
      if (!agent) return;
      const agentList = await agentService.list();
      setUsers(agentList);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const canAssignEnquiries = () => {
    return userRole === 'admin' || userRole === 'manager';
  };

  const handleAssignEnquiry = (enquiry: Enquiry) => {
    setSelectedEnquiry(enquiry);
    setShowAssignModal(true);
  };

  const handleAssignSubmit = async (assignToUserId: string) => {
    if (!selectedEnquiry) return;
    setAssignLoading(true);
    try {
      await enquiryService.update(parseInt(selectedEnquiry.id), { assigned_to: assignToUserId });
      await fetchEnquiries();
      setShowAssignModal(false);
      setSelectedEnquiry(null);
    } catch (error) {
      console.error('Error in handleAssignSubmit:', error);
    } finally {
      setAssignLoading(false);
    }
  };

  const filteredEnquiries = useMemo(() => {
    let filtered = enquiries.filter(enquiry => {
      const searchTerm = search.toLowerCase();
      const matchesSearch = !search || (
        enquiry.contact_name.toLowerCase().includes(searchTerm) ||
        (enquiry.company_name && enquiry.company_name.toLowerCase().includes(searchTerm)) ||
        enquiry.email.toLowerCase().includes(searchTerm) ||
        enquiry.subject.toLowerCase().includes(searchTerm) ||
        enquiry.enquiry_number.toLowerCase().includes(searchTerm)
      );
      const matchesStatus = filterStatus === 'all' || enquiry.status === filterStatus;
      const matchesPriority = filterPriority === 'all' || enquiry.priority === filterPriority;
      return matchesSearch && matchesStatus && matchesPriority;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'priority':
          const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority as keyof typeof priorityOrder] - priorityOrder[a.priority as keyof typeof priorityOrder];
        case 'value':
          return (b.estimated_value || 0) - (a.estimated_value || 0);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'followup':
          if (!a.next_follow_up_date) return 1;
          if (!b.next_follow_up_date) return -1;
          return new Date(a.next_follow_up_date).getTime() - new Date(b.next_follow_up_date).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [enquiries, search, sortBy, filterStatus, filterPriority]);

  const totalPages = Math.ceil(filteredEnquiries.length / enquiriesPerPage);
  const paginatedEnquiries = filteredEnquiries.slice(
    (currentPage - 1) * enquiriesPerPage,
    currentPage * enquiriesPerPage
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getDaysUntilFollowUp = (date: string) => {
    const today = new Date();
    const followUpDate = new Date(date);
    const diffTime = followUpDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getStatusConfig = (status: string) => {
    return statusConfig[status as keyof typeof statusConfig] || statusConfig.new;
  };

  const getPriorityConfig = (priority: string) => {
    return priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.low;
  };

  const handleExportEnquiries = () => {
    try {
      const headers = [
        'Enquiry Number', 'Status', 'Priority', 'Contact Name', 'Company Name',
        'Email', 'Phone', 'Subject', 'Description', 'Estimated Value',
        'Estimated Quantity', 'Lead Source', 'Assigned To', 'Created By',
        'Created Date', 'Next Follow Up', 'Last Contacted'
      ];

      const csvRows = [headers.join(',')];
      filteredEnquiries.forEach(enquiry => {
        const row = [
          `"${enquiry.enquiry_number}"`, `"${enquiry.status}"`, `"${enquiry.priority}"`,
          `"${enquiry.contact_name}"`, `"${enquiry.company_name || ''}"`,
          `"${enquiry.email}"`, `"${enquiry.phone || ''}"`,
          `"${enquiry.subject.replace(/"/g, '""')}"`,
          `"${enquiry.description.replace(/"/g, '""')}"`,
          `"${enquiry.estimated_value || ''}"`, `"${enquiry.estimated_quantity || ''}"`,
          `"${enquiry.lead_source}"`, `"${enquiry.assigned_to_name || ''}"`,
          `"${enquiry.created_by_name || ''}"`, `"${formatDate(enquiry.created_at)}"`,
          `"${enquiry.next_follow_up_date ? formatDate(enquiry.next_follow_up_date) : ''}"`,
          `"${enquiry.last_contacted_at ? formatDate(enquiry.last_contacted_at) : ''}"`
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        const today = new Date().toISOString().split('T')[0];
        link.setAttribute('download', `enquiries_export_${today}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Error exporting enquiries:', error);
    }
  };

  return (
    <div className="p-6 bg-background min-h-screen text-foreground">
      {/* Header */}
      <div className="flex justify-between items-start mb-8 pb-8 border-b border-border/40 flex-wrap gap-4">
        <div className="flex-1">
          <div className="flex flex-col gap-2">
            <h1 className="flex items-center gap-3 text-xl font-semibold text-foreground">
              <MessageSquare size={24} className="text-primary" />
              Enquiries
            </h1>
            <p className="text-sm text-muted-foreground">Manage and track your sales pipeline</p>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <button
            onClick={handleExportEnquiries}
            title="Export enquiries"
            className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 text-muted-foreground border border-border rounded-lg text-sm font-medium hover:bg-muted hover:border-border transition-all"
          >
            <Download size={16} />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={() => setShowNewEnquiryModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-all"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">New Enquiry</span>
          </button>
        </div>
      </div>

      {/* Controls — only show when there's data */}
      {enquiries.length > 0 && (
        <div className="flex gap-4 mb-6 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 w-4 h-4 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name, company, email, or enquiry number..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full py-2.5 pl-10 pr-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
              />
            </div>
          </div>

          <div className="flex gap-3 items-center flex-wrap">
            <div className="flex gap-2 items-center flex-wrap">
              <Filter size={16} className="text-muted-foreground/50" />
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value as FilterStatus); setCurrentPage(1); }}
                className="px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-foreground text-sm cursor-pointer focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
              >
                <option value="all">All Status</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="quoted">Quoted</option>
                <option value="negotiating">Negotiating</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </select>

              <select
                value={filterPriority}
                onChange={(e) => { setFilterPriority(e.target.value as FilterPriority); setCurrentPage(1); }}
                className="px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-foreground text-sm cursor-pointer focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
              >
                <option value="all">All Priority</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-foreground text-sm cursor-pointer focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
              >
                <option value="date">Sort by Date</option>
                <option value="priority">Sort by Priority</option>
                <option value="value">Sort by Value</option>
                <option value="status">Sort by Status</option>
                <option value="followup">Sort by Follow-up</option>
              </select>
            </div>

            <div className="flex bg-muted/50 border border-border rounded-lg p-0.5 gap-0.5">
              <button
                className={cn(
                  'flex items-center justify-center p-2 rounded-md transition-all',
                  viewMode === 'grid'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
                onClick={() => { setViewMode('grid'); setCurrentPage(1); }}
                title="Grid view"
              >
                <Grid size={16} />
              </button>
              <button
                className={cn(
                  'flex items-center justify-center p-2 rounded-md transition-all',
                  viewMode === 'list'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
                onClick={() => { setViewMode('list'); setCurrentPage(1); }}
                title="List view"
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-sm text-muted-foreground">Loading enquiries...</p>
        </div>
      ) : filteredEnquiries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <MessageSquare size={28} className="text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">No enquiries yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            {search || filterStatus !== 'all' || filterPriority !== 'all'
              ? 'Try adjusting your filters or search criteria.'
              : 'Create your first enquiry to start tracking your sales pipeline.'}
          </p>
          {!search && filterStatus === 'all' && filterPriority === 'all' && (
            <button
              onClick={() => setShowNewEnquiryModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-all"
            >
              <Plus size={16} />
              New Enquiry
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
          {paginatedEnquiries.map((enquiry) => {
            const statusInfo = getStatusConfig(enquiry.status);
            const priorityInfo = getPriorityConfig(enquiry.priority);
            const StatusIcon = statusInfo.icon;
            const PriorityIcon = priorityInfo.icon;
            const daysUntilFollowUp = enquiry.next_follow_up_date ? getDaysUntilFollowUp(enquiry.next_follow_up_date) : null;

            return (
              <div
                key={enquiry.id}
                className="bg-card/50 border border-border/60 rounded-xl p-5 cursor-pointer hover:border-primary hover:-translate-y-0.5 hover:shadow-lg transition-all flex flex-col gap-3 group"
                onClick={() => navigate(`/enquiries/${enquiry.id}`)}
              >
                {/* Card Header */}
                <div className="flex justify-between items-start gap-3">
                  <div className="flex flex-col gap-2 flex-1">
                    <span className="text-xs text-muted-foreground font-medium tracking-wider uppercase">
                      #{enquiry.enquiry_number}
                    </span>
                    <div className="flex gap-2 flex-wrap">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium capitalize"
                        style={{
                          backgroundColor: `${statusInfo.color}20`,
                          color: statusInfo.color,
                          border: `1px solid ${statusInfo.color}40`
                        }}
                      >
                        <StatusIcon size={12} />
                        {statusInfo.label}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium capitalize"
                        style={{
                          backgroundColor: `${priorityInfo.color}20`,
                          color: priorityInfo.color,
                          border: `1px solid ${priorityInfo.color}40`
                        }}
                      >
                        <PriorityIcon size={12} />
                        {enquiry.priority}
                      </span>
                      {enquiry.lead_source && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                          style={{
                            backgroundColor: enquiry.lead_source === 'trade_portal' ? 'rgba(139, 123, 181, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                            color: enquiry.lead_source === 'trade_portal' ? '#8B7BB5' : 'var(--muted-foreground)',
                            border: `1px solid ${enquiry.lead_source === 'trade_portal' ? 'rgba(139, 123, 181, 0.3)' : 'rgba(100, 116, 139, 0.3)'}`,
                          }}
                        >
                          {enquiry.lead_source === 'trade_portal' ? 'Trade Portal' : enquiry.lead_source === 'trade_show' ? 'Trade Show' : enquiry.lead_source.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {canAssignEnquiries() && (
                      <button
                        className="flex items-center justify-center w-8 h-8 rounded-md border border-border/40 text-muted-foreground hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-all"
                        onClick={(e) => { e.stopPropagation(); handleAssignEnquiry(enquiry); }}
                        title="Assign to salesperson"
                      >
                        <User size={14} />
                      </button>
                    )}
                    <button
                      className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                      onClick={(e) => { e.stopPropagation(); }}
                    >
                      <MoreVertical size={14} />
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div className="flex-1 flex flex-col gap-2">
                  <h3 className="text-base font-semibold text-foreground leading-snug">{enquiry.subject}</h3>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-sm text-foreground/80">
                      <User size={14} />
                      <span>{enquiry.contact_name}</span>
                    </div>
                    {enquiry.company_name && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building size={14} />
                        <span>{enquiry.company_name}</span>
                      </div>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                    {enquiry.description.length > 120
                      ? enquiry.description.substring(0, 120) + '...'
                      : enquiry.description}
                  </p>

                  {enquiry.estimated_value && (
                    <div className="flex items-center gap-2 text-sm text-primary font-medium mt-auto">
                      <DollarSign size={14} />
                      <span>{formatCurrency(enquiry.estimated_value)}</span>
                      {enquiry.estimated_quantity && (
                        <span className="text-muted-foreground font-normal">{enquiry.estimated_quantity} units</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="flex justify-between items-center pt-3 border-t border-border/40">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar size={12} />
                      <span>{formatDate(enquiry.created_at)}</span>
                    </div>
                    {daysUntilFollowUp !== null && (
                      <div className={cn(
                        'flex items-center gap-1.5 text-xs',
                        daysUntilFollowUp < 0 ? 'text-destructive'
                          : daysUntilFollowUp <= 2 ? 'text-warning'
                          : 'text-foreground/70'
                      )}>
                        <Clock size={12} />
                        <span>
                          {daysUntilFollowUp < 0
                            ? `${Math.abs(daysUntilFollowUp)} days overdue`
                            : daysUntilFollowUp === 0
                            ? 'Follow up today'
                            : `Follow up in ${daysUntilFollowUp} days`}
                        </span>
                      </div>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="bg-card/50 border border-border/60 rounded-xl overflow-hidden mb-6">
          {/* List Header */}
          <div className="hidden lg:grid grid-cols-[2fr_2fr_120px_100px_120px_100px_100px_100px] gap-3 px-4 py-3 bg-muted/50 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider items-center">
            <div>Contact</div>
            <div>Subject</div>
            <div>Status</div>
            <div>Priority</div>
            <div>Value</div>
            <div>Follow-up</div>
            <div>Created</div>
            <div>Actions</div>
          </div>

          {/* List Body */}
          <div className="flex flex-col">
            {paginatedEnquiries.map((enquiry) => {
              const statusInfo = getStatusConfig(enquiry.status);
              const priorityInfo = getPriorityConfig(enquiry.priority);
              const StatusIcon = statusInfo.icon;
              const PriorityIcon = priorityInfo.icon;
              const daysUntilFollowUp = enquiry.next_follow_up_date ? getDaysUntilFollowUp(enquiry.next_follow_up_date) : null;

              return (
                <div
                  key={enquiry.id}
                  className="grid grid-cols-1 lg:grid-cols-[2fr_2fr_120px_100px_120px_100px_100px_100px] gap-3 px-4 py-3 border-b border-border/30 cursor-pointer hover:bg-primary/[0.04] transition-colors items-center"
                  onClick={() => navigate(`/enquiries/${enquiry.id}`)}
                >
                  {/* Contact */}
                  <div className="flex items-center">
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-foreground">{enquiry.contact_name}</span>
                        {enquiry.company_name && (
                          <span className="text-xs text-muted-foreground">{enquiry.company_name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail size={12} />
                        <span className="truncate">{enquiry.email}</span>
                        {enquiry.phone && (
                          <>
                            <Phone size={12} />
                            <span>{enquiry.phone}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Subject */}
                  <div className="flex items-center">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-medium tracking-wider uppercase">#{enquiry.enquiry_number}</span>
                        {enquiry.lead_source && (
                          <span
                            className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium"
                            style={{
                              backgroundColor: enquiry.lead_source === 'trade_portal' ? 'rgba(139, 123, 181, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                              color: enquiry.lead_source === 'trade_portal' ? '#8B7BB5' : 'var(--muted-foreground)',
                            }}
                          >
                            {enquiry.lead_source === 'trade_portal' ? 'Trade Portal' : enquiry.lead_source === 'trade_show' ? 'Trade Show' : enquiry.lead_source.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-foreground/90 font-medium truncate">{enquiry.subject}</span>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-center">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium capitalize"
                      style={{
                        backgroundColor: `${statusInfo.color}20`,
                        color: statusInfo.color,
                        border: `1px solid ${statusInfo.color}40`
                      }}
                    >
                      <StatusIcon size={12} />
                      {statusInfo.label}
                    </span>
                  </div>

                  {/* Priority */}
                  <div className="flex items-center">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium capitalize"
                      style={{
                        backgroundColor: `${priorityInfo.color}20`,
                        color: priorityInfo.color,
                        border: `1px solid ${priorityInfo.color}40`
                      }}
                    >
                      <PriorityIcon size={12} />
                      {enquiry.priority}
                    </span>
                  </div>

                  {/* Value */}
                  <div className="flex items-center">
                    {enquiry.estimated_value ? (
                      <span className="font-medium text-primary tabular-nums">{formatCurrency(enquiry.estimated_value)}</span>
                    ) : (
                      <span className="text-muted-foreground/30">-</span>
                    )}
                  </div>

                  {/* Follow-up */}
                  <div className="flex items-center">
                    {daysUntilFollowUp !== null ? (
                      <div className={cn(
                        'flex items-center gap-1.5 text-xs',
                        daysUntilFollowUp < 0 ? 'text-destructive'
                          : daysUntilFollowUp <= 2 ? 'text-warning'
                          : 'text-foreground/70'
                      )}>
                        <Clock size={12} />
                        <span>
                          {daysUntilFollowUp < 0
                            ? `${Math.abs(daysUntilFollowUp)}d overdue`
                            : daysUntilFollowUp === 0
                            ? 'Today'
                            : `${daysUntilFollowUp}d`}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/30">-</span>
                    )}
                  </div>

                  {/* Created */}
                  <div className="flex items-center">
                    <span className="text-sm text-muted-foreground tabular-nums">{formatDate(enquiry.created_at)}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center">
                    <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/enquiries/${enquiry.id}`)}
                        title="View details"
                        className="flex items-center justify-center w-8 h-8 border border-border/40 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => navigate(`/enquiries/${enquiry.id}/edit`)}
                        title="Edit enquiry"
                        className="flex items-center justify-center w-8 h-8 border border-border/40 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                      >
                        <Edit size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 py-6">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-muted/50 border border-border rounded-lg text-foreground/80 text-sm font-medium hover:bg-muted transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Previous
          </button>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="text-foreground/80 font-medium">Page {currentPage} of {totalPages}</span>
            <span>({filteredEnquiries.length} enquiries)</span>
          </div>

          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-muted/50 border border-border rounded-lg text-foreground/80 text-sm font-medium hover:bg-muted transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {/* Assignment Modal */}
      {showAssignModal && selectedEnquiry && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1000]">
          <div className="bg-card border border-border rounded-xl w-full max-w-sm max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-border/40">
              <h3 className="text-lg font-semibold text-foreground">Assign Enquiry</h3>
              <button
                onClick={() => { setShowAssignModal(false); setSelectedEnquiry(null); }}
                className="flex items-center justify-center w-8 h-8 border border-border/40 rounded-md text-muted-foreground hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-all text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-foreground mb-4">
                Assign enquiry <strong>#{selectedEnquiry.enquiry_number}</strong> to:
              </p>
              <div className="flex flex-col gap-2">
                {users.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No users available. User list is being migrated.</p>
                ) : (
                  users.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleAssignSubmit(user.id)}
                      disabled={assignLoading}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 border rounded-lg text-foreground text-sm w-full text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                        selectedEnquiry.assigned_to === user.id
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'bg-card/50 border-border/40 hover:bg-primary/10 hover:border-primary hover:text-primary'
                      )}
                    >
                      <User size={16} />
                      <span>{user.name}</span>
                      {selectedEnquiry.assigned_to === user.id && (
                        <span className="ml-auto px-2 py-0.5 bg-primary/20 border border-primary/30 rounded text-xs font-medium text-primary">
                          Current
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-border/40">
              <button
                onClick={() => { setShowAssignModal(false); setSelectedEnquiry(null); }}
                disabled={assignLoading}
                className="px-4 py-2 bg-muted/50 border border-border rounded-lg text-foreground/80 text-sm font-medium hover:bg-muted transition-all disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Enquiry Modal */}
      <NewEnquiryModal
        isOpen={showNewEnquiryModal}
        onClose={() => setShowNewEnquiryModal(false)}
        onCreated={() => {
          setShowNewEnquiryModal(false);
          fetchEnquiries();
        }}
      />
    </div>
  );
}

export default EnquiryList;
