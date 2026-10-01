// All money is integer cents. Fees are basis points (1 bps = 0.01%).
export function feeOf(amountCents, bps) {
  return Math.round((amountCents * bps) / 10000);
}

/** Split a sale between the platform and the creator. */
export function splitSale(priceCents, saleFeeBps) {
  const fee = priceCents > 0 ? feeOf(priceCents, saleFeeBps) : 0;
  return { fee, net: priceCents - fee };
}

/** Split a withdrawal between the platform's share and what the creator receives. */
export function splitWithdrawal(grossCents, withdrawFeeBps) {
  const fee = feeOf(grossCents, withdrawFeeBps);
  return { fee, payout: grossCents - fee };
}

export const fmt = (cents) => `$${(cents / 100).toFixed(2)}`;
