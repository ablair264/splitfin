/**
 * Notifications API
 * Handles notification listing and management
 *
 * GET /api/v1/notifications - List notifications (paginated)
 * GET /api/v1/notifications/unread-count - Get unread count
 * PUT /api/v1/notifications/:id/read - Mark single as read
 * PUT /api/v1/notifications/mark-all-read - Mark all as read
 */

import express from 'express';
import { query, insert } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /unread-count - Get unread notification count
 */
router.get('/unread-count', async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { rows } = await query(
      `SELECT COUNT(*)::int as count FROM notifications WHERE agent_id = $1 AND is_read = false`,
      [agentId]
    );

    res.json({ unread_count: rows[0]?.count || 0 });
  } catch (err) {
    logger.error('[Notifications] Unread count error:', err);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

/**
 * PUT /mark-all-read - Mark all notifications as read
 */
router.put('/mark-all-read', async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { rows } = await query(
      `WITH updated AS (
         UPDATE notifications SET is_read = true WHERE agent_id = $1 AND is_read = false RETURNING id
       )
       SELECT COUNT(*)::int as count FROM updated`,
      [agentId]
    );

    res.json({ message: 'All notifications marked as read', count: rows[0]?.count || 0 });
  } catch (err) {
    logger.error('[Notifications] Mark all read error:', err);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

/**
 * PUT /:id/read - Mark single notification as read
 */
router.put('/:id/read', async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const notificationId = parseInt(req.params.id, 10);
    if (isNaN(notificationId)) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    const { rows } = await query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND agent_id = $2 RETURNING id`,
      [notificationId, agentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification marked as read', notification_id: notificationId });
  } catch (err) {
    logger.error('[Notifications] Mark read error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

/**
 * GET / - List notifications (paginated)
 */
router.get('/', async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const unreadOnly = req.query.unread_only === 'true';

    const whereClause = unreadOnly
      ? 'WHERE agent_id = $1 AND is_read = false'
      : 'WHERE agent_id = $1';

    const [notificationsResult, countResult] = await Promise.all([
      query(
        `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [agentId, limit, offset]
      ),
      query(
        `SELECT COUNT(*)::int as count FROM notifications ${whereClause}`,
        [agentId]
      ),
    ]);

    const notifications = notificationsResult.rows;
    const total = countResult.rows[0]?.count || 0;

    res.json({
      notifications,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + notifications.length < total,
      },
    });
  } catch (err) {
    logger.error('[Notifications] List error:', err);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

/**
 * POST / - Create notification (internal use)
 */
router.post('/', async (req, res) => {
  try {
    const notification = await insert('notifications', req.body);
    res.status(201).json({ data: notification });
  } catch (err) {
    logger.error('[Notifications] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as notificationsRouter };
