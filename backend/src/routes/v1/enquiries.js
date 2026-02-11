import express from 'express';
import axios from 'axios';
import { query, getById, insert, update } from '../../config/database.js';
import { getAccessToken, ZOHO_CONFIG } from '../../api/zoho.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// GET /api/v1/enquiries
router.get('/', async (req, res) => {
  try {
    const { status, priority, assigned_to, search, limit = 100, offset = 0 } = req.query;

    let sql = `SELECT e.*,
      a1.name as assigned_to_name,
      a2.name as created_by_name
      FROM enquiries e
      LEFT JOIN agents a1 ON a1.id = e.assigned_to
      LEFT JOIN agents a2 ON a2.id = e.created_by
      WHERE e.is_active = true`;
    const params = [];
    let paramIdx = 1;

    if (status) {
      sql += ` AND e.status = $${paramIdx++}`;
      params.push(status);
    }

    if (priority) {
      sql += ` AND e.priority = $${paramIdx++}`;
      params.push(priority);
    }

    if (assigned_to) {
      sql += ` AND e.assigned_to = $${paramIdx++}`;
      params.push(assigned_to);
    }

    if (search) {
      sql += ` AND (e.contact_name ILIKE $${paramIdx} OR e.company_name ILIKE $${paramIdx} OR e.email ILIKE $${paramIdx} OR e.subject ILIKE $${paramIdx} OR e.enquiry_number ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    sql += ` ORDER BY e.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await query(sql, params);
    res.json({ data: rows, count: rows.length });
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

    res.json({ data: { customer, zoho_contact_id: zohoContact.contact_id } });
  } catch (err) {
    logger.error('[Enquiries] Approve error:', err);
    const message = err.response?.data?.message || err.message || 'Failed to approve enquiry';
    res.status(500).json({ error: message });
  }
});

export { router as enquiriesRouter };
