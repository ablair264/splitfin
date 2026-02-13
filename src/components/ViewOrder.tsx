import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { orderService } from '../services/orderService';
import { customerService } from '../services/customerService';
import { invoiceService } from '../services/invoiceService';
import { productService } from '../services/productService';
import { shippingService } from '../services/shippingService';
import { useLoader } from '../contexts/LoaderContext';
import type { Order, OrderLineItem, Customer, Invoice } from '../types/domain';
import {
  FileText,
  File,
  Settings,
  Mail,
  CheckCircle,
  Package,
  Warehouse,
  ClipboardList,
  Calendar,
  Home,
  Clock,
  HelpCircle,
  MapPin,
  Truck,
  X,
  Save,
  AlertTriangle,
  Plus,
  Minus,
  Search,
  Copy,
  Phone,
  CreditCard,
  ExternalLink,
  Hash,
  UserCheck,
  CalendarCheck,
  ChevronRight
} from 'lucide-react';

declare global {
  interface Window {
    google: any;
  }
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyCtvRdpXyzAg2YTTf398JHSxGA1dmD4Doc';

type TabFilter = 'all' | 'shipped' | 'partial' | 'awaiting';

const orderStatusSteps = [
  { key: 'confirmed', label: 'Order Confirmed', icon: ClipboardList },
  { key: 'processing', label: 'Sent to Warehouse', icon: Warehouse },
  { key: 'packed', label: 'Packed', icon: Package },
  { key: 'shipped', label: 'Shipped', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle }
];

interface DisplayLineItem extends OrderLineItem {
  brand_name?: string;
  quantity_shipped?: number;
  quantity_packed?: number;
  quantity_delivered?: number;
  quantity_invoiced?: number;
  quantity_cancelled?: number;
  quantity_returned?: number;
  zoho_item_id: string;
}

function ViewOrder() {
  usePageTitle('Order');
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { showLoader, hideLoader } = useLoader();

  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [courierInfo, setCourierInfo] = useState<any>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [sendingToZoho, setSendingToZoho] = useState(false);
  const [zohoSendStatus, setZohoSendStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [zohoSendMessage, setZohoSendMessage] = useState('');

  const [showEditModal, setShowEditModal] = useState(false);
  const [editOrderData, setEditOrderData] = useState<any>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancellingOrder, setCancellingOrder] = useState(false);

  const [availableItems, setAvailableItems] = useState<any[]>([]);
  const [itemSearchTerm, setItemSearchTerm] = useState('');
  const [showItemSearch, setShowItemSearch] = useState(false);

  const [sendingToPacking, setSendingToPacking] = useState(false);
  const [shippingStatus, setShippingStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [shippingMessage, setShippingMessage] = useState('');

  const [activePackageTab, setActivePackageTab] = useState(0);

  const fetchOrderDetails = useCallback(async () => {
    if (!orderId) return;

    setLoading(true);
    showLoader('Loading Order...');
    try {
      const orderData = await orderService.getById(Number(orderId));
      if (!orderData) throw new Error('Order not found');

      setOrder(orderData);

      if (orderData.zoho_customer_id) {
        try {
          const customerData = await customerService.getById(orderData.zoho_customer_id);
          setCustomer(customerData);

          if (customerData.latitude && customerData.longitude) {
            setMapCenter({ lat: customerData.latitude, lng: customerData.longitude });
          } else {
            const postcode = customerData.shipping_address?.zip || customerData.billing_address?.zip;
            if (postcode) {
              geocodePostcode(postcode);
            } else {
              setMapCenter({ lat: 51.5074, lng: -0.1278 });
            }
          }
        } catch {
          setMapCenter({ lat: 51.5074, lng: -0.1278 });
        }
      } else {
        setMapCenter({ lat: 51.5074, lng: -0.1278 });
      }

      try {
        const invoiceResult = await invoiceService.list({ customer_id: orderData.zoho_customer_id } as any);
        if (invoiceResult?.data) {
          const orderInvoices = invoiceResult.data.filter(
            (inv: Invoice) => inv.zoho_salesorder_id === orderData.zoho_salesorder_id
          );
          setInvoices(orderInvoices.length > 0 ? orderInvoices : []);
        }
      } catch {
        // invoices fetch failed silently
      }

      if (orderData.packages_json && Array.isArray(orderData.packages_json) && orderData.packages_json.length > 0) {
        const firstPackage = orderData.packages_json[0] as any;
        if (firstPackage) {
          setCourierInfo({
            courier_name: firstPackage.delivery_method || firstPackage.carrier || null,
            courier_logo_url: null
          });
        }
      }
    } catch (err) {
      console.error('Error fetching order details:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch order details');
    } finally {
      setLoading(false);
      hideLoader();
    }
  }, [orderId]);

  const geocodePostcode = async (postcode: string) => {
    if (!postcode) return;
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(postcode)},UK&key=${GOOGLE_MAPS_API_KEY}`
      );
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (data.status === 'OK' && data.results?.length > 0) {
        const location = data.results[0].geometry.location;
        setMapCenter({ lat: location.lat, lng: location.lng });
      } else {
        setMapCenter({ lat: 51.5074, lng: -0.1278 });
      }
    } catch {
      setMapCenter({ lat: 51.5074, lng: -0.1278 });
    }
  };

  const getCourierLogo = (carrier: string): string => {
    const carrierLower = carrier?.toLowerCase() || '';
    if (carrierLower.includes('ups')) return '/logos/ups.png';
    if (carrierLower.includes('royal mail')) return '/logos/royalmail.png';
    if (carrierLower.includes('dpd')) return '/logos/dpd.png';
    if (carrierLower.includes('dhl')) return '/logos/dhl.png';
    if (carrierLower.includes('fedex')) return '/logos/fedex.png';
    if (carrierLower.includes('tnt')) return '/logos/tnt.png';
    return '/logos/courier.png';
  };

  useEffect(() => {
    fetchOrderDetails();
  }, [fetchOrderDetails]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return 'Invalid Date';
    }
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Invalid Date';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'draft':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'pending':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'confirmed':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'processing':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'shipped':
      case 'partially_shipped':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'invoiced':
      case 'partially_invoiced':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'delivered':
      case 'fulfilled':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'paid':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'cancelled':
      case 'void':
        return 'bg-destructive/20 text-destructive border-destructive/30';
      case 'overdue':
        return 'bg-destructive/20 text-destructive border-destructive/30';
      case 'partially_paid':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      default:
        return 'bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30';
    }
  };

  const getOrderProgress = () => {
    const status = order?.status?.toLowerCase();
    // Map order statuses to stepper steps
    if (status === 'delivered') return 4;
    if (status === 'shipped') return 3;
    // Check packages for packed state
    if (order?.packages_json && Array.isArray(order.packages_json) && order.packages_json.length > 0) {
      if (status === 'processing' || status === 'confirmed') return 2;
    }
    if (status === 'processing') return 1;
    if (status === 'confirmed' || status === 'pending' || status === 'open') return 0;
    return 0;
  };

  const getFilteredLineItems = (): DisplayLineItem[] => {
    if (!order?.line_items) return [];
    const items = order.line_items as DisplayLineItem[];
    switch (activeTab) {
      case 'shipped':
        return items.filter(item => (item.quantity_shipped || 0) >= item.quantity);
      case 'partial':
        return items.filter(item => {
          const shipped = item.quantity_shipped || 0;
          return shipped > 0 && shipped < item.quantity;
        });
      case 'awaiting':
        return items.filter(item => (item.quantity_shipped || 0) === 0);
      default:
        return items;
    }
  };

  const getTotalsByTab = () => {
    if (!order?.line_items) return { all: 0, shipped: 0, partial: 0, awaiting: 0 };
    const items = order.line_items as DisplayLineItem[];
    return {
      all: items.length,
      shipped: items.filter(item => (item.quantity_shipped || 0) >= item.quantity).length,
      partial: items.filter(item => {
        const shipped = item.quantity_shipped || 0;
        return shipped > 0 && shipped < item.quantity;
      }).length,
      awaiting: items.filter(item => (item.quantity_shipped || 0) === 0).length
    };
  };

  const handlePrintOrder = () => { window.print(); };

  const [creatingInvoice, setCreatingInvoice] = useState(false);

  const handleCreateInvoice = async () => {
    if (!order?.zoho_salesorder_id) return;

    const confirmed = window.confirm(
      `Generate invoice for order ${order.salesorder_number || orderId}?\n\nThis will create an invoice in Zoho Inventory.`
    );
    if (!confirmed) return;

    setCreatingInvoice(true);
    try {
      const agentId = order.agent_id || '';
      const newInvoice = await invoiceService.createFromOrder(order.zoho_salesorder_id, agentId);
      setInvoices((prev) => [...prev, newInvoice]);
      navigate(`/finance/invoices/${newInvoice.id}`);
    } catch (err: any) {
      const msg = err?.message || 'Failed to create invoice';
      alert(`Invoice creation failed: ${msg}`);
      console.error('Invoice creation error:', err);
    } finally {
      setCreatingInvoice(false);
    }
  };

  const handleEditOrder = () => {
    if (order && customer) {
      setEditOrderData({
        notes: order.notes || '',
        order_status: order.status,
        order_date: order.date ? order.date.split('T')[0] : new Date().toISOString().split('T')[0],
        shipping_status: order.shipment_status || 'pending',
        billing_address: {
          address_1: customer.billing_address?.address || '',
          address_2: customer.billing_address?.street2 || '',
          city_town: customer.billing_address?.city || '',
          county: customer.billing_address?.state || '',
          postcode: customer.billing_address?.zip || ''
        },
        shipping_address: {
          address_1: customer.shipping_address?.address || customer.billing_address?.address || '',
          address_2: customer.shipping_address?.street2 || customer.billing_address?.street2 || '',
          city_town: customer.shipping_address?.city || customer.billing_address?.city || '',
          county: customer.shipping_address?.state || customer.billing_address?.state || '',
          postcode: customer.shipping_address?.zip || customer.billing_address?.zip || ''
        },
        make_default_addresses: false,
        line_items: order.line_items?.map(item => ({
          id: item.id,
          item_id: item.zoho_item_id,
          item_name: item.name,
          quantity: item.quantity,
          unit_price: item.rate,
          total_price: item.amount
        })) || [],
        new_items: []
      });
      setShowEditModal(true);
    }
  };

  const handleBackToOrders = () => { navigate('/orders'); };

  const searchItems = async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) { setAvailableItems([]); return; }
    try {
      const result = await productService.list({ search: searchTerm, limit: 20 });
      setAvailableItems(result.data || []);
    } catch {
      setAvailableItems([]);
    }
  };

  const addItemToOrder = (item: any) => {
    const newItem = {
      id: `new-${Date.now()}`,
      item_id: item.zoho_item_id || item.id,
      item_name: item.name,
      quantity: 1,
      unit_price: parseFloat(item.rate || 0),
      total_price: parseFloat(item.rate || 0),
      is_new: true
    };
    setEditOrderData({ ...editOrderData, line_items: [...editOrderData.line_items, newItem] });
    setItemSearchTerm('');
    setAvailableItems([]);
    setShowItemSearch(false);
  };

  const removeItemFromOrder = (itemIndex: number) => {
    const newItems = editOrderData.line_items.filter((_: any, index: number) => index !== itemIndex);
    setEditOrderData({ ...editOrderData, line_items: newItems });
  };

  const handleSaveOrderEdit = async () => {
    if (!editOrderData || !order || !customer) return;
    setSavingOrder(true);
    try {
      await orderService.update(order.id, {
        notes: editOrderData.notes,
        status: editOrderData.order_status,
        date: editOrderData.order_date
      });

      if (editOrderData.make_default_addresses) {
        await customerService.update(customer.id, {
          billing_address: {
            address: editOrderData.billing_address.address_1,
            street2: editOrderData.billing_address.address_2,
            city: editOrderData.billing_address.city_town,
            state: editOrderData.billing_address.county,
            zip: editOrderData.billing_address.postcode
          },
          shipping_address: {
            address: editOrderData.shipping_address.address_1,
            street2: editOrderData.shipping_address.address_2,
            city: editOrderData.shipping_address.city_town,
            state: editOrderData.shipping_address.county,
            zip: editOrderData.shipping_address.postcode
          }
        });
      }

      await sendOrderUpdateToWebhook('update', {
        ...editOrderData,
        addresses_updated: editOrderData.make_default_addresses,
        items_added: editOrderData.line_items.filter((item: any) => item.is_new).length,
        items_removed: 0
      });

      await fetchOrderDetails();
      setShowEditModal(false);
      setZohoSendStatus('success');
      setZohoSendMessage('Order updated successfully!');
      setTimeout(() => { setZohoSendStatus('idle'); setZohoSendMessage(''); }, 5000);
    } catch (error) {
      console.error('Error updating order:', error);
      setZohoSendStatus('error');
      setZohoSendMessage(error instanceof Error ? error.message : 'Failed to update order');
      setTimeout(() => { setZohoSendStatus('idle'); setZohoSendMessage(''); }, 5000);
    } finally {
      setSavingOrder(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    setCancellingOrder(true);
    try {
      await orderService.update(order.id, {
        status: 'cancelled',
        notes: order.notes ? `${order.notes}\n\nCANCELLED: ${cancelReason}` : `CANCELLED: ${cancelReason}`
      });
      await sendOrderUpdateToWebhook('cancel', { reason: cancelReason, cancelled_at: new Date().toISOString() });
      await fetchOrderDetails();
      setShowCancelModal(false);
      setCancelReason('');
      setZohoSendStatus('success');
      setZohoSendMessage('Order cancelled successfully!');
      setTimeout(() => { setZohoSendStatus('idle'); setZohoSendMessage(''); }, 5000);
    } catch (error) {
      console.error('Error cancelling order:', error);
      setZohoSendStatus('error');
      setZohoSendMessage(error instanceof Error ? error.message : 'Failed to cancel order');
      setTimeout(() => { setZohoSendStatus('idle'); setZohoSendMessage(''); }, 5000);
    } finally {
      setCancellingOrder(false);
    }
  };

  const sendOrderUpdateToWebhook = async (updateType: 'update' | 'cancel', updateData: any) => {
    try {
      const webhookData = {
        action: 'update_order',
        update_type: updateType,
        order_id: order?.id,
        order_number: order?.salesorder_number || order?.id,
        customer_data: customer,
        order_data: order,
        update_data: updateData,
        timestamp: new Date().toISOString(),
        source: 'view_order_page'
      };

      const webhookUrl = import.meta.env.VITE_ORDER_WEBHOOK_URL || 'https://hook.eu2.make.com/ussc9u8m3bamb3epfx4u0o0ef8hy8b4n';
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookData),
      });

      if (!response.ok) throw new Error(`Webhook failed with status: ${response.status}`);

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        await response.json();
      } else {
        await response.text();
      }
    } catch (error) {
      console.error('Error sending order update to webhook:', error);
    }
  };

  const handleSendToZoho = async () => {
    if (!order || !customer) {
      setZohoSendMessage('Missing order or customer data');
      setZohoSendStatus('error');
      return;
    }

    setSendingToZoho(true);
    setZohoSendStatus('sending');
    setZohoSendMessage('Preparing order for Zoho...');

    try {
      const lineItemsForWebhook = (order.line_items || []).map((item) => ({
        item_id: item.zoho_item_id,
        sku: item.sku || 'N/A',
        name: item.name,
        quantity: item.quantity,
        rate: item.rate,
        amount: item.amount,
        brand: 'Unknown'
      }));

      const webhookPayload = {
        salesorder_number: order.salesorder_number || `SO-${order.id}`,
        date: new Date(order.date || order.created_at).toISOString().split('T')[0],
        customer: {
          customer_id: customer.zoho_contact_id || customer.id,
          name: customer.company_name,
          email: customer.email,
          company: customer.company_name
        },
        line_items: lineItemsForWebhook,
        subtotal: order.sub_total || 0,
        vat_amount: Math.max(0, (order.total || 0) - (order.sub_total || 0)),
        total: order.total || 0,
        notes: order.notes || 'Order resent to Zoho via web app',
        created_by: 'Web Order - Resend',
        created_at: new Date().toISOString(),
        original_order_date: order.date || order.created_at
      };

      setZohoSendMessage('Sending to Zoho webhook...');
      const webhookUrl = import.meta.env.VITE_ORDER_WEBHOOK_URL || 'https://hook.eu2.make.com/ussc9u8m3bamb3epfx4u0o0ef8hy8b4n';
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload)
      });

      if (!response.ok) throw new Error(`Webhook failed with status: ${response.status}`);

      setZohoSendStatus('success');
      setZohoSendMessage('Order successfully sent to Zoho!');
      setTimeout(() => { setZohoSendStatus('idle'); setZohoSendMessage(''); }, 5000);
    } catch (error) {
      console.error('Error sending to Zoho:', error);
      setZohoSendStatus('error');
      setZohoSendMessage(error instanceof Error ? error.message : 'Failed to send to Zoho');
      setTimeout(() => { setZohoSendStatus('idle'); setZohoSendMessage(''); }, 5000);
    } finally {
      setSendingToZoho(false);
    }
  };

  const handleSendToPacking = async () => {
    if (!order) return;
    setSendingToPacking(true);
    setShippingStatus('sending');
    setShippingMessage('Sending order to packing...');

    try {
      const result = await shippingService.sendOrderToPacking(String(order.id));
      if (result.success) {
        setShippingStatus('success');
        setShippingMessage(result.message);
        await fetchOrderDetails();
        setTimeout(() => { setShippingStatus('idle'); setShippingMessage(''); }, 5000);
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error('Error sending order to packing:', error);
      setShippingStatus('error');
      setShippingMessage(error instanceof Error ? error.message : 'Failed to send order to packing');
      setTimeout(() => { setShippingStatus('idle'); setShippingMessage(''); }, 5000);
    } finally {
      setSendingToPacking(false);
    }
  };

  // Loading is handled by ProgressLoader via useLoader
  if (loading) {
    return null;
  }

  if (error) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="text-center max-w-md">
          <HelpCircle size={48} className="text-destructive mx-auto" />
          <h2 className="mt-4 mb-2 text-xl font-bold text-foreground">Error Loading Order</h2>
          <p className="text-muted-foreground mb-8">{error}</p>
          <div className="flex gap-4 justify-center">
            <button onClick={fetchOrderDetails} className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-all">
              Retry
            </button>
            <button onClick={handleBackToOrders} className="flex items-center gap-2 px-4 py-3 bg-muted/50 border border-border rounded-lg hover:bg-muted transition-all text-sm">
              Back to Orders
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="text-center max-w-md">
          <Package size={48} className="text-muted-foreground mx-auto" />
          <h2 className="mt-4 mb-2 text-xl font-bold text-foreground">Order Not Found</h2>
          <p className="text-muted-foreground mb-8">The requested order could not be found.</p>
          <button onClick={handleBackToOrders} className="flex items-center gap-2 px-4 py-3 bg-muted/50 border border-border rounded-lg hover:bg-muted transition-all text-sm mx-auto">
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  const progress = getOrderProgress();
  const tabTotals = getTotalsByTab();
  const filteredItems = getFilteredLineItems();
  const packages = (order.packages_json || []) as any[];
  const hasPackages = packages.length > 0;
  const activePackage = hasPackages ? packages[activePackageTab] || packages[0] : null;

  const notificationClass = (status: string) => {
    switch (status) {
      case 'sending': return 'bg-info/10 border-info/30 text-info';
      case 'success': return 'bg-success/10 border-success/30 text-success';
      case 'error': return 'bg-destructive/10 border-destructive/30 text-destructive';
      default: return 'bg-muted-foreground/10 border-muted-foreground/30 text-muted-foreground';
    }
  };

  const getCustomerInitial = () => {
    const name = customer?.company_name || order.customer_name || '';
    return name.charAt(0).toUpperCase() || '?';
  };

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
        <Link to="/orders" className="hover:text-foreground transition-colors">Orders</Link>
        <ChevronRight size={14} />
        <span className="text-foreground font-medium">{order.salesorder_number || 'N/A'}</span>
      </nav>

      {/* Header */}
      <div className="flex justify-between items-start mb-6 pb-5 border-b border-border flex-wrap gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">Order {order.salesorder_number || 'N/A'}</h1>
              <span className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wide border ${getStatusBadgeClass(order.status)}`}>
                {order.status}
              </span>
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={handlePrintOrder} className="flex items-center gap-2 px-4 py-2.5 bg-transparent border border-border text-muted-foreground rounded-lg hover:bg-muted hover:text-foreground transition-all text-sm">
              <File size={16} /> Print
            </button>
            <button onClick={handleCreateInvoice} className="flex items-center gap-2 px-4 py-2.5 bg-transparent border border-border text-muted-foreground rounded-lg hover:bg-muted hover:text-foreground transition-all text-sm">
              <FileText size={16} /> Invoice
            </button>
            <button onClick={handleEditOrder} className="flex items-center gap-2 px-4 py-2.5 bg-transparent border border-border text-muted-foreground rounded-lg hover:bg-muted hover:text-foreground transition-all text-sm">
              <Settings size={16} /> Edit Order
            </button>
            <button onClick={handleSendToPacking} disabled={sendingToPacking} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed">
              <Package size={16} /> {sendingToPacking ? 'Sending...' : 'Send to Packing'}
            </button>
          </div>
        </div>

        {/* Notifications */}
        {zohoSendMessage && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border mb-4 ${notificationClass(zohoSendStatus)}`}>
            {zohoSendStatus === 'sending' && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
            {zohoSendStatus === 'success' && <CheckCircle size={20} />}
            {zohoSendStatus === 'error' && <HelpCircle size={20} />}
            <span>{zohoSendMessage}</span>
          </div>
        )}
        {shippingMessage && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border mb-4 ${notificationClass(shippingStatus)}`}>
            {shippingStatus === 'sending' && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
            {shippingStatus === 'success' && <CheckCircle size={20} />}
            {shippingStatus === 'error' && <HelpCircle size={20} />}
            <span>{shippingMessage}</span>
          </div>
        )}

        {/* Customer Details Card (full-width, above grid) */}
        {customer && (
          <div className="bg-card rounded-xl border border-border p-4 mb-6">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Avatar */}
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg shrink-0">
                {getCustomerInitial()}
              </div>

              {/* Name + Company */}
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-foreground truncate">{customer.company_name}</h3>
                {customer.contact_name && (
                  <p className="text-sm text-muted-foreground truncate">{customer.contact_name}</p>
                )}
              </div>

              {/* Contact info inline */}
              <div className="flex items-center gap-5 flex-wrap text-sm text-muted-foreground">
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                    <Phone size={14} className="text-primary" />
                    <span>{customer.phone}</span>
                  </a>
                )}
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                    <Mail size={14} className="text-primary" />
                    <span>{customer.email}</span>
                  </a>
                )}
              </div>

              {/* Financial summary */}
              <div className="flex items-center gap-4 text-sm">
                <div className="flex flex-col items-center px-3 py-1 bg-muted/50 rounded-lg border border-border">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Receivable</span>
                  <span className="font-semibold text-warning">{formatCurrency(customer.outstanding_receivable || 0)}</span>
                </div>
                <div className="flex flex-col items-center px-3 py-1 bg-muted/50 rounded-lg border border-border">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Credits</span>
                  <span className="font-semibold text-success">{formatCurrency(customer.unused_credits || 0)}</span>
                </div>
              </div>

              {/* View Customer button */}
              <button
                onClick={() => navigate(`/customer/${customer.zoho_contact_id}`)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-primary/80 border border-primary/25 bg-primary/5 rounded-md hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-all shrink-0"
              >
                <ExternalLink size={12} />
                View Customer
              </button>
            </div>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 mb-6">
          {/* Left Column */}
          <div className="flex flex-col gap-5">
            {/* Order Details & Progress (consolidated) */}
            <div className="bg-card rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Order Details</h3>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Calendar className="text-primary w-5 shrink-0" size={20} />
                  <div className="flex-1">
                    <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Order Date</label>
                    <span className="text-foreground font-medium">{formatDate(order.date || order.created_at)}</span>
                  </div>
                </div>
                {order.reference_number && (
                  <div className="flex items-center gap-3">
                    <Hash className="text-primary w-5 shrink-0" size={20} />
                    <div className="flex-1">
                      <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Reference</label>
                      <span className="text-foreground font-medium">{order.reference_number}</span>
                    </div>
                  </div>
                )}
                {order.salesperson_name && (
                  <div className="flex items-center gap-3">
                    <UserCheck className="text-primary w-5 shrink-0" size={20} />
                    <div className="flex-1">
                      <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Salesperson</label>
                      <span className="text-foreground font-medium">{order.salesperson_name}</span>
                    </div>
                  </div>
                )}
                {order.delivery_date && (
                  <div className="flex items-center gap-3">
                    <CalendarCheck className="text-primary w-5 shrink-0" size={20} />
                    <div className="flex-1">
                      <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Delivery Date</label>
                      <span className="text-foreground font-medium">{formatDate(order.delivery_date)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Progress stepper (merged into same card) */}
              <div className="mt-5 pt-4 border-t border-border">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Progress</h4>
                <div className="flex flex-col gap-0">
                  {orderStatusSteps.map((step, index) => {
                    const isCompleted = index < progress;
                    const isCurrent = index === progress;
                    const isFuture = index > progress;
                    const StepIcon = step.icon;

                    return (
                      <div key={step.key} className="flex items-start gap-3 relative">
                        {index < orderStatusSteps.length - 1 && (
                          <div className={`absolute left-[15px] top-[32px] w-0.5 h-[calc(100%-8px)] ${
                            isCompleted ? 'bg-primary' : 'bg-muted'
                          }`} />
                        )}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 transition-all ${
                          isCompleted ? 'bg-primary text-background' :
                          isCurrent ? 'bg-success text-white shadow-[0_0_12px_color-mix(in_srgb,var(--success)_50%,transparent)]' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          <StepIcon size={14} />
                        </div>
                        <div className={`pb-4 pt-1 ${isFuture ? 'opacity-40' : ''}`}>
                          <span className={`text-sm font-medium ${
                            isCurrent ? 'text-success' : isCompleted ? 'text-foreground' : 'text-muted-foreground'
                          }`}>
                            {step.label}
                          </span>
                          {isCurrent && (
                            <span className="block text-[10px] text-success/70 uppercase tracking-wider mt-0.5">Current</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Customer Details (map + addresses) */}
            {customer && (
              <div className="bg-card rounded-xl border border-border p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Location</h3>

                {mapCenter && (
                  <div className="w-full h-[200px] rounded-lg overflow-hidden border border-border mb-4">
                    <iframe
                      title="Customer Location Map"
                      width="100%"
                      height="300"
                      frameBorder="0"
                      style={{ border: 0, borderRadius: '8px' }}
                      src={`https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${mapCenter.lat},${mapCenter.lng}&zoom=15`}
                      allowFullScreen
                    />
                  </div>
                )}

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    {customer.email && (
                      <a href={`mailto:${customer.email}`} className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors">
                        <Mail size={16} className="text-primary" />
                        <span>{customer.email}</span>
                      </a>
                    )}
                    {customer.phone && (
                      <a href={`tel:${customer.phone}`} className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors">
                        <Phone size={16} className="text-primary" />
                        <span>{customer.phone}</span>
                      </a>
                    )}
                  </div>

                  <div className="mt-2">
                    <h5 className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">Billing Address</h5>
                    <div className="flex items-start gap-3 text-sm text-muted-foreground leading-relaxed">
                      <Home size={16} className="text-primary mt-0.5 shrink-0" />
                      <div>
                        {customer.billing_address?.address}<br />
                        {customer.billing_address?.street2 && <>{customer.billing_address.street2}<br /></>}
                        {customer.billing_address?.city} {customer.billing_address?.zip}<br />
                        {customer.billing_address?.state}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2">
                    <h5 className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">Shipping Address</h5>
                    <div className="flex items-start gap-3 text-sm text-muted-foreground leading-relaxed">
                      <MapPin size={16} className="text-primary mt-0.5 shrink-0" />
                      <div>
                        {customer.shipping_address?.address ? (
                          <>
                            {customer.shipping_address.address}<br />
                            {customer.shipping_address.street2 && <>{customer.shipping_address.street2}<br /></>}
                            {customer.shipping_address.city} {customer.shipping_address.zip}<br />
                            {customer.shipping_address.state}
                          </>
                        ) : (
                          <>
                            <em>Same as billing address:</em><br />
                            {customer.billing_address?.address}<br />
                            {customer.billing_address?.street2 && <>{customer.billing_address.street2}<br /></>}
                            {customer.billing_address?.city} {customer.billing_address?.zip}<br />
                            {customer.billing_address?.state}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Package Information with Tabs */}
            {customer && (
              <div className="bg-card rounded-xl border border-border p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Package Information</h3>
                {!hasPackages ? (
                  <p className="text-muted-foreground italic text-sm">No shipment data available for this order.</p>
                ) : (
                  <div className="mt-2">
                    {/* Package tabs (if multiple) */}
                    {packages.length > 1 && (
                      <div className="flex gap-1 mb-4 border-b border-border pb-3">
                        {packages.map((_: any, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => setActivePackageTab(idx)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                              activePackageTab === idx
                                ? 'bg-primary/20 text-primary border border-primary/30'
                                : 'text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground'
                            }`}
                          >
                            Package {idx + 1}
                          </button>
                        ))}
                      </div>
                    )}

                    {activePackage && (
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Package</span>
                              <span className="text-foreground font-medium">#{activePackageTab + 1} of {packages.length}</span>
                            </div>
                            {activePackage.quantity !== undefined && (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Quantity</span>
                                <span className="text-foreground font-medium">{activePackage.quantity}</span>
                              </div>
                            )}
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Courier</span>
                              <span className="text-foreground font-medium">{activePackage.delivery_method || activePackage.carrier || 'Unknown'}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Tracking</span>
                              <span className="text-foreground font-medium">{activePackage.tracking_number || 'N/A'}</span>
                            </div>
                            {activePackage.shipment_date && (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Shipment Date</span>
                                <span className="text-foreground font-medium">{formatDateTime(activePackage.shipment_date)}</span>
                              </div>
                            )}
                          </div>
                          {(activePackage.delivery_method || activePackage.carrier) && (
                            <div className="h-10">
                              <img
                                src={getCourierLogo(activePackage.delivery_method || activePackage.carrier)}
                                alt={activePackage.delivery_method || activePackage.carrier}
                                className="h-10 w-auto object-contain"
                                onError={(e) => { (e.target as HTMLImageElement).src = getCourierLogo('default'); }}
                              />
                            </div>
                          )}
                        </div>

                        <div className="mt-2">
                          <h4 className="text-sm font-semibold text-primary mb-2">Ship To</h4>
                          {(order.shipping_address_json?.address || customer.shipping_address?.address) ? (
                            <div className="flex items-start gap-3 text-sm text-muted-foreground leading-relaxed">
                              <MapPin size={16} className="text-primary mt-0.5 shrink-0" />
                              <div>
                                <strong>{customer.company_name}</strong><br />
                                {order.shipping_address_json?.address || customer.shipping_address?.address}<br />
                                {(order.shipping_address_json?.street2 || customer.shipping_address?.street2) && <>{order.shipping_address_json?.street2 || customer.shipping_address?.street2}<br /></>}
                                {order.shipping_address_json?.city || customer.shipping_address?.city} {order.shipping_address_json?.zip || customer.shipping_address?.zip}<br />
                                {order.shipping_address_json?.state || customer.shipping_address?.state}
                              </div>
                            </div>
                          ) : (
                            <p className="text-muted-foreground italic text-sm">No shipping address available.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Order Notes (in left column) */}
            {order.notes && (
              <div className="bg-card rounded-xl border border-border p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Order Notes</h3>
                <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
                  <p className="text-foreground leading-relaxed m-0 text-sm">{order.notes}</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="flex flex-col">
            {/* Order Items Card */}
            <div className="bg-card rounded-xl border border-border p-5">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-semibold text-foreground">Order Items</h3>
                <span className="text-lg font-semibold text-primary">Total: {formatCurrency(order.total || 0)}</span>
              </div>

              {/* Tab Filters */}
              <div className="flex gap-2 mb-6 border-b border-border pb-4 flex-wrap">
                {(['all', 'shipped', 'partial', 'awaiting'] as TabFilter[]).map(tab => (
                  <button
                    key={tab}
                    className={`px-4 py-2 border rounded-md text-sm font-medium transition-all ${
                      activeTab === tab
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab === 'all' ? `All Items (${tabTotals.all})` :
                     tab === 'shipped' ? `Shipped (${tabTotals.shipped})` :
                     tab === 'partial' ? `Partial (${tabTotals.partial})` :
                     `Awaiting (${tabTotals.awaiting})`}
                  </button>
                ))}
              </div>

              {/* Line Items Table */}
              <div className="mb-6">
                <div className="hidden lg:grid grid-cols-[2fr_1fr_0.5fr_1fr_1fr_1fr_1fr] gap-4 py-3 border-b-2 border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <div>Item</div>
                  <div>SKU</div>
                  <div>Qty</div>
                  <div>Unit Price</div>
                  <div>Total</div>
                  <div>Shipped</div>
                  <div>Status</div>
                </div>

                <div className="flex flex-col">
                  {filteredItems.map((item) => {
                    const shipped = item.quantity_shipped || 0;
                    const isFullyShipped = shipped >= item.quantity;
                    const isPartiallyShipped = shipped > 0 && shipped < item.quantity;

                    return (
                      <div key={item.id} className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_0.5fr_1fr_1fr_1fr_1fr] gap-4 py-4 border-b border-border/50 items-center hover:bg-muted/40 transition-colors">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium text-foreground">{item.name}</span>
                          {item.brand_name && <span className="text-xs text-muted-foreground">{item.brand_name}</span>}
                        </div>
                        <div>
                          <code className="bg-muted px-2 py-1 rounded text-xs text-primary border border-primary/20">
                            {item.sku || item.zoho_item_id?.substr(0, 8) || 'N/A'}
                          </code>
                        </div>
                        <div className="text-sm font-medium text-foreground">{item.quantity}</div>
                        <div className="text-sm font-medium text-foreground">{formatCurrency(item.rate || 0)}</div>
                        <div className="text-sm font-medium text-foreground">{formatCurrency(item.amount || 0)}</div>
                        <div className="text-sm font-medium text-foreground">{shipped} / {item.quantity}</div>
                        <div className="text-xs">
                          {isFullyShipped ? (
                            <span className="flex items-center gap-1.5 text-success font-medium"><CheckCircle size={16} /> Shipped</span>
                          ) : isPartiallyShipped ? (
                            <span className="flex items-center gap-1.5 text-warning font-medium"><Clock size={16} /> Partial</span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-muted-foreground font-medium"><Package size={16} /> Pending</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredItems.length === 0 && (
                  <div className="flex flex-col items-center gap-4 py-12 text-muted-foreground text-center">
                    <Package size={48} className="text-muted-foreground/50" />
                    <p>No items match the current filter</p>
                  </div>
                )}
              </div>

              {/* Order Summary */}
              <div className="bg-muted/50 p-6 rounded-lg border-t border-border">
                <div className="flex justify-between items-center py-2 text-sm text-muted-foreground">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(order.sub_total || 0)}</span>
                </div>
                {(order.discount_total || 0) > 0 && (
                  <div className="flex justify-between items-center py-2 text-sm text-muted-foreground">
                    <span>Discount:</span>
                    <span className="text-success">-{formatCurrency(order.discount_total || 0)}</span>
                  </div>
                )}
                {(order.shipping_charge || 0) > 0 && (
                  <div className="flex justify-between items-center py-2 text-sm text-muted-foreground">
                    <span>Shipping:</span>
                    <span>{formatCurrency(order.shipping_charge || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 text-sm text-muted-foreground">
                  <span>Tax:</span>
                  <span>{formatCurrency(order.tax_total || Math.max(0, (order.total || 0) - (order.sub_total || 0)))}</span>
                </div>
                {(order.adjustment || 0) !== 0 && (
                  <div className="flex justify-between items-center py-2 text-sm text-muted-foreground">
                    <span>Adjustment:</span>
                    <span>{formatCurrency(order.adjustment || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-3 border-t border-border mt-2 text-lg font-semibold text-primary">
                  <span>Total:</span>
                  <span>{formatCurrency(order.total || 0)}</span>
                </div>
              </div>

              {/* Invoice Section (below summary) */}
              <div className="mt-6 pt-6 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <CreditCard size={16} className="text-primary" />
                  Invoices {invoices.length > 0 && <span className="text-xs text-muted-foreground">({invoices.length})</span>}
                </h3>
                {invoices.length === 0 ? (
                  <div className="flex items-center justify-between gap-3 px-4 py-4 bg-muted/30 rounded-lg border border-border/50 text-sm">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <FileText size={18} className="text-muted-foreground/50" />
                      <span>No invoice generated yet</span>
                    </div>
                    <button
                      onClick={handleCreateInvoice}
                      disabled={creatingInvoice || !order?.zoho_salesorder_id}
                      className="px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-md hover:bg-primary/10 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {creatingInvoice ? 'Creating...' : 'Generate Invoice'}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {invoices.map((invoice) => (
                      <div key={invoice.id} onClick={() => navigate(`/finance/invoices/${invoice.id}`)} className="flex items-center justify-between gap-4 px-4 py-3 bg-muted/40 rounded-lg border border-border hover:bg-muted/60 transition-colors cursor-pointer">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium text-foreground truncate">{invoice.invoice_number || 'Invoice'}</span>
                            <span className="text-xs text-muted-foreground">{formatDate(invoice.invoice_date)}</span>
                          </div>
                          {invoice.due_date && (
                            <div className="flex flex-col text-xs text-muted-foreground hidden sm:flex">
                              <span>Due</span>
                              <span className="text-muted-foreground">{formatDate(invoice.due_date)}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col items-end text-sm">
                            <span className="font-medium text-foreground">{formatCurrency(invoice.total)}</span>
                            {invoice.balance > 0 && (
                              <span className="text-xs text-warning">Bal: {formatCurrency(invoice.balance)}</span>
                            )}
                          </div>
                          <span className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide border ${getStatusBadgeClass(invoice.status)}`}>
                            {invoice.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Edit Order Modal */}
        {showEditModal && editOrderData && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] p-4">
            <div className="bg-card rounded-xl border border-border max-w-[800px] w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex justify-between items-center p-6 border-b border-border">
                <h2 className="text-2xl font-bold text-foreground">Edit Order</h2>
                <button onClick={() => setShowEditModal(false)} className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6">
                {/* Order Status and Date */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div>
                    <label htmlFor="orderStatus" className="block mb-2 font-semibold text-foreground">Order Status</label>
                    <select
                      id="orderStatus"
                      value={editOrderData.order_status}
                      onChange={(e) => setEditOrderData({ ...editOrderData, order_status: e.target.value })}
                      className="w-full px-3 py-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info focus:bg-muted/80 focus:ring-2 focus:ring-info/10 transition-all"
                    >
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="processing">Processing</option>
                      <option value="shipped">Shipped</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="shippingStatus" className="block mb-2 font-semibold text-foreground">Shipping Status</label>
                    <select
                      id="shippingStatus"
                      value={editOrderData.shipping_status}
                      onChange={(e) => setEditOrderData({ ...editOrderData, shipping_status: e.target.value })}
                      className="w-full px-3 py-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info focus:bg-muted/80 focus:ring-2 focus:ring-info/10 transition-all"
                    >
                      <option value="pending">Pending</option>
                      <option value="processing">Processing</option>
                      <option value="shipped">Shipped</option>
                      <option value="delivered">Delivered</option>
                      <option value="returned">Returned</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="orderDate" className="block mb-2 font-semibold text-foreground">Order Date</label>
                    <input
                      type="date"
                      id="orderDate"
                      value={editOrderData.order_date}
                      onChange={(e) => setEditOrderData({ ...editOrderData, order_date: e.target.value })}
                      className="w-full px-3 py-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info focus:bg-muted/80 focus:ring-2 focus:ring-info/10 transition-all"
                    />
                  </div>
                </div>

                {/* Addresses Section */}
                <div className="my-8 p-6 bg-muted/30 border border-border rounded-xl">
                  <h3 className="text-xl font-semibold text-foreground mb-6">Addresses</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Billing Address */}
                    <div>
                      <h4 className="text-base font-semibold text-foreground mb-4">Billing Address</h4>
                      <div className="flex flex-col gap-3">
                        <input type="text" placeholder="Address Line 1" value={editOrderData.billing_address.address_1}
                          onChange={(e) => setEditOrderData({ ...editOrderData, billing_address: { ...editOrderData.billing_address, address_1: e.target.value } })}
                          className="w-full px-3 py-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info focus:bg-muted/80 focus:ring-2 focus:ring-info/10 transition-all" />
                        <input type="text" placeholder="Address Line 2 (optional)" value={editOrderData.billing_address.address_2}
                          onChange={(e) => setEditOrderData({ ...editOrderData, billing_address: { ...editOrderData.billing_address, address_2: e.target.value } })}
                          className="w-full px-3 py-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info focus:bg-muted/80 focus:ring-2 focus:ring-info/10 transition-all" />
                        <div className="grid grid-cols-3 gap-3">
                          <input type="text" placeholder="City/Town" value={editOrderData.billing_address.city_town}
                            onChange={(e) => setEditOrderData({ ...editOrderData, billing_address: { ...editOrderData.billing_address, city_town: e.target.value } })}
                            className="w-full px-3 py-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info focus:bg-muted/80 focus:ring-2 focus:ring-info/10 transition-all" />
                          <input type="text" placeholder="County" value={editOrderData.billing_address.county}
                            onChange={(e) => setEditOrderData({ ...editOrderData, billing_address: { ...editOrderData.billing_address, county: e.target.value } })}
                            className="w-full px-3 py-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info focus:bg-muted/80 focus:ring-2 focus:ring-info/10 transition-all" />
                          <input type="text" placeholder="Postcode" value={editOrderData.billing_address.postcode}
                            onChange={(e) => setEditOrderData({ ...editOrderData, billing_address: { ...editOrderData.billing_address, postcode: e.target.value } })}
                            className="w-full px-3 py-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info focus:bg-muted/80 focus:ring-2 focus:ring-info/10 transition-all" />
                        </div>
                      </div>
                    </div>

                    {/* Shipping Address */}
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="text-base font-semibold text-foreground">Shipping Address</h4>
                        <button type="button" onClick={() => setEditOrderData({ ...editOrderData, shipping_address: { ...editOrderData.billing_address } })}
                          className="flex items-center gap-1 px-3 py-2 bg-info/10 border border-info/30 rounded-md text-info text-xs hover:bg-info/20 hover:border-info/50 transition-all">
                          <Copy size={14} /> Copy Billing
                        </button>
                      </div>
                      <div className="flex flex-col gap-3">
                        <input type="text" placeholder="Address Line 1" value={editOrderData.shipping_address.address_1}
                          onChange={(e) => setEditOrderData({ ...editOrderData, shipping_address: { ...editOrderData.shipping_address, address_1: e.target.value } })}
                          className="w-full px-3 py-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info focus:bg-muted/80 focus:ring-2 focus:ring-info/10 transition-all" />
                        <input type="text" placeholder="Address Line 2 (optional)" value={editOrderData.shipping_address.address_2}
                          onChange={(e) => setEditOrderData({ ...editOrderData, shipping_address: { ...editOrderData.shipping_address, address_2: e.target.value } })}
                          className="w-full px-3 py-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info focus:bg-muted/80 focus:ring-2 focus:ring-info/10 transition-all" />
                        <div className="grid grid-cols-3 gap-3">
                          <input type="text" placeholder="City/Town" value={editOrderData.shipping_address.city_town}
                            onChange={(e) => setEditOrderData({ ...editOrderData, shipping_address: { ...editOrderData.shipping_address, city_town: e.target.value } })}
                            className="w-full px-3 py-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info focus:bg-muted/80 focus:ring-2 focus:ring-info/10 transition-all" />
                          <input type="text" placeholder="County" value={editOrderData.shipping_address.county}
                            onChange={(e) => setEditOrderData({ ...editOrderData, shipping_address: { ...editOrderData.shipping_address, county: e.target.value } })}
                            className="w-full px-3 py-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info focus:bg-muted/80 focus:ring-2 focus:ring-info/10 transition-all" />
                          <input type="text" placeholder="Postcode" value={editOrderData.shipping_address.postcode}
                            onChange={(e) => setEditOrderData({ ...editOrderData, shipping_address: { ...editOrderData.shipping_address, postcode: e.target.value } })}
                            className="w-full px-3 py-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info focus:bg-muted/80 focus:ring-2 focus:ring-info/10 transition-all" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center cursor-pointer text-foreground mt-6 gap-2">
                    <input type="checkbox" checked={editOrderData.make_default_addresses}
                      onChange={(e) => setEditOrderData({ ...editOrderData, make_default_addresses: e.target.checked })}
                      className="w-auto" />
                    <span className="text-sm">Update customer's default addresses with these changes</span>
                  </label>
                </div>

                {/* Line Items Section */}
                <div className="my-8 p-6 bg-muted/30 border border-border rounded-xl">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-semibold text-foreground">Line Items</h3>
                    <button type="button" onClick={() => setShowItemSearch(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-md font-semibold hover:bg-success/80 hover:-translate-y-0.5 transition-all text-sm">
                      <Plus size={16} /> Add Item
                    </button>
                  </div>

                  {showItemSearch && (
                    <div className="mb-6 p-4 bg-muted/50 rounded-lg border border-border">
                      <div className="relative flex items-center gap-2">
                        <Search size={16} className="absolute left-3 text-muted-foreground pointer-events-none" />
                        <input type="text" placeholder="Search items by name, SKU, or description..."
                          value={itemSearchTerm}
                          onChange={(e) => { setItemSearchTerm(e.target.value); searchItems(e.target.value); }}
                          className="w-full pl-10 pr-10 py-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info focus:bg-muted/80 focus:ring-2 focus:ring-info/10 transition-all"
                          autoFocus />
                        <button onClick={() => { setShowItemSearch(false); setItemSearchTerm(''); setAvailableItems([]); }}
                          className="absolute right-2 p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
                          <X size={16} />
                        </button>
                      </div>

                      {availableItems.length > 0 && (
                        <div className="mt-2 max-h-[200px] overflow-y-auto border border-border rounded-md bg-muted/30">
                          {availableItems.map((item) => (
                            <div key={item.id} className="p-3 border-b border-border cursor-pointer hover:bg-muted/50 transition-all last:border-b-0"
                              onClick={() => addItemToOrder(item)}>
                              <div className="font-semibold text-foreground text-sm mb-1">{item.name}</div>
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{item.sku}</span>
                                <span className="text-success">{item.brand}</span>
                                <span className="text-info font-semibold">{formatCurrency(item.rate || 0)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="border border-border rounded-lg p-4 bg-muted/30">
                    {editOrderData.line_items.map((item: any, index: number) => (
                      <div key={item.id} className="grid grid-cols-1 md:grid-cols-[2fr_100px_120px_150px_40px] gap-4 items-center p-3 border-b border-border last:border-b-0">
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-foreground text-sm">
                            {item.item_name}
                            {item.is_new && <span className="inline-block bg-success text-white text-[10px] font-bold px-1.5 py-0.5 rounded ml-2">NEW</span>}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-muted-foreground">Qty:</label>
                          <input type="number" min="0" value={item.quantity}
                            onChange={(e) => {
                              const newItems = [...editOrderData.line_items];
                              const qty = parseInt(e.target.value) || 0;
                              newItems[index].quantity = qty;
                              newItems[index].total_price = qty * newItems[index].unit_price;
                              setEditOrderData({ ...editOrderData, line_items: newItems });
                            }}
                            className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info transition-all" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-muted-foreground">Unit Price:</label>
                          <input type="number" min="0" step="0.01" value={item.unit_price}
                            onChange={(e) => {
                              const newItems = [...editOrderData.line_items];
                              const price = parseFloat(e.target.value) || 0;
                              newItems[index].unit_price = price;
                              newItems[index].total_price = newItems[index].quantity * price;
                              setEditOrderData({ ...editOrderData, line_items: newItems });
                            }}
                            className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info transition-all" />
                        </div>
                        <div className="text-right font-semibold text-success text-sm">
                          Total: {formatCurrency(item.total_price)}
                        </div>
                        <div className="flex justify-center">
                          <button type="button" onClick={() => removeItemFromOrder(index)}
                            className="bg-destructive text-white rounded p-1.5 hover:bg-destructive/80 hover:scale-110 transition-all" title="Remove item">
                            <Minus size={14} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {editOrderData.line_items.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        <p>No items in this order. Add items using the button above.</p>
                      </div>
                    )}
                  </div>

                  <div className="text-right p-4 border-t-2 border-border mt-4 text-foreground text-lg">
                    <strong>Order Total: {formatCurrency(editOrderData.line_items.reduce((sum: number, item: any) => sum + item.total_price, 0))}</strong>
                  </div>
                </div>

                {/* Order Notes */}
                <div className="mb-6">
                  <label htmlFor="orderNotes" className="block mb-2 font-semibold text-foreground">Order Notes</label>
                  <textarea id="orderNotes" value={editOrderData.notes}
                    onChange={(e) => setEditOrderData({ ...editOrderData, notes: e.target.value })}
                    className="w-full px-3 py-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info focus:bg-muted/80 focus:ring-2 focus:ring-info/10 transition-all resize-y min-h-[80px]"
                    rows={4} placeholder="Add any notes about this order..." />
                </div>
              </div>

              <div className="flex justify-between items-center p-6 border-t border-border gap-4 flex-wrap">
                <button onClick={() => setShowCancelModal(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-destructive text-white rounded-lg font-semibold hover:bg-destructive/80 hover:-translate-y-0.5 transition-all text-sm">
                  <AlertTriangle size={16} /> Cancel Order
                </button>
                <div className="flex gap-3">
                  <button onClick={() => setShowEditModal(false)} disabled={savingOrder}
                    className="flex items-center gap-2 px-6 py-3 bg-muted text-foreground border border-border rounded-lg font-semibold hover:bg-muted hover:border-border disabled:opacity-60 disabled:cursor-not-allowed transition-all text-sm">
                    Close
                  </button>
                  <button onClick={handleSaveOrderEdit} disabled={savingOrder}
                    className="flex items-center gap-2 px-6 py-3 bg-info text-white rounded-lg font-semibold hover:bg-info/80 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed transition-all text-sm">
                    <Save size={16} /> {savingOrder ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Order Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] p-4">
            <div className="bg-card rounded-xl border border-border max-w-[800px] w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex justify-between items-center p-6 border-b border-border">
                <h2 className="text-2xl font-bold text-foreground">Cancel Order</h2>
                <button onClick={() => setShowCancelModal(false)} className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6">
                <div className="flex items-center gap-3 p-4 bg-warning/10 border border-warning/30 rounded-lg mb-6 text-warning">
                  <AlertTriangle size={20} />
                  <p className="font-semibold m-0">Are you sure you want to cancel this order? This action cannot be undone.</p>
                </div>

                <div className="mb-6">
                  <label htmlFor="cancelReason" className="block mb-2 font-semibold text-foreground">Reason for cancellation (optional)</label>
                  <textarea id="cancelReason" value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="w-full px-3 py-3 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-info focus:bg-muted/80 focus:ring-2 focus:ring-info/10 transition-all resize-y min-h-[80px]"
                    rows={3} placeholder="Please provide a reason for cancelling this order..." />
                </div>
              </div>

              <div className="flex justify-end items-center p-6 border-t border-border gap-3">
                <button onClick={() => setShowCancelModal(false)} disabled={cancellingOrder}
                  className="flex items-center gap-2 px-6 py-3 bg-muted text-foreground border border-border rounded-lg font-semibold hover:bg-muted hover:border-border disabled:opacity-60 disabled:cursor-not-allowed transition-all text-sm">
                  Keep Order
                </button>
                <button onClick={handleCancelOrder} disabled={cancellingOrder}
                  className="flex items-center gap-2 px-6 py-3 bg-destructive text-white rounded-lg font-semibold hover:bg-destructive/80 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed transition-all text-sm">
                  <AlertTriangle size={16} /> {cancellingOrder ? 'Cancelling...' : 'Cancel Order'}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export default ViewOrder;
