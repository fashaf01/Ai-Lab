// Payment provider boundary. The demo provider approves every charge and
// "pays out" instantly, so the marketplace logic can be exercised end to end.
//
// To go live, implement the same two functions with a real provider
// (e.g. Stripe Checkout + Stripe Connect for creator payouts) and keep the
// ledger in db.js as the source of truth for who is owed what.
export const payments = {
  name: 'demo',
  async charge({ buyerId, amountCents }) {
    return { ok: true, reference: `demo_${buyerId}_${amountCents}_${Date.now()}` };
  },
  async payout({ creatorId, amountCents }) {
    return { ok: true, reference: `demo_payout_${creatorId}_${amountCents}_${Date.now()}` };
  },
};
