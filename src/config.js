const int = (v, d) => (v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);

export const config = {
  port: int(process.env.PORT, 3000),
  dbPath: process.env.DB_PATH || 'data/market.db',
  // Platform's cut of every paid sale, in basis points (1000 = 10%).
  saleFeeBps: int(process.env.SALE_FEE_BPS, 1000),
  // Platform's share taken when a creator withdraws, in basis points (300 = 3%).
  withdrawFeeBps: int(process.env.WITHDRAW_FEE_BPS, 300),
  // Creators can only withdraw once their balance reaches this (cents).
  minWithdrawCents: int(process.env.MIN_WITHDRAW_CENTS, 2000),
  // Cheap on purpose: the whole point is affordable AI products.
  maxPriceCents: int(process.env.MAX_PRICE_CENTS, 2500),
  // Whoever registers with this email becomes the admin.
  adminEmail: (process.env.ADMIN_EMAIL || '').toLowerCase(),
  secureCookies: process.env.NODE_ENV === 'production',
};

export const CATEGORIES = ['plugin', 'website', 'agent', 'template', 'prompt-pack', 'script', 'other'];
