import { Router } from 'express';
import { logger } from '../utils/logger.js';

// UPS environment toggle (production | sandbox)
const UPS_BASE = (process.env.UPS_ENV || 'production') === 'sandbox'
  ? 'https://wwwcie.ups.com'
  : 'https://onlinetools.ups.com';
const UPS_API_BASE = `${UPS_BASE}/api`;
const UPS_AUTH_URL = `${UPS_BASE}/security/v1/oauth/token`;
const TRACKINGMORE_API_BASE = 'https://api.trackingmore.com/v4';

export const trackingRouter = Router();

// Simple health for this router
trackingRouter.get('/tracking/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// TrackingMore proxy logic (shared by GET and POST routes)
async function handleTrackingMoreProxy(req, res) {
  try {
    const action = req.query.action;
    logger.info(`[TrackingMore] action=${action} method=${req.method}`);
    const apiKey = process.env.TRACKINGMORE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing TRACKINGMORE_API_KEY' });

    if (action === 'detect') {
      const resp = await fetch(`${TRACKINGMORE_API_BASE}/couriers/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Tracking-Api-Key': apiKey,
        },
        body: JSON.stringify(req.body || {}),
      });
      const text = await resp.text();
      logger.info(`[TrackingMore] detect status=${resp.status}`);
      return res.status(resp.status).type('application/json').send(text);
    }

    if (action === 'create') {
      const resp = await fetch(`${TRACKINGMORE_API_BASE}/trackings/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Tracking-Api-Key': apiKey,
        },
        body: JSON.stringify(req.body || {}),
      });
      const text = await resp.text();
      logger.info(`[TrackingMore] create status=${resp.status}`);
      return res.status(resp.status).type('application/json').send(text);
    }

    if (action === 'get') {
      const tn = req.query.tracking_numbers || '';
      const cc = req.query.courier_code || '';

      // UPS shortcut: call native API instead of TrackingMore for reliability
      if ((cc || '').toLowerCase() === 'ups' && !req.body) {
        const tracking = tn.toString().split(',')[0].trim();
        if (!tracking) return res.status(400).json({ error: 'Missing tracking number' });

        const { UPS_CLIENT_ID, UPS_CLIENT_SECRET } = process.env;
        if (!UPS_CLIENT_ID || !UPS_CLIENT_SECRET) {
          return res.status(500).json({ error: 'Missing UPS credentials' });
        }
        const UPS_BASE = (process.env.UPS_ENV || 'production') === 'sandbox'
          ? 'https://wwwcie.ups.com'
          : 'https://onlinetools.ups.com';
        const UPS_API_BASE = `${UPS_BASE}/api`;
        const UPS_AUTH_URL = `${UPS_BASE}/security/v1/oauth/token`;

        const authHeader = 'Basic ' + Buffer.from(`${UPS_CLIENT_ID}:${UPS_CLIENT_SECRET}`).toString('base64');
        const tokenResp = await fetch(UPS_AUTH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': authHeader,
          },
          body: 'grant_type=client_credentials',
        });
        if (!tokenResp.ok) {
          const text = await tokenResp.text();
          logger.warn(`[UPS] Token fetch failed ${tokenResp.status}: ${text}`);
          return res.status(tokenResp.status).type('application/json').send(text);
        }
        const tokenData = await tokenResp.json();
        const bearer = `Bearer ${tokenData.access_token}`;

        const upsResp = await fetch(`${UPS_API_BASE}/track/v1/details/${encodeURIComponent(tracking)}`, {
          method: 'GET',
          headers: {
            'Authorization': bearer,
            'Content-Type': 'application/json',
            'transId': `splitfin-${Date.now()}`,
            'transactionSrc': 'Splitfin',
          },
        });
        const text = await upsResp.text();
        logger.info(`[UPS] Track response ${upsResp.status} for ${tracking}`);
        return res.status(upsResp.status).type('application/json').send(text);
      }

      // Default: call TrackingMore GET
      const url = `${TRACKINGMORE_API_BASE}/trackings/get?tracking_numbers=${encodeURIComponent(tn)}&courier_code=${encodeURIComponent(cc)}`;
      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'Tracking-Api-Key': apiKey },
      });
      const text = await resp.text();
      logger.info(`[TrackingMore] get status=${resp.status}`);
      return res.status(resp.status).type('application/json').send(text);
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

