// middleware/attackSurfaceGuard.js

// FIX: Import CommonJS default, then destructure
import pathToRegexpPkg from 'path-to-regexp';
const { match } = pathToRegexpPkg;

// Very small, very fast wall at the door
const BLOCKLIST = [
  // .env fishing
  /^\/(\w+\/)*\.env(\.local)?$/i,
  /^\/(\w+\/)*(env|\.env|\.git|\.ds_store)(\/|$)/i,
  // PHPUnit probes
  /(^|\/)vendor\/phpunit\/phpunit\/src\/Util\/PHP\/eval-stdin\.php/i,
  /(^|\/)phpunit(\/|$).*eval-stdin\.php/i
];

export function attackSurfaceGuard({ allowlist = [] } = {}) {
  const allows = allowlist.map(({ method, path }) => ({
    method: method.toUpperCase(),
    re: match(path)
  }));

  return (req, res, next) => {
    const p = req.path || '';

    if (BLOCKLIST.some(rx => rx.test(p))) {
      return res.status(410).end();
    }

    if (allows.length) {
      const ok = allows.some(a => a.method === req.method && a.re(p));
      if (!ok) return res.status(404).end();
    }

    next();
  };
}