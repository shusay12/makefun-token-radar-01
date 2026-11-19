// The token radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// rows the radar exists to find: pre-token protocols the list leaves out, at any size, that pass the
// product screen below — the watchlist's own screen with the size floor removed, so a protocol the
// list missed at $2B is ranked beside one it missed at $20M. A protocol is pre-token when its record
// carries no token (no market cap, no CoinGecko id, no symbol). Protocols whose token already
// trades are never ranked here: they are the calibration set, and the dashboard shows the largest
// of them apart, at the market's own values.
//
// The value model is calibrated on the snapshot itself, not on a hand-kept list of names:
//
//   comps       every live-token protocol with a market cap gives one ratio, mcap / TVL
//   multiple    a category's median ratio, shrunk toward the global median by its comp count,
//               then clamped:  multiple = clamp((n x catMedian + K x globalMedian) / (n + K))
//   growth      1 + clamp(change_7d, -40, +60) / 100 x 0.6      (unreported growth counts as 0)
//   seasoning   0.70 + min(age_days, 1460) / 1460 x 0.30        (unknown listing date: the
//               board's own median age, so the model never invents a birthday)
//   implied     max(1, round(tvl_usd x multiple x growth x seasoning))
//
// The same function scores every row; no protocol name is ever special-cased. The dashboard states
// the calibration table the multiples came from, so a reader can check every number on the board.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  shrink_k: number;
  multiple_min: number;
  multiple_max: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  seasoning_floor: number;
  seasoning_range: number;
  seasoning_days: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 6,
  multiple_min: 0.03,
  multiple_max: 1.5,
  growth_weight: 0.6,
  growth_floor: -40,
  growth_cap: 60,
  seasoning_floor: 0.7,
  seasoning_range: 0.3,
  seasoning_days: 1460,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'comps-2';

/** How many live-token protocols the dashboard's Already trading view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category's calibration: how many trading comps it has, their median ratio, the multiple used. */
export interface CalibrationRow {
  category: string;
  comps: number;
  median_ratio: number;
  multiple: number;
}

/** The whole calibration: the global comp median and one row per category that has comps. */
export interface Calibration {
  global_comps: number;
  global_median: number;
  fallback_multiple: number;
  rows: CalibrationRow[];
  byCategory: Map<string, CalibrationRow>;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    category_comps: number;
    category_median: number;
    growth_pct: number;
    growth_multiplier: number;
    seasoning_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row: the board row's figures, its model parts and its farm plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  multiple: number;
  category_comps: number;
  category_median: number;
  growth_multiplier: number;
  seasoning_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  protocols_size: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  median_age_days: number;
  calibration: { global_comps: number; global_median: number; fallback_multiple: number; rows: CalibrationRow[] };
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The middle value of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A wrapped, staked or staking whole word in a name marks a product of a token that already trades. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

/** Exchange names a wrapped or staked product's name can begin with (the watchlist's own list). */
const EXCHANGE_HEADS = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Categories that are wrapped, staked or bridged products, or exchanges: the watchlist's own exclusions. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/**
 * The product screen the radar applies at every size: the watchlist's own exclusions, with the
 * size floor removed. A protocol is rankable when it records no token, its category is not a
 * wrapped, staked or bridged product class or an exchange, it is not a versioned pool of another
 * protocol, and its name does not mark it as a wrapped or staked product of a token that already
 * trades or as an exchange's own product. The screen reads names and categories only, never a
 * hand-kept list of slugs.
 */
export function passesScreen(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (PRODUCT_CATEGORIES.has(p.category ?? '')) return false;
  if (VERSIONED.test(p.name)) return false;
  if (PRODUCT_WORD.test(p.name)) return false;
  if (EXCHANGE_HEADS.some((head) => p.name === head || p.name.startsWith(`${head} `))) return false;
  return true;
}

/**
 * The calibration: one mcap/TVL ratio per live-token protocol that records both figures, a median
 * per category, each shrunk toward the global median by its comp count and clamped to the model's
 * band. A category with no comps prices at the clamped global median.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const ratios: number[] = [];
  const perCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    ratios.push(ratio);
    const key = p.category ?? 'Uncategorized';
    const list = perCategory.get(key);
    if (list === undefined) perCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  const globalMedian = ratios.length > 0 ? median(ratios) : 0.2;
  const fallback = clamp(globalMedian, model.multiple_min, model.multiple_max);
  const rows: CalibrationRow[] = [];
  const byCategory = new Map<string, CalibrationRow>();
  for (const [category, list] of perCategory) {
    const med = median(list);
    const shrunk = (list.length * med + model.shrink_k * globalMedian) / (list.length + model.shrink_k);
    const row: CalibrationRow = {
      category,
      comps: list.length,
      median_ratio: round4(med),
      multiple: round4(clamp(shrunk, model.multiple_min, model.multiple_max)),
    };
    rows.push(row);
    byCategory.set(category, row);
  }
  rows.sort((a, b) => b.comps - a.comps || (a.category < b.category ? -1 : 1));
  return { global_comps: ratios.length, global_median: round4(globalMedian), fallback_multiple: round4(fallback), rows, byCategory };
}

/** The board candidates' median known age in days: the model's stand-in for an unreported listing date. */
export function medianAge(snapshot: Snapshot): number {
  const ages: number[] = [];
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) continue;
    const age = ageDays(snapshot.as_of, p.listed_at);
    if (age !== null) ages.push(age);
  }
  return ages.length > 0 ? Math.round(median(ages)) : 365;
}

