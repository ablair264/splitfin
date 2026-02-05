import express from 'express';

export const aiRouter = express.Router();

// CORS preflight handler for all AI routes
aiRouter.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'false');
  res.sendStatus(204);
});

// Simple OpenAI category classifier and description enricher proxies
// Requires process.env.OPENAI_API_KEY. No keys sent to client.

async function callOpenAI(messages, model = process.env.OPENAI_MODEL || 'gpt-4o-mini') {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' }
    })
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  return JSON.parse(data.choices[0].message.content);
}

aiRouter.post('/classify-category', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
    const system = { role: 'system', content: 'You are a product data classifier. Always return valid JSON.' };
    const user = {
      role: 'user',
      content: `Given ONLY this product name, classify the concrete item type (one or two words, Title Case).
Name: ${name}
Rules:
- Return the most specific common item type a shopper would understand.
- If uncertain, return null.
Return ONLY JSON: { "category": "<Title Case or null>" }`
    };
    const out = await callOpenAI([system, user]);
    res.json({ category: typeof out.category === 'string' ? out.category : null });
  } catch (e) {
    res.status(500).json({ error: 'classification_failed', message: e.message });
  }
});

aiRouter.post('/enrich-description', async (req, res) => {
  try {
    const { name, description = '', brand = '', ean = '' } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const system = { role: 'system', content: 'You are a product description writer. Always return valid JSON.' };
    const user = {
      role: 'user',
      content: `Write a compelling product description.
Name: ${name}
Brand: ${brand}
Current Description: ${description || 'None'}
SKU/EAN: ${ean}
Requirements: 50-120 words, engaging, practical benefits, specific details if present.
Return ONLY JSON: { "enhanced_description": "..." }`
    };
    const out = await callOpenAI([system, user], process.env.OPENAI_MODEL || 'gpt-4o');
    res.json({ description: out.enhanced_description || description });
  } catch (e) {
    res.status(500).json({ error: 'enrichment_failed', message: e.message });
  }
});

// Web Search endpoint for AI enrichment (uses Serper.dev if configured; fallback to DDG)
export async function handleWebSearch(req, res) {
  try {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Requested-With');

    // Accept input from JSON body or querystring for flexibility
    const body = req.body || {};
    const query = (typeof body.query === 'string' && body.query) || (typeof req.query?.query === 'string' && req.query.query) || '';
    const limitRaw = body.limit ?? req.query?.limit;
    const limit = Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : 5;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query is required' });
    }

    const lim = Math.max(1, Math.min(10, Number(limit) || 5));
    const serperKey = process.env.SERPER_API_KEY || process.env.SERP_API_KEY || '';
    if (serperKey) {
      try {
        const r = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-KEY': serperKey },
          body: JSON.stringify({ q: query, num: lim })
        });
        if (r.ok) {
          const data = await r.json();
          const organic = Array.isArray(data.organic) ? data.organic : [];
          const results = organic.slice(0, lim).map((o) => ({
            title: o.title || '',
            url: o.link || o.url || '',
            snippet: o.snippet || o.description || ''
          }));
          return res.json({ results });
        }
      } catch (e) {
        // continue to fallback
      }
    }

    // DuckDuckGo HTML fallback
    try {
      const ddgUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const rr = await fetch(ddgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await rr.text();
      const results = [];
      // Use RegExp constructor to avoid literal parsing issues
      const re = new RegExp('<a rel="nofollow" class="result__a" href="([^\"]+)">(.*?)</a>[\\s\\S]*?<a class="result__snippet"[^>]*>([\\s\\S]*?)</a>', 'g');
      let m; let count = 0;
      while ((m = re.exec(html)) && count < lim) {
        const url = m[1];
        const title = m[2].replace(/<[^>]+>/g, '');
        const snippet = m[3].replace(/<[^>]+>/g, '');
        results.push({ title, url, snippet });
        count++;
      }
      return res.json({ results });
    } catch (e) {
      return res.json({ results: [] });
    }
  } catch (e) {
    res.status(500).json({ error: 'web_search_failed', message: e.message });
  }
}

aiRouter.post('/web-search', handleWebSearch);
// Allow mounting at /api/ai-web-search (root) as well
aiRouter.post('/', handleWebSearch);

// Image analysis endpoint for imageProcessingService
aiRouter.post('/analyze-image', async (req, res) => {
  try {
    const { image, fileType, fileName } = req.body || {};
    if (!image) return res.status(400).json({ error: 'image is required' });
    
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this product image of a single catalogue item. Output JSON only: {"productType": "...", "color": "...", "confidence": 0-1, "details": "..."}. Rules: 1) Be specific for productType (e.g., Decorative Candle, Throw Pillow, Wall Art). 2) Report the OBJECT color only; ignore plain white/gray studio backgrounds or shadows. If only the background is visible, set color to "Unknown". 3) Keep details concise.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${fileType};base64,${image}`,
                  detail: 'low'
                }
              }
            ]
          }
        ],
        max_tokens: 300,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const contentRaw = data.choices[0]?.message?.content || '';
    
    // Strip markdown code blocks if present
    const content = contentRaw
      .replace(/^```(json)?/i, '')
      .replace(/```$/i, '')
      .trim();

    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch (_) {
      // Try to extract JSON from content
      const start = contentRaw.indexOf('{');
      const end = contentRaw.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        const jsonSlice = contentRaw.slice(start, end + 1);
        analysis = JSON.parse(jsonSlice);
      } else {
        throw new Error('Invalid JSON response from OpenAI');
      }
    }

    res.json({
      productType: analysis.productType || 'Unknown',
      color: analysis.color || 'Unknown',
      confidence: Math.min(analysis.confidence || 0.8, 1.0),
      details: analysis.details || 'AI analysis completed'
    });

  } catch (e) {
    res.status(500).json({ error: 'image_analysis_failed', message: e.message });
  }
});

// Chat completion endpoint for openaiService
aiRouter.post('/chat-completion', async (req, res) => {
  // Ensure CORS headers are set for this endpoint
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'false');
  
  try {
    const { messages, model = 'gpt-3.5-turbo', max_tokens = 300, temperature = 0.7, functions, function_call } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const requestBody = {
      model,
      messages,
      max_tokens,
      temperature
    };

    // Add function calling if provided
    if (functions) {
      requestBody.functions = functions;
      if (function_call) {
        requestBody.function_call = function_call;
      }
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    res.json(data);

  } catch (e) {
    res.status(500).json({ error: 'chat_completion_failed', message: e.message });
  }
});

// Generate insight endpoint for aiInsightService
aiRouter.post('/generate-insight', async (req, res) => {
  try {
    const { prompt, model = 'gpt-3.5-turbo', max_tokens = 500, temperature = 0.7 } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const system = { role: 'system', content: 'You are a business data analyst. Provide actionable insights based on the data provided.' };
    const user = { role: 'user', content: prompt };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [system, user],
        max_tokens,
        temperature
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || 'Analysis completed';

    res.json({
      content,
      insight: content,
      model_used: model
    });

  } catch (e) {
    res.status(500).json({ error: 'insight_generation_failed', message: e.message });
  }
});

// Embedding endpoint for semantic search
aiRouter.post('/embedding', async (req, res) => {
  // Ensure CORS headers are set for this endpoint
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'false');
  
  try {
    const { input, model = 'text-embedding-3-small' } = req.body || {};
    if (!input) return res.status(400).json({ error: 'input is required' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    res.json(data);

  } catch (e) {
    res.status(500).json({ error: 'embedding_failed', message: e.message });
  }
});
