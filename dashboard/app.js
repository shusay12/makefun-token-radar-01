/* Token Radar dashboard: renders window.RADAR (written by main.ts beside this page) with no
   network and no framework. Hash routes: #/board (filters in the query), #/protocol/<slug>,
   #/live, #/model. The board is sortable and filterable; every row opens its detail view. */
'use strict';

const R = window.RADAR;
const main = document.getElementById('board');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtUsd(n) {
  if (n === null || n === undefined) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n}`;
}

function fmtFull(n) {
  return n === null || n === undefined ? '—' : `$${Math.round(n).toLocaleString('en-US')}`;
}

function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  const s = n > 0 ? '+' : '';
  return `${s}${n.toFixed(1)}%`;
}

function fmtAge(days) {
  if (days === null || days === undefined) return 'not reported';
  if (days < 90) return `${days} days`;
  if (days < 730) return `${(days / 30.44).toFixed(1)} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}

function catName(r) {
  return r.category ?? 'Uncategorized';
}

function chainText(chains) {
  if (!chains || chains.length === 0) return '—';
  if (chains.length <= 2) return chains.join(', ');
  return `${chains.slice(0, 2).join(', ')} +${chains.length - 2}`;
}

function header(active) {
  const totalImplied = R.rows.reduce((sum, r) => sum + r.implied_value_usd, 0);
  const tab = (route, label) =>
    `<a href="#/${route}"${active === route ? ' aria-current="page"' : ''}>${label}</a>`;
  return `
  <div class="masthead">
    <h1>TOKEN RADAR<span class="dot">.</span></h1>
    <div class="tagline">Protocols that record no token yet, ranked by what their launch would be
    worth — priced from the market's own trading protocols, each with the steps to farm it.</div>
  </div>
  <div class="stats">
    <div class="stat"><span class="k">Protocols scanned</span><span class="v">${R.protocols_size}</span></div>
    <div class="stat"><span class="k">Pre-token ranked</span><span class="v">${R.board_size}</span></div>
    <div class="stat"><span class="k">Watchlist covered</span><span class="v"><em>${R.watchlist_size} / ${R.watchlist_size}</em></span></div>
    <div class="stat"><span class="k">Finds beyond the list</span><span class="v">${R.early_size}</span></div>
    <div class="stat"><span class="k">Board's implied value</span><span class="v">${fmtUsd(totalImplied)}</span></div>
    <div class="stat"><span class="k">Snapshot</span><span class="v">${esc(R.as_of)}</span></div>
  </div>
  <nav class="tabs">${tab('board', 'The board')}${tab('live', 'Already trading')}${tab('model', 'How the value is worked out')}</nav>`;
}

function footer() {
  return `<footer>Data: a sealed snapshot of DefiLlama's protocol list, fetched ${esc(R.as_of)} and
  frozen for this board. “Records no token” is DefiLlama's record, not proof a protocol has none.
  An implied value is this radar's own estimate from the model on the third tab, never a promise
  that a token will exist. Model ${esc(R.model_version)}.</footer>`;
}

/* ---------- board ---------- */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const params = new URLSearchParams(query ?? '');
  return { path: path || 'board', params };
}

function boardUrl(f) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.cat && f.cat !== 'all') p.set('cat', f.cat);
  if (f.chain && f.chain !== 'all') p.set('chain', f.chain);
  if (f.watch) p.set('watch', '1');
  if (f.sort && f.sort !== 'rank') p.set('sort', f.sort);
  const s = p.toString();
  return `#/board${s ? `?${s}` : ''}`;
}

const SORTERS = {
  rank: (a, b) => a.rank - b.rank,
  value: (a, b) => b.implied_value_usd - a.implied_value_usd,
  tvl: (a, b) => b.tvl_usd - a.tvl_usd,
  growth: (a, b) => (b.change_7d ?? -1e9) - (a.change_7d ?? -1e9),
  age: (a, b) => (b.age_days ?? -1) - (a.age_days ?? -1),
  multiple: (a, b) => b.multiple - a.multiple,
};

