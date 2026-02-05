/**
 * Messages API
 * Handles messaging between agents and admins
 *
 * GET /api/v1/messages/conversations - List user's conversations
 * GET /api/v1/messages/conversations/:id - Get conversation with messages
 * POST /api/v1/messages/conversations - Start new conversation
 * POST /api/v1/messages/conversations/:id/messages - Send message
 * PUT /api/v1/messages/conversations/:id/read - Mark as read
 * GET /api/v1/messages/unread-count - Total unread count (messages + broadcasts)
 * GET /api/v1/messages/contacts - Available contacts to message
 * GET /api/v1/messages/broadcasts - List broadcast messages
 * POST /api/v1/messages/broadcasts - Send broadcast (admin only)
 * PUT /api/v1/messages/broadcasts/:id/read - Mark broadcast as read
 */

import express from 'express';
import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// Admin IDs - these users have admin privileges
const ADMIN_IDS = ['tony', 'blair'];

function isAdmin(agentId) {
  return ADMIN_IDS.includes(agentId?.toLowerCase());
}

// ============================================
// CONTACTS
// ============================================

/**
 * GET /contacts - Get available contacts
 */
router.get('/contacts', async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userIsAdmin = isAdmin(agentId);
    const { rows } = await query(
      `SELECT id, name FROM agents WHERE active = true AND id != $1`,
      [agentId]
    );

    // Filter based on admin status
    const contacts = rows
      .map(r => ({ ...r, is_admin: isAdmin(r.id) }))
      .filter(c => userIsAdmin ? !c.is_admin : c.is_admin);

    res.json({ contacts });
  } catch (err) {
    logger.error('[Messages] Get contacts error:', err);
    res.status(500).json({ error: 'Failed to get contacts' });
  }
});

// ============================================
// UNREAD COUNT
// ============================================

/**
 * GET /unread-count - Total unread count
 */
