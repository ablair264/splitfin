// src/middleware/ipBlocker.js
import fs from 'fs/promises';
import path from 'path';
import { Router } from 'express';
import { logger } from '../utils/logger.js';

const BLOCKLIST_FILE = path.resolve('./config/blocklist.json');

// ---- helpers ---------------------------------------------------------------

function getClientIP(req) {
  const xf = (req.headers['x-forwarded-for'] || '').toString();
  const first = xf.split(',')[0].trim();
  return first || req.ip || req.connection?.remoteAddress || 'unknown';
}

function hasSuspiciousDoubleSlash(url) {
  // Reject any path with // beyond the leading slash; do not 301/307
  return /\/\/{2,}/.test(url || '');
}

async function loadStaticBlocklist() {
  try {
    const txt = await fs.readFile(BLOCKLIST_FILE, 'utf8');
    const arr = JSON.parse(txt);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

async function saveStaticBlocklist(set) {
  const arr = Array.from(set);
  await fs.mkdir(path.dirname(BLOCKLIST_FILE), { recursive: true });
  await fs.writeFile(BLOCKLIST_FILE, JSON.stringify(arr, null, 2), 'utf8');
}

// ---- state -----------------------------------------------------------------

let staticBlockedIPs = await loadStaticBlocklist();
const dynamicBlockedIPs = new Set(); // runtime (non-persistent) blocks

// ---- patterns --------------------------------------------------------------

const SUSPICIOUS_PATTERNS = [
  // .env fishing
  /\.env(\.local)?($|\/)/i,
  /(^|\/)(env|\.git|\.ds_store)(\/|$)/i,

  // PHPUnit probes
  /(^|\/)vendor\/phpunit\/phpunit\/src\/Util\/PHP\/eval-stdin\.php/i,
  /(^|\/)phpunit(\/|$).*eval-stdin\.php/i,
  /(^|\/)lib\/phpunit\/.*\/eval-stdin\.php/i,
  /(^|\/)wp-content\/plugins\/.*\/vendor\/phpunit\/.*\/eval-stdin\.php/i,

  // Common CMS/Admin honey paths + .env under them
  /(^|\/)(wp-admin|wp-content|wp-includes|administrator|admin|panel|cms|blog|backup|old|new|lib|vendor|api|v1|v2)\/.*\.env/i
];

// ---- middleware ------------------------------------------------------------

export function ipBlocker(req, res, next) {
  const ip = getClientIP(req);
  const url = req.originalUrl || req.url || '';
  const method = req.method;
  const ua = req.headers['user-agent'] || 'unknown';

  if (staticBlockedIPs.has(ip) || dynamicBlockedIPs.has(ip)) {
    logger.warn(`[IPBlocker] Denylisted IP ${ip}: ${method} ${url} UA="${ua}"`);
    return res.status(403).end();
  }

  if (hasSuspiciousDoubleSlash(url)) {
    logger.warn(`[IPBlocker] Double-slash path from ${ip}: ${method} ${url}`);
    return res.status(404).end();
  }

  if (SUSPICIOUS_PATTERNS.some(rx => rx.test(url))) {
    logger.warn(`[IPBlocker] Suspicious path from ${ip}: ${method} ${url}`);
    return res.status(410).end(); // fast/futile
  }

  return next();
}

// ---- programmatic control --------------------------------------------------

export function blockIP(ip, reason = 'manual') {
  dynamicBlockedIPs.add(ip);
  logger.warn(`[IPBlocker] Manually blocked ${ip} (${reason})`);
}

export function unblockIP(ip) {
  dynamicBlockedIPs.delete(ip);
  staticBlockedIPs.delete(ip);
}

// ---- admin API (file-backed) -----------------------------------------------

export function createBlocklistAPI(adminApiKey) {
  const r = Router();

  // tiny auth wall for admin endpoints
  r.use((req, res, next) => {
    const key = req.headers['x-admin-api-key'];
    if (key !== adminApiKey) return res.status(401).json({ error: 'Unauthorized' });
    next();
  });

  // list all blocked IPs (static + dynamic)
  r.get('/blocklist', (_req, res) => {
    res.json({
      static: Array.from(staticBlockedIPs),
      dynamic: Array.from(dynamicBlockedIPs)
    });
  });

  // add to static blocklist (persists to disk)
  r.post('/blocklist', async (req, res) => {
    const { ip, reason = 'admin' } = req.body || {};
    if (!ip || typeof ip !== 'string') {
      return res.status(400).json({ error: 'Bad Request', message: 'ip is required' });
    }
    staticBlockedIPs.add(ip);
    await saveStaticBlocklist(staticBlockedIPs);
    logger.warn(`[IPBlocker] Persistently blocked ${ip} (${reason})`);
    res.status(201).json({ ok: true, ip });
  });

  // remove from static blocklist
  r.delete('/blocklist/:ip', async (req, res) => {
    const { ip } = req.params;
    if (!staticBlockedIPs.has(ip)) {
      return res.status(404).json({ error: 'Not Found', message: 'IP not in static blocklist' });
    }
    staticBlockedIPs.delete(ip);
    await saveStaticBlocklist(staticBlockedIPs);
    logger.info(`[IPBlocker] Unblocked (static) ${ip}`);
    res.json({ ok: true, ip });
  });

  // optional: add/remove dynamic blocks (non-persistent)
  r.post('/blocklist/dynamic', (req, res) => {
    const { ip, reason = 'admin' } = req.body || {};
    if (!ip || typeof ip !== 'string') {
      return res.status(400).json({ error: 'Bad Request', message: 'ip is required' });
    }
    dynamicBlockedIPs.add(ip);
    logger.warn(`[IPBlocker] Runtime blocked ${ip} (${reason})`);
    res.status(201).json({ ok: true, ip });
  });

  r.delete('/blocklist/dynamic/:ip', (req, res) => {
    const { ip } = req.params;
    if (!dynamicBlockedIPs.has(ip)) {
      return res.status(404).json({ error: 'Not Found', message: 'IP not in dynamic blocklist' });
    }
    dynamicBlockedIPs.delete(ip);
    logger.info(`[IPBlocker] Unblocked (dynamic) ${ip}`);
    res.json({ ok: true, ip });
  });

  return r;
}
