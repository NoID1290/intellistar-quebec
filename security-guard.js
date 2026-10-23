'use strict';

const path = require('node:path');

const MIN_PATCHED_NODE_VERSIONS = {
  22: [22, 23, 4],
  24: [24, 22, 1],
  26: [26, 12, 1],
};

/**
 * Checks whether a Node.js version string (e.g. "24.22.1" or "v24.22.1")
 * includes the October 21, 2026 security patches (CVE-2026-111497 / Node2Shell, etc.).
 */
function isNodeRuntimePatched(versionString = process.versions.node) {
  const clean = String(versionString || '').trim().replace(/^v/i, '');
  const parts = clean.split('.').map(n => parseInt(n, 10));
  if (parts.length < 3 || parts.some(n => Number.isNaN(n))) return false;
  const [major, minor, patch] = parts;

  if (major > 26) return true;
  const minTuple = MIN_PATCHED_NODE_VERSIONS[major];
  if (!minTuple) return false;

  if (minor !== minTuple[1]) return minor > minTuple[1];
  return patch >= minTuple[2];
}

/**
 * Inspects an incoming HTTP request for exploit vectors from the October 2026
 * Node2Shell (CVE-2026-111497), PHP2Shell (CVE-2026-109618 / CVE-2026-109619),
 * NUL-byte hostname/URL truncation (CVE-2026-105482), and non-ASCII/fullwidth Host
 * verification bypass (CVE-2026-105483).
 *
 * Returns null if safe, or { status, error, code } if blocked.
 */
function inspectIncomingRequest(req) {
  const rawUrl = String(req.originalUrl || req.url || '/');
  const hostHeader = String((req.headers && req.headers.host) || '');
  const contentEncoding = String((req.headers && req.headers['content-encoding']) || '').toLowerCase();

  // 1. Mitigate CVE-2026-111497 (Node2Shell):
  // Block inbound Brotli-compressed request bodies before Express/body-parser
  // can pass them to zlib.createBrotliDecompress().
  if (contentEncoding) {
    const encodings = contentEncoding.split(',').map(s => s.trim());
    if (encodings.some(enc => enc === 'br' || enc === 'brotli' || enc === 'x-brotli')) {
      return {
        status: 415,
        code: 'BROTLI_INPUT_BLOCKED',
        error: 'Brotli Content-Encoding on request bodies is not supported (CVE-2026-111497 mitigation).',
      };
    }
  }

  // 2. Mitigate CVE-2026-105482 &CVE-2026-105483:
  // Block NUL bytes (\0 or %00) in URL or Host, and block non-ASCII / fullwidth characters in Host.
  if (rawUrl.includes('\0') || /%00/i.test(rawUrl) || hostHeader.includes('\0') || /%00/i.test(hostHeader)) {
    return {
      status: 400,
      code: 'NUL_BYTE_BLOCKED',
      error: 'Invalid NUL byte in request URL or Host header.',
    };
  }

  if (/[^\x20-\x7e]/.test(hostHeader)) {
    return {
      status: 400,
      code: 'NON_ASCII_HOST_BLOCKED',
      error: 'Invalid non-ASCII characters in Host header.',
    };
  }

  // 3. Decode pathname safely to check for path traversal and PHP2Shell probes
  let pathname = rawUrl;
  const qIndex = rawUrl.indexOf('?');
  const queryString = qIndex >= 0 ? rawUrl.slice(qIndex + 1) : '';
  if (qIndex >= 0) {
    pathname = rawUrl.slice(0, qIndex);
  }

  let decodedPath = pathname;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return {
      status: 400,
      code: 'MALFORMED_URI',
      error: 'Malformed URI path.',
    };
  }

  if (decodedPath.includes('\0')) {
    return {
      status: 400,
      code: 'NUL_BYTE_BLOCKED',
      error: 'Invalid NUL byte in decoded request path.',
    };
  }

  // 4. Block path traversal sequences (.. segments or backslash traversal)
  const normalizedSegments = decodedPath.replace(/\\/g, '/').split('/');
  if (normalizedSegments.includes('..')) {
    return {
      status: 403,
      code: 'PATH_TRAVERSAL_BLOCKED',
      error: 'Path traversal is not permitted.',
    };
  }

  // 5. Block PHP2Shell (CVE-2026-109618 / CVE-2026-109619) & CGI exploit probes
  if (
    /\.(?:php[0-9]?|phtml|phar)(?:$|\/)/i.test(decodedPath) ||
    /^\/cgi-bin(?:\/|$)/i.test(decodedPath) ||
    /(?:^|[?&])(?:-d\b|allow_url_include|auto_prepend_file)/i.test(queryString)
  ) {
    return {
      status: 403,
      code: 'PHP_PROBE_BLOCKED',
      error: 'Forbidden resource.',
    };
  }

  return null;
}

/**
 * Applies standard security response headers to an HTTP response.
 */
function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
}

/**
 * Express middleware that applies security headers and blocks Node2Shell / PHP2Shell /
 * October 2026 Node.js CVE exploit payloads before route handlers or body parsers execute.
 */
function createSecurityMiddleware() {
  return function securityMiddleware(req, res, next) {
    applySecurityHeaders(res);
    const violation = inspectIncomingRequest(req);
    if (violation) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(violation.status).json({
        error: violation.error,
        code: violation.code,
      });
    }
    next();
  };
}

/**
 * Installs security hardening on an Express app instance prior to body-parser/routes.
 */
function installSecurityHardening(app) {
  if (typeof app.disable === 'function') {
    app.disable('x-powered-by');
  }
  app.use(createSecurityMiddleware());
}

/**
 * Safely resolves a relative path inside a root directory, returning null if the
 * resolved path escapes rootDir or contains invalid encoding.
 */
function resolveSafeChildPath(rootDir, relativeInput) {
  try {
    const decoded = decodeURIComponent(String(relativeInput || ''));
    if (decoded.includes('\0')) return null;
    const resolvedRoot = path.resolve(rootDir);
    const cleaned = decoded.replace(/^[\/\\]+/, '');
    const candidate = path.resolve(resolvedRoot, cleaned);
    if (candidate === resolvedRoot || !candidate.startsWith(resolvedRoot + path.sep)) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}

module.exports = {
  MIN_PATCHED_NODE_VERSIONS,
  isNodeRuntimePatched,
  inspectIncomingRequest,
  applySecurityHeaders,
  createSecurityMiddleware,
  installSecurityHardening,
  resolveSafeChildPath,
};

