const $ = (s) => document.querySelector(s);
const app = $('#app');
let me = null, cfg = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (c) => (c === 0 ? 'FREE' : `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`);
const usd = (c) => `$${(c / 100).toFixed(2)}`;
const pct = (bps) => `${+(bps / 100).toFixed(2)}%`;
const date = (t) => new Date(t).toLocaleDateString();
const num = (id) => String(id).padStart(4, '0');
const safeHref = (u) => (/^https?:\/\//i.test(u) ? esc(u) : '#');
const go = (h) => { location.hash = h; };

async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 2200); }
const err = (e) => `<div class="msg err" role="alert">${esc(e.message || e)}</div>`;

// ---------- chrome ----------
const NAV = [['shelves', 'Shelves'], ['how', 'How it works'], ['creators', 'For creators']];
function nav(active) {
  const l = (h, t) => `<a href="#/${h}" ${active === h ? 'aria-current="page"' : ''}>${t}</a>`;
  $('#nav').innerHTML = NAV.map(([h, t]) => l(h, t)).join('') + (me
    ? `${l('library', 'Library')}${l('creator', 'Earnings')}${me.isAdmin ? l('admin', 'Admin') : ''}<button id="out">Log out</button>`
    : `${l('login', 'Log in')}<a class="btn" href="#/register">Start selling</a>`);
  $('#out')?.addEventListener('click', async () => { await api('/logout', 'POST'); me = null; go('#/'); route(); });
}
function footer() {
  $('#foot').innerHTML = `<div class="wrap"><div class="foot-g">
    <div><a class="brand" href="#/"><img src="/logo.svg" alt="" width="34" height="34"><span>labshelf</span></a>
      <p class="mute" style="max-width:30ch">A small-price shelf for things made with AI. Creators keep ${100 - cfg.saleFeeBps / 100}% of every sale.</p></div>
    <div><h4>Shop</h4><a href="#/shelves">All shelves</a>${cfg.categories.slice(0, 4).map((c) => `<a href="#/shelves/${c}">${esc(c.replace('-', ' '))}s</a>`).join('')}</div>
    <div><h4>Sell</h4><a href="#/creators">For creators</a><a href="#/how">How it works</a><a href="#/register">Open a shelf</a></div>
    <div><h4>Labshelf</h4><a href="#/brand">Brand guide</a><a href="#/how">Fair-pay promise</a></div></div>
    <div class="mega" aria-hidden="true">labshelf</div></div>`;
}