// TrackingMore: routes
trackingRouter.post('/trackingmore-proxy', handleTrackingMoreProxy);
trackingRouter.get('/trackingmore-proxy', handleTrackingMoreProxy);

// Export the function for use in index.js
export { handleTrackingMoreProxy };

// UPS: Fetch OAuth token
trackingRouter.post('/ups/token', async (req, res) => {
  logger.info('[UPS] Token request received');
  try {
    const { UPS_CLIENT_ID, UPS_CLIENT_SECRET } = process.env;
    if (!UPS_CLIENT_ID || !UPS_CLIENT_SECRET) {
      return res.status(500).json({ error: 'Missing UPS credentials' });
    }

    const authHeader = 'Basic ' + Buffer.from(`${UPS_CLIENT_ID}:${UPS_CLIENT_SECRET}`).toString('base64');
    const resp = await fetch(UPS_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': authHeader,
      },
      body: 'grant_type=client_credentials',
    });
    const text = await resp.text();
    logger.info(`[UPS] Token response status: ${resp.status}`);
    res.status(resp.status).type('application/json').send(text);
  } catch (err) {
    logger.error('[UPS] Token error', err);
    res.status(500).json({ error: String(err) });
  }
});

// UPS: Track package (server fetches fresh token each time for safety)
trackingRouter.get('/ups/track', async (req, res) => {
  try {
    const tracking = req.query.tracking;
    logger.info(`[UPS] Track request for ${tracking}`);
    if (!tracking) return res.status(400).json({ error: 'Missing tracking' });

    const { UPS_CLIENT_ID, UPS_CLIENT_SECRET } = process.env;
    if (!UPS_CLIENT_ID || !UPS_CLIENT_SECRET) {
      return res.status(500).json({ error: 'Missing UPS credentials' });
    }

    const authHeader = 'Basic ' + Buffer.from(`${UPS_CLIENT_ID}:${UPS_CLIENT_SECRET}`).toString('base64');
    const tokenResp = await fetch(UPS_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': authHeader,
      },
      body: 'grant_type=client_credentials',
    });
    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      logger.warn(`[UPS] Token fetch failed ${tokenResp.status}: ${text}`);
      return res.status(tokenResp.status).type('application/json').send(text);
    }
    const tokenData = await tokenResp.json();
    const bearer = `Bearer ${tokenData.access_token}`;

    const upsResp = await fetch(`${UPS_API_BASE}/track/v1/details/${encodeURIComponent(tracking)}`, {
      method: 'GET',
      headers: {
        'Authorization': bearer,
        'Content-Type': 'application/json',
        'transId': `splitfin-${Date.now()}`,
        'transactionSrc': 'Splitfin',
      },
    });
    const text = await upsResp.text();
    logger.info(`[UPS] Track response ${upsResp.status} for ${tracking}`);
    res.status(upsResp.status).type('application/json').send(text);
  } catch (err) {
    logger.error('[UPS] Track error', err);
    res.status(500).json({ error: String(err) });
  }
});

