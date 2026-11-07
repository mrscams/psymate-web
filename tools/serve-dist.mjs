#!/usr/bin/env node
// Sert l'application construite (dist/psymate-web/browser) pour les e2e : les deux langues
// sous /fr/ et /en/ (ng serve n'en sert qu'une à la fois), retour sur index.html pour les routes
// du SPA, et proxy /api → psymate-api, comme proxy.conf.json en développement.
// Usage : pnpm build, puis node tools/serve-dist.mjs (PORT=4200, API_URL=http://localhost:8080).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve('dist/psymate-web/browser');
const PORT = Number(process.env['PORT'] ?? 4200);
const API = new URL(process.env['API_URL'] ?? 'http://localhost:8080');
const LOCALES = ['fr', 'en'];
const DEFAULT_LOCALE = 'fr';
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

if (!LOCALES.every((locale) => existsSync(join(ROOT, locale, 'index.html')))) {
  console.error(`[serve-dist] ${ROOT} ne contient pas /fr et /en : lance d'abord pnpm build.`);
  process.exit(1);
}

function proxyToApi(req, res) {
  const upstream = request(
    {
      hostname: API.hostname,
      port: API.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: API.host },
    },
    (apiRes) => {
      res.writeHead(apiRes.statusCode ?? 502, apiRes.headers);
      apiRes.pipe(res);
    },
  );
  upstream.on('error', () => {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`psymate-api injoignable sur ${API.origin}`);
  });
  req.pipe(upstream);
}

function sendFile(res, file, status = 200) {
  res.writeHead(status, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    proxyToApi(req, res);
    return;
  }

  const locale = url.pathname.split('/')[1];
  if (!LOCALES.includes(locale)) {
    const rest = url.pathname === '/' ? '/' : url.pathname;
    res.writeHead(302, { location: `/${DEFAULT_LOCALE}${rest}${url.search}` });
    res.end();
    return;
  }

  const file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT + sep)) {
    res.writeHead(400).end();
    return;
  }
  if (existsSync(file) && statSync(file).isFile()) {
    sendFile(res, file);
  } else if (extname(url.pathname)) {
    res.writeHead(404).end();
  } else {
    sendFile(res, join(ROOT, locale, 'index.html'));
  }
});

server.listen(PORT, 'localhost', () => {
  console.log(`[serve-dist] http://localhost:${PORT}/fr/ et /en/ ; /api → ${API.origin}`);
});
