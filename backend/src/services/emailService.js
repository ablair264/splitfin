// server/src/services/emailService.js
import postmark from 'postmark';
import { logger } from '../utils/logger.js';

// Initialize Postmark client
const client = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN);

const FROM_EMAIL = process.env.FROM_EMAIL || 'DM Brands <noreply@dmbrands.co.uk>';

/**
 * Send an invoice payment reminder email via Resend.
 */
export async function sendInvoiceReminder({ to, cc, subject, invoice, customer, customMessage }) {
  if (!process.env.RESEND_API_KEY) {
    logger.warn('[Email] RESEND_API_KEY not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const fmtCurrency = (v) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: invoice.currency_code || 'GBP' }).format(v || 0);
  const fmtDate = (d) => {
    if (!d) return 'N/A';
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d));
  };

  const isOverdue = invoice.due_date && new Date(invoice.due_date) < new Date() && invoice.balance > 0;
  const daysOverdue = isOverdue ? Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / 86400000) : 0;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
<tr><td style="background-color:#0f172a;padding:24px 32px;">
  <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">DM Brands</h1>
  <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Payment Reminder</p>
</td></tr>
<tr><td style="padding:32px;">
  <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Dear ${customer?.contact_name || customer?.company_name || 'Customer'},</p>
  <p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.6;">This is a friendly reminder regarding the following invoice${isOverdue ? ', which is now <strong style="color:#ef4444;">overdue</strong>' : ''}:</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
  <tr><td style="padding:20px;"><table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding:4px 0;color:#64748b;font-size:13px;">Invoice Number</td><td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;text-align:right;">${invoice.invoice_number}</td></tr>
    <tr><td style="padding:4px 0;color:#64748b;font-size:13px;">Invoice Date</td><td style="padding:4px 0;color:#0f172a;font-size:13px;text-align:right;">${fmtDate(invoice.invoice_date)}</td></tr>
    <tr><td style="padding:4px 0;color:#64748b;font-size:13px;">Due Date</td><td style="padding:4px 0;color:${isOverdue ? '#ef4444' : '#0f172a'};font-size:13px;font-weight:${isOverdue ? '600' : '400'};text-align:right;">${fmtDate(invoice.due_date)}${daysOverdue > 0 ? ` (${daysOverdue} days overdue)` : ''}</td></tr>
    <tr><td style="padding:4px 0;color:#64748b;font-size:13px;">Total Amount</td><td style="padding:4px 0;color:#0f172a;font-size:13px;text-align:right;">${fmtCurrency(invoice.total)}</td></tr>
    <tr><td colspan="2" style="padding:8px 0 4px;border-top:1px solid #e2e8f0;"></td></tr>
    <tr><td style="padding:4px 0;color:#0f172a;font-size:15px;font-weight:700;">Amount Due</td><td style="padding:4px 0;color:${isOverdue ? '#ef4444' : '#0f172a'};font-size:15px;font-weight:700;text-align:right;">${fmtCurrency(invoice.balance)}</td></tr>
  </table></td></tr></table>
  ${customMessage ? `<div style="background-color:#f0f9ff;border-left:3px solid #0ea5e9;padding:12px 16px;margin-bottom:24px;border-radius:0 4px 4px 0;"><p style="margin:0;color:#334155;font-size:14px;line-height:1.6;">${customMessage.replace(/\n/g, '<br>')}</p></div>` : ''}
  <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.6;">Please arrange payment at your earliest convenience. If you have already made the payment, please disregard this reminder.</p>
  <p style="margin:24px 0 0;color:#334155;font-size:15px;line-height:1.6;">Kind regards,<br><strong>DM Brands</strong></p>
</td></tr>
<tr><td style="background-color:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
  <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">This is an automated reminder from DM Brands. Please do not reply to this email.</p>
</td></tr>
</table></td></tr></table></body></html>`;

  try {
    const payload = { from: FROM_EMAIL, to, subject, html };
    if (cc) payload.cc = cc;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      logger.error('[Email] Resend error:', data);
      return { success: false, error: data.message || 'Send failed' };
    }

    logger.info(`[Email] Reminder sent to ${to} for invoice ${invoice.invoice_number}`);
    return { success: true, message_id: data.id };
  } catch (err) {
    logger.error('[Email] Send error:', err);
    return { success: false, error: err.message || 'Send failed' };
  }
}

export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const result = await client.sendEmail({
      From: process.env.EMAIL_FROM || 'sales@dmbrands.co.uk',
      To: to,
      Subject: subject,
      HtmlBody: html,
      TextBody: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      MessageStream: 'outbound'
    });
    
    console.log(`Email sent successfully to ${to}, MessageID: ${result.MessageID}`);
    return { 
      success: true, 
      messageId: result.MessageID 
    };
    
  } catch (error) {
    console.error('Postmark error:', error);
    
    if (error.ErrorCode) {
      console.error(`Postmark Error Code: ${error.ErrorCode}`);
      console.error(`Postmark Message: ${error.Message}`);
    }
    
    throw error;
  }
};

// Optional: Send with template
export const sendEmailWithTemplate = async ({ to, templateAlias, templateModel }) => {
  try {
    const result = await client.sendEmailWithTemplate({
      From: process.env.EMAIL_FROM || 'sales@dmbrands.co.uk',
      To: to,
      TemplateAlias: templateAlias,
      TemplateModel: templateModel,
      MessageStream: 'outbound'
    });
    
    console.log(`Template email sent to ${to}, MessageID: ${result.MessageID}`);
    return { 
      success: true, 
      messageId: result.MessageID 
    };
    
  } catch (error) {
    console.error('Postmark template error:', error);
    throw error;
  }
};

// Optional: Batch sending
export const sendBulkEmails = async (emails) => {
  try {
    const messages = emails.map(({ to, subject, html, text }) => ({
      From: process.env.EMAIL_FROM || 'sales@dmbrands.co.uk',
      To: to,
      Subject: subject,
      HtmlBody: html,
      TextBody: text || html.replace(/<[^>]*>/g, ''),
      MessageStream: 'outbound'
    }));
    
    const results = await client.sendEmailBatch(messages);
    
    console.log(`Bulk emails sent: ${results.length} emails`);
    return { 
      success: true, 
      count: results.length,
      results 
    };
    
  } catch (error) {
    console.error('Postmark bulk error:', error);
    throw error;
  }
};