/** The scoring parts and the implied value one protocol gets under the calibration. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  medianAgeDays: number,
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; comps: number; catMedian: number; growthPct: number; growthMult: number; seasoningMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const cal = calibration.byCategory.get(protocol.category ?? 'Uncategorized');
  const multiple = cal === undefined ? calibration.fallback_multiple : cal.multiple;
  const growthPct = clamp(finite(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? medianAgeDays;
  const seasoningMult = model.seasoning_floor + (Math.min(Math.max(ageForModel, 0), model.seasoning_days) / model.seasoning_days) * model.seasoning_range;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * seasoningMult));
  return {
    implied,
    multiple,
    comps: cal === undefined ? 0 : cal.comps,
    catMedian: cal === undefined ? calibration.global_median : cal.median_ratio,
    growthPct,
    growthMult,
    seasoningMult,
    age,
  };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = calibrate(snapshot, model);
  const medianAgeDays = medianAge(snapshot);
  const index = bySlug(snapshot.protocols);
  const onWatchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, exactly as the snapshot names it.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The radar's own finds: every screened pre-token protocol the list leaves out, at any size. No
  // cap and no floor: the list's misses are the radar's job, and a cap would only hide the tail
  // the board exists to surface.
  for (const p of snapshot.protocols) {
    if (chosen.has(p.slug)) continue;
    if (passesScreen(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, calibration, medianAgeDays, model) }));
  scored.sort(
    (a, b) =>
      b.implied - a.implied ||
      b.p.tvl_usd - a.p.tvl_usd ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: onWatchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      multiple: s.multiple,
      category_comps: s.comps,
      category_median: s.catMedian,
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      seasoning_multiplier: round4(s.seasoningMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain, in the plain tiers a farmer budgets by. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $12 of gas at typical mainnet fees';
  if (chain === 'Solana') return 'under $1 of fees';
  return 'about $2 of gas';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core farming action, in the words a farmer can follow. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}; if it offers borrowing, borrow about $${Math.round(capital / 3)} against it and supply that too, keeping the health factor above 2.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and trade one small position a week at 2x leverage or under, so the wallet builds real volume.`;
  if (c.includes('bridge') || c.includes('canonical') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds in one app on the far side instead of bridging straight back.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and hold the liquid receipt token in the same wallet.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield')) return `Deposit $${capital} into a ${name} vault on ${chain} (the USDC or ETH vault with the most deposits) and keep the vault shares.`;
  if (c.includes('dex') || c.includes('liquidity')) return `Add $${capital} of liquidity to ${name}'s busiest pool on ${chain}, split evenly across both assets, and keep the position open.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the farming wallet.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it, keeping the subscription receipt.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} for the longest term it offers and keep the policy.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and take one position in its most traded market.`;
  if (c.includes('chain')) return `Bridge $${capital} to the ${name} chain and use its two busiest apps each week: one swap and one deposit.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second action: the step that deepens a position from a deposit into a history. */
function deepenAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow against the position once and re-supply the borrowed asset, so both sides of ${name}'s market record your wallet.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Keep weekly volume near $${capital * 2} across several small trades rather than one large trade, and never let one position risk more than a fifth of the margin.`;
  if (c.includes('bridge') || c.includes('canonical') || c.includes('cross chain')) return `Bridge a second, smaller amount (about $${Math.round(capital / 4)}) back a week later; round trips are what bridge activity programs count.`;
  if (c.includes('staking') || c.includes('restak')) return `Delegate or restake the receipt token where ${name} offers it, and answer one governance poll if the wallet is asked.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield')) return `Split a second $${Math.round(capital / 2)} into a second ${name} vault (another asset or another chain it runs on) so the wallet is not riding on one strategy.`;
  if (c.includes('dex') || c.includes('liquidity')) return `Make two swaps a week in the same pool, about $${Math.round(capital / 5)} each way, so the wallet shows trading as well as liquidity.`;
  return `Repeat the core action once more after 14 days with about $${Math.round(capital / 2)}, so the wallet's history spans two monthly snapshots.`;
}

/** The weekly qualifying action for the category. */
function weeklyAction(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('perpetual') || c.includes('derivative')) return `Place the week's small trade and check the position's margin before you close the app.`;
  if (c.includes('bridge') || c.includes('canonical') || c.includes('cross chain')) return `Make one small qualifying bridge run (about $25) so every week of the window shows activity.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Check the position's health factor and top up or repay a little so the week shows a real interaction.`;
  return `Make one qualifying action, such as a deposit top-up, a swap, a claim or a vote, so every week of the window shows activity.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm ${p.name} with, and keep its seed phrase offline.`,
      cost: 'under $3 to fund and make the first transaction',
      time: '5 minutes',
    },
    {
      text: coreAction(p, capital, chain),
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: deepenAction(p, capital, chain),
      cost: `about $${Math.round(capital / 2)} more capital at most, and ${gas}`,
      time: '10 minutes, a week after step 2',
    },
    {
      text: weeklyAction(p),
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and open ${p.name}'s own points or rewards page once a week to see what it counts.`,
      cost: `the $${capital} stays in the position; checking costs nothing`,
      time: `${hold} days, 5 minutes a week`,
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log; when a token or claim is announced, claim only from the link the protocol itself publishes, and never pay a fee to claim.`,
      cost: 'nothing but the log; a claim, if one comes, costs gas only',
      time: '5 minutes to log, 10 minutes to claim',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Already trading view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      symbol: p.symbol,
    }));
}

/** A board row's form for data.js: everything the page renders, farm plan included. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    watchlist: row.watchlist,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    category_comps: row.model.category_comps,
    category_median: row.model.category_median,
    growth_multiplier: row.model.growth_multiplier,
    seasoning_multiplier: row.model.seasoning_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const calibration = calibrate(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    protocols_size: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    median_age_days: medianAge(snapshot),
    calibration: {
      global_comps: calibration.global_comps,
      global_median: calibration.global_median,
      fallback_multiple: calibration.fallback_multiple,
      rows: calibration.rows,
    },
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows: the gate wants at least 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters once trimmed`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
