import express from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRY = '24h';

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const { agent_id, pin } = req.body;

    if (!agent_id || !pin) {
      return res.status(400).json({ error: 'agent_id and pin are required' });
    }

    const { rows } = await query(
      'SELECT id, name, pin, is_admin, commission_rate, brands, active FROM agents WHERE id = $1',
      [agent_id]
    );

    const agent = rows[0];
    if (!agent) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!agent.active) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    // Simple PIN comparison (in production, use bcrypt for pin_hash)
    if (agent.pin !== pin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        agent_id: agent.id,
        name: agent.name,
        is_admin: agent.is_admin,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    const { pin: _pin, ...agentData } = agent;

    res.json({
      token,
      agent: agentData,
    });
  } catch (err) {
    logger.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/auth/me
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    const { rows } = await query(
      'SELECT id, name, is_admin, commission_rate, brands, active FROM agents WHERE id = $1',
      [decoded.agent_id]
    );

    const agent = rows[0];
    if (!agent || !agent.active) {
      return res.status(401).json({ error: 'Invalid or inactive agent' });
    }

    res.json({ agent });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    logger.error('[Auth] Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as authRouter };
