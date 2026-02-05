// server/src/services/customerAuthService.js
import admin from 'firebase-admin';

const db = admin.firestore();
const auth = admin.auth();

/**
 * Generate a secure random password
 */
function generateSecurePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Create Firebase Auth user and users collection document for a customer
 */
export async function createCustomerAuth(customerId) {
  try {
    console.log(`🔐 Creating auth for customer: ${customerId}`);
    
    // Get customer data from customer_data collection
    const customerDoc = await db.collection('customer_data').doc(customerId).get();
    
    if (!customerDoc.exists) {
      throw new Error('Customer not found in customer_data collection');
    }
    
    const customerData = customerDoc.data();
    
    // Check if customer already has authentication using the account field
    if (customerData.account === true) {
      console.log('Customer already has authentication account');
      
      // Optionally verify the auth user still exists
      if (customerData.auth_uid) {
        try {
          await auth.getUser(customerData.auth_uid);
          return {
            success: true,
            uid: customerData.auth_uid,
            message: 'Customer already has authentication'
          };
        } catch (e) {
          console.log('Auth user not found, will recreate');
        }
      }
    }
    
    // Prepare user data
    const email = customerData.email || customerData.Primary_Email;
    if (!email) {
      throw new Error('Customer has no email address');
    }
    
    const displayName = customerData.customer_name || customerData.company_name || 'Customer';
    const tempPassword = generateSecurePassword();
    
    // Create Firebase Auth user
    let authUser;
    try {
      authUser = await auth.createUser({
        email: email,
        password: tempPassword,
        displayName: displayName,
        emailVerified: false
      });
      console.log('✅ Created Firebase Auth user:', authUser.uid);
    } catch (authError) {
      // If user already exists, get their UID
      if (authError.code === 'auth/email-already-exists') {
        const existingUser = await auth.getUserByEmail(email);
        authUser = existingUser;
        console.log('User already exists:', authUser.uid);
      } else {
        throw authError;
      }
    }
    
    // Create/Update users collection document
    const userDocData = {
      uid: authUser.uid,
      email: email,
      name: customerData.customer_name || customerData.company_name || 'Customer',
      companyName: customerData.company_name || customerData.customer_name || '',
      role: 'customer',
      customer_id: customerData.customer_id || '', // Zoho customer ID
      firebase_customer_doc_id: customerId, // Reference to customer_data doc
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      isOnline: false,
      
      // Additional customer fields
      phone: customerData.phone || '',
      billing_address: customerData.billing_address || {},
      shipping_address: customerData.shipping_address || {},
      
      // Metadata
      authCreatedAt: new Date().toISOString(),
      authCreatedBy: 'system',
      tempPasswordSet: true
    };
    
    // Save to users collection using UID as document ID
    await db.collection('users').doc(authUser.uid).set(userDocData, { merge: true });
    console.log('✅ Created users collection document');
    
    // Update customer_data with authentication info
    await db.collection('customer_data').doc(customerId).update({
      account: true,  // Mark that they now have authentication
      auth_uid: authUser.uid,  // Store the auth UID
      has_login: true,
      login_created_at: admin.firestore.FieldValue.serverTimestamp(),
      temp_password: tempPassword, // Store temporarily for email sending
      account_created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Updated customer_data with account status');
    
    // Return success
    return {
      success: true,
      uid: authUser.uid,
      email: email,
      tempPassword: tempPassword,
      message: 'Customer authentication created successfully'
    };
    
  } catch (error) {
    console.error('❌ Error creating customer auth:', error);
    throw error;
  }
}

/**
 * Bulk create authentication for multiple customers
 */
export async function bulkCreateCustomerAuth(customerIds) {
  const results = {
    success: [],
    failed: [],
    total: customerIds.length
  };
  
  for (const customerId of customerIds) {
    try {
      const result = await createCustomerAuth(customerId);
      results.success.push({
        customerId,
        uid: result.uid,
        email: result.email
      });
    } catch (error) {
      results.failed.push({
        customerId,
        error: error.message
      });
    }
  }
  
  return results;
}

/**
 * Create auth for all customers without Firebase auth
 */
export async function createAuthForAllCustomers() {
  try {
    console.log('🔄 Starting bulk auth creation...');
    
    // Get all customers without account or where account is false
    const customersSnapshot = await db.collection('customer_data')
      .where('account', '!=', true)
      .limit(50) // Process in batches
      .get();
    
    // Also get customers where account field doesn't exist
    const noAccountFieldSnapshot = await db.collection('customer_data')
      .where('account', '==', null)
      .limit(50)
      .get();
    
    // Combine both sets
    const allDocs = [...customersSnapshot.docs, ...noAccountFieldSnapshot.docs];
    
    // Remove duplicates
    const uniqueDocs = Array.from(new Map(allDocs.map(doc => [doc.id, doc])).values());
    const customerIds = uniqueDocs.map(doc => doc.id);
    
    if (customerIds.length === 0) {
      return {
        message: 'No customers need authentication',
        total: 0
      };
    }
    
    const results = await bulkCreateCustomerAuth(customerIds);
    
    console.log('✅ Bulk auth creation complete:', results);
    return results;
    
  } catch (error) {
    console.error('❌ Bulk auth error:', error);
    throw error;
  }
}