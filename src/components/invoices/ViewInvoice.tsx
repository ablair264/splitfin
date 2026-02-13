import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { invoiceService } from '@/services/invoiceService';
import { orderService } from '@/services/orderService';
import { authService } from '@/services/authService';
import { Button } from '@/components/ui/button';
import type { Invoice, InvoicePayment } from '@/types/domain';
import { statusStyles } from './invoices-columns';
import {
  FileText,
  ArrowLeft,
  ChevronRight,
  MapPin,
  Mail,
  Phone,
  User,
  Calendar,
  Clock,
  CreditCard,
  Package,
  ExternalLink,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Banknote,
  X,
  Check,
  Loader2,
  Send,
} from 'lucide-react';

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(dateStr));
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const style = statusStyles[status] || 'bg-muted text-muted-foreground border-border';
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${style}`}>
      {label}
    </span>
  );
}

function AddressCard({ label, address }: { label: string; address: Record<string, string> | null }) {
  if (!address) return null;
  const parts = [address.address, address.street2, address.city, address.state, address.zip, address.country].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <div className="flex-1 min-w-[200px]">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <MapPin size={12} />
        {label}
      </h4>
      <p className="text-sm text-muted-foreground leading-relaxed">{parts.join(', ')}</p>
    </div>
  );
}

const PAYMENT_MODES = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'direct_debit', label: 'Direct Debit' },
  { value: 'other', label: 'Other' },
];

export default function ViewInvoice() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [linkedOrderId, setLinkedOrderId] = useState<number | null>(null);

  // Payments state
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState('bank_transfer');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentDesc, setPaymentDesc] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  // Reminder state
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderTo, setReminderTo] = useState('');
  const [reminderCc, setReminderCc] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderLog, setReminderLog] = useState<Array<{ id: number; sent_to: string; subject: string; status: string; created_at: string }>>([]);

  usePageTitle(invoice ? `Invoice ${invoice.invoice_number}` : 'Invoice');

  const fetchInvoice = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const data = await invoiceService.getById(Number(invoiceId));
      setInvoice(data);
    } catch (err) {
      console.error('Failed to fetch invoice:', err);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  const fetchPayments = useCallback(async () => {
    if (!invoiceId) return;
    try {
      const data = await invoiceService.getPayments(Number(invoiceId));
      setPayments(data);
    } catch (err) {
      console.error('Failed to fetch payments:', err);
    }
  }, [invoiceId]);

  const fetchReminderLog = useCallback(async () => {
    if (!invoiceId) return;
    try {
      const data = await invoiceService.getReminderLog(Number(invoiceId));
      setReminderLog(data as Array<{ id: number; sent_to: string; subject: string; status: string; created_at: string }>);
    } catch {
      // Reminder log may not exist yet
    }
  }, [invoiceId]);

  useEffect(() => {
    fetchInvoice();
    fetchPayments();
    fetchReminderLog();
  }, [fetchInvoice, fetchPayments, fetchReminderLog]);

  // Look up the internal order ID for the linked salesorder
  useEffect(() => {
    if (!invoice?.salesorder_number) return;
    let ignore = false;
    orderService.list({ search: invoice.salesorder_number, limit: 1 }).then((res) => {
      if (!ignore && res.data?.length) {
        setLinkedOrderId(res.data[0].id);
      }
    }).catch(() => {});
    return () => { ignore = true; };
  }, [invoice?.salesorder_number]);

  async function handleRecordPayment() {
    if (!invoice) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setPaymentError('Enter a valid amount');
      return;
    }
    if (amount > invoice.balance) {
      setPaymentError(`Amount exceeds balance (${formatCurrency(invoice.balance)})`);
      return;
    }

    setRecordingPayment(true);
    setPaymentError('');

    try {
      const agent = authService.getCachedAgent();
      const result = await invoiceService.recordPayment(invoice.id, {
        amount,
        payment_date: paymentDate,
        payment_mode: paymentMode,
        reference_number: paymentRef || undefined,
        description: paymentDesc || undefined,
        recorded_by: agent?.id,
      });

      // Update invoice locally
      setInvoice(prev => prev ? {
        ...prev,
        balance: result.new_balance,
        status: result.invoice_status,
        last_payment_date: paymentDate,
      } : null);

      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentRef('');
      setPaymentDesc('');
      fetchPayments();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to record payment';
      setPaymentError(message);
    } finally {
      setRecordingPayment(false);
    }
  }

  async function handleSendReminder() {
    if (!invoice || !reminderTo) return;

    setSendingReminder(true);
    try {
      const agent = authService.getCachedAgent();
      await invoiceService.sendReminder(invoice.id, {
        to: reminderTo,
        cc: reminderCc || undefined,
        custom_message: reminderMessage || undefined,
        sent_by: agent?.id,
      });
      setShowReminderModal(false);
      setReminderMessage('');
      fetchReminderLog();
    } catch (err) {
      console.error('Failed to send reminder:', err);
    } finally {
      setSendingReminder(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-white/5 rounded w-64" />
        <div className="h-64 bg-white/5 rounded-xl" />
        <div className="h-48 bg-white/5 rounded-xl" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-16">
        <FileText size={48} className="mx-auto text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-medium text-foreground">Invoice not found</h2>
        <button onClick={() => navigate('/finance/invoices')} className="mt-4 text-sm text-primary hover:underline">
          Back to Invoices
        </button>
      </div>
    );
  }

  const isOverdue = invoice.due_date && invoice.balance > 0 && new Date(invoice.due_date) < new Date();
  const lineItems = invoice.line_items || [];
  const customerInfo = invoice.customer_info;
  const hasNotes = invoice.notes || invoice.terms;
  const canRecordPayment = invoice.balance > 0 && invoice.status !== 'void';
  const canSendReminder = invoice.balance > 0 && customerInfo?.email;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/finance/invoices" className="hover:text-foreground transition-colors">Invoices</Link>
        <ChevronRight size={14} />
        <span className="text-foreground font-medium">{invoice.invoice_number}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{invoice.invoice_number}</h1>
          <StatusBadge status={invoice.status} />
          {isOverdue && (
            <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
              <AlertTriangle size={12} /> Overdue
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canSendReminder && (
            <Button
              intent="outline"
              size="sm"
              onPress={() => {
                setReminderTo(customerInfo?.email || '');
                setShowReminderModal(true);
              }}
            >
              <Send size={14} /> Send Reminder
            </Button>
          )}
          {canRecordPayment && (
            <Button
              intent="primary"
              size="sm"
              onPress={() => {
                setPaymentAmount(String(invoice.balance));
                setShowPaymentModal(true);
              }}
            >
              <Banknote size={14} /> Record Payment
            </Button>
          )}
          <Button intent="outline" size="sm" onPress={() => navigate('/finance/invoices')}>
            <ArrowLeft size={14} /> Back
          </Button>
        </div>
      </div>

      {/* Main content: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Line items + financials */}
        <div className="lg:col-span-2 space-y-6">
          {/* Line Items */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Package size={16} className="text-primary" />
                Line Items
                <span className="text-xs text-muted-foreground">({lineItems.length})</span>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-5 py-3 font-medium">Item</th>
                    <th className="text-right px-3 py-3 font-medium">Qty</th>
                    <th className="text-right px-3 py-3 font-medium">Rate</th>
                    <th className="text-right px-3 py-3 font-medium">Discount</th>
                    <th className="text-right px-3 py-3 font-medium">Tax</th>
                    <th className="text-right px-5 py-3 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex flex-col">
                          <span className="text-foreground font-medium">{item.name}</span>
                          {item.sku && <span className="text-xs text-muted-foreground font-mono">{item.sku}</span>}
                          {item.description && <span className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</span>}
                        </div>
                      </td>
                      <td className="text-right px-3 py-3 tabular-nums text-muted-foreground">{item.quantity}</td>
                      <td className="text-right px-3 py-3 tabular-nums text-muted-foreground">{formatCurrency(item.rate)}</td>
                      <td className="text-right px-3 py-3 tabular-nums text-muted-foreground">
                        {item.discount_amount > 0 ? formatCurrency(item.discount_amount) : '-'}
                      </td>
                      <td className="text-right px-3 py-3 tabular-nums text-muted-foreground">
                        {item.tax_amount > 0 ? (
                          <span title={item.tax_name || ''}>{formatCurrency(item.tax_amount)}</span>
                        ) : '-'}
                      </td>
                      <td className="text-right px-5 py-3 tabular-nums font-medium text-foreground">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                  {lineItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">No line items</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Financial Summary */}
            <div className="px-5 py-4 border-t border-border bg-white/[0.02]">
              <div className="flex flex-col items-end gap-1.5 text-sm">
                <div className="flex justify-between w-64">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums text-foreground">{formatCurrency(invoice.sub_total)}</span>
                </div>
                {invoice.discount_total > 0 && (
                  <div className="flex justify-between w-64">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="tabular-nums text-foreground">-{formatCurrency(invoice.discount_total)}</span>
                  </div>
                )}
                {invoice.tax_total > 0 && (
                  <div className="flex justify-between w-64">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="tabular-nums text-foreground">{formatCurrency(invoice.tax_total)}</span>
                  </div>
                )}
                {invoice.shipping_charge > 0 && (
                  <div className="flex justify-between w-64">
                    <span className="text-muted-foreground">Shipping</span>
                    <span className="tabular-nums text-foreground">{formatCurrency(invoice.shipping_charge)}</span>
                  </div>
                )}
                {invoice.adjustment !== 0 && invoice.adjustment != null && (
                  <div className="flex justify-between w-64">
                    <span className="text-muted-foreground">Adjustment</span>
                    <span className="tabular-nums text-foreground">{formatCurrency(invoice.adjustment)}</span>
                  </div>
                )}
                <div className="flex justify-between w-64 pt-2 border-t border-border font-semibold">
                  <span className="text-foreground">Total</span>
                  <span className="tabular-nums text-foreground">{formatCurrency(invoice.total)}</span>
                </div>
                {invoice.balance > 0 && (
                  <div className={`flex justify-between w-64 pt-1 font-semibold ${isOverdue ? 'text-red-400' : 'text-orange-400'}`}>
                    <span>Balance Due</span>
                    <span className="tabular-nums">{formatCurrency(invoice.balance)}</span>
                  </div>
                )}
                {invoice.balance === 0 && invoice.total > 0 && (
                  <div className="flex justify-between w-64 pt-1 font-semibold text-emerald-400">
                    <span>Paid in Full</span>
                    <span className="tabular-nums">{formatCurrency(0)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Payment History */}
          {payments.length > 0 && (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Banknote size={16} className="text-emerald-400" />
                  Payment History
                  <span className="text-xs text-muted-foreground">({payments.length})</span>
                </h3>
              </div>
              <div className="divide-y divide-white/5">
                {payments.map((p) => (
                  <div key={p.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <Check size={14} className="text-emerald-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{formatCurrency(p.amount)}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>{formatDate(p.payment_date)}</span>
                          <span className="text-muted-foreground/30">|</span>
                          <span className="capitalize">{(p.payment_mode || 'cash').replace(/_/g, ' ')}</span>
                          {p.reference_number && (
                            <>
                              <span className="text-muted-foreground/30">|</span>
                              <span>Ref: {p.reference_number}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.sync_status === 'synced' ? (
                        <span className="text-xs text-emerald-400/70">Synced</span>
                      ) : (
                        <span className="text-xs text-amber-400/70">Pending sync</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reminder History */}
          {reminderLog.length > 0 && (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Send size={16} className="text-blue-400" />
                  Reminder History
                  <span className="text-xs text-muted-foreground">({reminderLog.length})</span>
                </h3>
              </div>
              <div className="divide-y divide-white/5">
                {reminderLog.map((r) => (
                  <div key={r.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm text-foreground">{r.subject}</div>
                      <div className="text-xs text-muted-foreground">
                        Sent to {r.sent_to} on {formatDate(r.created_at)}
                      </div>
                    </div>
                    <span className={`text-xs ${r.status === 'sent' ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes & Terms (collapsible) */}
          {hasNotes && (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setShowNotes(!showNotes)}
                className="w-full px-5 py-3 flex items-center justify-between text-sm font-semibold text-foreground hover:bg-white/[0.02] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <FileText size={16} className="text-primary" />
                  Notes & Terms
                </span>
                {showNotes ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showNotes && (
                <div className="px-5 pb-4 space-y-3 border-t border-border pt-3">
                  {invoice.notes && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
                    </div>
                  )}
                  {invoice.terms && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Terms & Conditions</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.terms}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column: Info cards */}
        <div className="space-y-6">
          {/* Payment Info */}
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <CreditCard size={16} className="text-primary" />
              Payment Details
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Calendar className="text-primary w-5 shrink-0" size={18} />
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Invoice Date</label>
                  <span className="text-foreground font-medium text-sm">{formatDate(invoice.invoice_date)}</span>
                </div>
              </div>
              {invoice.due_date && (
                <div className="flex items-center gap-3">
                  <Clock className={`w-5 shrink-0 ${isOverdue ? 'text-red-400' : 'text-primary'}`} size={18} />
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Due Date</label>
                    <span className={`font-medium text-sm ${isOverdue ? 'text-red-400' : 'text-foreground'}`}>{formatDate(invoice.due_date)}</span>
                  </div>
                </div>
              )}
              {invoice.payment_terms_label && (
                <div className="flex items-center gap-3">
                  <FileText className="text-primary w-5 shrink-0" size={18} />
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Payment Terms</label>
                    <span className="text-foreground font-medium text-sm">{invoice.payment_terms_label}</span>
                  </div>
                </div>
              )}
              {invoice.last_payment_date && (
                <div className="flex items-center gap-3">
                  <CreditCard className="text-emerald-400 w-5 shrink-0" size={18} />
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Last Payment</label>
                    <span className="text-emerald-400 font-medium text-sm">{formatDate(invoice.last_payment_date)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Customer Info */}
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <User size={16} className="text-primary" />
              Customer
            </h3>
            <div className="space-y-3">
              <div>
                <span className="text-foreground font-medium text-sm">{invoice.customer_name}</span>
                {customerInfo?.id && (
                  <Link
                    to={`/customers/${customerInfo.id}`}
                    className="ml-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    View <ExternalLink size={10} />
                  </Link>
                )}
              </div>
              {customerInfo?.contact_name && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User size={14} className="shrink-0" />
                  {customerInfo.contact_name}
                </div>
              )}
              {customerInfo?.email && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail size={14} className="shrink-0" />
                  <a href={`mailto:${customerInfo.email}`} className="hover:text-primary transition-colors truncate">
                    {customerInfo.email}
                  </a>
                </div>
              )}
              {customerInfo?.phone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone size={14} className="shrink-0" />
                  {customerInfo.phone}
                </div>
              )}
            </div>
          </div>

          {/* Linked Order */}
          {invoice.salesorder_number && (
            <div className="bg-card rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Package size={16} className="text-primary" />
                Linked Order
              </h3>
              <Link
                to={linkedOrderId ? `/order/${linkedOrderId}` : `/orders?search=${invoice.salesorder_number}`}
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <FileText size={14} />
                {invoice.salesorder_number}
                <ExternalLink size={12} />
              </Link>
            </div>
          )}

          {/* Salesperson */}
          {invoice.salesperson_name && (
            <div className="bg-card rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <User size={16} className="text-primary" />
                Salesperson
              </h3>
              <span className="text-sm text-foreground">{invoice.salesperson_name}</span>
            </div>
          )}

          {/* Addresses */}
          {(invoice.billing_address || invoice.shipping_address) && (
            <div className="bg-card rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <MapPin size={16} className="text-primary" />
                Addresses
              </h3>
              <div className="flex flex-col gap-4">
                <AddressCard label="Billing" address={invoice.billing_address as Record<string, string>} />
                <AddressCard label="Shipping" address={invoice.shipping_address as Record<string, string>} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl w-full max-w-md mx-4 shadow-2xl">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Banknote size={18} className="text-primary" />
                Record Payment
              </h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="flex justify-between text-sm text-muted-foreground pb-2 border-b border-border/50">
                <span>Invoice Balance</span>
                <span className="font-medium text-foreground">{formatCurrency(invoice.balance)}</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={invoice.balance}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="0.00"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white/5 border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Method</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white/5 border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {PAYMENT_MODES.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Reference Number</label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="e.g. CHQ-12345"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
                <input
                  type="text"
                  value={paymentDesc}
                  onChange={(e) => setPaymentDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Optional note"
                />
              </div>

              {paymentError && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertTriangle size={12} /> {paymentError}
                </p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
              <Button intent="outline" size="sm" onPress={() => setShowPaymentModal(false)}>
                Cancel
              </Button>
              <Button intent="primary" size="sm" onPress={handleRecordPayment} isDisabled={recordingPayment}>
                {recordingPayment ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {recordingPayment ? 'Recording...' : 'Record Payment'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reminder Modal */}
      {showReminderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl w-full max-w-md mx-4 shadow-2xl">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Send size={18} className="text-blue-400" />
                Send Payment Reminder
              </h3>
              <button onClick={() => setShowReminderModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="flex justify-between text-sm text-muted-foreground pb-2 border-b border-border/50">
                <span>{invoice.invoice_number}</span>
                <span className="font-medium text-foreground">Balance: {formatCurrency(invoice.balance)}</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">To *</label>
                <input
                  type="email"
                  value={reminderTo}
                  onChange={(e) => setReminderTo(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">CC</label>
                <input
                  type="email"
                  value={reminderCc}
                  onChange={(e) => setReminderCc(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Custom Message</label>
                <textarea
                  value={reminderMessage}
                  onChange={(e) => setReminderMessage(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  placeholder="Add a personal note (optional)"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
              <Button intent="outline" size="sm" onPress={() => setShowReminderModal(false)}>
                Cancel
              </Button>
              <Button intent="primary" size="sm" onPress={handleSendReminder} isDisabled={sendingReminder || !reminderTo}>
                {sendingReminder ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {sendingReminder ? 'Sending...' : 'Send Reminder'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
