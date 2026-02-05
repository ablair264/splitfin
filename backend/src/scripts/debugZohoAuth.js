// debugZohoAuth.js
// Script to debug Zoho authentication issues

import dotenv from 'dotenv';
import axios from 'axios';
import { getAccessToken, ZOHO_CONFIG } from '../api/zoho.js';

// Load environment variables
dotenv.config();

console.log('🔍 Zoho Authentication Debug Tool\n');

// 1. Check environment variables
console.log('1️⃣ Checking environment variables...');
const requiredVars = [
  'ZOHO_CLIENT_ID',
  'ZOHO_CLIENT_SECRET', 
  'ZOHO_REFRESH_TOKEN',
  'ZOHO_ORG_ID'
];

let missingVars = [];
requiredVars.forEach(varName => {
  if (process.env[varName]) {
    console.log(`✅ ${varName}: ${varName.includes('SECRET') || varName.includes('TOKEN') ? '***' + process.env[varName].slice(-4) : process.env[varName]}`);
  } else {
    console.log(`❌ ${varName}: MISSING`);
    missingVars.push(varName);
  }
});

if (missingVars.length > 0) {
  console.log('\n❌ Missing required environment variables:', missingVars.join(', '));
  console.log('Please check your .env file');
  process.exit(1);
}

// 2. Test refresh token
console.log('\n2️⃣ Testing refresh token...');
try {
  const tokenUrl = 'https://accounts.zoho.eu/oauth/v2/token';
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN
  });
  
  console.log('Making request to:', tokenUrl);
  console.log('With params:', {
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: '***' + process.env.ZOHO_CLIENT_SECRET.slice(-4),
    refresh_token: '***' + process.env.ZOHO_REFRESH_TOKEN.slice(-4)
  });
  
  const response = await axios.post(tokenUrl, params);
  
  if (response.data.access_token) {
    console.log('✅ Successfully obtained access token');
    console.log('Token expires in:', response.data.expires_in, 'seconds');
  } else {
    console.log('❌ No access token in response:', response.data);
  }
} catch (error) {
  console.log('❌ Failed to get access token');
  console.log('Error:', error.response?.data || error.message);
  
  if (error.response?.data?.error === 'invalid_client') {
    console.log('\n⚠️  Invalid client error. This usually means:');
    console.log('   1. Client ID or Client Secret is incorrect');
    console.log('   2. The app is not authorized for this refresh token');
    console.log('   3. The refresh token belongs to a different app');
  } else if (error.response?.data?.error === 'invalid_code') {
    console.log('\n⚠️  Invalid refresh token. You need to generate a new one.');
  }
}

// 3. Test getAccessToken function
console.log('\n3️⃣ Testing getAccessToken function...');
try {
  const token = await getAccessToken();
  console.log('✅ getAccessToken() succeeded');
  console.log('Token (first 20 chars):', token.substring(0, 20) + '...');
} catch (error) {
  console.log('❌ getAccessToken() failed:', error.message);
}

// 4. Test API call
console.log('\n4️⃣ Testing Zoho Inventory API call...');
try {
  const token = await getAccessToken();
  const testUrl = `https://www.zohoapis.eu/inventory/v1/organizations`;
  
  const response = await axios.get(testUrl, {
    headers: {
      'Authorization': `Zoho-oauthtoken ${token}`
    }
  });
  
  console.log('✅ API call successful');
  console.log('Organizations found:', response.data.organizations?.length || 0);
  
  // Check if org ID matches
  const orgs = response.data.organizations || [];
  const matchingOrg = orgs.find(org => org.organization_id === process.env.ZOHO_ORG_ID);
  
  if (matchingOrg) {
    console.log('✅ Organization ID matches:', matchingOrg.name);
  } else {
    console.log('⚠️  Organization ID not found in list');
    console.log('Available organizations:');
    orgs.forEach(org => {
      console.log(`  - ${org.name}: ${org.organization_id}`);
    });
  }
  
} catch (error) {
  console.log('❌ API call failed:', error.response?.data || error.message);
}

// 5. Test specific order fetch
console.log('\n5️⃣ Testing specific order fetch...');
const testOrderId = '310656000054304864'; // One of the failing orders

try {
  const token = await getAccessToken();
  const orderUrl = `https://www.zohoapis.eu/inventory/v1/salesorders/${testOrderId}`;
  
  console.log('Fetching order:', testOrderId);
  const response = await axios.get(orderUrl, {
    headers: {
      'Authorization': `Zoho-oauthtoken ${token}`
    },
    params: {
      organization_id: process.env.ZOHO_ORG_ID
    }
  });
  
  console.log('✅ Order fetch successful');
  console.log('Order number:', response.data.salesorder?.salesorder_number);
} catch (error) {
  console.log('❌ Order fetch failed:', error.response?.data || error.message);
  if (error.response?.status === 401) {
    console.log('⚠️  401 Unauthorized - Token might be invalid');
  } else if (error.response?.status === 404) {
    console.log('⚠️  404 Not Found - Order might not exist');
  }
}

console.log('\n📋 Diagnostic Summary:');
console.log('If you see "invalid_client" errors, you need to:');
console.log('1. Verify your ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET are correct');
console.log('2. Generate a new refresh token using the correct app');
console.log('3. Make sure the app has access to Zoho Inventory API');
console.log('\nTo generate a new refresh token:');
console.log('1. Go to https://api-console.zoho.eu/');
console.log('2. Select your app');
console.log('3. Generate a new authorization code');
console.log('4. Exchange it for a refresh token');