router.get('/unread-count', async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userIsAdmin = isAdmin(agentId);
    const field = userIsAdmin ? 'admin_unread_count' : 'agent_unread_count';
    const whereClause = userIsAdmin ? 'admin_id = $1' : 'agent_id = $1';

    const [messageResult, broadcastResult] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(${field}), 0)::int as total FROM conversations WHERE ${whereClause}`,
        [agentId]
      ),
      userIsAdmin
        ? Promise.resolve({ rows: [{ count: 0 }] })
        : query(
            `SELECT COUNT(*)::int as count
             FROM broadcast_messages b
             WHERE NOT EXISTS (
               SELECT 1 FROM broadcast_reads br
               WHERE br.broadcast_id = b.id AND br.agent_id = $1
             )`,
            [agentId]
          ),
    ]);

    const messageCount = messageResult.rows[0]?.total || 0;
    const broadcastCount = broadcastResult.rows[0]?.count || 0;

    res.json({
      messages: messageCount,
      broadcasts: broadcastCount,
      total: messageCount + broadcastCount,
    });
  } catch (err) {
    logger.error('[Messages] Unread count error:', err);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// ============================================
// CONVERSATIONS
// ============================================

/**
 * GET /conversations - List conversations
 */
router.get('/conversations', async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const userIsAdmin = isAdmin(agentId);

    const whereClause = userIsAdmin ? 'WHERE c.admin_id = $1' : 'WHERE c.agent_id = $1';
    const joinField = userIsAdmin ? 'c.agent_id' : 'c.admin_id';

    const [conversationsResult, countResult] = await Promise.all([
      query(
        `SELECT c.*,
                a.name as other_name,
                (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_content
         FROM conversations c
         JOIN agents a ON a.id = ${joinField}
         ${whereClause}
         ORDER BY c.last_message_at DESC NULLS LAST
         LIMIT $2 OFFSET $3`,
        [agentId, limit, offset]
      ),
      query(
        `SELECT COUNT(*)::int as count FROM conversations c ${whereClause}`,
        [agentId]
      ),
    ]);

    const conversations = conversationsResult.rows.map(c => ({
      ...c,
      other_user_name: c.other_name,
      last_message: c.last_content,
    }));
    const total = countResult.rows[0]?.count || 0;

    res.json({
      conversations,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + conversations.length < total,
      },
    });
  } catch (err) {
    logger.error('[Messages] List conversations error:', err);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

/**
 * POST /conversations - Start new conversation
 */
router.post('/conversations', async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { recipient_id } = req.body;
    if (!recipient_id) {
      return res.status(400).json({ error: 'recipient_id is required' });
    }

    const currentIsAdmin = isAdmin(agentId);
    const recipientIsAdmin = isAdmin(recipient_id);

    // Enforce agent-admin restriction
    if (currentIsAdmin === recipientIsAdmin) {
      return res.status(403).json({
        error: currentIsAdmin
          ? 'Admins can only message regular agents'
          : 'Agents can only message admin users',
      });
    }

    // Determine which is agent and which is admin
    const agentUserId = currentIsAdmin ? recipient_id : agentId;
    const adminUserId = currentIsAdmin ? agentId : recipient_id;

    // Try to find existing conversation
    const { rows: existing } = await query(
      `SELECT * FROM conversations WHERE agent_id = $1 AND admin_id = $2`,
      [agentUserId, adminUserId]
    );

    if (existing.length > 0) {
      return res.json({ conversation: existing[0] });
    }

    // Create new conversation
    const { rows: created } = await query(
      `INSERT INTO conversations (agent_id, admin_id)
       VALUES ($1, $2)
       RETURNING *`,
      [agentUserId, adminUserId]
    );

    res.json({ conversation: created[0] });
  } catch (err) {
    logger.error('[Messages] Create conversation error:', err);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/**
 * GET /conversations/:id - Get conversation with messages
 */
router.get('/conversations/:id', async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const conversationId = parseInt(req.params.id, 10);
    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    const userIsAdmin = isAdmin(agentId);
    const joinField = userIsAdmin ? 'c.agent_id' : 'c.admin_id';

    // Get conversation and verify access
    const { rows: convRows } = await query(
      `SELECT c.*,
              a.name as other_name
       FROM conversations c
       JOIN agents a ON a.id = ${joinField}
       WHERE c.id = $1 AND (c.agent_id = $2 OR c.admin_id = $2)`,
      [conversationId, agentId]
    );

    if (convRows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conversation = {
      ...convRows[0],
      other_user_name: convRows[0].other_name,
    };

    // Get messages
    const { rows: messageRows } = await query(
      `SELECT m.*,
              a.name as sender_name
       FROM messages m
       JOIN agents a ON a.id = m.sender_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );

    // Get attachments for messages
    const messageIds = messageRows.map(m => m.id);
    let attachments = [];
    if (messageIds.length > 0) {
      const { rows: attachRows } = await query(
        `SELECT * FROM message_attachments WHERE message_id = ANY($1)`,
        [messageIds]
      );
      attachments = attachRows;
    }

    // Group attachments by message
    const attachmentsByMessage = new Map();
    for (const att of attachments) {
      const existing = attachmentsByMessage.get(att.message_id) || [];
      existing.push(att);
      attachmentsByMessage.set(att.message_id, existing);
    }

    // Reverse to get chronological order
    const messages = messageRows.reverse().map(m => ({
      ...m,
      attachments: attachmentsByMessage.get(m.id) || [],
    }));

    res.json({ conversation, messages });
  } catch (err) {
    logger.error('[Messages] Get conversation error:', err);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * POST /conversations/:id/messages - Send message
 */
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const conversationId = parseInt(req.params.id, 10);
    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const { content, attachments = [] } = req.body;
    if (!content && attachments.length === 0) {
      return res.status(400).json({ error: 'Message must have content or attachments' });
    }

    // Verify sender has access to conversation
    const { rows: convRows } = await query(
      `SELECT * FROM conversations WHERE id = $1 AND (agent_id = $2 OR admin_id = $2)`,
      [conversationId, agentId]
    );

    if (convRows.length === 0) {
      return res.status(403).json({ error: 'Cannot send message to this conversation' });
    }

    const senderIsAdmin = isAdmin(agentId);

    // Insert message
    const { rows: messageRows } = await query(
      `INSERT INTO messages (conversation_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [conversationId, agentId, content || null]
    );

    const message = messageRows[0];

    // Insert attachments
    const messageAttachments = [];
    for (const att of attachments) {
      const { rows: attRows } = await query(
        `INSERT INTO message_attachments (message_id, file_type, file_name, file_url, file_size, mime_type)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [message.id, att.file_type, att.file_name, att.file_url, att.file_size || null, att.mime_type || null]
      );
      messageAttachments.push(attRows[0]);
    }

    // Update conversation
    const unreadField = senderIsAdmin ? 'agent_unread_count' : 'admin_unread_count';
    await query(
      `UPDATE conversations
       SET last_message_at = NOW(), ${unreadField} = ${unreadField} + 1
       WHERE id = $1`,
      [conversationId]
    );

    res.json({ message: { ...message, attachments: messageAttachments } });
  } catch (err) {
    logger.error('[Messages] Send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * PUT /conversations/:id/read - Mark conversation as read
 */
router.put('/conversations/:id/read', async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const conversationId = parseInt(req.params.id, 10);
    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const userIsAdmin = isAdmin(agentId);
    const unreadField = userIsAdmin ? 'admin_unread_count' : 'agent_unread_count';

    // Reset unread count
    const { rows } = await query(
      `UPDATE conversations SET ${unreadField} = 0 WHERE id = $1 AND (agent_id = $2 OR admin_id = $2) RETURNING id`,
      [conversationId, agentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Mark messages as read
    await query(
      `UPDATE messages
       SET is_read = TRUE, read_at = NOW()
       WHERE conversation_id = $1 AND sender_id != $2 AND is_read = FALSE`,
      [conversationId, agentId]
    );

    res.json({ message: 'Conversation marked as read' });
  } catch (err) {
    logger.error('[Messages] Mark read error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// ============================================
// BROADCASTS
// ============================================

/**
 * GET /broadcasts - List broadcasts
 */
router.get('/broadcasts', async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const [broadcastsResult, countResult] = await Promise.all([
      query(
        `SELECT b.*,
                a.name as sender_name
         FROM broadcast_messages b
         JOIN agents a ON a.id = b.sender_id
         ORDER BY b.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query(`SELECT COUNT(*)::int as count FROM broadcast_messages`),
    ]);

    const broadcasts = broadcastsResult.rows;
    const total = countResult.rows[0]?.count || 0;

    // Get read status for non-admin users
    const userIsAdmin = isAdmin(agentId);
    let readBroadcastIds = new Set();
    if (!userIsAdmin && broadcasts.length > 0) {
      const broadcastIds = broadcasts.map(b => b.id);
      const { rows: readRows } = await query(
        `SELECT broadcast_id FROM broadcast_reads WHERE agent_id = $1 AND broadcast_id = ANY($2)`,
        [agentId, broadcastIds]
      );
      readBroadcastIds = new Set(readRows.map(r => r.broadcast_id));
    }

    // Get attachments
    const broadcastIds = broadcasts.map(b => b.id);
    let attachments = [];
    if (broadcastIds.length > 0) {
      const { rows: attachRows } = await query(
        `SELECT * FROM broadcast_attachments WHERE broadcast_id = ANY($1)`,
        [broadcastIds]
      );
      attachments = attachRows;
    }

    // Group attachments
    const attachmentsByBroadcast = new Map();
    for (const att of attachments) {
      const existing = attachmentsByBroadcast.get(att.broadcast_id) || [];
      existing.push(att);
      attachmentsByBroadcast.set(att.broadcast_id, existing);
    }

    res.json({
      broadcasts: broadcasts.map(b => ({
        ...b,
        is_read: userIsAdmin ? true : readBroadcastIds.has(b.id),
        attachments: attachmentsByBroadcast.get(b.id) || [],
      })),
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + broadcasts.length < total,
      },
    });
  } catch (err) {
    logger.error('[Messages] List broadcasts error:', err);
    res.status(500).json({ error: 'Failed to list broadcasts' });
  }
});

/**
 * POST /broadcasts - Send broadcast (admin only)
 */
router.post('/broadcasts', async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isAdmin(agentId)) {
      return res.status(403).json({ error: 'Only admins can send broadcasts' });
    }

    const { content, attachments = [] } = req.body;
    if (!content && attachments.length === 0) {
      return res.status(400).json({ error: 'Broadcast must have content or attachments' });
    }

    // Insert broadcast
    const { rows: broadcastRows } = await query(
      `INSERT INTO broadcast_messages (sender_id, content)
       VALUES ($1, $2)
       RETURNING *`,
      [agentId, content || null]
    );

    const broadcast = broadcastRows[0];

    // Insert attachments
    const broadcastAttachments = [];
    for (const att of attachments) {
      const { rows: attRows } = await query(
        `INSERT INTO broadcast_attachments (broadcast_id, file_type, file_name, file_url, file_size, mime_type)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [broadcast.id, att.file_type, att.file_name, att.file_url, att.file_size || null, att.mime_type || null]
      );
      broadcastAttachments.push(attRows[0]);
    }

    res.json({ broadcast: { ...broadcast, attachments: broadcastAttachments } });
  } catch (err) {
    logger.error('[Messages] Send broadcast error:', err);
    res.status(500).json({ error: 'Failed to send broadcast' });
  }
});

/**
 * PUT /broadcasts/:id/read - Mark broadcast as read
 */
router.put('/broadcasts/:id/read', async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Admins don't need to mark as read
    if (isAdmin(agentId)) {
      return res.json({ message: 'Broadcast marked as read' });
    }

    const broadcastId = parseInt(req.params.id, 10);
    if (isNaN(broadcastId)) {
      return res.status(400).json({ error: 'Invalid broadcast ID' });
    }

    await query(
      `INSERT INTO broadcast_reads (broadcast_id, agent_id)
       VALUES ($1, $2)
       ON CONFLICT (broadcast_id, agent_id) DO NOTHING`,
      [broadcastId, agentId]
    );

    res.json({ message: 'Broadcast marked as read' });
  } catch (err) {
    logger.error('[Messages] Mark broadcast read error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

export { router as messagesRouter };