// Royal Mail / Parcelforce: Track package (direct when enabled)
trackingRouter.get('/royalmail/track', async (req, res) => {
  try {
    const tracking = (req.query.tracking || '').toString().trim();
    const carrier = ((req.query.carrier || 'royal-mail').toString().trim() || 'royal-mail').toLowerCase();
    logger.info(`[RoyalMail] Track request for ${tracking} (carrier=${carrier})`);
    if (!tracking) return res.status(400).json({ error: 'Missing tracking' });

    // Try direct Royal Mail integration if enabled and not Parcelforce
    const directEnabled = process.env.ROYALMAIL_DIRECT === 'true';
    logger.info(`[RoyalMail] ROYALMAIL_DIRECT env var: "${process.env.ROYALMAIL_DIRECT}", directEnabled: ${directEnabled}`);
    if (directEnabled && carrier !== 'parcelforce') {
      const clientId = process.env.ROYALMAIL_CLIENT_ID;
      const clientSecret = process.env.ROYALMAIL_CLIENT_SECRET;
      const base = process.env.ROYALMAIL_API_BASE || 'https://api.royalmail.net';

      if (!clientId || !clientSecret) {
        logger.warn('[RoyalMail] ROYALMAIL_DIRECT=true but ROYALMAIL_CLIENT_ID/ROYALMAIL_CLIENT_SECRET missing - falling back to proxy');
      } else {
        try {
          const view = (req.query.view || 'events').toString().toLowerCase();
          const url = view === 'summary'
            ? `${base}/mailpieces/v2/summary?mailPieceId=${encodeURIComponent(tracking)}`
            : `${base}/mailpieces/v2/${encodeURIComponent(tracking)}/events`;

          const clientIpHeader = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip;
          const headers = {
            'Accept': 'application/json',
            'X-IBM-Client-Id': clientId,
            'X-IBM-Client-Secret': clientSecret,
            'X-Accept-RMG-Terms': 'yes',
            'User-Agent': 'Splitfin/1.0 (+https://splitfin.co.uk)',
            'X-Forwarded-For': clientIpHeader
          };

          const rmResp = await fetch(url, { method: 'GET', headers });
          const text = await rmResp.text();
          logger.info(`[RoyalMail] Direct status=${rmResp.status} url=${url}`);
          if (rmResp.ok || rmResp.status === 404 || rmResp.status === 400) {
            return res.status(rmResp.status).type('application/json').send(text);
          }
          logger.warn(`[RoyalMail] Direct call failed with ${rmResp.status}, falling back to proxy`);
        } catch (err) {
          logger.error('[RoyalMail] Direct call error, falling back to proxy', err);
        }
      }
    }

    // Fallback: use TrackingMore proxy to fetch Royal Mail / Parcelforce
    const apiKey = process.env.TRACKINGMORE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing TRACKINGMORE_API_KEY' });

    const url = `${TRACKINGMORE_API_BASE}/trackings/get?tracking_numbers=${encodeURIComponent(tracking)}&courier_code=${encodeURIComponent(carrier)}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'Tracking-Api-Key': apiKey }
    });
    const text = await resp.text();
    logger.info(`[RoyalMail] Proxy get status=${resp.status} for ${tracking}`);
    logger.info(`[RoyalMail] Proxy raw response: ${text.substring(0, 500)}`); // Log first 500 chars
    return res.status(resp.status).type('application/json').send(text);
  } catch (err) {
    logger.error('[RoyalMail] Track error', err);
    return res.status(500).json({ error: String(err) });
  }
});

// Royal Mail OAuth callback (if your Royal Mail app uses OAuth)
// This endpoint captures ?code and ?state and exchanges for tokens if needed.
// Currently we just log and redirect to frontend; extend with token exchange if RM issues OAuth tokens.
trackingRouter.get('/royalmail/oauth/callback', async (req, res) => {
  try {
    const code = (req.query.code || '').toString();
    const state = (req.query.state || '').toString();
    logger.info(`[RoyalMail] OAuth callback received code length=${code.length}, state=${state}`);

    // If Royal Mail issues OAuth tokens, implement exchange here.
    // For now, just redirect to frontend with success parameters.
    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://splitfin.co.uk';
    const params = new URLSearchParams();
    if (code) params.set('code', code);
    if (state) params.set('state', state);
    params.set('provider', 'royalmail');

    return res.redirect(`${FRONTEND_URL}/integrations/royalmail/callback?${params.toString()}`);
  } catch (err) {
    logger.error('[RoyalMail] OAuth callback error', err);
    return res.status(500).json({ error: String(err) });
  }
});

// Test endpoint to check TrackingMore courier info
trackingRouter.get('/royalmail/test', async (req, res) => {
  try {
    const apiKey = process.env.TRACKINGMORE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing TRACKINGMORE_API_KEY' });

    // Get Royal Mail courier info from TrackingMore
    const resp = await fetch(`${TRACKINGMORE_API_BASE}/couriers`, {
      method: 'GET',
      headers: { 'Tracking-Api-Key': apiKey }
    });
    const data = await resp.json();
    
    // Filter for Royal Mail
    const royalMailCourier = Array.isArray(data && data.data)
      ? data.data.find(c => (c && (c.courier_code === 'royal-mail' || (c.courier_name && typeof c.courier_name === 'string' && c.courier_name.toLowerCase().includes('royal mail')))))
      : null;
    
    logger.info('[RoyalMail] Test courier info:', royalMailCourier);
    return res.json({ 
      status: resp.status,
      royalMailCourier,
      note: 'Use a real Royal Mail tracking number from a recent delivery for testing'
    });
  } catch (err) {
    logger.error('[RoyalMail] Test error', err);
    return res.status(500).json({ error: String(err) });
  }
});

// TrackingMore endpoints removed
