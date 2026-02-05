exports.handler = async (event) => {
  console.log('Anthropic proxy called with method:', event.httpMethod);
  
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Get API key from environment variable
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
  
  if (!anthropicApiKey) {
    console.error('Anthropic API key not found in environment variables');
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Anthropic API key not configured' })
    };
  }

  try {
    // First, let's check what we have available
    console.log('Environment check - has fetch?', typeof fetch !== 'undefined');
    console.log('API Key present?', !!anthropicApiKey);
    console.log('API Key starts with:', anthropicApiKey?.substring(0, 10));
    
    // Parse the request body
    const requestBody = JSON.parse(event.body);
    
    console.log('Proxying request to Anthropic with model:', requestBody.model);

    // Try using the standard https module as a fallback
    if (typeof fetch === 'undefined') {
      const https = require('https');
      const { promisify } = require('util');
      
      return new Promise((resolve) => {
        const postData = JSON.stringify(requestBody);
        
        const options = {
          hostname: 'api.anthropic.com',
          port: 443,
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length,
            'x-api-key': anthropicApiKey,
            'anthropic-version': '2023-06-01'
          }
        };
        
        const req = https.request(options, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              const jsonData = JSON.parse(data);
              resolve({
                statusCode: res.statusCode,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(jsonData)
              });
            } catch (e) {
              resolve({
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to parse response', details: e.message })
              });
            }
          });
        });
        
        req.on('error', (e) => {
          console.error('Request error:', e);
          resolve({
            statusCode: 500,
            body: JSON.stringify({ error: 'Request failed', details: e.message })
          });
        });
        
        req.write(postData);
        req.end();
      });
    }

    // Make the request to Anthropic using fetch
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Anthropic API error:', response.status, data);
      return {
        statusCode: response.status,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: data.error || 'Anthropic API error',
          status: response.status,
          details: data
        })
      };
    }

    // Return the response
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Anthropic proxy error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to process request',
        details: error.message,
        stack: error.stack
      })
    };
  }
};