import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      pass_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY,
      creator_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      demo_url TEXT,
      delivery_url TEXT NOT NULL,   -- only revealed to buyers and the creator
      ai_tool TEXT,                 -- what AI built it (disclosure)
      status TEXT NOT NULL DEFAULT 'published', -- published | hidden
      downloads INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES items(id),
      buyer_id INTEGER NOT NULL REFERENCES users(id),
      price_cents INTEGER NOT NULL,
      fee_cents INTEGER NOT NULL,
      net_cents INTEGER NOT NULL,
      payment_ref TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE (item_id, buyer_id)
    );
    -- Append-only. user_id NULL = the platform. Creator balance = SUM(amount).
    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      type TEXT NOT NULL, -- sale | sale_fee | withdraw_hold | withdraw_release | withdraw_fee
      amount_cents INTEGER NOT NULL,
      ref_id INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id);
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY,
      creator_id INTEGER NOT NULL REFERENCES users(id),
      gross_cents INTEGER NOT NULL,
      fee_cents INTEGER NOT NULL,
      payout_cents INTEGER NOT NULL,
      payout_details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | rejected
      payout_ref TEXT,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER
    );
  `);
  return db;
}

/** Run fn inside a write transaction; rolls back if it throws. */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const balanceOf = (db, userId) =>
  db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS b FROM ledger WHERE user_id = ?').get(userId).b;
