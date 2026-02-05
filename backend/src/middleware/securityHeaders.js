// middleware/securityHeaders.js
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

function generateNonce() {
  return crypto.randomBytes(16).toString('base64');
}

export function securityHeaders(options = {}) {
  const defaults = {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'strict-dynamic'"], // we add nonce dynamically
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        frameAncestors: ["'none'"]
      }
    },
    referrerPolicy: 'no-referrer',
    xContentTypeOptions: 'nosniff',
    xFrameOptions: 'DENY',
    strictTransportSecurity: {
      maxAge: 15552000, // 180 days
      includeSubDomains: true,
      preload: false
    },
    permissionsPolicy: {
      features: {
        geolocation: [],
        microphone: [],
        camera: [],
        usb: [],
        payment: [],
        magnetometer: [],
        gyroscope: []
      }
    }
  };

  const config = { ...defaults, ...options };

  return function securityHeadersMiddleware(req, res, next) {
    // CSP nonce for inline scripts (if you have docs/ui)
    const nonce = generateNonce();
    res.locals.cspNonce = nonce;

    // Build CSP
    const d = config.contentSecurityPolicy?.directives || {};
    const scriptSrc = d.scriptSrc ? [...d.scriptSrc, `'nonce-${nonce}'`] : [`'nonce-${nonce}'`];
    const csp = Object.entries({ ...d, scriptSrc })
      .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()} ${[].concat(v).join(' ')}`)
      .join('; ');

    res.setHeader('Content-Security-Policy', csp);

    // Other headers
    res.setHeader('Referrer-Policy', config.referrerPolicy);
    res.setHeader('X-Content-Type-Options', config.xContentTypeOptions);
    res.setHeader('X-Frame-Options', config.xFrameOptions);

    const hsts = config.strictTransportSecurity;
    if (hsts) {
      const parts = [`max-age=${hsts.maxAge}`];
      if (hsts.includeSubDomains) parts.push('includeSubDomains');
      if (hsts.preload) parts.push('preload');
      res.setHeader('Strict-Transport-Security', parts.join('; '));
    }

    if (config.permissionsPolicy?.features) {
      const features = config.permissionsPolicy.features;
      const value = Object.entries(features)
        .map(([f, allow]) => `${f}=(${(allow || []).join(' ')})`).join(', ');
      res.setHeader('Permissions-Policy', value);
    }

    // Hide tech stack
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    // Misc helpful headers
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    next();
  };
}

// Minimal sanitiser for odd HTTP inputs
export function sanitizeRequest(req, _res, next) {
  // Trim weird whitespace in headers we use
  if (req.headers['authorization']) req.headers['authorization'] = String(req.headers['authorization']).trim();
  if (req.headers['x-forwarded-for']) req.headers['x-forwarded-for'] = String(req.headers['x-forwarded-for']).trim();
  return next();
}

// Combined helper: sanitiser + headers
export function applySecurity() {
  return [sanitizeRequest, securityHeaders()];
}

// Central error handler with safe JSON
export function secureErrorHandler(err, _req, res, _next) {
  const id = crypto.randomUUID();
  logger.error(`[Error:${id}]`, err);
  const status = err.status || 500;
  res.status(status).json({
    error: status >= 500 ? 'Server Error' : 'Request Error',
    requestId: id
  });
}
