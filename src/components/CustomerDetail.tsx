import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Mail, Phone, MapPin, ExternalLink, Save, X, Loader2, ShoppingCart,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { customerService } from '../services/customerService';
import { orderService } from '../services/orderService';
import { useLoader } from '../contexts/LoaderContext';
import type { Customer, Address, Order } from '../types/domain';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Editable, EditableArea, EditablePreview, EditableInput,
} from '@/components/ui/editable';

// ---------------------------------------------------------------------------
// File-scope helpers
// ---------------------------------------------------------------------------

const ADDRESS_FIELDS: { key: keyof Address; label: string }[] = [
  { key: 'address', label: 'Address' },
  { key: 'street2', label: 'Address 2' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'Postcode' },
  { key: 'country', label: 'Country' },
];

const formatCurrency = (value: number | undefined | null): string => {
  if (value === undefined || value === null || isNaN(value)) return '\u00A30';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
};

const formatDate = (dateString: string | undefined | null) => {
  if (!dateString) return '-';
  try {
    return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return '-'; }
};

const orderStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'confirmed': case 'invoiced':
      return 'text-primary bg-primary/8 border-primary/15';
    case 'draft':
      return 'text-muted-foreground bg-muted/30 border-border/30';
    case 'void': case 'cancelled':
      return 'text-destructive bg-destructive/10 border-destructive/20';
    case 'closed':
      return 'text-muted-foreground bg-muted/30 border-border/30';
    default:
      return 'text-muted-foreground bg-muted/30 border-border/30';
  }
};

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
      <span className="text-[13px] text-muted-foreground shrink-0">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CustomerDetail() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { showLoader, hideLoader } = useLoader();
  const [customerData, setCustomerData] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Inline edit state
  const [dirtyFields, setDirtyFields] = useState<Record<string, unknown>>({});
  const [discardCount, setDiscardCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasDirtyFields = Object.keys(dirtyFields).length > 0;

  useEffect(() => {
    if (customerId) fetchCustomerData();
  }, [customerId]);

  useEffect(() => {
    if (customerData?.zoho_contact_id) {
      fetchOrders(customerData.zoho_contact_id);
    }
  }, [customerData?.zoho_contact_id]);

  const fetchCustomerData = async () => {
    try {
      setLoading(true);
      showLoader('Loading Customer...');
      const customer = await customerService.getById(customerId!);
      setCustomerData(customer);
    } catch (error) {
      console.error('Error fetching customer:', error);
    } finally {
      setLoading(false);
      hideLoader();
    }
  };

  const fetchOrders = async (zohoContactId: string) => {
    try {
      setOrdersLoading(true);
      const { data } = await orderService.list({ customer_id: zohoContactId, limit: 50 });
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setOrdersLoading(false);
    }
  };

  // -- Dirty field tracking --
  const handleFieldSubmit = useCallback((field: string, value: string) => {
    if (!customerData) return;
    const currentVal = String((customerData as unknown as Record<string, unknown>)[field] ?? '');
    if (value === currentVal) {
      setDirtyFields(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      return;
    }
    setDirtyFields(prev => ({ ...prev, [field]: value || null }));
  }, [customerData]);

  const handleAddressFieldSubmit = useCallback((type: 'billing_address' | 'shipping_address', field: keyof Address, value: string) => {
    if (!customerData) return;
    const currentAddr = customerData[type] as Address | null;
    const currentVal = currentAddr?.[field] ?? '';
    const dirtyKey = `${type}.${field}`;

    if (value === currentVal) {
      setDirtyFields(prev => {
        const next = { ...prev };
        delete next[dirtyKey];
        return next;
      });
      return;
    }
    setDirtyFields(prev => ({ ...prev, [dirtyKey]: value || undefined }));
  }, [customerData]);

  const handleSave = async () => {
    if (!customerData || !hasDirtyFields) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Reconstruct update payload from dirtyFields
      const payload: Partial<Customer> = {};
      const billingUpdates: Record<string, unknown> = {};
      const shippingUpdates: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(dirtyFields)) {
        if (key.startsWith('billing_address.')) {
          billingUpdates[key.replace('billing_address.', '')] = value;
        } else if (key.startsWith('shipping_address.')) {
          shippingUpdates[key.replace('shipping_address.', '')] = value;
        } else {
          (payload as Record<string, unknown>)[key] = value;
        }
      }

      if (Object.keys(billingUpdates).length > 0) {
        payload.billing_address = { ...(customerData.billing_address as Address || {}), ...billingUpdates } as Address;
      }
      if (Object.keys(shippingUpdates).length > 0) {
        payload.shipping_address = { ...(customerData.shipping_address as Address || {}), ...shippingUpdates } as Address;
      }

      const updated = await customerService.update(customerData.id, payload);
      setCustomerData(updated);
      setDirtyFields({});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save changes';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setDirtyFields({});
    setSaveError(null);
    setDiscardCount(c => c + 1);
  };

  if (loading) return null;

  if (!customerData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Customer not found</p>
        <Button intent="plain" size="sm" onPress={() => navigate('/customers')}>
          Back to Customers
        </Button>
      </div>
    );
  }

  const contactPersons = customerData.contact_persons || [];
  const primaryContact = contactPersons.find(c => c.is_primary_contact);
  const outstandingAmount = customerData.outstanding_receivable || 0;
  const lastOrderDate = orders.length > 0 ? orders[0]?.date : undefined;

  // Stable Editable key prefix
  const ek = `${customerData.id}-${discardCount}`;

  return (
    <div className="w-full p-6">
      {/* ── Identity + Metrics strip ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-6 pb-7 mb-8 border-b border-border/60"
      >
        <div className="flex items-center gap-3 shrink-0">
          <Avatar
            size="lg"
            initials={customerData.company_name.charAt(0).toUpperCase()}
            className="bg-primary text-primary-fg"
          />
          <div>
            <h1 className="text-[17px] font-semibold text-foreground leading-tight">{customerData.company_name}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider',
                customerData.status === 'active'
                  ? 'bg-success/10 text-success'
                  : 'bg-muted/30 text-muted-foreground'
              )}>
                {customerData.status}
              </span>
              {customerData.location_region && (
                <span className="text-[11px] text-muted-foreground">{customerData.location_region}</span>
              )}
              {customerData.brand_preferences && customerData.brand_preferences.length > 0 && (
                <>
                  <span className="text-border">&middot;</span>
                  {customerData.brand_preferences.map((brand, i) => {
                    const label = typeof brand === 'string' ? brand : (brand as Record<string, string>)?.brand || String(brand);
                    return (
                      <span
                        key={i}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-primary/8 text-primary border border-primary/15"
                      >
                        {label}
                      </span>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>

        <Separator orientation="vertical" className="h-10" />

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-x-6 gap-y-3 flex-1 min-w-0">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Spent</div>
            <div className="text-lg font-semibold text-foreground tabular-nums">{formatCurrency(customerData.total_spent)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Outstanding</div>
            <div className={cn('text-lg font-semibold tabular-nums', outstandingAmount > 0 ? 'text-warning' : 'text-muted-foreground')}>
              {outstandingAmount > 0 ? formatCurrency(outstandingAmount) : '\u00A30'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Terms</div>
            <div className="text-lg font-semibold text-foreground">{customerData.payment_terms_label || customerData.payment_terms || '-'}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Orders</div>
            <div className="text-lg font-semibold text-foreground tabular-nums">{orders.length}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Avg Order</div>
            <div className="text-lg font-semibold text-foreground tabular-nums">{formatCurrency(customerData.average_order_value)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Since</div>
            <div className="text-sm font-medium text-foreground">{formatDate(customerData.created_at)}</div>
          </div>
          {customerData.segment && (
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Segment</div>
              <div className="text-sm font-medium text-primary">{customerData.segment}</div>
            </div>
          )}
        </div>

        {/* Header actions */}
        <div className="shrink-0 flex items-center gap-2">
          <AnimatePresence>
            {hasDirtyFields && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-2"
              >
                <Button intent="outline" size="sm" onPress={handleDiscard} isDisabled={saving}>
                  <X size={13} /> Discard
                </Button>
                <Button intent="primary" size="sm" onPress={handleSave} isDisabled={saving}>
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          {!hasDirtyFields && (
            <Button
              intent="outline"
              size="sm"
              onPress={() => navigate('/orders/new', { state: { fromCustomerDetail: true, customer: { id: customerData.id, display_name: customerData.company_name } } })}
            >
              <ShoppingCart size={12} /> New Order
            </Button>
          )}
        </div>
      </motion.div>

      {/* Save error banner */}
      <AnimatePresence>
        {saveError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 px-4 py-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-[13px] text-destructive"
          >
            {saveError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main two-column layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-10">
        {/* Left column */}
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Company card */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="bg-card rounded-xl border border-border/60 p-5"
            >
              <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-4">Company</h3>

              <DetailRow label="Contact">
                <Editable
                  key={`contact_name-${ek}`}
                  defaultValue={customerData.contact_name || ''}
                  placeholder="-"
                  onSubmit={val => handleFieldSubmit('contact_name', val)}
                >
                  <EditableArea>
                    <EditablePreview className="text-[13px] font-medium text-foreground py-0" />
                    <EditableInput className="text-[13px] font-medium px-1 text-right" />
                  </EditableArea>
                </Editable>
              </DetailRow>

              <DetailRow label="Email">
                <div className="flex items-center gap-1.5 justify-end">
                  <Editable
                    key={`email-${ek}`}
                    defaultValue={customerData.email || primaryContact?.email || ''}
                    placeholder="-"
                    onSubmit={val => handleFieldSubmit('email', val)}
                  >
                    <EditableArea>
                      <EditablePreview className="text-[13px] font-medium text-foreground py-0" />
                      <EditableInput className="text-[13px] font-medium px-1 text-right" type="email" />
                    </EditableArea>
                  </Editable>
                  {(customerData.email || primaryContact?.email) && (
                    <Tooltip>
                      <TooltipTrigger
                        aria-label="Send email"
                        className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors"
                        onPress={() => window.open(`mailto:${customerData.email || primaryContact?.email}`)}
                      >
                        <Mail size={11} />
                      </TooltipTrigger>
                      <TooltipContent>Send email</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </DetailRow>

              <DetailRow label="Phone">
                <div className="flex items-center gap-1.5 justify-end">
                  <Editable
                    key={`phone-${ek}`}
                    defaultValue={customerData.phone || ''}
                    placeholder="-"
                    onSubmit={val => handleFieldSubmit('phone', val)}
                  >
                    <EditableArea>
                      <EditablePreview className="text-[13px] font-medium text-foreground py-0 tabular-nums" />
                      <EditableInput className="text-[13px] font-medium px-1 text-right" type="tel" />
                    </EditableArea>
                  </Editable>
                  {customerData.phone && (
                    <Tooltip>
                      <TooltipTrigger
                        aria-label="Call"
                        className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors"
                        onPress={() => window.open(`tel:${customerData.phone}`)}
                      >
                        <Phone size={11} />
                      </TooltipTrigger>
                      <TooltipContent>Call</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </DetailRow>

              <DetailRow label="Mobile">
                <div className="flex items-center gap-1.5 justify-end">
                  <Editable
                    key={`mobile-${ek}`}
                    defaultValue={customerData.mobile || ''}
                    placeholder="-"
                    onSubmit={val => handleFieldSubmit('mobile', val)}
                  >
                    <EditableArea>
                      <EditablePreview className="text-[13px] font-medium text-foreground py-0 tabular-nums" />
                      <EditableInput className="text-[13px] font-medium px-1 text-right" type="tel" />
                    </EditableArea>
                  </Editable>
                  {customerData.mobile && (
                    <Tooltip>
                      <TooltipTrigger
                        aria-label="Call mobile"
                        className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors"
                        onPress={() => window.open(`tel:${customerData.mobile}`)}
                      >
                        <Phone size={11} />
                      </TooltipTrigger>
                      <TooltipContent>Call mobile</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </DetailRow>

              <DetailRow label="Website">
                <Editable
                  key={`website-${ek}`}
                  defaultValue={customerData.website || ''}
                  placeholder="-"
                  onSubmit={val => handleFieldSubmit('website', val)}
                >
                  <EditableArea>
                    <EditablePreview className="text-[13px] font-medium text-foreground py-0" />
                    <EditableInput className="text-[13px] font-medium px-1 text-right" />
                  </EditableArea>
                </Editable>
              </DetailRow>

              <DetailRow label="Payment Terms">
                <Editable
                  key={`payment_terms-${ek}`}
                  defaultValue={customerData.payment_terms || ''}
                  placeholder="-"
                  onSubmit={val => handleFieldSubmit('payment_terms', val)}
                >
                  <EditableArea>
                    <EditablePreview className="text-[13px] font-medium text-foreground py-0" />
                    <EditableInput className="text-[13px] font-medium px-1 text-right" />
                  </EditableArea>
                </Editable>
              </DetailRow>
            </motion.div>

            {/* Financial card — read-only */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-card rounded-xl border border-border/60 p-5"
            >
              <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-4">Financial</h3>
              <DetailRow label="Total Spent">
                <span className="text-[13px] font-semibold text-primary tabular-nums">{formatCurrency(customerData.total_spent)}</span>
              </DetailRow>
              <DetailRow label="Outstanding">
                <span className="text-[13px] font-medium text-foreground tabular-nums">{formatCurrency(outstandingAmount)}</span>
              </DetailRow>
              <DetailRow label="Unused Credits">
                <span className="text-[13px] font-medium text-foreground tabular-nums">{formatCurrency(customerData.unused_credits)}</span>
              </DetailRow>
              <DetailRow label="Currency">
                <span className="text-[13px] font-medium text-foreground">{customerData.currency_code}</span>
              </DetailRow>
              <DetailRow label="Last Order">
                <span className="text-[13px] font-medium text-foreground">{formatDate(lastOrderDate)}</span>
              </DetailRow>
            </motion.div>
          </div>

          {/* Separator */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
          >
            <Separator className="my-8" />
          </motion.div>

          {/* Orders */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-card rounded-xl border border-border/60 p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                Orders ({orders.length})
              </h3>
              {orders.length > 0 && (
                <Button
                  intent="plain"
                  size="xs"
                  onPress={() => navigate('/orders', { state: { customerId: customerData.id, customerName: customerData.company_name } })}
                  className="text-primary/70 hover:text-primary"
                >
                  View all <ExternalLink size={10} />
                </Button>
              )}
            </div>

            {ordersLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground mb-3">No orders found</p>
                <Button
                  intent="plain"
                  size="sm"
                  onPress={() => navigate('/orders/new', { state: { fromCustomerDetail: true, customer: { id: customerData.id, display_name: customerData.company_name } } })}
                  className="text-primary hover:underline"
                >
                  Create first order
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader className="bg-secondary/50">
                    <TableRow className="border-b border-border/60 hover:bg-secondary/50">
                      <TableHead>Order</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-[40px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.slice(0, 15).map(order => (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer border-b border-border/30 hover:bg-primary/[0.03] transition-colors"
                        onClick={() => navigate(`/order/${order.id}`)}
                      >
                        <TableCell className="font-medium text-foreground">
                          <span className="text-[13px]">#{order.salesorder_number || order.id}</span>
                          {order.reference_number && (
                            <span className="ml-2 text-[11px] text-muted-foreground">{order.reference_number}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-[12px] text-muted-foreground tabular-nums">
                          {formatDate(order.date)}
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            'inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium capitalize border',
                            orderStatusColor(order.status)
                          )}>
                            {order.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-[13px] font-semibold text-foreground tabular-nums">
                            {formatCurrency(order.total)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <ExternalLink size={12} className="text-muted-foreground inline-block" />
                        </TableCell>
                      </TableRow>
                    ))}
                    {orders.length > 15 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-2">
                          <Button
                            intent="plain"
                            size="xs"
                            onPress={() => navigate('/orders', { state: { customerId: customerData.id, customerName: customerData.company_name } })}
                            className="text-primary/70 hover:text-primary"
                          >
                            View all {orders.length} orders
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </motion.div>
        </div>

        {/* ── Right column ── */}
        <div className="flex flex-col gap-6">
          {/* Contact Persons — read-only */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card rounded-xl border border-border/60 p-5"
          >
            <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-4">
              Contacts ({contactPersons.length})
            </h3>
            {contactPersons.length > 0 ? (
              <div className="space-y-3">
                {contactPersons.map((contact, i) => (
                  <div key={contact.contact_person_id || i} className="py-3 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[13px] font-medium text-foreground">
                        {`${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unnamed'}
                      </span>
                      {contact.is_primary_contact && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-primary/8 text-primary border border-primary/15">
                          Primary
                        </span>
                      )}
                    </div>
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-primary transition-colors mb-0.5">
                        <Mail size={11} /> {contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <Phone size={11} /> {contact.phone}
                      </div>
                    )}
                    {contact.mobile && (
                      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <Phone size={11} /> {contact.mobile}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">No contacts</p>
            )}
          </motion.div>

          {/* Addresses — inline editable */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-card rounded-xl border border-border/60 p-5"
          >
            <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-4">Addresses</h3>

            <div className="space-y-5">
              {/* Billing */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <MapPin size={11} className="text-muted-foreground" />
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Billing</span>
                </div>
                <div className="space-y-1 pl-[17px]">
                  {ADDRESS_FIELDS.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground/60">{label}</span>
                      <Editable
                        key={`billing_${key}-${ek}`}
                        defaultValue={(customerData.billing_address as Address)?.[key] ?? ''}
                        placeholder="-"
                        onSubmit={val => handleAddressFieldSubmit('billing_address', key, val)}
                      >
                        <EditableArea>
                          <EditablePreview className="text-[13px] text-foreground py-0" />
                          <EditableInput className="text-[13px] px-1 text-right" />
                        </EditableArea>
                      </Editable>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Shipping */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <MapPin size={11} className="text-muted-foreground" />
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Shipping</span>
                </div>
                <div className="space-y-1 pl-[17px]">
                  {ADDRESS_FIELDS.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground/60">{label}</span>
                      <Editable
                        key={`shipping_${key}-${ek}`}
                        defaultValue={(customerData.shipping_address as Address)?.[key] ?? ''}
                        placeholder="-"
                        onSubmit={val => handleAddressFieldSubmit('shipping_address', key, val)}
                      >
                        <EditableArea>
                          <EditablePreview className="text-[13px] text-foreground py-0" />
                          <EditableInput className="text-[13px] px-1 text-right" />
                        </EditableArea>
                      </Editable>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Integration — read-only */}
          {customerData.zoho_contact_id && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-card rounded-xl border border-border/60 p-5"
            >
              <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-4">Integration</h3>
              <DetailRow label="Zoho ID">
                <span className="text-[13px] font-medium text-foreground font-mono">{customerData.zoho_contact_id}</span>
              </DetailRow>
              <DetailRow label="Sync Status">
                <span className={cn(
                  'text-[10px] px-2 py-0.5 rounded-md border font-medium',
                  customerData.sync_status === 'synced'
                    ? 'bg-emerald-500/8 text-emerald-400 border-emerald-500/15'
                    : customerData.sync_status === 'pending_push'
                      ? 'bg-amber-500/8 text-amber-400 border-amber-500/15'
                      : 'bg-red-500/8 text-red-400 border-red-500/15'
                )}>
                  {customerData.sync_status === 'synced' ? 'Synced' : customerData.sync_status === 'pending_push' ? 'Pending' : customerData.sync_status}
                </span>
              </DetailRow>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
