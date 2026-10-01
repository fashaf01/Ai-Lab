// Demo data: `npm run seed`. Creates an admin and a few creators with listings.
import { config } from './config.js';
import { openDb } from './db.js';
import { createMarket } from './market.js';
import { payments } from './payments.js';

const db = openDb(config.dbPath);
const m = createMarket(db, { ...config, adminEmail: 'admin@example.com' }, payments);
const pw = 'password123';
const reg = (email, name) => m.register({ email, name, password: pw }).user;
try {
  reg('admin@example.com', 'Platform Admin');
  const mia = reg('mia@example.com', 'Mia Chen');
  const omar = reg('omar@example.com', 'Omar Haddad');
  const items = [
    [mia, 'Invoice Chaser — Gmail add-on', 'Drafts polite payment reminders for overdue invoices in one click.', 'plugin', 499, 'Claude'],
    [mia, 'Bakery Landing Page Kit', 'A complete one-page site for a small shop. Swap the text, publish in minutes.', 'website', 299, 'Claude + v0'],
    [omar, '50 Prompts for Etsy Sellers', 'Product titles, descriptions and tags that read like a human wrote them.', 'prompt-pack', 199, 'ChatGPT'],
    [omar, 'Meeting Notes Agent', 'Turns raw call transcripts into action items and a short summary.', 'agent', 799, 'Claude'],
    [omar, 'Free Resume Template (HTML)', 'Clean, printable single-page resume. Free forever.', 'template', 0, 'Claude'],
  ];
  for (const [u, title, summary, category, priceCents, aiTool] of items)
    m.createItem({ id: u.id }, { title, summary, category, priceCents, aiTool, deliveryUrl: 'https://example.com/download/' + encodeURIComponent(title),
      description: `${summary}\n\nWhat you get: the full source, a short setup guide and free updates from the creator.`, demoUrl: '' });
  console.log(`Seeded. Log in with admin@example.com / mia@example.com / omar@example.com, password: ${pw}`);
} catch (e) { console.log('Seed skipped:', e.message); }
