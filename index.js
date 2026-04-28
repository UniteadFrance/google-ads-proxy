'use strict';

const express = require('express');
const https = require('https');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 8080;
const PROXY_SECRET = process.env.PROXY_SECRET || 'unyx-gads-2026';
const GOOGLE_ADS_BASE = 'https://googleads.googleapis.com';

// ─── 1. Health check — NO auth, avant tout middleware ────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ─── 2. Middleware d'authentification ────────────────────────────────────────
app.use((req, res, next) => {
  const secret = req.headers['x-proxy-secret'];
  if (secret !== PROXY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// ─── 3. Parse le body en buffer brut ─────────────────────────────────────────
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// ─── 4. Proxy — toutes les routes vers googleapis ────────────────────────────
app.use((req, res) => {
  const targetUrl = new URL(`${GOOGLE_ADS_BASE}${req.path}`);

  for (const [key, value] of Object.entries(req.query)) {
    targetUrl.searchParams.set(key, value);
  }

  const forwardHeaders = {
    'content-type': req.headers['content-type'] || 'application/json',
    'authorization': req.headers['authorization'],
    'developer-token': req.headers['developer-token'],
  };
  if (req.headers['login-customer-id']) {
    forwardHeaders['login-customer-id'] = req.headers['login-customer-id'];
  }
  Object.keys(forwardHeaders).forEach(
    k => forwardHeaders[k] === undefined && delete forwardHeaders[k]
  );

  const body = Buffer.isBuffer(req.body) && req.body.length > 0 ? req.body : null;
  if (body) forwardHeaders['content-length'] = Buffer.byteLength(body);

  const options = {
    hostname: 'googleads.googleapis.com',
    path: targetUrl.pathname + (targetUrl.search || ''),
    method: req.method,
    headers: forwardHeaders,
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      try { res.setHeader(key, value); } catch (_) {}
    }
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[proxy error]', err.message);
    res.status(502).json({ error: 'Bad Gateway', detail: err.message });
  });

  if (body) proxyReq.write(body);
  proxyReq.end();
});

// ─── 5. Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`gads-proxy listening on port ${PORT}`);
});
