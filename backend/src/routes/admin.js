const admin = require('firebase-admin');
const { Router } = require('express');
const router = Router();

// Middleware to verify admin/brandManager role
const verifyAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Get user role from Firestore
    const userDoc = await admin.firestore()
      .collection('users')
      .doc(decodedToken.uid)
      .get();
    
    const userData = userDoc.data();
    if (userData?.role !== 'brandManager' && userData?.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Create Firebase Auth account for customer (used by CustomerApproval)
router.post('/create-customer-account', verifyAdmin, async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required',
        code: 'MISSING_FIELDS'
      });
    }
    
    // Create the Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: displayName || email,
      emailVerified: false
    });
    
    // Set custom claims for customer role
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: 'customer'
    });
    
    console.log(`✅ Created Firebase Auth account for ${email} with UID: ${userRecord.uid}`);
    
    res.json({ 
      success: true, 
      uid: userRecord.uid,
      message: 'Firebase Auth account created successfully'
    });
    
  } catch (error) {
    console.error('Error creating Firebase user:', error);
    
    // Handle specific Firebase errors
    if (error.code === 'auth/email-already-exists') {
      // Try to get the existing user
      try {
        const existingUser = await admin.auth().getUserByEmail(email);
        res.status(200).json({ 
          success: true,
          uid: existingUser.uid,
          message: 'User already exists',
          existing: true
        });
      } catch (getUserError) {
        res.status(400).json({ 
          error: 'Email already exists but could not retrieve user',
          code: 'EMAIL_EXISTS'
        });
      }
    } else if (error.code === 'auth/invalid-email') {
      res.status(400).json({ 
        error: 'Invalid email address',
        code: 'INVALID_EMAIL'
      });
    } else if (error.code === 'auth/weak-password') {
      res.status(400).json({ 
        error: 'Password is too weak (minimum 6 characters)',
        code: 'WEAK_PASSWORD'
      });
    } else {
      res.status(500).json({ 
        error: error.message,
        code: error.code || 'UNKNOWN_ERROR'
      });
    }
  }
});

// Update/Reset password for existing user
router.post('/reset-customer-password', verifyAdmin, async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    
    if (!email || !newPassword) {
      return res.status(400).json({ 
        error: 'Email and new password are required',
        code: 'MISSING_FIELDS'
      });
    }
    
    // Get user by email
    const userRecord = await admin.auth().getUserByEmail(email);
    
    // Update password
    await admin.auth().updateUser(userRecord.uid, {
      password: newPassword
    });
    
    console.log(`✅ Reset password for ${email}`);
    
    res.json({ 
      success: true,
      uid: userRecord.uid,
      message: 'Password reset successfully'
    });
    
  } catch (error) {
    console.error('Error resetting password:', error);
    
    if (error.code === 'auth/user-not-found') {
      res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    } else {
      res.status(500).json({ 
        error: error.message,
        code: error.code || 'UNKNOWN_ERROR'
      });
    }
  }
});

// Delete Firebase Auth account (for cleanup if needed)
router.delete('/delete-customer-account/:uid', verifyAdmin, async (req, res) => {
  try {
    const { uid } = req.params;
    
    await admin.auth().deleteUser(uid);
    
    console.log(`✅ Deleted Firebase Auth account with UID: ${uid}`);
    
    res.json({ 
      success: true,
      message: 'Firebase Auth account deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting Firebase user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check if email exists in Firebase Auth
router.get('/check-email/:email', verifyAdmin, async (req, res) => {
  try {
    const { email } = req.params;
    
    const userRecord = await admin.auth().getUserByEmail(decodeURIComponent(email));
    
    res.json({ 
      exists: true,
      uid: userRecord.uid,
      emailVerified: userRecord.emailVerified,
      disabled: userRecord.disabled
    });
    
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      res.json({ 
        exists: false
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Original endpoint - keeping for backward compatibility
router.post('/create-customer-user', verifyAdmin, async (req, res) => {
  try {
    const { email, password, displayName, customerId, customerData } = req.body;
    
    // Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName,
      emailVerified: false
    });
    
    // Update or create customer_data record
    if (customerId) {
      // Update existing customer
      await admin.firestore()
        .collection('customer_data')
        .doc(customerId)
        .update({
          loginid: userRecord.uid,
          ...customerData
        });
    } else {
      // Create new customer
      await admin.firestore()
        .collection('customer_data')
        .add({
          loginid: userRecord.uid,
          ...customerData,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    
    res.json({ 
      success: true, 
      uid: userRecord.uid,
      message: 'User created successfully'
    });
    
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;