function renderBoard(params) {
  const f = {
    q: params.get('q') ?? '',
    cat: params.get('cat') ?? 'all',
    chain: params.get('chain') ?? 'all',
    watch: params.get('watch') === '1',
    sort: params.get('sort') ?? 'rank',
  };
  const cats = [...new Set(R.rows.map(catName))].sort();
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  let rows = R.rows.filter((r) => {
    if (f.watch && !r.watchlist) return false;
    if (f.cat !== 'all' && catName(r) !== f.cat) return false;
    if (f.chain !== 'all' && !r.chains.includes(f.chain)) return false;
    if (f.q && !`${r.name} ${r.slug}`.toLowerCase().includes(f.q.toLowerCase())) return false;
    return true;
  });
  rows = [...rows].sort(SORTERS[f.sort] ?? SORTERS.rank);

  const options = (list, cur, allLabel) =>
    `<option value="all"${cur === 'all' ? ' selected' : ''}>${allLabel}</option>` +
    list.map((v) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(v)}</option>`).join('');
  const sortOptions = [
    ['rank', 'Rank'],
    ['value', 'Implied value'],
    ['tvl', 'TVL'],
    ['growth', '7-day growth'],
    ['age', 'Age without a token'],
    ['multiple', 'Category multiple'],
  ].map(([v, label]) => `<option value="${v}"${f.sort === v ? ' selected' : ''}>${label}</option>`).join('');

  const body = rows
    .map(
      (r) => `<tr tabindex="0" data-slug="${esc(r.slug)}">
      <td>${r.rank}</td>
      <td class="l name">${esc(r.name)}<span class="badge ${r.watchlist ? 'watch' : 'early'}">${r.watchlist ? 'WATCHLIST' : 'EARLY'}</span><span class="slug">${esc(r.slug)}</span></td>
      <td class="l cat">${esc(catName(r))}</td>
      <td class="l chains">${esc(chainText(r.chains))}</td>
      <td>${fmtUsd(r.tvl_usd)}</td>
      <td class="${r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'}">${fmtPct(r.change_7d)}</td>
      <td>${fmtAge(r.age_days)}</td>
      <td>${r.multiple.toFixed(2)}x</td>
      <td class="value">${fmtUsd(r.implied_value_usd)}</td>
    </tr>`,
    )
    .join('');

  main.innerHTML = `${header('board')}
  <form class="controls" id="controls">
    <div><label for="q">Search</label><input type="search" id="q" value="${esc(f.q)}" placeholder="Name or slug"></div>
    <div><label for="cat">Category</label><select id="cat">${options(cats, f.cat, 'All categories')}</select></div>
    <div><label for="chain">Chain</label><select id="chain">${options(chains, f.chain, 'All chains')}</select></div>
    <div><label for="sort">Sort by</label><select id="sort">${sortOptions}</select></div>
    <div class="check"><input type="checkbox" id="watch"${f.watch ? ' checked' : ''}><label for="watch">Watchlist only</label></div>
  </form>
  <p class="count-line">Showing <strong>${rows.length}</strong> of ${R.board_size} ranked protocols.
  Every protocol on the snapshot's watchlist is on this board; the rest are the radar's own finds —
  protocols the list left out, at any size, that pass the same product screen.
  Click a row for its detail view and farm plan.</p>
  ${rows.length === 0 ? '<div class="empty">No protocol matches those filters. Loosen one and the board fills again.</div>' : `
  <table>
    <thead><tr>
      <th>Rank</th><th class="l">Protocol</th><th class="l">Category</th><th class="l">Chains</th>
      <th>TVL</th><th>7d</th><th>Age</th><th>Multiple</th><th>Implied value</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>`}
  ${footer()}`;

  const apply = () => {
    location.hash = boardUrl({
      q: document.getElementById('q').value.trim(),
      cat: document.getElementById('cat').value,
      chain: document.getElementById('chain').value,
      watch: document.getElementById('watch').checked,
      sort: document.getElementById('sort').value,
    });
  };
  for (const id of ['cat', 'chain', 'sort', 'watch']) document.getElementById(id).addEventListener('change', apply);
  document.getElementById('q').addEventListener('change', apply);
  main.querySelectorAll('tbody tr[data-slug]').forEach((tr) => {
    const go = () => { location.hash = `#/protocol/${tr.dataset.slug}`; };
    tr.addEventListener('click', go);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
}

/* ---------- detail ---------- */

function renderDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) { renderBoard(new URLSearchParams()); return; }
  const base = r.tvl_usd * r.multiple;
  const steps = r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('');
  main.innerHTML = `${header('board')}
  <a class="back" href="#/board">&larr; Back to the board</a>
  <div class="detail-head">
    <h2>${esc(r.name)} <span class="badge pre">PRE-TOKEN</span><span class="badge ${r.watchlist ? 'watch' : 'early'}">${r.watchlist ? 'WATCHLIST' : 'EARLY FIND'}</span></h2>
    <div class="sub">Rank #${r.rank} of ${R.board_size} &middot; ${esc(catName(r))} &middot; records no token in the ${esc(R.as_of)} snapshot</div>
  </div>
  <div class="tiles">
    <div class="tile"><span class="k">Implied launch value</span><span class="v">${fmtFull(r.implied_value_usd)}</span><span class="s">the model's estimate, worked out below</span></div>
    <div class="tile"><span class="k">TVL</span><span class="v">${fmtFull(r.tvl_usd)}</span><span class="s">total value locked, snapshot figure</span></div>
    <div class="tile"><span class="k">7-day TVL change</span><span class="v">${fmtPct(r.change_7d)}</span><span class="s">momentum the model prices in</span></div>
    <div class="tile"><span class="k">Tracked without a token</span><span class="v">${fmtAge(r.age_days)}</span><span class="s">listed ${esc(r.listed_at ?? 'date not reported')}</span></div>
    <div class="tile"><span class="k">Chains</span><span class="v">${r.chains.length || '—'}</span><span class="s">${esc(chainText(r.chains))}</span></div>
    <div class="tile"><span class="k">Category multiple</span><span class="v">${r.multiple.toFixed(2)}x</span><span class="s">from ${r.category_comps} trading ${esc(catName(r))} comps</span></div>
  </div>
  <h3 class="section">How this value is worked out</h3>
  <table class="breakdown">
    <tbody>
      <tr><td class="l">TVL (snapshot)</td><td>${fmtFull(r.tvl_usd)}</td></tr>
      <tr><td class="l">x category multiple (${esc(catName(r))}: median comp ${r.category_median.toFixed(2)}x, shrunk by comp count)</td><td>${r.multiple.toFixed(2)}x</td></tr>
      <tr><td class="l">= base value at category prices</td><td>${fmtFull(base)}</td></tr>
      <tr><td class="l">x growth factor (7-day change ${fmtPct(r.change_7d)})</td><td>${r.growth_multiplier.toFixed(2)}x</td></tr>
      <tr><td class="l">x seasoning factor (${fmtAge(r.age_days)} with no token)</td><td>${r.seasoning_multiplier.toFixed(2)}x</td></tr>
      <tr class="total"><td class="l">Implied launch value</td><td>${fmtFull(r.implied_value_usd)}</td></tr>
    </tbody>
  </table>
  <h3 class="section">How to farm it</h3>
  <ol class="plan">${steps}</ol>
  <p class="note">The plan is generated from ${esc(r.name)}'s own record — its category, its first
  chain and its size — so the actions, the capital and the holding window fit this protocol, not a
  template pasted over the whole board. Costs are the gas and capital a position needs; no step
  asks you to pay anyone for access or a claim.</p>
  ${footer()}`;
}

/* ---------- live ---------- */

function renderLive() {
  const body = R.live
    .map(
      (p) => `<tr>
      <td class="l name">${esc(p.name)}<span class="slug">${esc(p.slug)}</span></td>
      <td class="l cat">${esc(p.symbol ?? '—')}</td>
      <td class="l cat">${esc(p.category ?? 'Uncategorized')}</td>
      <td>${fmtUsd(p.mcap_usd)}</td>
      <td>${fmtUsd(p.tvl_usd)}</td>
      <td>${p.mcap_usd && p.tvl_usd ? `${(p.mcap_usd / p.tvl_usd).toFixed(2)}x` : '—'}</td>
      <td class="${p.change_7d === null ? '' : p.change_7d >= 0 ? 'pos' : 'neg'}">${fmtPct(p.change_7d)}</td>
    </tr>`,
    )
    .join('');
  main.innerHTML = `${header('live')}
  <p class="count-line">These protocols already have a token that trades, so the radar never ranks
  them: it prices them at the market's own figures. They are the calibration set — the category
  multiples on the board are the medians of ratios like these, and the largest ${R.live_size} are
  shown here.</p>
  <table>
    <thead><tr><th class="l">Protocol</th><th class="l">Symbol</th><th class="l">Category</th>
    <th>Market cap</th><th>TVL</th><th>Mcap / TVL</th><th>7d</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  ${footer()}`;
}

