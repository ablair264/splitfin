import { query } from '../config/database.js';
import { sendInvoiceReminder } from './emailService.js';
import { logger } from '../utils/logger.js';

/**
 * Process automatic invoice reminders.
 * Checks all invoices with balance > 0 against customer reminder settings.
 * Deduplicates via invoice_reminder_log (no repeat for same invoice + same calendar day).
 */
export async function processAutoReminders() {
  logger.info('[Reminder Cron] Starting auto-reminder processing');

  try {
    // Get all unpaid invoices with customer email
    const { rows: invoices } = await query(`
      SELECT i.*, c.id as customer_db_id, c.email as customer_email, c.contact_name, c.company_name,
             a.id as agent_user_id, a.name as agent_name
      FROM invoices i
      LEFT JOIN customers c ON c.zoho_contact_id = i.zoho_customer_id
      LEFT JOIN agents a ON a.id = i.agent_id
      WHERE i.balance > 0
        AND i.status NOT IN ('void', 'paid')
        AND c.email IS NOT NULL
        AND c.email != ''
      ORDER BY i.due_date ASC
    `);

    if (invoices.length === 0) {
      logger.info('[Reminder Cron] No unpaid invoices with customer emails found');
      return { sent: 0, skipped: 0 };
    }

    let sent = 0;
    let skipped = 0;

    for (const inv of invoices) {
      try {
        // Get customer reminder settings (or defaults)
        const { rows: settingsRows } = await query(
          'SELECT * FROM invoice_reminder_settings WHERE customer_id = $1 LIMIT 1',
          [inv.customer_db_id]
        );

        const settings = settingsRows[0] || {
          is_enabled: true,
          days_before_due: [7, 3, 1],
          days_after_due: [1, 7, 14, 30],
          max_reminders: 5,
          cc_agent: true,
          custom_message: null,
        };

        if (!settings.is_enabled) {
          skipped++;
          continue;
        }

        // Check max reminders
        const { rows: [{ count: reminderCount }] } = await query(
          'SELECT COUNT(*) as count FROM invoice_reminder_log WHERE invoice_id = $1',
          [inv.id]
        );
        if (parseInt(reminderCount) >= settings.max_reminders) {
          skipped++;
          continue;
        }

        // Check if already sent today
        const { rows: [{ count: todayCount }] } = await query(
          "SELECT COUNT(*) as count FROM invoice_reminder_log WHERE invoice_id = $1 AND created_at::date = CURRENT_DATE",
          [inv.id]
        );
        if (parseInt(todayCount) > 0) {
          skipped++;
          continue;
        }

        // Calculate days until/past due
        if (!inv.due_date) {
          skipped++;
          continue;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDate = new Date(inv.due_date);
        dueDate.setHours(0, 0, 0, 0);
        const daysDiff = Math.round((dueDate - today) / 86400000);

        let shouldSend = false;
        let reminderType = 'auto_before_due';

        if (daysDiff > 0) {
          // Before due date
          const daysBeforeDue = settings.days_before_due || [7, 3, 1];
          shouldSend = daysBeforeDue.includes(daysDiff);
          reminderType = 'auto_before_due';
        } else if (daysDiff <= 0) {
          // On or after due date
          const daysAfterDue = settings.days_after_due || [1, 7, 14, 30];
          shouldSend = daysAfterDue.includes(Math.abs(daysDiff));
          reminderType = 'auto_after_due';
        }

        if (!shouldSend) {
          skipped++;
          continue;
        }

        // Send the reminder
        const subject = daysDiff < 0
          ? `Overdue: Invoice ${inv.invoice_number} - ${Math.abs(daysDiff)} days past due`
          : `Upcoming: Invoice ${inv.invoice_number} due in ${daysDiff} day${daysDiff !== 1 ? 's' : ''}`;

        const ccEmail = settings.cc_agent && inv.agent_user_id
          ? await getAgentEmail(inv.agent_user_id)
          : null;

        const result = await sendInvoiceReminder({
          to: inv.customer_email,
          cc: ccEmail || undefined,
          subject,
          invoice: inv,
          customer: { contact_name: inv.contact_name, company_name: inv.company_name },
          customMessage: settings.custom_message,
        });

        // Log
        await query(
          `INSERT INTO invoice_reminder_log (invoice_id, customer_id, reminder_type, sent_to, cc_to, subject, resend_message_id, status, error)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            inv.id,
            inv.customer_db_id,
            reminderType,
            inv.customer_email,
            ccEmail || null,
            subject,
            result.message_id || null,
            result.success ? 'sent' : 'failed',
            result.error || null,
          ]
        );

        if (result.success) {
          sent++;
          logger.info(`[Reminder Cron] Sent reminder for ${inv.invoice_number} to ${inv.customer_email}`);
        } else {
          logger.warn(`[Reminder Cron] Failed to send for ${inv.invoice_number}: ${result.error}`);
        }
      } catch (invErr) {
        logger.error(`[Reminder Cron] Error processing invoice ${inv.id}:`, invErr);
        skipped++;
      }
    }

    logger.info(`[Reminder Cron] Complete: ${sent} sent, ${skipped} skipped`);
    return { sent, skipped };
  } catch (err) {
    logger.error('[Reminder Cron] Fatal error:', err);
    return { sent: 0, skipped: 0, error: err.message };
  }
}

async function getAgentEmail(agentId) {
  // Agents table doesn't have email - return null
  // If agent emails are added later, query them here
  return null;
}
