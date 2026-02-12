import { Handler } from '@netlify/functions';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

type ZohoInvoicePayload = Record<string, any>;

function parseJsonBody(body: string | null, isBase64Encoded?: boolean) {
  if (!body) return null;
  const raw = isBase64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeStatus(status?: string, balance?: number) {
  if (!status) return 'draft';
  if (typeof balance === 'number' && balance <= 0) return 'paid';
  return status.toLowerCase();
}

function coerceNumber(value: any) {
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getInvoiceObject(payload: ZohoInvoicePayload) {
  if (!payload) return null;
  if (payload.invoice) return payload.invoice;
  if (payload.data?.invoice) return payload.data.invoice;
  if (payload.data) return payload.data;
  return payload;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (webhookSecret) {
    const provided = event.headers['x-webhook-secret'] || event.headers['X-Webhook-Secret'];
    if (provided !== webhookSecret) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  const payload = parseJsonBody(event.body, event.isBase64Encoded);
  if (!payload) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const invoice = getInvoiceObject(payload);
  if (!invoice || !invoice.invoice_id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing invoice_id' }) };
  }

  const zohoInvoiceId = String(invoice.invoice_id);
  const nowIso = new Date().toISOString();

  const invoiceRecord = {
    zoho_invoice_id: zohoInvoiceId,
    invoice_number: invoice.invoice_number || invoice.invoice_no || null,
    reference_number: invoice.reference_number || null,
    zoho_customer_id: invoice.customer_id || null,
    customer_name: invoice.customer_name || null,
    agent_id: invoice.salesperson_id || invoice.salesperson_name || null,
    zoho_salesorder_id: invoice.salesorder_id || invoice.zoho_salesorder_id || null,
    salesorder_number: invoice.salesorder_number || invoice.so_number || null,
    invoice_date: invoice.date || invoice.invoice_date || null,
    due_date: invoice.due_date || null,
    status: normalizeStatus(invoice.status, coerceNumber(invoice.balance)),
    sub_total: coerceNumber(invoice.sub_total ?? invoice.subtotal),
    tax_total: coerceNumber(invoice.tax_total ?? invoice.tax_amount),
    discount_total: coerceNumber(invoice.discount_total ?? invoice.discount_amount),
    shipping_charge: coerceNumber(invoice.shipping_charge),
    total: coerceNumber(invoice.total ?? invoice.total_amount),
    balance: coerceNumber(invoice.balance ?? invoice.balance_due),
    currency_code: invoice.currency_code || 'GBP',
    billing_address: invoice.billing_address || null,
    shipping_address: invoice.shipping_address || null,
    sync_status: 'synced',
    created_at: invoice.created_time || nowIso,
    updated_at: invoice.last_modified_time || nowIso,
  };

  const lineItems: any[] = Array.isArray(invoice.line_items)
    ? invoice.line_items
    : Array.isArray(payload.line_items)
      ? payload.line_items
      : [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const columns = Object.keys(invoiceRecord);
    const values = Object.values(invoiceRecord);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const updates = columns
      .filter((col) => col !== 'zoho_invoice_id')
      .map((col) => `${col} = EXCLUDED.${col}`)
      .join(', ');

    await client.query(
      `INSERT INTO invoices (${columns.join(', ')})
       VALUES (${placeholders})
       ON CONFLICT (zoho_invoice_id) DO UPDATE SET ${updates}`,
      values
    );

    await client.query('DELETE FROM invoice_line_items WHERE zoho_invoice_id = $1', [zohoInvoiceId]);

    if (lineItems.length > 0) {
      for (const item of lineItems) {
        const itemRecord = {
          zoho_invoice_id: zohoInvoiceId,
          zoho_item_id: item.item_id || item.zoho_item_id || null,
          sku: item.sku || item.item_code || null,
          name: item.name || item.item_name || null,
          quantity: coerceNumber(item.quantity),
          rate: coerceNumber(item.rate),
          amount: coerceNumber(item.item_total ?? item.amount ?? item.total),
        };

        const itemColumns = Object.keys(itemRecord);
        const itemValues = Object.values(itemRecord);
        const itemPlaceholders = itemColumns.map((_, i) => `$${i + 1}`).join(', ');

        await client.query(
          `INSERT INTO invoice_line_items (${itemColumns.join(', ')})
           VALUES (${itemPlaceholders})`,
          itemValues
        );
      }
    }

    await client.query('COMMIT');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        invoice_id: zohoInvoiceId,
        line_items: lineItems.length,
      }),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Zoho webhook error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to process invoice webhook',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  } finally {
    client.release();
  }
};
