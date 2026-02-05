// server/src/routes/email.js
import express from 'express';
import postmark from 'postmark';

const router = express.Router();

// Initialize Postmark client
const client = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN || 'be720a82-b526-482d-a9dd-c9a8357999ac');

router.post('/send-login-details', async (req, res) => {
  try {
    const { email, password, customerName } = req.body;
    
    const emailData = {
      From: process.env.POSTMARK_FROM_EMAIL || 'noreply@splitfin.com',
      To: email,
      Subject: 'Your Splitfin Account Has Been Created',
      HtmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1f2a;">Welcome to Splitfin!</h1>
          <p>Dear ${customerName},</p>
          <p>Your account has been created successfully. You can now log in to track your orders and manage your account.</p>
          
          <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #1a1f2a; margin-top: 0;">Your Login Details</h2>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Temporary Password:</strong> ${password}</p>
          </div>
          
          <p>For security reasons, please change your password after your first login.</p>
          
          <div style="margin: 30px 0;">
            <a href="${process.env.APP_URL}/customer/login" 
               style="background: #79d5e9; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Login to Your Account
            </a>
          </div>
          
          <p>If you have any questions, please don't hesitate to contact our support team.</p>
          
          <p>Best regards,<br>The Splitfin Team</p>
        </div>
      `,
      TextBody: `
        Welcome to Splitfin!
        
        Dear ${customerName},
        
        Your account has been created successfully. You can now log in to track your orders and manage your account.
        
        Your Login Details:
        Email: ${email}
        Temporary Password: ${password}
        
        For security reasons, please change your password after your first login.
        
        Login to your account: ${process.env.APP_URL}/customer/login
        
        If you have any questions, please don't hesitate to contact our support team.
        
        Best regards,
        The Splitfin Team
      `,
      MessageStream: 'outbound'
    };
    
    const result = await client.sendEmail(emailData);
    
    res.json({ 
      success: true, 
      message: 'Login details sent successfully',
      messageId: result.MessageID 
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Optional: Send order confirmation email
router.post('/send-order-confirmation', async (req, res) => {
  try {
    const { email, customerName, orderNumber, orderTotal, items } = req.body;
    
    const itemsHtml = items.map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.product.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.qty}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">£${item.total.toFixed(2)}</td>
      </tr>
    `).join('');
    
    const emailData = {
      From: process.env.POSTMARK_FROM_EMAIL || 'orders@splitfin.com',
      To: email,
      Subject: `Order Confirmation - ${orderNumber}`,
      HtmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1f2a;">Order Confirmation</h1>
          <p>Dear ${customerName},</p>
          <p>Thank you for your order! We've received your order and it's being processed.</p>
          
          <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #1a1f2a; margin-top: 0;">Order Details</h2>
            <p><strong>Order Number:</strong> ${orderNumber}</p>
            <p><strong>Order Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          
          <h3>Items Ordered:</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f9fafb;">
                <th style="padding: 8px; text-align: left;">Item</th>
                <th style="padding: 8px; text-align: center;">Quantity</th>
                <th style="padding: 8px; text-align: right;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding: 8px; text-align: right; font-weight: bold;">Total:</td>
                <td style="padding: 8px; text-align: right; font-weight: bold;">£${orderTotal.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          
          <p style="margin-top: 30px;">You can track your order status by logging into your account.</p>
          
          <div style="margin: 30px 0;">
            <a href="${process.env.APP_URL}/customer/orders" 
               style="background: #79d5e9; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Track Your Order
            </a>
          </div>
          
          <p>Best regards,<br>The Splitfin Team</p>
        </div>
      `,
      MessageStream: 'outbound'
    };
    
    const result = await client.sendEmail(emailData);
    
    res.json({ 
      success: true, 
      message: 'Order confirmation sent successfully',
      messageId: result.MessageID 
    });
  } catch (error) {
    console.error('Error sending order confirmation:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Catalog Request Email
router.post('/catalogue-request', async (req, res) => {
  try {
    const { name, company, email, phone, address, city, postcode, country, catalogues, message, submittedAt } = req.body;
    
    // Format catalogues list
    const cataloguesList = catalogues.map(cat => `<li style="padding: 4px 0;">${cat}</li>`).join('');
    
    const emailData = {
      From: process.env.POSTMARK_FROM_EMAIL || 'noreply@dmbrands.co.uk',
      To: 'sales@dmbrands.co.uk',
      Subject: `Catalogue Request from ${name} - ${company}`,
      HtmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #faf8f9; padding: 20px;">
          <div style="background: white; border-radius: 20px; box-shadow: 0 2px 8px rgba(45, 27, 32, 0.08); overflow: hidden;">
            <!-- Header with gradient -->
            <div style="background: linear-gradient(135deg, #c58390 0%, #965251 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">New Catalogue Request</h1>
              <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0; font-size: 16px;">Received ${new Date(submittedAt).toLocaleString('en-GB')}</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 30px;">
              <!-- Customer Details -->
              <div style="background: #f9f7f8; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <h2 style="color: #2d1b20; font-size: 20px; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #f5f3f4;">Customer Information</h2>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #5c4a4f; width: 120px; font-weight: 500;">Name:</td>
                    <td style="padding: 8px 0; color: #2d1b20;">${name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #5c4a4f; font-weight: 500;">Company:</td>
                    <td style="padding: 8px 0; color: #2d1b20;">${company}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #5c4a4f; font-weight: 500;">Email:</td>
                    <td style="padding: 8px 0; color: #2d1b20;"><a href="mailto:${email}" style="color: #c58390; text-decoration: none;">${email}</a></td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #5c4a4f; font-weight: 500;">Phone:</td>
                    <td style="padding: 8px 0; color: #2d1b20;">${phone}</td>
                  </tr>
                </table>
              </div>
              
              <!-- Shipping Address -->
              <div style="background: #f9f7f8; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <h2 style="color: #2d1b20; font-size: 20px; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #f5f3f4;">Shipping Address</h2>
                <p style="color: #2d1b20; margin: 5px 0; line-height: 1.6;">
                  ${address}<br>
                  ${city}<br>
                  ${postcode}<br>
                  ${country}
                </p>
              </div>
              
              <!-- Requested Catalogues -->
              <div style="background: #f9f7f8; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <h2 style="color: #2d1b20; font-size: 20px; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #f5f3f4;">Requested Catalogues</h2>
                <ul style="margin: 0; padding-left: 20px; color: #2d1b20;">
                  ${cataloguesList}
                </ul>
              </div>
              
              <!-- Additional Message -->
              ${message ? `
              <div style="background: #f9f7f8; border-radius: 12px; padding: 20px;">
                <h2 style="color: #2d1b20; font-size: 20px; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #f5f3f4;">Additional Information</h2>
                <p style="color: #2d1b20; margin: 0; line-height: 1.6;">${message}</p>
              </div>
              ` : ''}
            </div>
            
            <!-- Footer -->
            <div style="background: #f5f3f4; padding: 20px; text-align: center;">
              <p style="color: #8a7a7f; margin: 0; font-size: 14px;">This email was sent from the DM Brands customer portal</p>
            </div>
          </div>
        </div>
      `,
      TextBody: `
        New Catalogue Request
        Received: ${new Date(submittedAt).toLocaleString('en-GB')}
        
        CUSTOMER INFORMATION
        Name: ${name}
        Company: ${company}
        Email: ${email}
        Phone: ${phone}
        
        SHIPPING ADDRESS
        ${address}
        ${city}
        ${postcode}
        ${country}
        
        REQUESTED CATALOGUES
        ${catalogues.join('\n')}
        
        ${message ? `ADDITIONAL INFORMATION\n${message}` : ''}
      `,
      MessageStream: 'outbound'
    };
    
    const result = await client.sendEmail(emailData);
    
    res.json({ 
      success: true, 
      message: 'Catalogue request sent successfully',
      messageId: result.MessageID 
    });
  } catch (error) {
    console.error('Error sending catalogue request:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// DMBrands Order Approved Email
router.post('/order-approved', async (req, res) => {
  try {
    const {
      to,
      customerName,
      orderNumber,
      zohoOrderNumber,
      items,
      subtotal,
      vat,
      total,
      shippingAddress,
      purchaseOrderNumber,
      deliveryNotes
    } = req.body;
    
    // Format items HTML
    const itemsHtml = items.map(item => `
      <tr>
        <td style="padding: 12px 8px; border-bottom: 1px solid #f5f3f4; color: #2d1b20;">
          <strong style="font-weight: 600;">${item.name}</strong><br>
          <span style="color: #8a7a7f; font-size: 14px;">SKU: ${item.sku}</span>
        </td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #f5f3f4; text-align: center; color: #5c4a4f;">${item.quantity}</td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #f5f3f4; text-align: right; color: #2d1b20; font-weight: 500;">£${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `).join('');
    
    // Format address
    const addressFormatted = `
      ${shippingAddress.address1}<br>
      ${shippingAddress.street2 ? shippingAddress.street2 + '<br>' : ''}
      ${shippingAddress.city}<br>
      ${shippingAddress.county ? shippingAddress.county + '<br>' : ''}
      ${shippingAddress.postcode}
    `;
    
    const emailData = {
      From: process.env.POSTMARK_FROM_EMAIL || 'orders@dmbrands.co.uk',
      To: to,
      Subject: `Order Approved - ${zohoOrderNumber} | DM Brands`,
      HtmlBody: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #faf8f9;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #faf8f9; padding: 20px;">
            <!-- Header with Logo -->
            <div style="background: linear-gradient(135deg, #61bc8e 0%, #4daeac 100%); border-radius: 20px 20px 0 0; padding: 40px 30px; text-align: center;">
              <div style="background: #8d8089; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                <span style="color: white; font-size: 28px; font-weight: bold;">dmb</span>
              </div>
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">Order Approved!</h1>
              <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0; font-size: 16px;">Your order has been confirmed</p>
            </div>
            
            <!-- Main Content -->
            <div style="background: white; padding: 30px; border-radius: 0 0 20px 20px;">
              <!-- Greeting -->
              <p style="color: #2d1b20; font-size: 16px; margin: 0 0 20px 0;">Dear ${customerName},</p>
              <p style="color: #5c4a4f; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Great news! Your order has been approved and confirmed. We're now preparing your items for shipment.
              </p>
              
              <!-- Order Details Box -->
              <div style="background: #f9f7f8; border-radius: 12px; padding: 20px; margin-bottom: 30px;">
                <h2 style="color: #2d1b20; font-size: 20px; margin: 0 0 15px 0;">Order Details</h2>
                <table style="width: 100%;">
                  <tr>
                    <td style="color: #8a7a7f; padding: 5px 0;">Order Number:</td>
                    <td style="color: #2d1b20; font-weight: 600; text-align: right;">${zohoOrderNumber}</td>
                  </tr>
                  <tr>
                    <td style="color: #8a7a7f; padding: 5px 0;">Reference:</td>
                    <td style="color: #2d1b20; text-align: right;">${orderNumber}</td>
                  </tr>
                  <tr>
                    <td style="color: #8a7a7f; padding: 5px 0;">Status:</td>
                    <td style="color: #61bc8e; font-weight: 600; text-align: right;">Confirmed</td>
                  </tr>
                  ${purchaseOrderNumber ? `
                  <tr>
                    <td style="color: #8a7a7f; padding: 5px 0;">PO Number:</td>
                    <td style="color: #2d1b20; text-align: right;">${purchaseOrderNumber}</td>
                  </tr>
                  ` : ''}
                </table>
              </div>
              
              <!-- Items Table -->
              <div style="margin-bottom: 30px;">
                <h3 style="color: #2d1b20; font-size: 18px; margin: 0 0 15px 0;">Order Items</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <thead>
                    <tr style="background: #f9f7f8;">
                      <th style="padding: 12px 8px; text-align: left; color: #8a7a7f; font-size: 14px; font-weight: 600;">Item</th>
                      <th style="padding: 12px 8px; text-align: center; color: #8a7a7f; font-size: 14px; font-weight: 600;">Qty</th>
                      <th style="padding: 12px 8px; text-align: right; color: #8a7a7f; font-size: 14px; font-weight: 600;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsHtml}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colspan="2" style="padding: 12px 8px; text-align: right; color: #5c4a4f;">Subtotal:</td>
                      <td style="padding: 12px 8px; text-align: right; color: #2d1b20;">£${subtotal.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td colspan="2" style="padding: 12px 8px; text-align: right; color: #5c4a4f;">VAT (20%):</td>
                      <td style="padding: 12px 8px; text-align: right; color: #2d1b20;">£${vat.toFixed(2)}</td>
                    </tr>
                    <tr style="border-top: 2px solid #f5f3f4;">
                      <td colspan="2" style="padding: 12px 8px; text-align: right; color: #2d1b20; font-weight: 600; font-size: 18px;">Total:</td>
                      <td style="padding: 12px 8px; text-align: right; color: #61bc8e; font-weight: 600; font-size: 18px;">£${total.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              
              <!-- Delivery Information -->
              <div style="background: #f9f7f8; border-radius: 12px; padding: 20px; margin-bottom: 30px;">
                <h3 style="color: #2d1b20; font-size: 18px; margin: 0 0 15px 0;">Delivery Information</h3>
                <p style="color: #2d1b20; margin: 0 0 10px 0; line-height: 1.6;">
                  ${addressFormatted}
                </p>
                ${deliveryNotes ? `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #f5f3f4;">
                  <p style="color: #8a7a7f; margin: 0 0 5px 0; font-size: 14px; font-weight: 600;">Delivery Notes:</p>
                  <p style="color: #5c4a4f; margin: 0; font-style: italic;">${deliveryNotes}</p>
                </div>
                ` : ''}
              </div>
              
              <!-- Next Steps -->
              <div style="background: linear-gradient(135deg, rgba(97, 188, 142, 0.1) 0%, rgba(77, 174, 172, 0.1) 100%); border-radius: 12px; padding: 20px; text-align: center;">
                <h3 style="color: #2d1b20; font-size: 18px; margin: 0 0 10px 0;">What Happens Next?</h3>
                <p style="color: #5c4a4f; margin: 0; line-height: 1.6;">
                  Your order is now being prepared for shipment. We'll send you tracking information as soon as your items are dispatched. Orders are typically shipped within 2-3 business days.
                </p>
              </div>
              
              <!-- Payment Information -->
              <div style="margin-top: 30px; padding: 20px; background: #f9f7f8; border-radius: 12px; text-align: center;">
                <p style="color: #8a7a7f; margin: 0; font-size: 14px;">
                  <strong>Payment Terms:</strong> Net 30 days<br>
                  An invoice will be sent separately for this order.
                </p>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="padding: 30px; text-align: center;">
              <p style="color: #8a7a7f; margin: 0 0 10px 0; font-size: 14px;">
                If you have any questions about your order, please contact us at:
              </p>
              <p style="color: #c58390; margin: 0 0 20px 0; font-size: 16px;">
                <a href="mailto:orders@dmbrands.co.uk" style="color: #c58390; text-decoration: none;">orders@dmbrands.co.uk</a>
              </p>
              <p style="color: #bc9bab; margin: 0; font-size: 12px;">
                © ${new Date().getFullYear()} DM Brands. All rights reserved.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      TextBody: `
        Order Approved - ${zohoOrderNumber}
        
        Dear ${customerName},
        
        Great news! Your order has been approved and confirmed. We're now preparing your items for shipment.
        
        ORDER DETAILS
        Order Number: ${zohoOrderNumber}
        Reference: ${orderNumber}
        Status: Confirmed
        ${purchaseOrderNumber ? `PO Number: ${purchaseOrderNumber}` : ''}
        
        ORDER ITEMS
        ${items.map(item => `${item.name} (SKU: ${item.sku}) - Qty: ${item.quantity} - £${(item.price * item.quantity).toFixed(2)}`).join('\n')}
        
        Subtotal: £${subtotal.toFixed(2)}
        VAT (20%): £${vat.toFixed(2)}
        Total: £${total.toFixed(2)}
        
        DELIVERY ADDRESS
        ${shippingAddress.address1}
        ${shippingAddress.street2 || ''}
        ${shippingAddress.city}
        ${shippingAddress.county || ''}
        ${shippingAddress.postcode}
        
        ${deliveryNotes ? `DELIVERY NOTES\n${deliveryNotes}` : ''}
        
        WHAT HAPPENS NEXT?
        Your order is now being prepared for shipment. We'll send you tracking information as soon as your items are dispatched. Orders are typically shipped within 2-3 business days.
        
        PAYMENT TERMS: Net 30 days
        An invoice will be sent separately for this order.
        
        If you have any questions about your order, please contact us at orders@dmbrands.co.uk
        
        © ${new Date().getFullYear()} DM Brands. All rights reserved.
      `,
      MessageStream: 'outbound'
    };
    
    const result = await client.sendEmail(emailData);
    
    res.json({ 
      success: true, 
      message: 'Order approval email sent successfully',
      messageId: result.MessageID 
    });
  } catch (error) {
    console.error('Error sending order approval email:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// DMBrands Order Confirmation Email
router.post('/order-confirmation', async (req, res) => {
  try {
    const {
      to,
      customerName,
      orderNumber,
      items,
      subtotal,
      vat,
      total,
      shippingAddress,
      purchaseOrderNumber,
      deliveryNotes
    } = req.body;
    
    // Format items HTML
    const itemsHtml = items.map(item => `
      <tr>
        <td style="padding: 12px 8px; border-bottom: 1px solid #f5f3f4; color: #2d1b20;">
          <strong style="font-weight: 600;">${item.name}</strong><br>
          <span style="color: #8a7a7f; font-size: 14px;">SKU: ${item.sku}</span>
        </td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #f5f3f4; text-align: center; color: #5c4a4f;">${item.quantity}</td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #f5f3f4; text-align: right; color: #2d1b20; font-weight: 500;">£${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `).join('');
    
    // Format address
    const addressFormatted = `
      ${shippingAddress.address1}<br>
      ${shippingAddress.street2 ? shippingAddress.street2 + '<br>' : ''}
      ${shippingAddress.city}<br>
      ${shippingAddress.county ? shippingAddress.county + '<br>' : ''}
      ${shippingAddress.postcode}
    `;
    
    // Generate Google Maps static image URL
    const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY || 'YOUR_GOOGLE_MAPS_API_KEY';
    const addressString = `${shippingAddress.address1}, ${shippingAddress.city}, ${shippingAddress.postcode}, UK`;
    const encodedAddress = encodeURIComponent(addressString);
    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodedAddress}&zoom=15&size=600x200&maptype=roadmap&markers=color:0xc58390|${encodedAddress}&style=feature:all|element:geometry|color:0xf5f5f5&style=feature:all|element:labels.text.fill|color:0x616161&style=feature:all|element:labels.text.stroke|color:0xf5f5f5&style=feature:poi|element:labels.text.fill|color:0x757575&style=feature:road|element:geometry|color:0xffffff&style=feature:road|element:labels.text.fill|color:0x8a8a8a&style=feature:water|element:geometry|color:0xc9c9c9&key=${mapsApiKey}`;
    
    const emailData = {
      From: process.env.POSTMARK_FROM_EMAIL || 'orders@dmbrands.co.uk',
      To: to,
      Subject: `Order Received - ${orderNumber} | DM Brands`,
      HtmlBody: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #faf8f9;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #faf8f9; padding: 20px;">
            <!-- Header with Logo -->
            <div style="background: linear-gradient(135deg, #c58390 0%, #965251 100%); border-radius: 20px 20px 0 0; padding: 40px 30px; text-align: center;">
              <div style="background: #8d8089; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                <span style="color: white; font-size: 28px; font-weight: bold;">dmb</span>
              </div>
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">Order Received!</h1>
              <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0; font-size: 16px;">Thank you for your order</p>
            </div>
            
            <!-- Main Content -->
            <div style="background: white; padding: 30px; border-radius: 0 0 20px 20px;">
              <!-- Greeting -->
              <p style="color: #2d1b20; font-size: 16px; margin: 0 0 20px 0;">Dear ${customerName},</p>
              <p style="color: #5c4a4f; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                We've received your order and a member of our orders team will be in touch shortly to confirm and process your request.
              </p>
              
              <!-- Order Details Box -->
              <div style="background: #f9f7f8; border-radius: 12px; padding: 20px; margin-bottom: 30px;">
                <h2 style="color: #2d1b20; font-size: 20px; margin: 0 0 15px 0;">Order Details</h2>
                <table style="width: 100%;">
                  <tr>
                    <td style="color: #8a7a7f; padding: 5px 0;">Order Number:</td>
                    <td style="color: #2d1b20; font-weight: 600; text-align: right;">${orderNumber}</td>
                  </tr>
                  <tr>
                    <td style="color: #8a7a7f; padding: 5px 0;">Order Date:</td>
                    <td style="color: #2d1b20; text-align: right;">${new Date().toLocaleDateString('en-GB')}</td>
                  </tr>
                  ${purchaseOrderNumber ? `
                  <tr>
                    <td style="color: #8a7a7f; padding: 5px 0;">PO Number:</td>
                    <td style="color: #2d1b20; text-align: right;">${purchaseOrderNumber}</td>
                  </tr>
                  ` : ''}
                </table>
              </div>
              
              <!-- Items Table -->
              <div style="margin-bottom: 30px;">
                <h3 style="color: #2d1b20; font-size: 18px; margin: 0 0 15px 0;">Order Items</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <thead>
                    <tr style="background: #f9f7f8;">
                      <th style="padding: 12px 8px; text-align: left; color: #8a7a7f; font-size: 14px; font-weight: 600;">Item</th>
                      <th style="padding: 12px 8px; text-align: center; color: #8a7a7f; font-size: 14px; font-weight: 600;">Qty</th>
                      <th style="padding: 12px 8px; text-align: right; color: #8a7a7f; font-size: 14px; font-weight: 600;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsHtml}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colspan="2" style="padding: 12px 8px; text-align: right; color: #5c4a4f;">Subtotal:</td>
                      <td style="padding: 12px 8px; text-align: right; color: #2d1b20;">£${subtotal.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td colspan="2" style="padding: 12px 8px; text-align: right; color: #5c4a4f;">VAT (20%):</td>
                      <td style="padding: 12px 8px; text-align: right; color: #2d1b20;">£${vat.toFixed(2)}</td>
                    </tr>
                    <tr style="border-top: 2px solid #f5f3f4;">
                      <td colspan="2" style="padding: 12px 8px; text-align: right; color: #2d1b20; font-weight: 600; font-size: 18px;">Total:</td>
                      <td style="padding: 12px 8px; text-align: right; color: #c58390; font-weight: 600; font-size: 18px;">£${total.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              
              <!-- Delivery Information -->
              <div style="background: #f9f7f8; border-radius: 12px; padding: 20px; margin-bottom: 30px;">
                <h3 style="color: #2d1b20; font-size: 18px; margin: 0 0 15px 0;">Delivery Information</h3>
                <p style="color: #2d1b20; margin: 0 0 10px 0; line-height: 1.6;">
                  ${addressFormatted}
                </p>
                ${deliveryNotes ? `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #f5f3f4;">
                  <p style="color: #8a7a7f; margin: 0 0 5px 0; font-size: 14px; font-weight: 600;">Delivery Notes:</p>
                  <p style="color: #5c4a4f; margin: 0; font-style: italic;">${deliveryNotes}</p>
                </div>
                ` : ''}
              </div>
              
              <!-- Map Preview -->
              <div style="margin-bottom: 30px;">
                <h3 style="color: #2d1b20; font-size: 18px; margin: 0 0 15px 0;">Delivery Location</h3>
                <div style="border-radius: 12px; overflow: hidden; border: 1px solid #f5f3f4;">
                  <img src="${mapUrl}" alt="Delivery location map" style="width: 100%; height: 200px; object-fit: cover; display: block;">
                </div>
              </div>
              
              <!-- Next Steps -->
              <div style="background: linear-gradient(135deg, rgba(197, 131, 144, 0.1) 0%, rgba(150, 82, 81, 0.1) 100%); border-radius: 12px; padding: 20px; text-align: center;">
                <h3 style="color: #2d1b20; font-size: 18px; margin: 0 0 10px 0;">What's Next?</h3>
                <p style="color: #5c4a4f; margin: 0; line-height: 1.6;">
                  Our team will review your order and contact you within 1 business day to confirm availability and arrange payment. Orders are typically processed within 2-3 business days after approval.
                </p>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="padding: 30px; text-align: center;">
              <p style="color: #8a7a7f; margin: 0 0 10px 0; font-size: 14px;">
                If you have any questions about your order, please contact us at:
              </p>
              <p style="color: #c58390; margin: 0 0 20px 0; font-size: 16px;">
                <a href="mailto:orders@dmbrands.co.uk" style="color: #c58390; text-decoration: none;">orders@dmbrands.co.uk</a>
              </p>
              <p style="color: #bc9bab; margin: 0; font-size: 12px;">
                © ${new Date().getFullYear()} DM Brands. All rights reserved.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      TextBody: `
        Order Received - ${orderNumber}
        
        Dear ${customerName},
        
        We've received your order and a member of our orders team will be in touch shortly to confirm and process your request.
        
        ORDER DETAILS
        Order Number: ${orderNumber}
        Order Date: ${new Date().toLocaleDateString('en-GB')}
        ${purchaseOrderNumber ? `PO Number: ${purchaseOrderNumber}` : ''}
        
        ORDER ITEMS
        ${items.map(item => `${item.name} (SKU: ${item.sku}) - Qty: ${item.quantity} - £${(item.price * item.quantity).toFixed(2)}`).join('\n')}
        
        Subtotal: £${subtotal.toFixed(2)}
        VAT (20%): £${vat.toFixed(2)}
        Total: £${total.toFixed(2)}
        
        DELIVERY ADDRESS
        ${shippingAddress.address1}
        ${shippingAddress.street2 || ''}
        ${shippingAddress.city}
        ${shippingAddress.county || ''}
        ${shippingAddress.postcode}
        
        ${deliveryNotes ? `DELIVERY NOTES\n${deliveryNotes}` : ''}
        
        WHAT'S NEXT?
        Our team will review your order and contact you within 1 business day to confirm availability and arrange payment. Orders are typically processed within 2-3 business days after approval.
        
        If you have any questions about your order, please contact us at orders@dmbrands.co.uk
        
        © ${new Date().getFullYear()} DM Brands. All rights reserved.
      `,
      MessageStream: 'outbound'
    };
    
    const result = await client.sendEmail(emailData);
    
    res.json({ 
      success: true, 
      message: 'Order confirmation sent successfully',
      messageId: result.MessageID 
    });
  } catch (error) {
    console.error('Error sending order confirmation:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;