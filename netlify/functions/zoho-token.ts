import { Handler } from '@netlify/functions';

// These should be in Netlify environment variables, not in code
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
const ZOHO_AUTH_URL = 'https://accounts.zoho.eu/oauth/v2';

export const handler: Handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Validate environment variables
    if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
      console.error('Missing Zoho environment variables');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    // Refresh the Zoho access token
    const response = await fetch(`${ZOHO_AUTH_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        refresh_token: ZOHO_REFRESH_TOKEN,
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Zoho token refresh failed:', response.status, errorText);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Failed to refresh token',
          details: `HTTP ${response.status}`
        })
      };
    }

    const data = await response.json();
    
    // Return only the access token and expiry info
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        // Add CORS headers if needed
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST'
      },
      body: JSON.stringify({
        access_token: data.access_token,
        expires_in: data.expires_in || 3600,
        expires_at: new Date().getTime() + ((data.expires_in || 3600) * 1000)
      })
    };

  } catch (error) {
    console.error('Error in zoho-token function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};