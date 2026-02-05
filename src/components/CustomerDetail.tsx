import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Mail, Phone, MapPin, ExternalLink, Pencil, Save, X, Loader2, ShoppingCart
} from 'lucide-react';
import { customerService } from '../services/customerService';
import { orderService } from '../services/orderService';
import { useLoader } from '../contexts/LoaderContext';
import type { Customer, Address, Order } from '../types/domain';
import { cn } from '@/lib/utils';

const ADDRESS_FIELDS: { key: keyof Address; label: string }[] = [
  { key: 'address', label: 'Address' },
  { key: 'street2', label: 'Address 2' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'Postcode' },
  { key: 'country', label: 'Country' },
];

export default function CustomerDetail() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { showLoader, hideLoader } = useLoader();
  const [customerData, setCustomerData] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Customer>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (customerId) fetchCustomerData();
  }, [customerId]);

  // Fetch orders AFTER customer loads, using zoho_contact_id
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

  // -- Edit helpers --
  const initEditData = () => {
    if (!customerData) return;
    setEditData({
      company_name: customerData.company_name,
      contact_name: customerData.contact_name,
      email: customerData.email,
      phone: customerData.phone,
      mobile: customerData.mobile,
      website: customerData.website,
      payment_terms: customerData.payment_terms,
      billing_address: customerData.billing_address ? { ...customerData.billing_address } : null,
      shipping_address: customerData.shipping_address ? { ...customerData.shipping_address } : null,
    });
  };

  const handleFieldChange = (field: keyof Customer, value: string) => {
    setEditData(prev => ({ ...prev, [field]: value || null }));
  };

  const handleAddressChange = (type: 'billing_address' | 'shipping_address', field: keyof Address, value: string) => {
    setEditData(prev => ({
      ...prev,
      [type]: { ...(prev[type] as Address || {}), [field]: value || undefined },
    }));
  };

  const handleSave = async () => {
    if (!customerData) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await customerService.update(customerData.id, editData);
      setCustomerData(updated);
      setIsEditing(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save changes';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditData({});
    setSaveError(null);
  };

  const startEditing = () => {
    initEditData();
    setSaveError(null);
    setIsEditing(true);
  };

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
      case 'confirmed': case 'invoiced': return 'text-brand-300 bg-brand-300/10';
      case 'draft': return 'text-gray-400 bg-gray-400/10';
      case 'void': case 'cancelled': return 'text-red-400 bg-red-400/10';
      case 'closed': return 'text-gray-500 bg-gray-500/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  // Loading is handled by ProgressLoader via useLoader
  if (loading) {
    return null;
  }

  if (!customerData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-gray-400">Customer not found</p>
        <button onClick={() => navigate('/customers')} className="text-sm text-brand-300 hover:underline">
          Back to Customers
        </button>
      </div>
    );
  }

  const contactPersons = customerData.contact_persons || [];
  const primaryContact = contactPersons.find(c => c.is_primary_contact);
  const outstandingAmount = customerData.outstanding_receivable || 0;
  const lastOrderDate = orders.length > 0 ? orders[0]?.date : undefined;

  // -- Shared input classes --
  const inputCls = 'w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1.5 text-[13px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-300/40 transition-colors';

  // Inline helper for key-value rows (view & edit modes)
  const InfoRow = ({
    label,
    value,
    accent,
    editKey,
  }: {
    label: string;
    value: string | number;
    accent?: boolean;
    editKey?: keyof Customer;
  }) => {
    if (isEditing && editKey) {
      return (
        <div className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.04] last:border-0">
          <span className="text-[13px] text-gray-500 shrink-0">{label}</span>
          <input
            type="text"
            value={(editData[editKey] as string) ?? ''}
            onChange={e => handleFieldChange(editKey, e.target.value)}
            className={cn(inputCls, 'text-right max-w-[200px]')}
            placeholder={label}
          />
        </div>
      );
    }
    return (
      <div className="flex items-baseline justify-between py-2.5 border-b border-white/[0.04] last:border-0">
        <span className="text-[13px] text-gray-500">{label}</span>
        <span className={cn('text-[13px] font-medium tabular-nums', accent ? 'text-brand-300' : 'text-gray-200')}>
          {value}
        </span>
      </div>
    );
  };

  // Address editor sub-component
  const AddressEditor = ({
    type,
    label,
  }: {
    type: 'billing_address' | 'shipping_address';
    label: string;
  }) => {
    const addr = (editData[type] as Address) || {};
    return (
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <MapPin size={11} className="text-gray-600" />
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{label}</span>
        </div>
        <div className="space-y-2 pl-[17px]">
          {ADDRESS_FIELDS.map(({ key, label: fieldLabel }) => (
            <input
              key={key}
              type="text"
              value={addr[key] ?? ''}
              onChange={e => handleAddressChange(type, key, e.target.value)}
              className={inputCls}
              placeholder={fieldLabel}
            />
          ))}
        </div>
      </div>
    );
  };

  const formatAddress = (addr: Customer['billing_address']) => {
    if (!addr) return null;
    const parts = [addr.address, addr.street2, addr.city, addr.state, addr.zip, addr.country].filter(Boolean);
    return parts.length > 0 ? parts : null;
  };

  const billingParts = formatAddress(customerData.billing_address);
  const shippingParts = formatAddress(customerData.shipping_address);

  return (
    <div className="w-full px-6 py-2">
      {/* Back link */}
      <button
        onClick={() => navigate('/customers')}
        className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-300 transition-colors mb-5"
      >
        <ArrowLeft size={14} />
        Customers
      </button>

      {/* Identity + metrics strip */}
      <div className="flex items-center gap-6 pb-7 mb-8 border-b border-white/[0.06]">
        {/* Customer identity */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-300 to-[#4daeac] flex items-center justify-center text-white font-semibold text-[14px] shrink-0">
            {customerData.company_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-[17px] font-semibold text-white leading-tight">{customerData.company_name}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider',
                customerData.status === 'active'
                  ? 'bg-emerald-400/10 text-emerald-400'
                  : 'bg-gray-500/10 text-gray-500'
              )}>
                {customerData.status}
              </span>
              {customerData.location_region && (
                <span className="text-[11px] text-gray-500">{customerData.location_region}</span>
              )}
              {customerData.brand_preferences && customerData.brand_preferences.length > 0 && (
                <>
                  <span className="text-gray-700">·</span>
                  {customerData.brand_preferences.map((brand, i) => {
                    const label = typeof brand === 'string' ? brand : (brand as any)?.brand || String(brand);
                    return (
                      <span
                        key={i}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-brand-300/10 text-brand-300 border border-brand-300/20"
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

        <div className="w-px h-10 bg-white/[0.06]" />

        {/* Metrics */}
        <div className="flex items-center gap-6 flex-1 min-w-0">
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Spent</div>
            <div className="text-lg font-semibold text-white tabular-nums">{formatCurrency(customerData.total_spent)}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Outstanding</div>
            <div className={cn('text-lg font-semibold tabular-nums', outstandingAmount > 0 ? 'text-amber-400' : 'text-gray-600')}>
              {outstandingAmount > 0 ? formatCurrency(outstandingAmount) : '\u00A30'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Terms</div>
            <div className="text-lg font-semibold text-white">{customerData.payment_terms_label || customerData.payment_terms || '-'}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Orders</div>
            <div className="text-lg font-semibold text-white tabular-nums">{orders.length}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Avg Order</div>
            <div className="text-lg font-semibold text-white tabular-nums">{formatCurrency(customerData.average_order_value)}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Since</div>
            <div className="text-sm font-medium text-gray-300">{formatDate(customerData.created_at)}</div>
          </div>
          {customerData.segment && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Segment</div>
              <div className="text-sm font-medium text-brand-300">{customerData.segment}</div>
            </div>
          )}
        </div>

        {/* Edit / Save / Cancel */}
        <div className="shrink-0 flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-gray-400 hover:text-gray-200 bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.06] transition-colors"
              >
                <X size={13} /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-white bg-brand-300 hover:bg-brand-300/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate('/orders/new', { state: { fromCustomerDetail: true, customer: { id: customerData.id, display_name: customerData.company_name } } })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-brand-300/80 hover:text-brand-300 bg-brand-300/5 hover:bg-brand-300/10 border border-brand-300/20 transition-colors"
              >
                <ShoppingCart size={12} /> New Order
              </button>
              <button
                onClick={startEditing}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[12px] font-medium text-white bg-brand-300 hover:bg-brand-300/90 transition-colors"
              >
                <Pencil size={12} /> Edit Customer
              </button>
            </>
          )}
        </div>
      </div>

      {/* Save error banner */}
      {saveError && (
        <div className="mb-6 px-4 py-2.5 rounded-md bg-red-400/10 border border-red-400/20 text-[13px] text-red-400">
          {saveError}
        </div>
      )}

      {/* Main two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-10">
        {/* Left column — Contact info + Orders */}
        <div>
          {/* Contact & Company */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Company details */}
            <div className="bg-white/[0.02] rounded-xl border border-white/[0.06] p-5">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-4">Company</h3>
              <InfoRow label="Company Name" value={customerData.company_name} editKey="company_name" />
              <InfoRow label="Contact Name" value={customerData.contact_name || '-'} editKey="contact_name" />
              {isEditing ? (
                <InfoRow label="Email" value={customerData.email || primaryContact?.email || '-'} editKey="email" />
              ) : (
                <div className="flex items-baseline justify-between py-2.5 border-b border-white/[0.04]">
                  <span className="text-[13px] text-gray-500">Email</span>
                  {(customerData.email || primaryContact?.email) ? (
                    <a href={`mailto:${customerData.email || primaryContact?.email}`} className="text-[13px] font-medium text-gray-200 hover:text-brand-300 transition-colors">
                      {customerData.email || primaryContact?.email}
                    </a>
                  ) : (
                    <span className="text-[13px] font-medium text-gray-200">-</span>
                  )}
                </div>
              )}
              {isEditing ? (
                <InfoRow label="Phone" value={customerData.phone || '-'} editKey="phone" />
              ) : (
                <div className="flex items-baseline justify-between py-2.5 border-b border-white/[0.04]">
                  <span className="text-[13px] text-gray-500">Phone</span>
                  {customerData.phone ? (
                    <a href={`tel:${customerData.phone}`} className="text-[13px] font-medium text-gray-200 hover:text-brand-300 transition-colors tabular-nums">
                      {customerData.phone}
                    </a>
                  ) : (
                    <span className="text-[13px] font-medium text-gray-200">-</span>
                  )}
                </div>
              )}
              {isEditing ? (
                <InfoRow label="Mobile" value={customerData.mobile || '-'} editKey="mobile" />
              ) : (
                <div className="flex items-baseline justify-between py-2.5 border-b border-white/[0.04]">
                  <span className="text-[13px] text-gray-500">Mobile</span>
                  {customerData.mobile ? (
                    <a href={`tel:${customerData.mobile}`} className="text-[13px] font-medium text-gray-200 hover:text-brand-300 transition-colors tabular-nums">
                      {customerData.mobile}
                    </a>
                  ) : (
                    <span className="text-[13px] font-medium text-gray-200">-</span>
                  )}
                </div>
              )}
              <InfoRow label="Website" value={customerData.website || '-'} editKey="website" />
            </div>

            {/* Financial — always read-only */}
            <div className="bg-white/[0.02] rounded-xl border border-white/[0.06] p-5">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-4">Financial</h3>
              <InfoRow label="Total Spent" value={formatCurrency(customerData.total_spent)} accent />
              <InfoRow label="Outstanding" value={formatCurrency(outstandingAmount)} />
              <InfoRow label="Unused Credits" value={formatCurrency(customerData.unused_credits)} />
              <InfoRow label="Currency" value={customerData.currency_code} />
              <InfoRow label="Last Order" value={formatDate(lastOrderDate)} />
            </div>
          </div>

          {/* Payment terms (editable) */}
          {isEditing && (
            <div className="mt-6">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-4">Payment Terms</h3>
              <InfoRow label="Payment Terms" value={customerData.payment_terms || '-'} editKey="payment_terms" />
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-white/[0.05] my-8" />

          {/* Orders */}
          <div className="bg-white/[0.02] rounded-xl border border-white/[0.06] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                Orders ({orders.length})
              </h3>
              {orders.length > 0 && (
                <button
                  onClick={() => navigate('/orders', { state: { customerId: customerData.id, customerName: customerData.company_name } })}
                  className="flex items-center gap-1 text-[11px] text-brand-300/70 hover:text-brand-300 transition-colors"
                >
                  View all <ExternalLink size={10} />
                </button>
              )}
            </div>

            {ordersLoading ? (
              <div className="py-8 text-center text-sm text-gray-500">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-500 mb-3">No orders found</p>
                <button
                  onClick={() => navigate('/orders/new', { state: { fromCustomerDetail: true, customer: { id: customerData.id, display_name: customerData.company_name } } })}
                  className="text-[13px] text-brand-300 hover:underline"
                >
                  Create first order
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                {/* Orders header */}
                <div className="grid grid-cols-[1fr_90px_80px_80px_60px] gap-3 px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-white/[0.02]">
                  <div>Order</div>
                  <div>Date</div>
                  <div>Status</div>
                  <div className="text-right">Total</div>
                  <div />
                </div>
                {orders.slice(0, 15).map(order => (
                  <div
                    key={order.id}
                    className="grid grid-cols-[1fr_90px_80px_80px_60px] gap-3 px-4 py-2.5 border-t border-white/[0.04] hover:bg-white/[0.015] transition-colors cursor-pointer items-center"
                    onClick={() => navigate(`/order/${order.id}`)}
                  >
                    <div className="text-[13px] text-gray-200 font-medium truncate">
                      #{order.salesorder_number || order.id}
                      {order.reference_number && (
                        <span className="ml-2 text-[11px] text-gray-600">{order.reference_number}</span>
                      )}
                    </div>
                    <div className="text-[12px] text-gray-500 tabular-nums">{formatDate(order.date)}</div>
                    <div>
                      <span className={cn('inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium capitalize', orderStatusColor(order.status))}>
                        {order.status}
                      </span>
                    </div>
                    <div className="text-[13px] font-medium text-gray-200 text-right tabular-nums">
                      {formatCurrency(order.total)}
                    </div>
                    <div className="text-right">
                      <ExternalLink size={12} className="text-gray-600 inline-block" />
                    </div>
                  </div>
                ))}
                {orders.length > 15 && (
                  <div className="px-4 py-2 border-t border-white/[0.04] text-center">
                    <button
                      onClick={() => navigate('/orders', { state: { customerId: customerData.id, customerName: customerData.company_name } })}
                      className="text-[12px] text-brand-300/70 hover:text-brand-300 transition-colors"
                    >
                      View all {orders.length} orders
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column — Contacts + Addresses */}
        <div className="flex flex-col gap-6">
          {/* Contact Persons — always read-only */}
          <div className="bg-white/[0.02] rounded-xl border border-white/[0.06] p-5">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Contacts ({contactPersons.length})
            </h3>
            {contactPersons.length > 0 ? (
              <div className="space-y-3">
                {contactPersons.map((contact, i) => (
                  <div key={contact.contact_person_id || i} className="py-3 border-b border-white/[0.04] last:border-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[13px] font-medium text-gray-200">
                        {`${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unnamed'}
                      </span>
                      {contact.is_primary_contact && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-brand-300/10 text-brand-300">
                          Primary
                        </span>
                      )}
                    </div>
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-brand-300 transition-colors mb-0.5">
                        <Mail size={11} /> {contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
                        <Phone size={11} /> {contact.phone}
                      </div>
                    )}
                    {contact.mobile && (
                      <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
                        <Phone size={11} /> {contact.mobile}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-gray-600">No contacts</p>
            )}
          </div>

          {/* Addresses */}
          <div className="bg-white/[0.02] rounded-xl border border-white/[0.06] p-5">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-4">Addresses</h3>

            {isEditing ? (
              <div className="space-y-6">
                <AddressEditor type="billing_address" label="Billing" />
                <AddressEditor type="shipping_address" label="Shipping" />
              </div>
            ) : (
              <div className="space-y-5">
                {/* Billing */}
                {billingParts && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <MapPin size={11} className="text-gray-600" />
                      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Billing</span>
                    </div>
                    <div className="text-[13px] text-gray-300 leading-relaxed pl-[17px]">
                      {billingParts.map((part, i) => <div key={i}>{part}</div>)}
                    </div>
                  </div>
                )}
                {/* Shipping */}
                {shippingParts && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <MapPin size={11} className="text-gray-600" />
                      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Shipping</span>
                    </div>
                    <div className="text-[13px] text-gray-300 leading-relaxed pl-[17px]">
                      {shippingParts.map((part, i) => <div key={i}>{part}</div>)}
                    </div>
                  </div>
                )}
                {!billingParts && !shippingParts && (
                  <p className="text-[13px] text-gray-600">No addresses on file</p>
                )}
              </div>
            )}
          </div>

          {/* Sync info — always read-only */}
          {customerData.zoho_contact_id && (
            <div className="bg-white/[0.02] rounded-xl border border-white/[0.06] p-5">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-4">Integration</h3>
              <InfoRow label="Zoho ID" value={customerData.zoho_contact_id} />
              <InfoRow label="Sync Status" value={customerData.sync_status} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
