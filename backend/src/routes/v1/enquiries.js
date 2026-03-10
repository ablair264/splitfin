import express from 'express';
import axios from 'axios';
import { query, getById, insert, update } from '../../config/database.js';
import { getAccessToken, ZOHO_CONFIG } from '../../api/zoho.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

const FROM_EMAIL = process.env.FROM_EMAIL || 'DM Brands <noreply@dmbrands.co.uk>';
const TRADE_PORTAL_URL = process.env.TRADE_PORTAL_URL || 'https://trade.dmbrands.co.uk';

const COLORS = {
  mauve: '#593c4f',
  dustyPink: '#d4b8b8',
  dustyPinkLight: '#e8d5d5',
  footer: '#4a4044',
  textDark: '#593c4f',
  textMuted: '#666666',
};

const BRAND_LOGOS = [
  { name: 'Elvang', url: `${TRADE_PORTAL_URL}/brands/elvang.svg` },
  { name: 'Remember', url: `${TRADE_PORTAL_URL}/brands/remember.svg` },
  { name: 'Relaxound', url: `${TRADE_PORTAL_URL}/brands/relaxound.svg` },
  { name: 'Rader', url: `${TRADE_PORTAL_URL}/brands/rader.svg` },
  { name: 'My Flame', url: `${TRADE_PORTAL_URL}/brands/myflame.svg` },
  { name: 'Ideas', url: `${TRADE_PORTAL_URL}/brands/i4s.svg` },
  { name: 'GEFU', url: `${TRADE_PORTAL_URL}/brands/gefu.svg` },
];

