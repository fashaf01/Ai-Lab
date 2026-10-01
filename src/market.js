import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { tx, balanceOf } from './db.js';
import { splitSale, splitWithdrawal } from './money.js';
import { CATEGORIES } from './config.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);
const now = () => Date.now();

const hashPw = (pw) => {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 64).toString('hex')}`;
};
const checkPw = (pw, stored) => {
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  return a.length === b.length && timingSafeEqual(a, b);
};
const sha = (s) => createHash('sha256').update(s).digest('hex');

export function createMarket(db, config, payments) {
  const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email, isAdmin: !!u.is_admin };

  // ---------- auth ----------
  function newSession(userId) {
    const token = randomBytes(32).toString('hex');
    const ttl = 30 * 24 * 3600 * 1000;
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(sha(token), userId, now() + ttl);
    return { token, maxAgeSec: ttl / 1000 };
  }

  function register({ email, name, password }) {
    email = String(email || '').trim().toLowerCase();
    name = String(name || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Enter a valid email.');
    if (name.length < 2 || name.length > 60) throw bad('Name must be 2–60 characters.');
    if (String(password || '').length < 8) throw bad('Password must be at least 8 characters.');
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) throw bad('That email is already registered.');
    const isAdmin = config.adminEmail && email === config.adminEmail ? 1 : 0;
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (email,name,pass_hash,is_admin,created_at) VALUES (?,?,?,?,?)')
      .run(email, name, hashPw(password), isAdmin, now());
    return { user: publicUser(getUser(lastInsertRowid)), session: newSession(lastInsertRowid) };
  }

  function login({ email, password }) {
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').trim().toLowerCase());
    if (!u || !checkPw(String(password || ''), u.pass_hash)) throw new HttpError(401, 'Wrong email or password.');
    return { user: publicUser(u), session: newSession(u.id) };
  }

  const getUser = (id) => db.prepare('SELECT * FROM users WHERE id=?').get(id);

  function userForToken(token) {
    if (!token) return null;
    const row = db
      .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?')
      .get(sha(token), now());
    return row || null;
  }
  const logout = (token) => token && db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token));

  // ---------- items ----------
  const cardFields = `i.id, i.title, i.summary, i.category, i.price_cents AS priceCents, i.downloads,
    i.ai_tool AS aiTool, i.created_at AS createdAt, u.name AS creator, i.creator_id AS creatorId`;

  function listItems({ q, category, sort } = {}) {
    const where = ["i.status='published'"];
    const args = [];
    if (category && CATEGORIES.includes(category)) { where.push('i.category=?'); args.push(category); }
    if (q) {
      where.push("(i.title LIKE ? ESCAPE '\\' OR i.summary LIKE ? ESCAPE '\\')");
      const like = `%${String(q).slice(0, 80).replace(/[\\%_]/g, '\\$&')}%`;
      args.push(like, like);
    }
    const order = { popular: 'i.downloads DESC', cheap: 'i.price_cents ASC', new: 'i.created_at DESC' }[sort] || 'i.created_at DESC';
    return db
      .prepare(`SELECT ${cardFields} FROM items i JOIN users u ON u.id=i.creator_id WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 100`)
      .all(...args);
  }

  const owns = (userId, item) =>
    !!userId && (item.creator_id === userId || !!db.prepare('SELECT 1 FROM purchases WHERE item_id=? AND buyer_id=?').get(item.id, userId));

  function getItem(id, viewer) {
    const it = db.prepare('SELECT * FROM items WHERE id=?').get(id);
    if (!it || (it.status !== 'published' && it.creator_id !== viewer?.id)) throw new HttpError(404, 'Not found.');
    const creator = getUser(it.creator_id).name;
    const out = {
      id: it.id, title: it.title, summary: it.summary, description: it.description, category: it.category,
      priceCents: it.price_cents, demoUrl: it.demo_url, aiTool: it.ai_tool, downloads: it.downloads,
      status: it.status, creator, creatorId: it.creator_id, createdAt: it.created_at,
      isOwner: viewer?.id === it.creator_id,
    };
    out.owned = owns(viewer?.id, it);
    if (out.owned) out.deliveryUrl = it.delivery_url; // never leaked otherwise
    return out;
  }

  function validateItem(b) {
    const t = (v, min, max, label) => {
      v = String(v ?? '').trim();
      if (v.length < min || v.length > max) throw bad(`${label} must be ${min}–${max} characters.`);
      return v;
    };
    const url = (v, label, required) => {
      v = String(v ?? '').trim();
      if (!v && !required) return null;
      try {
        const u = new URL(v);
        if (!['http:', 'https:'].includes(u.protocol)) throw 0;
        return u.toString();
      } catch { throw bad(`${label} must be a valid http(s) link.`); }
    };
    const price = Math.round(Number(b.priceCents));
    if (!Number.isFinite(price) || price < 0 || price > config.maxPriceCents)
      throw bad(`Price must be between $0 and $${(config.maxPriceCents / 100).toFixed(2)}.`);
    if (!CATEGORIES.includes(b.category)) throw bad('Pick a category.');
    return {
      title: t(b.title, 3, 80, 'Title'),
      summary: t(b.summary, 10, 160, 'Summary'),
      description: t(b.description, 20, 5000, 'Description'),
      category: b.category,
      price_cents: price,
      demo_url: url(b.demoUrl, 'Demo link', false),
      delivery_url: url(b.deliveryUrl, 'Download link', true),
      ai_tool: String(b.aiTool || '').trim().slice(0, 60) || null,
    };
  }

  function createItem(user, body) {
    const v = validateItem(body);
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO items (creator_id,title,summary,description,category,price_cents,demo_url,delivery_url,ai_tool,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(user.id, v.title, v.summary, v.description, v.category, v.price_cents, v.demo_url, v.delivery_url, v.ai_tool, now());
    return getItem(lastInsertRowid, user);
  }

  function updateItem(user, id, body) {
    const it = db.prepare('SELECT * FROM items WHERE id=?').get(id);
    if (!it || it.creator_id !== user.id) throw new HttpError(404, 'Not found.');
    const status = body.status === 'hidden' ? 'hidden' : 'published';
    const v = validateItem(body);
    db.prepare(`UPDATE items SET title=?,summary=?,description=?,category=?,price_cents=?,demo_url=?,delivery_url=?,ai_tool=?,status=? WHERE id=?`)
      .run(v.title, v.summary, v.description, v.category, v.price_cents, v.demo_url, v.delivery_url, v.ai_tool, status, id);
    return getItem(id, user);
  }

  // ---------- buying ----------
  async function buy(user, itemId) {
    const it = db.prepare("SELECT * FROM items WHERE id=? AND status='published'").get(itemId);
    if (!it) throw new HttpError(404, 'Not found.');
    if (it.creator_id === user.id) throw bad("You can't buy your own item.");
    if (owns(user.id, it)) throw bad('You already own this.');

    let ref = null;
    if (it.price_cents > 0) {
      const charge = await payments.charge({ buyerId: user.id, amountCents: it.price_cents });
      if (!charge.ok) throw new HttpError(402, 'Payment failed.');
      ref = charge.reference;
    }
    const { fee, net } = splitSale(it.price_cents, config.saleFeeBps);
    tx(db, () => {
      if (owns(user.id, it)) throw bad('You already own this.'); // lost a race
      const { lastInsertRowid: pid } = db
        .prepare('INSERT INTO purchases (item_id,buyer_id,price_cents,fee_cents,net_cents,payment_ref,created_at) VALUES (?,?,?,?,?,?,?)')
        .run(it.id, user.id, it.price_cents, fee, net, ref, now());
      if (it.price_cents > 0) {
        const L = db.prepare('INSERT INTO ledger (user_id,type,amount_cents,ref_id,created_at) VALUES (?,?,?,?,?)');
        L.run(it.creator_id, 'sale', net, pid, now());
        L.run(null, 'sale_fee', fee, pid, now());
      }
      db.prepare('UPDATE items SET downloads=downloads+1 WHERE id=?').run(it.id);
    });
    return getItem(it.id, user);
  }

  const library = (user) =>
    db.prepare(`SELECT ${cardFields}, i.delivery_url AS deliveryUrl, p.created_at AS purchasedAt
                FROM purchases p JOIN items i ON i.id=p.item_id JOIN users u ON u.id=i.creator_id
                WHERE p.buyer_id=? ORDER BY p.created_at DESC`).all(user.id);

  // ---------- creator money ----------
  function creatorDashboard(user) {
    const items = db.prepare(
      `SELECT i.id, i.title, i.price_cents AS priceCents, i.status, i.downloads,
              COALESCE((SELECT SUM(net_cents) FROM purchases WHERE item_id=i.id),0) AS earnedCents
       FROM items i WHERE creator_id=? ORDER BY created_at DESC`).all(user.id);
    const t = db.prepare(
      `SELECT COUNT(*) AS sales, COALESCE(SUM(p.price_cents),0) AS gross, COALESCE(SUM(p.fee_cents),0) AS fees, COALESCE(SUM(p.net_cents),0) AS net
       FROM purchases p JOIN items i ON i.id=p.item_id WHERE i.creator_id=? AND p.price_cents>0`).get(user.id);
    const withdrawals = db.prepare('SELECT * FROM withdrawals WHERE creator_id=? ORDER BY id DESC').all(user.id).map(wd);
    const balance = balanceOf(db, user.id);
    return {
      items, totals: { sales: t.sales, grossCents: t.gross, feesCents: t.fees, netCents: t.net },
      balanceCents: balance, minWithdrawCents: config.minWithdrawCents,
      canWithdraw: balance >= config.minWithdrawCents,
      saleFeeBps: config.saleFeeBps, withdrawFeeBps: config.withdrawFeeBps, withdrawals,
    };
  }
  const wd = (w) => ({
    id: w.id, grossCents: w.gross_cents, feeCents: w.fee_cents, payoutCents: w.payout_cents,
    status: w.status, createdAt: w.created_at, resolvedAt: w.resolved_at, payoutDetails: w.payout_details,
  });

  function requestWithdrawal(user, { amountCents, payoutDetails }) {
    const gross = Math.round(Number(amountCents));
    const details = String(payoutDetails || '').trim().slice(0, 200);
    if (!Number.isFinite(gross) || gross <= 0) throw bad('Enter an amount.');
    if (details.length < 3) throw bad('Tell us where to send the money (e.g. PayPal email).');
    return tx(db, () => {
      const bal = balanceOf(db, user.id);
      if (bal < config.minWithdrawCents)
        throw bad(`You can withdraw once your balance reaches $${(config.minWithdrawCents / 100).toFixed(2)}.`);
      if (gross < config.minWithdrawCents) throw bad(`Minimum withdrawal is $${(config.minWithdrawCents / 100).toFixed(2)}.`);
      if (gross > bal) throw bad('That is more than your balance.');
      const { fee, payout } = splitWithdrawal(gross, config.withdrawFeeBps);
      const { lastInsertRowid: id } = db
        .prepare('INSERT INTO withdrawals (creator_id,gross_cents,fee_cents,payout_cents,payout_details,created_at) VALUES (?,?,?,?,?,?)')
        .run(user.id, gross, fee, payout, details, now());
      db.prepare('INSERT INTO ledger (user_id,type,amount_cents,ref_id,created_at) VALUES (?,?,?,?,?)')
        .run(user.id, 'withdraw_hold', -gross, id, now());
      return wd(db.prepare('SELECT * FROM withdrawals WHERE id=?').get(id));
    });
  }

  // ---------- admin ----------
  function adminSummary() {
    const sum = (type) => db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS s FROM ledger WHERE user_id IS NULL AND type=?').get(type).s;
    const owed = db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS s FROM ledger WHERE user_id IS NOT NULL').get().s;
    const one = (sql) => db.prepare(sql).get().n;
    return {
      saleFeesCents: sum('sale_fee'), withdrawFeesCents: sum('withdraw_fee'),
      platformRevenueCents: sum('sale_fee') + sum('withdraw_fee'),
      owedToCreatorsCents: owed,
      users: one('SELECT COUNT(*) n FROM users'), items: one('SELECT COUNT(*) n FROM items'),
      sales: one('SELECT COUNT(*) n FROM purchases WHERE price_cents>0'),
      pendingWithdrawals: one("SELECT COUNT(*) n FROM withdrawals WHERE status='pending'"),
    };
  }
  const adminWithdrawals = () =>
    db.prepare(`SELECT w.*, u.name AS creator_name, u.email AS creator_email FROM withdrawals w JOIN users u ON u.id=w.creator_id
                ORDER BY (w.status='pending') DESC, w.id DESC LIMIT 200`).all()
      .map((w) => ({ ...wd(w), creator: w.creator_name, creatorEmail: w.creator_email }));

  async function resolveWithdrawal(id, action) {
    const w = db.prepare('SELECT * FROM withdrawals WHERE id=?').get(id);
    if (!w) throw new HttpError(404, 'Not found.');
    if (w.status !== 'pending') throw bad('Already resolved.');
    let ref = null;
    if (action === 'paid') {
      const r = await payments.payout({ creatorId: w.creator_id, amountCents: w.payout_cents });
      if (!r.ok) throw new HttpError(502, 'Payout failed.');
      ref = r.reference;
    } else if (action !== 'rejected') throw bad('Unknown action.');
    tx(db, () => {
      const fresh = db.prepare('SELECT status FROM withdrawals WHERE id=?').get(id);
      if (fresh.status !== 'pending') throw bad('Already resolved.');
      const L = db.prepare('INSERT INTO ledger (user_id,type,amount_cents,ref_id,created_at) VALUES (?,?,?,?,?)');
      if (action === 'paid') L.run(null, 'withdraw_fee', w.fee_cents, id, now());
      else L.run(w.creator_id, 'withdraw_release', w.gross_cents, id, now());
      db.prepare('UPDATE withdrawals SET status=?, payout_ref=?, resolved_at=? WHERE id=?').run(action, ref, now(), id);
    });
    return wd(db.prepare('SELECT * FROM withdrawals WHERE id=?').get(id));
  }

  return {
    publicUser, register, login, logout, userForToken, listItems, getItem, createItem, updateItem,
    buy, library, creatorDashboard, requestWithdrawal, adminSummary, adminWithdrawals, resolveWithdrawal,
  };
}
