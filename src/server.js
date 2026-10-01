import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, CATEGORIES } from './config.js';
import { openDb } from './db.js';
import { createMarket, HttpError } from './market.js';
import { payments } from './payments.js';

const PUBLIC = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

export function createApp(db = openDb(config.dbPath)) {
  const m = createMarket(db, config, payments);
  const buckets = new Map(); // crude per-IP limiter for auth endpoints

  const cookieToken = (req) => /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  };
  const setCookie = (token, maxAge) =>
    `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${config.secureCookies ? '; Secure' : ''}`;

  async function readJson(req) {
    let size = 0; const chunks = [];
    for await (const c of req) {
      if ((size += c.length) > 100_000) throw new HttpError(413, 'Too large.');
      chunks.push(c);
    }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new HttpError(400, 'Bad JSON.'); }
  }

  function limited(req) {
    const ip = req.socket.remoteAddress, t = Date.now();
    const hits = (buckets.get(ip) || []).filter((x) => t - x < 60_000);
    hits.push(t); buckets.set(ip, hits);
    return hits.length > 20;
  }

  async function api(req, res, url) {
    const token = cookieToken(req);
    const user = m.userForToken(token);
    const route = `${req.method} ${url.pathname}`;
    const need = () => { if (!user) throw new HttpError(401, 'Please log in.'); return user; };
    const admin = () => { if (!need().is_admin) throw new HttpError(403, 'Admins only.'); };
    if (req.method !== 'GET' && !(req.headers['content-type'] || '').startsWith('application/json'))
      throw new HttpError(415, 'JSON only.'); // also blocks cross-site form posts
    const body = req.method === 'GET' ? {} : await readJson(req);
    let p;

    if (route === 'GET /api/config')
      return send(res, 200, { categories: CATEGORIES, saleFeeBps: config.saleFeeBps, withdrawFeeBps: config.withdrawFeeBps,
        minWithdrawCents: config.minWithdrawCents, maxPriceCents: config.maxPriceCents, paymentMode: payments.name });
    if (route === 'GET /api/me') return send(res, 200, { user: m.publicUser(user) || null });
    if (route === 'POST /api/register' || route === 'POST /api/login') {
      if (limited(req)) throw new HttpError(429, 'Too many attempts. Try again in a minute.');
      const r = route.endsWith('register') ? m.register(body) : m.login(body);
      return send(res, 200, { user: r.user }, { 'set-cookie': setCookie(r.session.token, r.session.maxAgeSec) });
    }
    if (route === 'POST /api/logout') { m.logout(token); return send(res, 200, {}, { 'set-cookie': setCookie('', 0) }); }

    if (route === 'GET /api/items')
      return send(res, 200, { items: m.listItems(Object.fromEntries(url.searchParams)) });
    if (route === 'POST /api/items') return send(res, 201, m.createItem(need(), body));
    if ((p = /^\/api\/items\/(\d+)$/.exec(url.pathname))) {
      if (req.method === 'GET') return send(res, 200, m.getItem(+p[1], user));
      if (req.method === 'PUT') return send(res, 200, m.updateItem(need(), +p[1], body));
    }
    if (req.method === 'POST' && (p = /^\/api\/items\/(\d+)\/buy$/.exec(url.pathname)))
      return send(res, 200, await m.buy(need(), +p[1]));

    if (route === 'GET /api/library') return send(res, 200, { items: m.library(need()) });
    if (route === 'GET /api/creator') return send(res, 200, m.creatorDashboard(need()));
    if (route === 'POST /api/withdrawals') return send(res, 201, m.requestWithdrawal(need(), body));

    if (route === 'GET /api/admin/summary') { admin(); return send(res, 200, m.adminSummary()); }
    if (route === 'GET /api/admin/withdrawals') { admin(); return send(res, 200, { withdrawals: m.adminWithdrawals() }); }
    if (req.method === 'POST' && (p = /^\/api\/admin\/withdrawals\/(\d+)\/(paid|rejected)$/.exec(url.pathname))) {
      admin(); return send(res, 200, await m.resolveWithdrawal(+p[1], p[2]));
    }
    throw new HttpError(404, 'Not found.');
  }

  async function serveStatic(res, pathname) {
    let rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
    if (!MIME[extname(rel)]) rel = '/index.html'; // SPA fallback
    try {
      const data = await readFile(join(PUBLIC, rel));
      res.writeHead(200, { 'content-type': MIME[extname(rel)], 'x-content-type-options': 'nosniff' });
      res.end(data);
    } catch { res.writeHead(404); res.end('Not found'); }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else await serveStatic(res, url.pathname);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      send(res, 500, { error: 'Something went wrong.' });
    }
  });
  return { server, db };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = createApp();
  server.listen(config.port, () => console.log(`AI Lab marketplace on http://localhost:${config.port}`));
}
