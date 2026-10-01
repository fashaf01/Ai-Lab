import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, balanceOf } from '../src/db.js';
import { createMarket } from '../src/market.js';
import { splitSale, splitWithdrawal } from '../src/money.js';

const cfg = { saleFeeBps: 1000, withdrawFeeBps: 300, minWithdrawCents: 2000, maxPriceCents: 2500, adminEmail: 'a@x.io' };
const payments = { name: 'test', charge: async () => ({ ok: true, reference: 'r' }), payout: async () => ({ ok: true, reference: 'p' }) };

function setup() {
  const db = openDb(':memory:');
  const m = createMarket(db, cfg, payments);
  const mk = (email) => ({ id: m.register({ email, name: 'User ' + email, password: 'password123' }).user.id });
  return { db, m, mk };
}
const item = (price) => ({ title: 'Cool plugin', summary: 'Does a cool thing well', description: 'A longer description here.',
  category: 'plugin', priceCents: price, deliveryUrl: 'https://example.com/file.zip' });

test('fee math', () => {
  assert.deepEqual(splitSale(499, 1000), { fee: 50, net: 449 });
  assert.deepEqual(splitSale(0, 1000), { fee: 0, net: 0 });
  assert.deepEqual(splitWithdrawal(2000, 300), { fee: 60, payout: 1940 });
});

test('sale credits creator net and platform fee; delivery link only after purchase', async () => {
  const { db, m, mk } = setup();
  const seller = mk('s@x.io'), buyer = mk('b@x.io');
  const it = m.createItem(seller, item(500));
  assert.equal(m.getItem(it.id, buyer).deliveryUrl, undefined);
  assert.equal(m.getItem(it.id, null).deliveryUrl, undefined);
  await m.buy(buyer, it.id);
  assert.equal(m.getItem(it.id, buyer).deliveryUrl, 'https://example.com/file.zip');
  assert.equal(balanceOf(db, seller.id), 450);
  assert.equal(m.adminSummary().saleFeesCents, 50);
  await assert.rejects(m.buy(buyer, it.id), /already own/);
  await assert.rejects(m.buy(seller, it.id), /own item/);
});

test('free items cost nothing and book no money', async () => {
  const { db, m, mk } = setup();
  const seller = mk('s@x.io'), buyer = mk('b@x.io');
  const it = m.createItem(seller, item(0));
  await m.buy(buyer, it.id);
  assert.equal(balanceOf(db, seller.id), 0);
  assert.equal(m.library(buyer).length, 1);
});

test('price cap and validation', () => {
  const { m, mk } = setup();
  const s = mk('s@x.io');
  assert.throws(() => m.createItem(s, item(2501)), /Price/);
  assert.throws(() => m.createItem(s, { ...item(100), deliveryUrl: 'javascript:alert(1)' }), /link/);
});

test('withdrawal: threshold, hold, platform share on paid, release on reject', async () => {
  const { db, m, mk } = setup();
  const seller = mk('s@x.io');
  const it = m.createItem(seller, item(2500)); // net 2250 per sale
  const b1 = mk('b1@x.io'), b2 = mk('b2@x.io');
  await m.buy(b1, it.id);
  assert.equal(balanceOf(db, seller.id), 2250);
  assert.throws(() => m.requestWithdrawal(seller, { amountCents: 1000, payoutDetails: 'me@pp.com' }), /Minimum/);
  assert.throws(() => m.requestWithdrawal(seller, { amountCents: 9999, payoutDetails: 'me@pp.com' }), /more than/);

  const w = m.requestWithdrawal(seller, { amountCents: 2000, payoutDetails: 'me@pp.com' });
  assert.equal(w.feeCents, 60); assert.equal(w.payoutCents, 1940);
  assert.equal(balanceOf(db, seller.id), 250); // held immediately

  await m.resolveWithdrawal(w.id, 'paid');
  assert.equal(m.adminSummary().withdrawFeesCents, 60);
  await assert.rejects(m.resolveWithdrawal(w.id, 'paid'), /Already/);

  await m.buy(b2, it.id); // balance 2500
  const w2 = m.requestWithdrawal(seller, { amountCents: 2500, payoutDetails: 'me@pp.com' });
  assert.equal(balanceOf(db, seller.id), 0);
  await m.resolveWithdrawal(w2.id, 'rejected');
  assert.equal(balanceOf(db, seller.id), 2500); // money returned
  assert.equal(m.adminSummary().withdrawFeesCents, 60); // no share on rejected
});

test('books balance: creators owed + platform revenue + paid out == gross sales', async () => {
  const { m, mk } = setup();
  const seller = mk('s@x.io'), b = mk('b@x.io'), c = mk('c@x.io');
  const it = m.createItem(seller, item(2500));
  await m.buy(b, it.id); await m.buy(c, it.id);
  const w = m.requestWithdrawal(seller, { amountCents: 2000, payoutDetails: 'me@pp.com' });
  await m.resolveWithdrawal(w.id, 'paid');
  const s = m.adminSummary();
  assert.equal(s.owedToCreatorsCents + s.platformRevenueCents + w.payoutCents, 5000);
});

test('auth: wrong password, admin email, sessions', () => {
  const { m } = setup();
  const r = m.register({ email: 'A@x.io', name: 'Admin', password: 'password123' });
  assert.equal(r.user.isAdmin, true);
  assert.throws(() => m.login({ email: 'a@x.io', password: 'nope-nope' }), /Wrong/);
  assert.equal(m.userForToken(r.session.token).email, 'a@x.io');
  m.logout(r.session.token);
  assert.equal(m.userForToken(r.session.token), null);
});

test('creator dashboard totals', async () => {
  const { m, mk } = setup();
  const seller = mk('s@x.io'), b = mk('b@x.io');
  const it = m.createItem(seller, item(500));
  await m.buy(b, it.id);
  const d = m.creatorDashboard(seller);
  assert.deepEqual(d.totals, { sales: 1, grossCents: 500, feesCents: 50, netCents: 450 });
  assert.equal(d.balanceCents, 450);
  assert.equal(d.canWithdraw, false);
  assert.equal(d.items[0].earnedCents, 450);
});
