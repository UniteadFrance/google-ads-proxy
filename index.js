/**
 * Google Ads API Proxy
 * Relaie les appels de Base44 vers googleads.googleapis.com
 * Déployer sur Railway : https://railway.app
 */

const express = require('express');
const app = express();

app.use(express.json());

// Sécurité : clé secrète partagée entre Base44 et ce proxy
const PROXY_SECRET = process.env.PROXY_SECRET || 'changeme';

// Middleware de vérification de la clé secrète
app.use((req, res, next) => {
  const secret = req.headers['x-proxy-secret'];
  if (secret !== PROXY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Route principale : relaie tout vers googleads.googleapis.com
app.all('/googleads/*', async (req, res) => {
  const path = req.path.replace('/googleads', '');
  const targetUrl = `https://googleads.googleapis.com${path}`;

  // Récupère les headers pertinents
  const headers = {
    'Authorization': req.headers['authorization'] || '',
    'developer-token': req.headers['developer-token'] || '',
    'Content-Type': 'application/json',
  };

  // Ajoute login-customer-id si présent
  if (req.headers['login-customer-id']) {
    headers['login-customer-id'] = req.headers['login-customer-id'];
  }

  try {
    const fetchOptions = {
      method: req.method,
      headers,
    };

    if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.text();

    res.status(response.status);
    res.set('Content-Type', 'application/json');
    res.send(data);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Google Ads Proxy running on port ${PORT}`);
});