function emailWrapper(content, title) {
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  </head>
  <body style="margin: 0; padding: 0; background-color: #ffffff; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff;">
      <tr>
        <td align="center" style="padding: 40px 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px;">
            <tr>
              <td style="background: linear-gradient(180deg, ${COLORS.dustyPink} 0%, ${COLORS.dustyPinkLight} 100%); border-radius: 16px; padding: 40px 40px 50px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="padding-bottom: 30px;">
                      <img src="${TRADE_PORTAL_URL}/logo-circle.png" alt="DMB" width="100" height="100" style="display: block;">
                    </td>
                  </tr>
                </table>
                ${content}
              </td>
            </tr>
            <tr>
              <td style="padding: 30px 20px; text-align: center;">
                <p style="margin: 0 0 15px; font-size: 15px; font-weight: 600; color: ${COLORS.textDark};">
                  If you received this email in error, you can safely ignore it.
                </p>
                <p style="margin: 0; font-size: 14px; color: ${COLORS.textMuted};">
                  If you require any assistance or have a question.<br>
                  Please call DM Brands on <strong>01905 616 006</strong>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background-color: ${COLORS.footer}; border-radius: 12px; padding: 30px 40px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="color: #ffffff; font-size: 13px; line-height: 1.6;">
                      <p style="margin: 0 0 5px; font-weight: 600;">DM Brands Ltd</p>
                      <p style="margin: 0 0 15px; opacity: 0.9;">79 Waterworks Road, Worcester, WR1 3EZ</p>
                      <p style="margin: 0;">
                        01905 616 006<br>
                        <a href="mailto:sales@dmbrands.co.uk" style="color: #ffffff; opacity: 0.9;">sales@dmbrands.co.uk</a>
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-top: 25px;">
                      <table role="presentation" cellspacing="0" cellpadding="0">
                        <tr>
                          ${BRAND_LOGOS.map(logo => `
                            <td style="padding: 0 6px;">
                              <img src="${logo.url}" alt="${logo.name}" width="36" height="36" style="display: block;">
                            </td>
                          `).join('')}
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

async function sendApprovalEmail(customer, createdBy) {
  try {
    if (!customer?.email) {
      logger.warn('[Enquiries] Approval email not sent: customer has no email');
      return { sent: false, reason: 'missing_email' };
    }

    if (!process.env.RESEND_API_KEY) {
      logger.warn('[Enquiries] Approval email not sent: RESEND_API_KEY not configured');
      return { sent: false, reason: 'email_not_configured' };
    }

    // Generate magic link token
    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    await update('customers', customer.id, {
      magic_link_token: token,
      magic_link_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    });

    const magicLinkUrl = `${TRADE_PORTAL_URL}/auth/magic-link?token=${token}`;
    const customerName = customer.contact_name || null;
    const companyName = customer.company_name || customer.contact_name || '';

    const content = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center" style="padding-bottom: 20px;">
            <h1 style="margin: 0; font-family: 'Comfortaa', 'Trebuchet MS', sans-serif; font-size: 28px; font-weight: 600; color: ${COLORS.mauve};">
              Welcome to DM Brands
            </h1>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center" style="padding-bottom: 25px;">
            <p style="margin: 0 0 15px; font-size: 16px; line-height: 1.6; color: ${COLORS.textDark};">
              ${customerName ? `Hi ${customerName},` : 'Hello,'}<br><br>
              Great news! Your trade account application for<br>
              <strong>${companyName}</strong> has been approved.
            </p>
            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: ${COLORS.textDark};">
              Click the button below to set up your account and start<br>
              browsing our full product catalogue. This link expires in 8 hours.
            </p>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center" style="padding-bottom: 20px;">
            <a href="${magicLinkUrl}"
               style="display: inline-block; background-color: ${COLORS.mauve}; color: #ffffff; padding: 16px 60px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
              Set Up Your Account
            </a>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td style="padding: 20px; background: rgba(255,255,255,0.5); border-radius: 12px;">
            <p style="margin: 0 0 15px; font-size: 14px; font-weight: 600; color: ${COLORS.mauve}; text-align: center;">
              What you can do:
            </p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr><td style="padding: 8px 0; font-size: 14px; color: ${COLORS.textDark};">&#10003; Browse products from all our premium brands</td></tr>
              <tr><td style="padding: 8px 0; font-size: 14px; color: ${COLORS.textDark};">&#10003; View real-time stock availability</td></tr>
              <tr><td style="padding: 8px 0; font-size: 14px; color: ${COLORS.textDark};">&#10003; See your personalised trade pricing</td></tr>
              <tr><td style="padding: 8px 0; font-size: 14px; color: ${COLORS.textDark};">&#10003; Place and track orders online</td></tr>
              <tr><td style="padding: 8px 0; font-size: 14px; color: ${COLORS.textDark};">&#10003; View your order history</td></tr>
            </table>
          </td>
        </tr>
      </table>
    `;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: customer.email,
        subject: 'Your Trade Account Has Been Approved - DM Brands',
        html: emailWrapper(content, 'Account Approved'),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('[Enquiries] Approval email send failed:', errorData);
      return { sent: false, reason: errorData.message || 'send_failed' };
    }

    logger.info(`[Enquiries] Approval email sent to ${customer.email} for customer ${customer.id} by ${createdBy || 'system'}`);
    return { sent: true };
  } catch (err) {
    logger.error('[Enquiries] Approval email error:', err);
    return { sent: false, reason: err.message || 'send_failed' };
  }
}

const ENQUIRY_SORT_COLUMNS = {
  created_at: 'e.created_at',
  updated_at: 'e.updated_at',
  contact_name: 'e.contact_name',
  company_name: 'e.company_name',
  status: 'e.status',
  priority: 'e.priority',
  estimated_value: 'e.estimated_value',
  lead_source: 'e.lead_source',
  enquiry_number: 'e.enquiry_number',
};

// GET /api/v1/enquiries
router.get('/', async (req, res) => {
  try {
    const {
      status, priority, assigned_to, search, lead_source,
      sort_by = 'created_at', sort_order = 'desc',
      limit = 50, offset = 0,
    } = req.query;

    const baseSql = `FROM enquiries e
      LEFT JOIN agents a1 ON a1.id = e.assigned_to
      LEFT JOIN agents a2 ON a2.id = e.created_by
      WHERE e.is_active = true`;

    let conditions = '';
    const params = [];
    let paramIdx = 1;

    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        conditions += ` AND e.status = $${paramIdx++}`;
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        conditions += ` AND e.status = ANY($${paramIdx++}::text[])`;
        params.push(statuses);
      }
    }

    if (priority) {
      const priorities = priority.split(',').map(s => s.trim()).filter(Boolean);
      if (priorities.length === 1) {
        conditions += ` AND e.priority = $${paramIdx++}`;
        params.push(priorities[0]);
      } else if (priorities.length > 1) {
        conditions += ` AND e.priority = ANY($${paramIdx++}::text[])`;
        params.push(priorities);
      }
    }

    if (lead_source) {
      const sources = lead_source.split(',').map(s => s.trim()).filter(Boolean);
      if (sources.length === 1) {
        conditions += ` AND e.lead_source = $${paramIdx++}`;
        params.push(sources[0]);
      } else if (sources.length > 1) {
        conditions += ` AND e.lead_source = ANY($${paramIdx++}::text[])`;
        params.push(sources);
      }
    }

    if (assigned_to) {
      conditions += ` AND e.assigned_to = $${paramIdx++}`;
      params.push(assigned_to);
    }

    if (search) {
      conditions += ` AND (e.contact_name ILIKE $${paramIdx} OR e.company_name ILIKE $${paramIdx} OR e.email ILIKE $${paramIdx} OR e.subject ILIKE $${paramIdx} OR e.enquiry_number ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const col = ENQUIRY_SORT_COLUMNS[sort_by] || 'e.created_at';
    const dir = sort_order === 'asc' ? 'ASC' : 'DESC';
    const lim = Math.min(parseInt(limit) || 50, 200);
    const off = parseInt(offset) || 0;

    const countSql = `SELECT COUNT(*) as total ${baseSql}${conditions}`;
    const dataSql = `SELECT e.*, a1.name as assigned_to_name, a2.name as created_by_name ${baseSql}${conditions} ORDER BY ${col} ${dir} LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(lim, off);

    const countParams = params.slice(0, -2);
    const [countResult, dataResult] = await Promise.all([
      query(countSql, countParams),
      query(dataSql, params),
    ]);

    const total = parseInt(countResult.rows[0].total);
    res.json({
      data: dataResult.rows,
      count: dataResult.rows.length,
      meta: { total, limit: lim, offset: off, has_more: off + lim < total },
    });
  } catch (err) {
    logger.error('[Enquiries] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/enquiries/count
router.get('/count', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT COUNT(*) as count FROM enquiries WHERE is_active = true';
    const params = [];

    if (status) {
      sql += ' AND status = $1';
      params.push(status);
    }

    const { rows } = await query(sql, params);
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    logger.error('[Enquiries] Count error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/enquiries/brands
// Returns distinct brand names from products for brand interest selection
router.get('/brands', async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND brand != '' AND status = 'active' ORDER BY brand ASC"
    );
    res.json({ data: rows.map(r => r.brand) });
  } catch (err) {
    logger.error('[Enquiries] Brands error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/enquiries/lead-sources
router.get('/lead-sources', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT lead_source, COUNT(*) as count
       FROM enquiries WHERE is_active = true AND lead_source IS NOT NULL
       GROUP BY lead_source ORDER BY count DESC`
    );
    res.json({ data: rows });
  } catch (err) {
    logger.error('[Enquiries] Lead sources error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/enquiries/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT e.*,
        a1.name as assigned_to_name,
        a2.name as created_by_name
        FROM enquiries e
        LEFT JOIN agents a1 ON a1.id = e.assigned_to
        LEFT JOIN agents a2 ON a2.id = e.created_by
        WHERE e.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }
    res.json({ data: rows[0] });
  } catch (err) {
    logger.error('[Enquiries] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/enquiries
router.post('/', async (req, res) => {
  try {
    // Set created_by from JWT if not provided
    const data = { ...req.body };
    if (!data.created_by && req.agent?.id) {
      data.created_by = req.agent.id;
    }
    if (!data.assigned_to && req.agent?.id) {
      data.assigned_to = req.agent.id;
    }

    const enquiry = await insert('enquiries', data);
    res.status(201).json({ data: enquiry });
  } catch (err) {
    logger.error('[Enquiries] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/enquiries/:id
router.put('/:id', async (req, res) => {
  try {
    const data = { ...req.body, updated_at: new Date().toISOString() };
    const enquiry = await update('enquiries', req.params.id, data);
    if (!enquiry) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }
    res.json({ data: enquiry });
  } catch (err) {
    logger.error('[Enquiries] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/v1/enquiries/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    const enquiry = await update('enquiries', req.params.id, {
      status,
    });
    if (!enquiry) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }
    res.json({ data: enquiry });
  } catch (err) {
    logger.error('[Enquiries] Status update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/enquiries/:id (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const enquiry = await update('enquiries', req.params.id, {
      is_active: false,
      updated_at: new Date().toISOString()
    });
    if (!enquiry) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }
    res.json({ data: enquiry });
  } catch (err) {
    logger.error('[Enquiries] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/enquiries/:id/activities
router.post('/:id/activities', async (req, res) => {
  try {
    const data = {
      enquiry_id: parseInt(req.params.id),
      activity_type: req.body.activity_type || 'note',
      description: req.body.description,
      created_by: req.body.created_by || req.agent?.id,
    };
    const activity = await insert('enquiry_activities', data);
    res.status(201).json({ data: activity });
  } catch (err) {
    logger.error('[Enquiries] Add activity error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/enquiries/:id/activities
router.get('/:id/activities', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ea.*, a.name as created_by_name
       FROM enquiry_activities ea
       LEFT JOIN agents a ON a.id = ea.created_by
       WHERE ea.enquiry_id = $1
       ORDER BY ea.created_at DESC`,
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (err) {
    logger.error('[Enquiries] Get activities error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/enquiries/:id/approve - Approve enquiry and create customer
router.post('/:id/approve', async (req, res) => {
  try {
    // 1. Fetch enquiry
    const { rows: enquiryRows } = await query(
      'SELECT * FROM enquiries WHERE id = $1 AND is_active = true',
      [req.params.id]
    );
    if (enquiryRows.length === 0) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }
    const enquiry = enquiryRows[0];

    if (enquiry.converted_to_customer) {
      return res.status(400).json({ error: 'Enquiry already converted to customer' });
    }

    // 2. Create contact in Zoho Inventory
    const token = await getAccessToken();
    const zohoPayload = {
      contact_name: enquiry.company_name || enquiry.contact_name,
      company_name: enquiry.company_name || enquiry.contact_name,
      contact_type: 'customer',
      customer_sub_type: 'business',
      contact_persons: [{
        first_name: enquiry.contact_name,
        email: enquiry.email,
        phone: enquiry.phone || '',
        is_primary_contact: true
      }]
    };

    const zohoResponse = await axios.post(
      `${ZOHO_CONFIG.baseUrls.inventory}/contacts`,
      zohoPayload,
      {
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
          'X-com-zoho-inventory-organizationid': ZOHO_CONFIG.orgId,
        },
        timeout: 15000,
      }
    );

    const zohoContact = zohoResponse.data?.contact;
    if (!zohoContact?.contact_id) {
      throw new Error('Failed to create contact in Zoho - no contact_id returned');
    }

    // 3. Insert into customers table
    const customerData = {
      zoho_contact_id: zohoContact.contact_id,
      company_name: enquiry.company_name || enquiry.contact_name,
      contact_name: enquiry.contact_name,
      email: enquiry.email,
      phone: enquiry.phone,
      status: 'active',
      pin_hash: '$DEFAULT_PIN_1234$',
      force_change_pin: true,
      sync_status: 'synced',
    };
    const customer = await insert('customers', customerData);

    // 4. Update enquiry as converted
    await update('enquiries', req.params.id, {
      converted_to_customer: true,
      converted_customer_id: customer.id,
      conversion_date: new Date().toISOString().slice(0, 10),
      status: 'won',
    });

    // 5. Log activity
    await insert('enquiry_activities', {
      enquiry_id: parseInt(req.params.id),
      activity_type: 'status_change',
      description: `Approved and converted to customer (Zoho ID: ${zohoContact.contact_id})`,
      created_by: req.agent?.id,
    });

    // 6. Send approval welcome email with magic link (best effort)
    const emailResult = await sendApprovalEmail(customer, req.agent?.id);
    if (!emailResult.sent) {
      await insert('enquiry_activities', {
        enquiry_id: parseInt(req.params.id),
        activity_type: 'note',
        description: `Approval email not sent (${emailResult.reason || 'unknown'})`,
        created_by: req.agent?.id,
      });
    } else {
      await insert('enquiry_activities', {
        enquiry_id: parseInt(req.params.id),
        activity_type: 'note',
        description: 'Approval welcome email with magic link sent to customer.',
        created_by: req.agent?.id,
      });
    }

    res.json({
      data: {
        customer,
        zoho_contact_id: zohoContact.contact_id,
        magic_link_sent: emailResult.sent,
        magic_link_reason: emailResult.sent ? null : emailResult.reason || 'unknown',
      },
    });
  } catch (err) {
    logger.error('[Enquiries] Approve error:', err);
    const message = err.response?.data?.message || err.message || 'Failed to approve enquiry';
    res.status(500).json({ error: message });
  }
});

export { router as enquiriesRouter };
