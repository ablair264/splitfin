import crypto from 'crypto';
import { logger } from '../utils/logger.js';

// Generate nonce for CSP
function generateNonce() {
  return crypto.randomBytes(16).toString('base64');
}

// Security headers middleware
export function securityHeaders(options = {}) {
  const defaults = {
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'strict-dynamic'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'none'"],
        workerSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
      }
    },
    
    // Strict Transport Security (HSTS)
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    
    // Additional security headers
    noSniff: true,
    xssFilter: true,
    referrerPolicy: 'strict-origin-when-cross-origin',
    frameOptions: 'DENY',
    permissionsPolicy: {
      accelerometer: [],
      camera: [],
      geolocation: [],
      gyroscope: [],
      magnetometer: [],
      microphone: [],
      payment: [],
      usb: []
    }
  };
  
  const config = { ...defaults, ...options };
  
  return function(req, res, next) {
    // Generate CSP nonce
    const nonce = generateNonce();
    res.locals.cspNonce = nonce;
    
    // Content Security Policy
    if (config.contentSecurityPolicy) {
      const cspDirectives = Object.entries(config.contentSecurityPolicy.directives)
        .filter(([, value]) => value !== null)
        .map(([key, values]) => {
          const directive = key.replace(/([A-Z])/g, '-$1').toLowerCase();
          
          if (key === 'scriptSrc' && values.includes("'strict-dynamic'")) {
            values = [...values, `'nonce-${nonce}'`];
          }
          
          if (values.length === 0) {
            return directive;
          }
          
          return `${directive} ${values.join(' ')}`;
        })
        .join('; ');
      
      res.setHeader('Content-Security-Policy', cspDirectives);
    }
    
    // Strict Transport Security
    if (config.hsts && (req.secure || req.headers['x-forwarded-proto'] === 'https')) {
      const hstsValue = [
        `max-age=${config.hsts.maxAge}`,
        config.hsts.includeSubDomains && 'includeSubDomains',
        config.hsts.preload && 'preload'
      ].filter(Boolean).join('; ');
      
      res.setHeader('Strict-Transport-Security', hstsValue);
    }
    
    // X-Content-Type-Options
    if (config.noSniff) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    
    // X-XSS-Protection (legacy but still useful)
    if (config.xssFilter) {
      res.setHeader('X-XSS-Protection', '1; mode=block');
    }
    
    // Referrer Policy
    if (config.referrerPolicy) {
      res.setHeader('Referrer-Policy', config.referrerPolicy);
    }
    
    // X-Frame-Options
    if (config.frameOptions) {
      res.setHeader('X-Frame-Options', config.frameOptions);
    }
    
    // Permissions Policy
    if (config.permissionsPolicy) {
      const permissionsValue = Object.entries(config.permissionsPolicy)
        .map(([feature, allowList]) => {
          if (allowList.length === 0) {
            return `${feature}=()`;
          }
          return `${feature}=(${allowList.join(' ')})`;
        })
        .join(', ');
      
      res.setHeader('Permissions-Policy', permissionsValue);
    }
    
    // Remove potentially dangerous headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    
    // Add custom security headers
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    
    next();
  };
}

// CORS configuration with security
export function secureCors(options = {}) {
  const defaults = {
    origin: false, // No CORS by default
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204
  };
  
  const config = { ...defaults, ...options };
  
  // Parse allowed origins from environment
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://splitfin.co.uk,http://localhost:3000,http://localhost:3001')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  
  if (allowedOrigins.length > 0) {
    config.origin = function(origin, callback) {
      // Allow requests with no origin (e.g., mobile apps, Postman)
      if (!origin) {
        return callback(null, true);
      }
      
      // Check against whitelist
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    };
  }
  
  return config;
}

// Request sanitization middleware
export function sanitizeRequest(req, res, next) {
  // Limit request size (skip for multipart — multer handles its own limits)
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  const isMultipart = contentType.startsWith('multipart/');
  const MAX_BODY_SIZE = 1048576; // 1MB for JSON/urlencoded
  const contentLength = parseInt(req.headers['content-length'] || '0');

  if (!isMultipart && contentLength > MAX_BODY_SIZE) {
    logger.warn(`[Sanitize] Request body too large: ${contentLength} bytes from ${req.ip}`);
    return res.status(413).json({
      error: 'Payload Too Large',
      message: 'Request body exceeds maximum size'
    });
  }
  
  // Sanitize headers
  const dangerousHeaders = [
    'x-forwarded-host',
    'x-forwarded-server',
    'x-rewrite-url'
  ];
  
  for (const header of dangerousHeaders) {
    if (req.headers[header]) {
      logger.warn(`[Sanitize] Removed dangerous header ${header} from ${req.ip}`);
      delete req.headers[header];
    }
  }
  
  // Validate content type for POST/PUT/PATCH requests
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    const allowedTypes = [
      'application/json',
      'application/x-www-form-urlencoded',
      'multipart/form-data'
    ];
    
    if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
      logger.warn(`[Sanitize] Invalid content type: ${contentType} from ${req.ip}`);
      return res.status(415).json({
        error: 'Unsupported Media Type',
        message: 'Invalid content type'
      });
    }
  }
  
  // Sanitize query parameters
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === 'string') {
      // Remove potential XSS attempts
      req.query[key] = value
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim();
      
      // Limit parameter length
      if (req.query[key].length > 1000) {
        req.query[key] = req.query[key].substring(0, 1000);
      }
    }
  }
  
  // Add request ID for tracking
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  
  next();
}

// Error handler with security considerations
export function secureErrorHandler(err, req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const requestId = req.id || 'unknown';
  
  // Log the error with context
  logger.error(`[Error] Request ${requestId} from ${ip}:`, {
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body
  });
  
  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production') {
    // Generic error messages for production
    const statusCode = err.statusCode || 500;
    const message = statusCode < 500 ? err.message : 'Internal Server Error';
    
    return res.status(statusCode).json({
      error: message,
      requestId: requestId
    });
  }
  
  // More detailed errors in development
  res.status(err.statusCode || 500).json({
    error: err.message,
    stack: err.stack,
    requestId: requestId
  });
}

// Export combined security middleware
export function applySecurity(app) {
  // Apply in correct order
  app.use(sanitizeRequest);
  app.use(securityHeaders());
  
  // Return middleware chain
  return [
    sanitizeRequest,
    securityHeaders()
  ];
}