/* ---------- model ---------- */

function renderModel() {
  const m = R.model;
  const cal = R.calibration.rows
    .map(
      (c) => `<tr><td class="l">${esc(c.category)}</td><td>${c.comps}</td><td>${c.median_ratio.toFixed(2)}x</td><td>${c.multiple.toFixed(2)}x</td></tr>`,
    )
    .join('');
  main.innerHTML = `${header('model')}
  <div class="prose">
    <h3 class="section">The question</h3>
    <p>Which protocols that record no token yet are worth a farmer's time, and what would each one's
    token be worth if it launched at the size the protocol already is? The board answers with one
    number per protocol — an implied launch value — and this page shows exactly where the number
    comes from. No protocol name is special-cased anywhere in the model.</p>
    <h3 class="section">The model (${esc(R.model_version)})</h3>
    <div class="formula">implied value = TVL x category multiple x growth factor x seasoning factor

category multiple = clamp( (n x category median + ${m.shrink_k} x global median) / (n + ${m.shrink_k}), ${m.multiple_min}x .. ${m.multiple_max}x )
  where a category's ratios are mcap / TVL over its protocols whose token already trades
growth factor    = 1 + clamp(7-day TVL change, ${m.growth_floor}% .. ${m.growth_cap}%) x ${m.growth_weight}
seasoning factor = ${m.seasoning_floor} + min(age in days, ${m.seasoning_days}) / ${m.seasoning_days} x ${m.seasoning_range}
  age is measured from the day DefiLlama began tracking the protocol; an unreported date
  uses the board's median age (${R.median_age_days} days), never an invented birthday</div>
    <p>The calibration is read off the snapshot itself: ${R.calibration.global_comps} protocols in it
    have both a token and a market cap, and their median mcap/TVL is
    ${R.calibration.global_median.toFixed(2)}x. A category with few trading comps is pulled toward
    that global median, so two lucky prices cannot set a whole category's values; a category with
    no comps at all prices at the global median, ${R.calibration.fallback_multiple.toFixed(2)}x.</p>
    <h3 class="section">The calibration table</h3>
    <table class="cal">
      <thead><tr><th class="l">Category</th><th>Trading comps</th><th>Median mcap / TVL</th><th>Multiple used</th></tr></thead>
      <tbody>${cal}</tbody>
    </table>
    <h3 class="section">Who gets on the board</h3>
    <ul class="rules">
      <li>Every protocol on the snapshot's watchlist is on the board: ${R.watchlist_size} of them. The watchlist is the floor, never the ceiling.</li>
      <li>Beyond the list, the radar applies the watchlist's own product screen at every size, with the $50M floor removed: a protocol joins the board when it records no token, its category is not a wrapped, staked or bridged product class (Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC) or an exchange, it is not a versioned pool of another protocol, and its name does not mark it as a wrapped or staked product or an exchange's own product. That is how the board catches protocols the list left out at $2B as well as at $20M — and why the big wrapped and staked products are never ranked as launches.</li>
      <li>Protocols whose token already trades are never ranked. They calibrate the model and are shown on the Already trading tab at the market's own values.</li>
      <li>“Records no token” is DefiLlama's record in a frozen snapshot, not proof a protocol has no token anywhere.</li>
    </ul>
    <h3 class="section">The farm plans</h3>
    <p>Each row's plan is generated from that protocol's own record: its category chooses the core
    action (supply, provide liquidity, bridge, stake, deposit to a vault), its first chain sets the
    gas tier, its TVL sets the capital a position needs, and its age sets the holding window. Every
    step states what it costs and how long it takes.</p>
  </div>
  ${footer()}`;
}

/* ---------- router ---------- */

function render() {
  if (!R) {
    main.innerHTML = '<div class="empty">The radar data (data.js) is missing: run main.ts first.</div>';
    return;
  }
  const { path, params } = parseHash();
  main.setAttribute('aria-busy', 'false');
  if (path === 'board') renderBoard(params);
  else if (path.startsWith('protocol/')) renderDetail(decodeURIComponent(path.slice('protocol/'.length)));
  else if (path === 'live') renderLive();
  else if (path === 'model') renderModel();
  else renderBoard(params);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
render();
