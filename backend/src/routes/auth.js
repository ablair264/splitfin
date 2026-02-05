// server/src/routes/auth.js
import express from 'express';
import axios from 'axios';
import admin from 'firebase-admin';

const router = express.Router();

// Zoho OAuth configuration from environment
const {
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REDIRECT_URI,
  ZOHO_REFRESH_TOKEN
} = process.env;

// Token cache
let tokenCache = {
  accessToken: null,
  expiresAt: 0,
  refreshPromise: null
};

/**
 * Get Zoho OAuth URL
 */
router.get('/url', (req, res) => {
  const AUTH_BASE = 'https://accounts.zoho.eu/oauth/v2/auth';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: ZOHO_CLIENT_ID,
    redirect_uri: ZOHO_REDIRECT_URI,
    scope: 'ZohoInventory.fullaccess.all,ZohoCRM.modules.ALL',
    access_type: 'offline',
    prompt: 'consent'
  });
  
  res.redirect(`${AUTH_BASE}?${params}`);
});

/**
 * OAuth callback handler
 */
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  
  if (error) {
    return res.status(400).send(`
      <div style="font-family: sans-serif; padding: 2em; text-align: center;">
        <h1>❌ OAuth Error</h1>
        <p>Error: ${error}</p>
        <a href="/oauth/url">Try Again</a>
      </div>
    `);
  }
  
  if (!code) {
    return res.status(400).send(`
      <div style="font-family: sans-serif; padding: 2em; text-align: center;">
        <h1>❌ No Authorization Code</h1>
        <p>No authorization code received from Zoho.</p>
        <a href="/oauth/url">Try Again</a>
      </div>
    `);
  }

  try {
    // Exchange code for tokens
    const { data } = await axios.post(
      'https://accounts.zoho.eu/oauth/v2/token',
      null,
      {
        params: {
          grant_type: 'authorization_code',
          client_id: ZOHO_CLIENT_ID,
          client_secret: ZOHO_CLIENT_SECRET,
          redirect_uri: ZOHO_REDIRECT_URI,
          code
        }
      }
    );

    if (data.error) {
      throw new Error(data.error_description || data.error);
    }

    const newRefreshToken = data.refresh_token;

    // Success page with instructions
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Zoho OAuth Success</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 2em;
            background: #f5f5f5;
          }
          .container {
            background: white;
            padding: 2em;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          h1 { color: #22c55e; }
          .token-box {
            background: #f3f4f6;
            padding: 1em;
            border-radius: 4px;
            margin: 1em 0;
            word-break: break-all;
            font-family: monospace;
            font-size: 0.9em;
          }
          .steps {
            background: #fef3c7;
            padding: 1em;
            border-radius: 4px;
            border-left: 4px solid #f59e0b;
          }
          .steps ol { margin: 0.5em 0; }
          button {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 0.5em 1em;
            border-radius: 4px;
            cursor: pointer;
          }
          button:hover { background: #2563eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Success! New Refresh Token Generated</h1>
          <p>Your new Refresh Token has been generated successfully.</p>
          
          <h3>Your New Refresh Token:</h3>
          <div class="token-box" id="token">${newRefreshToken}</div>
          <button onclick="copyToken()">📋 Copy Token</button>
          
          <div class="steps">
            <h4>⚠️ Important Next Steps:</h4>
            <ol>
              <li>Copy the token above</li>
              <li>Go to your Render.com dashboard</li>
              <li>Navigate to Environment Groups</li>
              <li>Update the <strong>ZOHO_REFRESH_TOKEN</strong> variable</li>
              <li>Save changes and restart your services</li>
            </ol>
          </div>
          
          <p><small>This token will not be shown again. Make sure to save it!</small></p>
        </div>
        
        <script>
          function copyToken() {
            const token = document.getElementById('token').textContent;
            navigator.clipboard.writeText(token).then(() => {
              alert('Token copied to clipboard!');
            }).catch(err => {
              console.error('Failed to copy:', err);
            });
          }
        </script>
      </body>
      </html>
    `);

  } catch (err) {
    console.error('❌ Token exchange failed:', err.response?.data || err.message);
    
    return res.status(500).send(`
      <div style="font-family: sans-serif; padding: 2em; text-align: center;">
        <h1>❌ Token Exchange Failed</h1>
        <p>Error: ${err.message}</p>
        <details>
          <summary>Technical Details</summary>
          <pre>${JSON.stringify(err.response?.data || err, null, 2)}</pre>
        </details>
        <a href="/oauth/url">Try Again</a>
      </div>
    `);
  }
});

/**
 * Get access token (used internally by other services)
 */
export async function getAccessToken() {
  const now = Date.now();
  
  // Return cached token if still valid
  if (tokenCache.accessToken && now < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }
  
  // Return existing refresh promise if one is in progress
  if (tokenCache.refreshPromise) {
    return await tokenCache.refreshPromise;
  }
  
  // Create new refresh promise
  tokenCache.refreshPromise = refreshAccessToken();
  
  try {
    const token = await tokenCache.refreshPromise;
    return token;
  } finally {
    tokenCache.refreshPromise = null;
  }
}

/**
 * Refresh the access token
 */
async function refreshAccessToken() {
  try {
    const { data } = await axios.post(
      'https://accounts.zoho.eu/oauth/v2/token',
      null,
      {
        params: {
          grant_type: 'refresh_token',
          client_id: ZOHO_CLIENT_ID,
          client_secret: ZOHO_CLIENT_SECRET,
          refresh_token: ZOHO_REFRESH_TOKEN
        }
      }
    );
    
    if (data.error) {
      throw new Error(data.error_description || data.error);
    }
    
    // Cache the new token
    tokenCache.accessToken = data.access_token;
    tokenCache.expiresAt = Date.now() + (data.expires_in * 1000) - (60 * 1000); // 1 minute buffer
    
    console.log('✅ Access token refreshed successfully');
    return data.access_token;
    
  } catch (error) {
    console.error('❌ Failed to refresh access token:', error.response?.data || error.message);
    throw error;
  }
}

router.post('/create-customer', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      emailVerified: true
    });
    
    res.json({ 
      success: true, 
      uid: userRecord.uid 
    });
  } catch (error) {
    console.error('Error creating customer auth:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Token status endpoint (for debugging)
 */
router.get('/token-status', (req, res) => {
  const now = Date.now();
  const isValid = tokenCache.accessToken && now < tokenCache.expiresAt;
  const expiresIn = isValid ? Math.floor((tokenCache.expiresAt - now) / 1000) : 0;
  
  res.json({
    hasToken: !!tokenCache.accessToken,
    isValid,
    expiresIn: `${expiresIn} seconds`,
    expiresAt: new Date(tokenCache.expiresAt).toISOString(),
    timestamp: new Date().toISOString()
  });
});

export default router;