// ---------- components ----------
function tagCard(i, tag = 'a') {
  const href = tag === 'a' ? ` href="#/item/${i.id}"` : '';
  return `<${tag} class="tagc c-${esc(i.category)}"${href}>
    <div class="band"><span>№ ${num(i.id)}</span><span>${esc(i.category.replace('-', ' '))}</span></div><i class="hole"></i>
    <div class="body"><h3>${esc(i.title)}</h3><p>${esc(i.summary)}</p></div>
    <div class="foot"><span class="by">by <b>${esc(i.creator)}</b>${i.aiTool ? `<br>made with ${esc(i.aiTool)}` : ''}</span>
      <span class="sticker ${i.priceCents ? '' : 'free'}">${money(i.priceCents)}</span></div></${tag}>`;
}
const table = (head, rows, raw) => !rows.length ? '<p class="mute">Nothing here yet.</p>' :
  `<div class="scroll"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) =>
    `<tr>${r.map((c) => `<td>${raw ? c : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const ctaBand = () => `<div class="band-cta"><h2>Built something with AI? Put it on the shelf.</h2>
  <a class="btn big" href="#/${me ? 'sell' : 'register'}">Open your shelf →</a></div>`;

// ---------- pages ----------
async function home() {
  const { items } = await api('/items?sort=new');
  const fresh = items.slice(0, 6), hero = items.slice(0, 3);
  const words = cfg.categories.map((c) => c.replace('-', ' ').toUpperCase());
  const tick = [...words, ...words].map((w) => `<span><b>◆</b> ${w}S</span>`).join('') + [...words, ...words].map((w) => `<span><b>◆</b> ${w}S</span>`).join('');
  app.innerHTML = `
    <section class="hero"><div>
      <p class="eyebrow">Labshelf · est. by people who ship</p>
      <h1>Made by AI.<br>Priced for <em>people</em>.</h1>
      <p class="lead">Plugins, sites, agents and templates from independent creators. A few dollars each, no subscriptions, yours to keep.</p>
      <div class="cta"><a class="btn big" href="#/shelves">Browse the shelves</a><a class="btn big ghost" href="#/creators">Sell yours</a></div>
    </div><div class="stack" aria-hidden="true">${hero.map((i) => tagCard(i, 'div')).join('')}</div></section>
    <div class="ticker" aria-hidden="true"><div>${tick}</div></div>
    <section class="block"><div class="sec-head"><div><p class="eyebrow">Pick a shelf</p><h2>What are you looking for?</h2></div></div>
      <div class="cats">${cfg.categories.map((c) => `<a class="chip c-${c}" href="#/shelves/${c}">${esc(c.replace('-', ' '))}</a>`).join('')}</div></section>
    <section class="block"><div class="sec-head"><div><p class="eyebrow">Just catalogued</p><h2>Fresh on the shelf</h2></div><a class="btn ghost" href="#/shelves">See everything →</a></div>
      <div class="grid">${fresh.map((i) => tagCard(i)).join('') || '<p class="mute">The shelves are being stocked. Be the first to list something.</p>'}</div></section>
    <section class="block"><div class="sec-head"><div><p class="eyebrow">Simple on both sides</p><h2>How Labshelf works</h2></div></div>${steps()}</section>
    ${ctaBand()}`;
}
const steps = () => `<div class="steps">
  <div class="step"><span class="n">01</span><h3>Make it with AI</h3><p>A plugin, a site, an agent, a prompt pack. If AI helped you build it, it belongs here.</p></div>
  <div class="step"><span class="n">02</span><h3>Tag it &amp; shelve it</h3><p>Give it a price up to ${usd(cfg.maxPriceCents)}. We catalogue it with its own number and a label that says what made it.</p></div>
  <div class="step"><span class="n">03</span><h3>Get paid fairly</h3><p>You keep ${100 - cfg.saleFeeBps / 100}% of every sale. Cash out from ${usd(cfg.minWithdrawCents)}; we take just ${pct(cfg.withdrawFeeBps)} on the way out.</p></div></div>`;

async function shelves(cat) {
  app.innerHTML = `<div style="padding-top:40px"><p class="eyebrow">The shelves</p><h1 style="font-size:clamp(2.2rem,5vw,3.6rem)">${cat ? esc(cat.replace('-', ' ')) + 's' : 'Everything on the shelf'}</h1></div>
    <div class="cats" style="margin-top:20px"><a class="chip all" href="#/shelves" ${cat ? '' : 'aria-current="true"'}>All</a>
      ${cfg.categories.map((c) => `<a class="chip c-${c}" href="#/shelves/${c}" ${c === cat ? 'aria-current="true"' : ''}>${esc(c.replace('-', ' '))}</a>`).join('')}</div>
    <div class="bar"><input id="q" type="search" placeholder="Search by name or what it does…" aria-label="Search"><select id="sort" aria-label="Sort">
      <option value="new">Newest first</option><option value="popular">Most downloaded</option><option value="cheap">Lowest price</option></select></div>
    <div id="list" class="grid" style="margin-top:8px"></div>`;
  const load = async () => {
    const p = new URLSearchParams({ q: $('#q').value, category: cat || '', sort: $('#sort').value });
    try {
      const { items } = await api('/items?' + p);
      $('#list').innerHTML = items.map((i) => tagCard(i)).join('') || '<p class="mute">Nothing on this shelf yet.</p>';
    } catch (e) { $('#list').innerHTML = err(e); }
  };
  let t; $('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  $('#sort').addEventListener('change', load); load();
}

async function itemPage(id) {
  const i = await api('/items/' + id);
  const buy = i.owned
    ? `<div class="note">${i.isOwner ? 'This is your listing.' : '✓ It\'s yours. Download any time.'}</div>
       <p><a class="btn big" style="width:100%;justify-content:center" target="_blank" rel="noopener noreferrer" href="${safeHref(i.deliveryUrl)}">Download</a></p>`
    : `<button class="btn big" id="buy" style="width:100%;justify-content:center">${i.priceCents ? 'Buy now' : 'Get it free'}</button>
       ${cfg.paymentMode === 'demo' && i.priceCents ? '<p class="mute" style="font-size:.82rem">Preview mode: no card is charged.</p>' : ''}`;
  app.innerHTML = `<p style="padding-top:26px"><a href="#/shelves">← Back to the shelves</a></p>
    <div class="sheet"><article><div class="cats"><span class="chip c-${esc(i.category)}">${esc(i.category.replace('-', ' '))}</span><span class="chip all">№ ${num(i.id)}</span></div>
      <h1 style="font-size:clamp(2rem,5vw,3.2rem);margin:16px 0 10px">${esc(i.title)}</h1>
      <p class="mute" style="font-size:1.15rem;margin:0 0 22px">${esc(i.summary)}</p>
      <div class="panel flat"><h3>About this ${esc(i.category.replace('-', ' '))}</h3><p class="desc">${esc(i.description)}</p>
        ${i.demoUrl ? `<p><a class="btn ghost" target="_blank" rel="noopener noreferrer" href="${safeHref(i.demoUrl)}">Open live demo ↗</a></p>` : ''}</div></article>
      <aside class="panel buy"><div class="price-big">${i.priceCents ? usd(i.priceCents) : 'Free'}</div><div id="msg"></div>
        <div style="margin-top:14px">${buy}</div>
        <ul class="checks"><li>One-time price, no subscription</li><li>Direct download link</li><li>Creator keeps ${100 - cfg.saleFeeBps / 100}%</li></ul>
        <dl class="meta"><div><dt>Creator</dt><dd>${esc(i.creator)}</dd></div><div><dt>Made with</dt><dd>${esc(i.aiTool || '—')}</dd></div>
        <div><dt>Downloads</dt><dd>${i.downloads}</dd></div><div><dt>Shelved</dt><dd>${date(i.createdAt)}</dd></div></dl>
        ${i.isOwner ? `<p><a href="#/sell/${i.id}">Edit this listing</a></p>` : ''}</aside></div>`;
  $('#buy')?.addEventListener('click', async (e) => {
    if (!me) return go('#/login');
    e.target.disabled = true;
    try { await api(`/items/${id}/buy`, 'POST'); toast('On your shelf now'); itemPage(id); }
    catch (x) { $('#msg').innerHTML = err(x); e.target.disabled = false; }
  });
}

function authPage(mode) {
  const reg = mode === 'register';
  app.innerHTML = `<div class="panel narrow"><p class="eyebrow">${reg ? 'Open a shelf' : 'Welcome back'}</p><h1 style="font-size:2.4rem">${reg ? 'Join Labshelf' : 'Log in'}</h1><div id="msg"></div>
    <form id="f">${reg ? '<label for="name">Your name</label><input id="name" name="name" required minlength="2" autocomplete="name">' : ''}
    <label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email">
    <label for="pw">Password</label><input id="pw" name="password" type="password" required minlength="8" autocomplete="${reg ? 'new' : 'current'}-password">
    <p><button class="btn big" style="width:100%;justify-content:center">${reg ? 'Create account' : 'Log in'}</button></p></form>
    <p class="mute">${reg ? 'Already have a shelf? <a href="#/login">Log in</a>' : 'New here? <a href="#/register">Create an account</a>'}</p></div>`;
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { me = (await api(reg ? '/register' : '/login', 'POST', Object.fromEntries(new FormData(e.target)))).user; go(reg ? '#/sell' : '#/'); route(); }
    catch (x) { $('#msg').innerHTML = err(x); }
  });
}

async function library() {
  const { items } = await api('/library');
  app.innerHTML = `<div style="padding-top:40px"><p class="eyebrow">Yours to keep</p><h1>My library</h1></div>
    <div class="grid" style="margin-top:26px">${items.map((i) => `<div class="tagc c-${esc(i.category)}"><div class="band"><span>№ ${num(i.id)}</span><span>${esc(i.category.replace('-', ' '))}</span></div><i class="hole"></i>
      <div class="body"><h3>${esc(i.title)}</h3><p>${esc(i.summary)}</p></div>
      <div class="foot"><a class="btn" target="_blank" rel="noopener noreferrer" href="${safeHref(i.deliveryUrl)}">Download</a><a href="#/item/${i.id}">Details</a></div></div>`).join('') ||
      '<p class="mute">Your library is empty. <a href="#/shelves">Browse the shelves</a>.</p>'}</div>`;
}

async function sellForm(id) {
  let i = { title: '', summary: '', description: '', category: cfg.categories[0], priceCents: 299, demoUrl: '', deliveryUrl: '', aiTool: '', status: 'published' };
  if (id) i = await api('/items/' + id);
  app.innerHTML = `<div class="panel wide"><p class="eyebrow">${id ? 'Edit listing' : 'New specimen'}</p><h1 style="font-size:2.4rem">${id ? 'Edit your listing' : 'Put it on the shelf'}</h1>
    <p class="note" style="margin-top:14px">You keep ${100 - cfg.saleFeeBps / 100}% of each sale. Prices go up to ${usd(cfg.maxPriceCents)} — that's what keeps us affordable.</p>
    <div id="msg"></div><form id="f">
    <label for="t">Title</label><input id="t" name="title" required maxlength="80" value="${esc(i.title)}">
    <label for="s">One-line summary</label><input id="s" name="summary" required maxlength="160" value="${esc(i.summary)}">
    <label for="d">Description</label><textarea id="d" name="description" rows="6" required maxlength="5000">${esc(i.description)}</textarea>
    <label for="c">Shelf</label><select id="c" name="category">${cfg.categories.map((c) => `<option value="${c}" ${c === i.category ? 'selected' : ''}>${esc(c.replace('-', ' '))}</option>`).join('')}</select>
    <label for="p">Price in USD <small>(0 = free)</small></label><input id="p" name="price" type="number" min="0" max="${cfg.maxPriceCents / 100}" step="0.01" value="${(i.priceCents / 100).toFixed(2)}">
    <label for="a">Made with <small>(AI tool, optional)</small></label><input id="a" name="aiTool" maxlength="60" value="${esc(i.aiTool)}">
    <label for="dl">Download link <small>(only buyers see it — Drive, Dropbox, GitHub release…)</small></label><input id="dl" name="deliveryUrl" type="url" required value="${esc(i.deliveryUrl)}">
    <label for="de">Live demo link <small>(optional)</small></label><input id="de" name="demoUrl" type="url" value="${esc(i.demoUrl)}">
    ${id ? `<label for="v">Visibility</label><select id="v" name="status"><option value="published" ${i.status === 'published' ? 'selected' : ''}>On the shelf</option><option value="hidden" ${i.status === 'hidden' ? 'selected' : ''}>Hidden</option></select>` : ''}
    <p style="margin-top:22px"><button class="btn big">${id ? 'Save changes' : 'Shelve it'}</button></p></form></div>`;
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    d.priceCents = Math.round(parseFloat(d.price || '0') * 100); delete d.price;
    try { const saved = await api(id ? '/items/' + id : '/items', id ? 'PUT' : 'POST', d); toast('Saved'); go('#/item/' + saved.id); }
    catch (x) { $('#msg').innerHTML = err(x); }
  });
}

async function creator() {
  const d = await api('/creator');
  const need = Math.max(0, d.minWithdrawCents - d.balanceCents);
  const prog = Math.min(100, Math.round((d.balanceCents / d.minWithdrawCents) * 100));
  const net = d.canWithdraw ? d.balanceCents - Math.round((d.balanceCents * d.withdrawFeeBps) / 10000) : 0;
  app.innerHTML = `<div style="padding-top:40px"><p class="eyebrow">Creator desk</p><h1>Your earnings</h1></div>
    <div class="stats">
      <div class="stat hot"><small>Available balance</small><b>${usd(d.balanceCents)}</b></div>
      <div class="stat"><small>Sales</small><b>${d.totals.sales}</b></div>
      <div class="stat"><small>Earned (after ${pct(d.saleFeeBps)})</small><b>${usd(d.totals.netCents)}</b></div>
      <div class="stat"><small>Platform fees</small><b>${usd(d.totals.feesCents)}</b></div></div>
    <div class="panel"><h2 style="font-size:1.6rem">Cash out</h2>
      <div class="meter" role="progressbar" aria-valuenow="${prog}" aria-valuemin="0" aria-valuemax="100" style="margin-top:14px"><i style="width:${prog}%"></i></div>
      <p class="mute">${d.canWithdraw ? `You can withdraw now. We take a ${pct(d.withdrawFeeBps)} share of the amount you withdraw.` : `Cash-out unlocks at ${usd(d.minWithdrawCents)} — ${usd(need)} to go.`}</p>
      <div id="msg"></div>
      ${d.canWithdraw ? `<form id="w"><label for="am">Amount in USD</label>
        <input id="am" name="amount" type="number" step="0.01" min="${d.minWithdrawCents / 100}" max="${d.balanceCents / 100}" value="${(d.balanceCents / 100).toFixed(2)}" required>
        <label for="dt">Send it to <small>(e.g. PayPal email)</small></label><input id="dt" name="details" required maxlength="200">
        <p><button class="btn">Request withdrawal</button> <span class="mute" style="font-size:.85rem">Withdrawing everything pays out about ${usd(net)}.</span></p></form>` : ''}
      ${table(['#', 'Requested', 'Amount', 'Our share', 'You get', 'Status'], d.withdrawals.map((w) => [w.id, date(w.createdAt), usd(w.grossCents), usd(w.feeCents), usd(w.payoutCents), w.status]))}</div>
    <h2 style="font-size:1.6rem;margin-top:34px">Your shelf</h2>${table(['Item', 'Price', 'Downloads', 'Earned', ''], d.items.map((i) =>
      [`<a href="#/item/${i.id}">${esc(i.title)}</a>${i.status === 'hidden' ? ' <small>(hidden)</small>' : ''}`, i.priceCents ? usd(i.priceCents) : 'Free', i.downloads, usd(i.earnedCents), `<a href="#/sell/${i.id}">Edit</a>`]), true)}
    <p><a class="btn" href="#/sell">+ New listing</a></p>`;
  $('#w')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await api('/withdrawals', 'POST', { amountCents: Math.round(parseFloat(f.amount) * 100), payoutDetails: f.details }); toast('Request sent'); creator(); }
    catch (x) { $('#msg').innerHTML = err(x); }
  });
}

async function adminPage() {
  const [s, { withdrawals }] = await Promise.all([api('/admin/summary'), api('/admin/withdrawals')]);
  app.innerHTML = `<div style="padding-top:40px"><p class="eyebrow">Back office</p><h1>Platform admin</h1></div><div class="stats">
    <div class="stat hot"><small>Platform revenue</small><b>${usd(s.platformRevenueCents)}</b></div>
    <div class="stat"><small>Sale fees</small><b>${usd(s.saleFeesCents)}</b></div>
    <div class="stat"><small>Withdrawal shares</small><b>${usd(s.withdrawFeesCents)}</b></div>
    <div class="stat"><small>Owed to creators</small><b>${usd(s.owedToCreatorsCents)}</b></div>
    <div class="stat"><small>Users / items / sales</small><b>${s.users} / ${s.items} / ${s.sales}</b></div></div>
    <h2 style="font-size:1.6rem">Withdrawal requests</h2><div id="msg"></div>
    ${table(['#', 'Creator', 'Send to', 'Gross', 'Fee', 'Pay out', 'Status', ''], withdrawals.map((w) => [w.id,
      esc(w.creator) + '<br><small>' + esc(w.creatorEmail) + '</small>', esc(w.payoutDetails), usd(w.grossCents), usd(w.feeCents), usd(w.payoutCents), w.status,
      w.status === 'pending' ? `<button class="btn" data-a="paid" data-id="${w.id}">Mark paid</button> <button class="btn ghost" data-a="rejected" data-id="${w.id}">Reject</button>` : '']), true)}`;
  app.querySelectorAll('button[data-a]').forEach((b) => b.addEventListener('click', async () => {
    try { await api(`/admin/withdrawals/${b.dataset.id}/${b.dataset.a}`, 'POST', {}); adminPage(); } catch (x) { $('#msg').innerHTML = err(x); }
  }));
}

// ----- static brand/story pages -----
function how() {
  app.innerHTML = `<div style="padding-top:44px"><p class="eyebrow">How it works</p><h1>Fair for buyers.<br>Fairer for <em>creators</em>.</h1></div>
    <section class="block">${steps()}</section>
    <section class="block"><h2>Where the money goes</h2><div class="stats">
      <div class="stat"><small>Platform fee per sale</small><b>${pct(cfg.saleFeeBps)}</b></div>
      <div class="stat"><small>Cash-out unlocks at</small><b>${usd(cfg.minWithdrawCents)}</b></div>
      <div class="stat"><small>Share when you withdraw</small><b>${pct(cfg.withdrawFeeBps)}</b></div>
      <div class="stat"><small>Highest price allowed</small><b>${usd(cfg.maxPriceCents)}</b></div></div></section>
    <section class="block"><h2>Our promises</h2><div class="steps">
      <div class="step"><h3>No subscriptions</h3><p>Buy once, download any time.</p></div>
      <div class="step"><h3>AI is labelled</h3><p>Every listing says what it was made with.</p></div>
      <div class="step"><h3>No surprise fees</h3><p>Two numbers, shown everywhere. That's all.</p></div></div></section>${ctaBand()}`;
}

function creators() {
  app.innerHTML = `<div style="padding-top:44px"><p class="eyebrow">For creators</p><h1>Your AI side project,<br>on a <em>real shelf</em>.</h1>
    <p class="mute" style="font-size:1.2rem;max-width:46ch;margin-top:18px">List it in minutes, set a small price, keep ${100 - cfg.saleFeeBps / 100}% of every sale.</p></div>
    <section class="block"><div class="panel"><h2 style="font-size:1.7rem">See what you'd keep</h2><div class="calc">
      <div><label for="pr">Price per sale: <b id="prv"></b></label><input id="pr" type="range" min="99" max="${cfg.maxPriceCents}" step="50" value="499">
        <label for="sl">Sales per month: <b id="slv"></b></label><input id="sl" type="range" min="1" max="500" value="40">
        <p class="mute" style="font-size:.85rem">Cash-out opens at ${usd(cfg.minWithdrawCents)}; withdrawing costs ${pct(cfg.withdrawFeeBps)}.</p></div>
      <div><p class="eyebrow">You'd receive per month</p><div class="big-num" id="net"></div>
        <div class="split" style="margin:14px 0 6px"><div class="you" id="you"></div><div class="us" id="us">US</div></div>
        <p class="mute" id="calcnote" style="font-size:.88rem"></p></div></div></div></section>
    <section class="block">${steps()}</section>${ctaBand()}`;
  const upd = () => {
    const p = +$('#pr').value, n = +$('#sl').value, gross = p * n, fee = Math.round((gross * cfg.saleFeeBps) / 10000), keep = gross - fee;
    const out = keep - Math.round((keep * cfg.withdrawFeeBps) / 10000);
    $('#prv').textContent = usd(p); $('#slv').textContent = n; $('#net').textContent = usd(out);
    $('#you').style.flexBasis = `${100 - cfg.saleFeeBps / 100}%`; $('#you').textContent = `YOU ${100 - cfg.saleFeeBps / 100}%`;
    $('#us').style.flexBasis = `${cfg.saleFeeBps / 100}%`; $('#us').textContent = cfg.saleFeeBps >= 800 ? `US ${cfg.saleFeeBps / 100}%` : '';
    $('#calcnote').textContent = `${usd(gross)} in sales → ${usd(fee)} platform fee → ${usd(keep)} balance → ${usd(out)} after the ${pct(cfg.withdrawFeeBps)} cash-out share.`;
  };
  $('#pr').addEventListener('input', upd); $('#sl').addEventListener('input', upd); upd();
}

function brand() {
  const sw = (n, v, d) => `<div class="sw"><i style="background:${v}"></i><div>${n}<span>${v} · ${d}</span></div></div>`;
  app.innerHTML = `<div style="padding-top:44px"><p class="eyebrow">Brand guide v1</p><h1>The <em>Labshelf</em> identity</h1>
    <p class="mute" style="font-size:1.15rem;max-width:56ch;margin-top:16px">Idea: every AI-made creation is a <b>specimen</b> — catalogued, labelled and shelved so ordinary people can pick it up. Warm paper, black ink, one loud orange. Friendly, tactile, a little nerdy.</p></div>
    <section class="block"><h2>Logo</h2><div class="do-dont" style="margin-top:20px">
      <div class="logo-box"><div class="brand" style="font-size:2.4rem"><img src="/logo.svg" width="64" height="64" alt=""><span>labshelf</span></div><span class="mono mute">Primary · on paper</span></div>
      <div class="logo-box dk"><div class="brand" style="font-size:2.4rem"><img src="/logo.svg" width="64" height="64" alt="" style="background:#F3EEE3;border-radius:14px;padding:4px"><span>labshelf</span></div><span class="mono">Reversed · on ink</span></div>
      <div class="logo-box"><img src="/favicon.svg" width="72" height="72" alt=""><span class="mono mute">App icon / favicon</span></div></div>
    <p class="mute">The mark is a flask standing on a shelf: lab (made with AI) + shelf (a place to buy it). Always lowercase wordmark, set in the serif. Keep clear space equal to the flask's neck width.</p></section>
    <section class="block"><h2>Colour</h2><div class="swatches" style="margin-top:20px">
      ${sw('Paper', '#F3EEE3', 'background')}${sw('Ink', '#15120E', 'text, borders')}${sw('Reaction orange', '#FF5A2C', 'the one accent: buttons, stickers')}
      ${sw('Plugin lime', '#C8F169', 'plugins · free')}${sw('Website sky', '#9ED8FF', 'websites')}${sw('Agent lilac', '#CBB9FF', 'agents')}
      ${sw('Template butter', '#FFE27A', 'templates · notes')}${sw('Prompt pink', '#FFB8D1', 'prompt packs')}${sw('Script mint', '#9BE8C8', 'scripts')}</div>
    <p class="mute">Rule: pastels are <i>label colours</i> for categories only. Orange is reserved for actions and prices. Text is always ink on paper/pastel — never orange on paper.</p></section>
    <section class="block"><h2>Type</h2><div class="panel flat"><p class="eyebrow">Display — Iowan / Palatino / Georgia</p><div style="font:700 3.4rem/1 var(--serif);letter-spacing:-.03em">Made by AI, priced for people.</div>
      <p class="eyebrow" style="margin-top:22px">Labels &amp; numbers — system mono, uppercase, tracked</p><div class="mono" style="font-size:1rem">№ 0042 · PLUGIN · $4.99</div>
      <p class="eyebrow" style="margin-top:22px">Body — system sans</p><div>Plain, short sentences. Say what it does and what it costs.</div></div></section>
    <section class="block"><h2>Signature components</h2><div class="grid" style="margin-top:20px">
      ${tagCard({ id: 42, title: 'Specimen tag', summary: 'Category-coloured band, item number, punched hole, dashed perforation and a tilted price sticker.', category: 'plugin', priceCents: 499, creator: 'Mia', aiTool: 'Claude' }, 'div')}
      <div class="panel flat" style="display:grid;gap:14px;align-content:start"><a class="btn" href="#/brand">Primary button</a><a class="btn ghost" href="#/brand">Secondary</a><a class="btn ink" href="#/brand">Inverse</a>
        <div class="cats"><span class="chip c-agent">agent</span><span class="chip c-website">website</span></div><div class="meter"><i style="width:62%"></i></div></div></div>
    <p class="mute">Hard 2px ink outlines, offset ink shadows (no blur), dotted-paper background. Things lift on hover and press in on click.</p></section>
    <section class="block"><h2>Voice</h2><div class="do-dont">
      <div class="step"><h3>We sound like</h3><p>A helpful shopkeeper who builds things. Warm, plain, specific, lightly nerdy.</p></div>
      <div class="step"><h3>We say</h3><p>"Put it on the shelf." "Keep ${100 - cfg.saleFeeBps / 100}%." "Made with Claude."</p></div>
      <div class="step"><h3>We avoid</h3><p>Hype, "revolutionary", "supercharge", buzzword soup, hidden fees.</p></div></div></section>
    <section class="block"><h2>Site map</h2><div class="panel flat"><pre class="mono" style="margin:0;white-space:pre-wrap;line-height:1.9">/ Home — hero · ticker · shelves · fresh · how it works
├─ /shelves[/category] — browse, search, sort
│   └─ /item/:id — specimen sheet + buy
├─ /how — fees &amp; promises
├─ /creators — pitch + earnings calculator
├─ /register · /login
└─ Signed in: /library · /sell[/:id] · /creator (earnings) · /admin</pre></div></section>`;
}

// ---------- router ----------
const guarded = new Set(['library', 'sell', 'creator', 'admin']);
async function route() {
  const [, name = '', arg] = location.hash.slice(1).split('/');
  nav(name);
  try {
    if (guarded.has(name) && !me) return go('#/login');
    if (name === 'item') await itemPage(arg);
    else if (name === 'login' || name === 'register') authPage(name);
    else if (name === 'library') await library();
    else if (name === 'sell') await sellForm(arg);
    else if (name === 'creator') await creator();
    else if (name === 'admin') await adminPage();
    else if (name === 'shelves') await shelves(arg);
    else if (name === 'how') how();
    else if (name === 'creators') creators();
    else if (name === 'brand') brand();
    else await home();
  } catch (e) { app.innerHTML = err(e); }
  window.scrollTo(0, 0);
}

(async () => {
  [cfg, { user: me }] = await Promise.all([api('/config'), api('/me')]);
  footer();
  addEventListener('hashchange', route);
  route();
})();
