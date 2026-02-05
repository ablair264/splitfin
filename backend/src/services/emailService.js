// server/src/services/emailService.js
import postmark from 'postmark';

// Initialize Postmark client
const client = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN);

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