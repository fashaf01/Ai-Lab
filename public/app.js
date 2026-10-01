const $ = (s) => document.querySelector(s);
const app = $('#app');
let me = null, cfg = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (c) => (c === 0 ? 'Free' : `$${(c / 100).toFixed(2)}`);
const usd = (c) => `$${(c / 100).toFixed(2)}`;
const pct = (bps) => `${bps / 100}%`;
const date = (t) => new Date(t).toLocaleDateString();
const safeHref = (u) => (/^https?:\/\//i.test(u) ? esc(u) : '#');

async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, {
    method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 2200); }
const err = (e) => `<div class="msg err">${esc(e.message || e)}</div>`;
const go = (h) => { location.hash = h; };

function nav() {
  $('#nav').innerHTML = me
    ? `<a href="#/">Browse</a><a href="#/library">My library</a><a href="#/sell">Sell</a><a href="#/creator">Earnings</a>
       ${me.isAdmin ? '<a href="#/admin">Admin</a>' : ''}<button id="out">Log out (${esc(me.name)})</button>`
    : `<a href="#/">Browse</a><a href="#/login">Log in</a><a class="btn" href="#/register">Start selling</a>`;
  $('#out')?.addEventListener('click', async () => { await api('/logout', 'POST'); me = null; nav(); go('#/'); });
}

const itemCard = (i) => `
  <a class="card" href="#/item/${i.id}">
    <div class="row"><span class="tag">${esc(i.category)}</span><span class="price ${i.priceCents ? '' : 'free'}">${money(i.priceCents)}</span></div>
    <h3>${esc(i.title)}</h3><p>${esc(i.summary)}</p>
    <small class="mute">by ${esc(i.creator)} · ${i.downloads} download${i.downloads === 1 ? '' : 's'}${i.aiTool ? ' · made with ' + esc(i.aiTool) : ''}</small>
  </a>`;

// ---------- views ----------
async function home() {
  app.innerHTML = `
    <section class="hero"><h1>Things built with AI, priced for everyone.</h1>
    <p>Plugins, websites, agents and templates from independent creators — usually a few dollars, not a subscription.
    Made something with AI? <a href="#/register">Sell it here</a> and keep ${100 - cfg.saleFeeBps / 100}% of every sale.</p></section>
    <div class="bar">
      <input id="q" type="search" placeholder="Search plugins, sites, agents…" aria-label="Search">
      <select id="cat" aria-label="Category"><option value="">All categories</option>${cfg.categories.map((c) => `<option>${c}</option>`).join('')}</select>
      <select id="sort" aria-label="Sort"><option value="new">Newest</option><option value="popular">Most downloaded</option><option value="cheap">Cheapest</option></select>
    </div><div id="list" class="grid"></div>`;
  const load = async () => {
    const p = new URLSearchParams({ q: $('#q').value, category: $('#cat').value, sort: $('#sort').value });
    try {
      const { items } = await api('/items?' + p);
      $('#list').innerHTML = items.map(itemCard).join('') || '<p class="mute">Nothing found yet.</p>';
    } catch (e) { $('#list').innerHTML = err(e); }
  };
  let t; $('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  $('#cat').addEventListener('change', load); $('#sort').addEventListener('change', load);
  load();
}

async function itemPage(id) {
  const i = await api('/items/' + id);
  const action = i.owned
    ? `<div class="notice">${i.isOwner ? 'This is your listing.' : '✓ You own this.'}</div>
       <p><a class="btn" target="_blank" rel="noopener noreferrer" href="${safeHref(i.deliveryUrl)}">Download</a></p>`
    : `<button class="btn" id="buy">${i.priceCents ? `Buy for ${money(i.priceCents)}` : 'Get it free'}</button>
       ${cfg.paymentMode === 'demo' && i.priceCents ? '<p><small class="mute">Demo mode: no real card is charged.</small></p>' : ''}`;
  app.innerHTML = `
    <a href="#/">← Back</a>
    <div class="panel"><span class="tag">${esc(i.category)}</span>
      <h1>${esc(i.title)}</h1>
      <p class="mute">by ${esc(i.creator)} · ${i.downloads} downloads${i.aiTool ? ' · made with ' + esc(i.aiTool) : ''}</p>
      <p class="desc">${esc(i.description)}</p>
      ${i.demoUrl ? `<p><a target="_blank" rel="noopener noreferrer" href="${safeHref(i.demoUrl)}">Live demo ↗</a></p>` : ''}
      <div id="msg"></div>${action}
      ${i.isOwner ? `<p><a href="#/sell/${i.id}">Edit listing</a></p>` : ''}</div>`;
  $('#buy')?.addEventListener('click', async (e) => {
    if (!me) return go('#/login');
    e.target.disabled = true;
    try { await api(`/items/${id}/buy`, 'POST'); toast('Added to your library'); itemPage(id); }
    catch (x) { $('#msg').innerHTML = err(x); e.target.disabled = false; }
  });
}

function authPage(mode) {
  const reg = mode === 'register';
  app.innerHTML = `<div class="panel narrow"><h1>${reg ? 'Create your account' : 'Welcome back'}</h1><div id="msg"></div>
    <form id="f">${reg ? '<label>Your name</label><input name="name" required minlength="2" autocomplete="name">' : ''}
    <label>Email</label><input name="email" type="email" required autocomplete="email">
    <label>Password</label><input name="password" type="password" required minlength="8" autocomplete="${reg ? 'new' : 'current'}-password">
    <p><button class="btn">${reg ? 'Sign up' : 'Log in'}</button></p></form>
    <p class="mute">${reg ? 'Have an account? <a href="#/login">Log in</a>' : 'New here? <a href="#/register">Create an account</a>'}</p></div>`;
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      me = (await api(reg ? '/register' : '/login', 'POST', Object.fromEntries(new FormData(e.target)))).user;
      nav(); go(reg ? '#/sell' : '#/');
    } catch (x) { $('#msg').innerHTML = err(x); }
  });
}

