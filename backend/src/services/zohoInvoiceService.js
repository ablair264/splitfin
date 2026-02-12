import axios from 'axios';
import { getAccessToken, ZOHO_CONFIG } from '../api/zoho.js';
import { logger } from '../utils/logger.js';

/**
 * Create an invoice in Zoho Inventory from an existing sales order.
 * Zoho auto-populates line items from the sales order.
 */
export async function createInvoiceFromSalesOrder(zohoSalesOrderId) {
  const token = await getAccessToken();

  try {
    // Zoho Inventory: Convert SO to Invoice
    const response = await axios.post(
      `${ZOHO_CONFIG.baseUrls.inventory}/invoices`,
      { salesorder_id: zohoSalesOrderId },
      {
        params: { salesorder_id: zohoSalesOrderId },
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
          'X-com-zoho-inventory-organizationid': ZOHO_CONFIG.orgId,
        },
      }
    );

    if (response.data.code !== 0) {
      throw new Error(response.data.message || 'Zoho invoice creation failed');
    }

    logger.info(`Invoice created in Zoho: ${response.data.invoice?.invoice_number}`);
    return response.data.invoice;
  } catch (error) {
    logger.error('Zoho invoice creation failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Fetch a single invoice from Zoho Inventory with full details.
 */
export async function getZohoInvoice(zohoInvoiceId) {
  const token = await getAccessToken();

  try {
    const response = await axios.get(
      `${ZOHO_CONFIG.baseUrls.inventory}/invoices/${zohoInvoiceId}`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          'X-com-zoho-inventory-organizationid': ZOHO_CONFIG.orgId,
        },
      }
    );

    if (response.data.code !== 0) {
      throw new Error(response.data.message || 'Failed to fetch Zoho invoice');
    }

    return response.data.invoice;
  } catch (error) {
    logger.error('Zoho invoice fetch failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Record a customer payment in Zoho Inventory.
 */
export async function recordZohoPayment(zohoCustomerId, zohoInvoiceId, { amount, date, payment_mode, reference_number }) {
  const token = await getAccessToken();

  try {
    const payload = {
      customer_id: zohoCustomerId,
      payment_mode: payment_mode || 'cash',
      amount: parseFloat(amount),
      date: date || new Date().toISOString().split('T')[0],
      reference_number: reference_number || '',
      invoices: [
        {
          invoice_id: zohoInvoiceId,
          amount_applied: parseFloat(amount),
        },
      ],
    };

    const response = await axios.post(
      `${ZOHO_CONFIG.baseUrls.inventory}/customerpayments`,
      payload,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
          'X-com-zoho-inventory-organizationid': ZOHO_CONFIG.orgId,
        },
      }
    );

    if (response.data.code !== 0) {
      throw new Error(response.data.message || 'Zoho payment recording failed');
    }

    logger.info(`Payment recorded in Zoho for invoice ${zohoInvoiceId}: ${amount}`);
    return response.data.payment;
  } catch (error) {
    logger.error('Zoho payment recording failed:', error.response?.data || error.message);
    throw error;
  }
}
