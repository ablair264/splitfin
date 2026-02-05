import express from 'express';
import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// GET /api/v1/agents
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, name, is_admin, commission_rate, brands, active FROM agents WHERE active = true ORDER BY name ASC'
    );
    res.json({ data: rows });
  } catch (err) {
    logger.error('[Agents] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/agents/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, name, is_admin, commission_rate, brands, active FROM agents WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json({ data: rows[0] });
  } catch (err) {
    logger.error('[Agents] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as agentsRouter };