async function library() {
  const { items } = await api('/library');
  app.innerHTML = `<h1>My library</h1><div class="grid">${items.map((i) => `
    <div class="card"><h3>${esc(i.title)}</h3><p>${esc(i.summary)}</p>
    <a class="btn" target="_blank" rel="noopener noreferrer" href="${safeHref(i.deliveryUrl)}">Download</a></div>`).join('') ||
    '<p class="mute">Nothing yet. <a href="#/">Browse the market</a>.</p>'}</div>`;
}

async function sellForm(id) {
  let i = { title: '', summary: '', description: '', category: cfg.categories[0], priceCents: 299, demoUrl: '', deliveryUrl: '', aiTool: '', status: 'published' };
  if (id) i = await api('/items/' + id);
  app.innerHTML = `<div class="panel narrow" style="max-width:640px"><h1>${id ? 'Edit' : 'List'} your creation</h1>
    <p class="notice">You keep ${100 - cfg.saleFeeBps / 100}% of each sale. Prices up to ${usd(cfg.maxPriceCents)} — we keep things affordable.</p>
    <div id="msg"></div><form id="f">
    <label>Title</label><input name="title" required maxlength="80" value="${esc(i.title)}">
    <label>One-line summary</label><input name="summary" required maxlength="160" value="${esc(i.summary)}">
    <label>Description</label><textarea name="description" rows="6" required maxlength="5000">${esc(i.description)}</textarea>
    <label>Category</label><select name="category">${cfg.categories.map((c) => `<option ${c === i.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
    <label>Price (USD, 0 = free)</label><input name="price" type="number" min="0" max="${cfg.maxPriceCents / 100}" step="0.01" value="${(i.priceCents / 100).toFixed(2)}">
    <label>Made with (AI tool, optional)</label><input name="aiTool" maxlength="60" value="${esc(i.aiTool)}">
    <label>Download link <small>(only buyers see it — Drive, Dropbox, GitHub release…)</small></label><input name="deliveryUrl" type="url" required value="${esc(i.deliveryUrl)}">
    <label>Live demo link (optional)</label><input name="demoUrl" type="url" value="${esc(i.demoUrl)}">
    ${id ? `<label>Visibility</label><select name="status"><option value="published" ${i.status === 'published' ? 'selected' : ''}>Published</option><option value="hidden" ${i.status === 'hidden' ? 'selected' : ''}>Hidden</option></select>` : ''}
    <p><button class="btn">${id ? 'Save' : 'Publish'}</button></p></form></div>`;
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    d.priceCents = Math.round(parseFloat(d.price || '0') * 100); delete d.price;
    try {
      const saved = await api(id ? '/items/' + id : '/items', id ? 'PUT' : 'POST', d);
      toast('Saved'); go('#/item/' + saved.id);
    } catch (x) { $('#msg').innerHTML = err(x); }
  });
}

async function creator() {
  const d = await api('/creator');
  const need = Math.max(0, d.minWithdrawCents - d.balanceCents);
  const prog = Math.min(100, Math.round((d.balanceCents / d.minWithdrawCents) * 100));
  const net = d.canWithdraw ? d.balanceCents - Math.round((d.balanceCents * d.withdrawFeeBps) / 10000) : 0;
  app.innerHTML = `<h1>Your earnings</h1>
    <div class="stats">
      <div class="stat"><small>Available balance</small><b>${usd(d.balanceCents)}</b></div>
      <div class="stat"><small>Sales</small><b>${d.totals.sales}</b></div>
      <div class="stat"><small>You earned (after ${pct(d.saleFeeBps)} fee)</small><b>${usd(d.totals.netCents)}</b></div>
      <div class="stat"><small>Platform fees</small><b>${usd(d.totals.feesCents)}</b></div></div>
    <div class="panel"><h2 style="margin-top:0">Withdraw</h2>
      <div class="bar2"><i style="width:${prog}%"></i></div>
      <p class="mute">${d.canWithdraw ? `You can withdraw now. A ${pct(d.withdrawFeeBps)} service share is taken from the amount you withdraw.`
        : `Withdrawals unlock at ${usd(d.minWithdrawCents)}. ${usd(need)} to go.`}</p>
      <div id="msg"></div>
      ${d.canWithdraw ? `<form id="w"><label>Amount (USD)</label>
        <input name="amount" type="number" step="0.01" min="${d.minWithdrawCents / 100}" max="${d.balanceCents / 100}" value="${(d.balanceCents / 100).toFixed(2)}" required>
        <label>Where should we send it? <small>(e.g. PayPal email)</small></label><input name="details" required maxlength="200">
        <p><button class="btn">Request withdrawal</button> <small class="mute">Example: withdrawing everything pays out about ${usd(net)}.</small></p></form>` : ''}
      ${table(['#', 'Requested', 'Amount', 'Fee', 'You get', 'Status'], d.withdrawals.map((w) =>
        [w.id, date(w.createdAt), usd(w.grossCents), usd(w.feeCents), usd(w.payoutCents), w.status]))}</div>
    <h2>Your listings</h2>${table(['Item', 'Price', 'Downloads', 'Earned', ''], d.items.map((i) =>
      [`<a href="#/item/${i.id}">${esc(i.title)}</a>${i.status === 'hidden' ? ' <small>(hidden)</small>' : ''}`, money(i.priceCents), i.downloads, usd(i.earnedCents), `<a href="#/sell/${i.id}">Edit</a>`]), true)}
    <p><a class="btn" href="#/sell">+ New listing</a></p>`;
  $('#w')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await api('/withdrawals', 'POST', { amountCents: Math.round(parseFloat(f.amount) * 100), payoutDetails: f.details }); toast('Request sent'); creator(); }
    catch (x) { $('#msg').innerHTML = err(x); }
  });
}

function table(head, rows, raw) {
  if (!rows.length) return '<p class="mute">Nothing here yet.</p>';
  return `<div class="scroll"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) =>
    `<tr>${r.map((c) => `<td>${raw ? c : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

async function adminPage() {
  const [s, { withdrawals }] = await Promise.all([api('/admin/summary'), api('/admin/withdrawals')]);
  app.innerHTML = `<h1>Platform admin</h1><div class="stats">
    <div class="stat"><small>Platform revenue</small><b>${usd(s.platformRevenueCents)}</b></div>
    <div class="stat"><small>from sale fees</small><b>${usd(s.saleFeesCents)}</b></div>
    <div class="stat"><small>from withdrawal shares</small><b>${usd(s.withdrawFeesCents)}</b></div>
    <div class="stat"><small>Owed to creators</small><b>${usd(s.owedToCreatorsCents)}</b></div>
    <div class="stat"><small>Users / items / sales</small><b>${s.users} / ${s.items} / ${s.sales}</b></div></div>
    <h2>Withdrawal requests</h2><div id="msg"></div>
    ${table(['#', 'Creator', 'Send to', 'Gross', 'Fee', 'Pay out', 'Status', ''], withdrawals.map((w) => [w.id,
      esc(w.creator) + '<br><small>' + esc(w.creatorEmail) + '</small>', esc(w.payoutDetails), usd(w.grossCents), usd(w.feeCents), usd(w.payoutCents), w.status,
      w.status === 'pending' ? `<button class="btn" data-a="paid" data-id="${w.id}">Mark paid</button> <button class="btn ghost" data-a="rejected" data-id="${w.id}">Reject</button>` : '']), true)}`;
  app.querySelectorAll('button[data-a]').forEach((b) => b.addEventListener('click', async () => {
    try { await api(`/admin/withdrawals/${b.dataset.id}/${b.dataset.a}`, 'POST', {}); adminPage(); }
    catch (x) { $('#msg').innerHTML = err(x); }
  }));
}

// ---------- router ----------
const guarded = new Set(['library', 'sell', 'creator', 'admin']);
async function route() {
  const [, name = '', arg] = location.hash.slice(1).split('/');
  try {
    if (guarded.has(name) && !me) return go('#/login');
    if (name === 'item') await itemPage(arg);
    else if (name === 'login' || name === 'register') authPage(name);
    else if (name === 'library') await library();
    else if (name === 'sell') await sellForm(arg);
    else if (name === 'creator') await creator();
    else if (name === 'admin') await adminPage();
    else await home();
  } catch (e) { app.innerHTML = err(e); }
  window.scrollTo(0, 0);
}

(async () => {
  [cfg, { user: me }] = await Promise.all([api('/config'), api('/me')]);
  nav();
  addEventListener('hashchange', route);
  route();
})();
