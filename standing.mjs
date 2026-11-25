// Ðialog standing/1: suggested, NON-CONSENSUS social standing derived from Ðialog state.
//
// Input: the state any Ðialog reader computes with codec.mjs `reduceState`, plus the
// tip height. Nothing else: no wall clock, no off-chain data, no tokens, no points
// anyone can buy. Two readers with the same chain and the same tip get the same numbers.
// Apps may present it however they like, or ignore it. See STANDING.md.

export const STANDING_VERSION = 'standing/1';
/** Dogecoin targets one block a minute, so 1440 blocks is one chain day. */
export const BLOCKS_PER_DAY = 1440;
export const SEED_AGE_BLOCKS = 7 * BLOCKS_PER_DAY;
export const SEED_MIN_POSTS = 3;
export const DAMPING = 0.85;
export const ITERATIONS = 20;
export const PAIR_CAP = 8;
export const MIN_TIP_KOINU = 1_000_000n;
/** An endorser with no standing counts 1% of a trusted one: a hundred fresh sybils equal one real account. */
export const CRED_FLOOR = 0.01;

const W = { follow: 3, react: 1, reply: 2, quote: 2, repost: 2, tip: 2 };
const POST_OPS = new Set(['post', 'reply', 'quote']);

export const MILESTONES = [
  { id: 'first-post', label: 'First post', test: (s) => s.posts >= 1 },
  { id: 'posts-10', label: '10 posts', test: (s) => s.posts >= 10 },
  { id: 'posts-100', label: '100 posts', test: (s) => s.posts >= 100 },
  { id: 'first-reply', label: 'First reply received', test: (s) => s.repliesReceived >= 1 },
  { id: 'followers-10', label: '10 followers', test: (s) => s.followers >= 10 },
  { id: 'followers-100', label: '100 followers', test: (s) => s.followers >= 100 },
  { id: 'first-tip', label: 'First tip received', test: (s) => s.tipsReceived >= 1 },
  { id: 'streak-7', label: '7-day streak', test: (s) => s.longestStreak >= 7 },
  { id: 'streak-30', label: '30-day streak', test: (s) => s.longestStreak >= 30 },
  { id: 'early-100', label: 'One of the first 100 posters', test: (s) => s.posterNumber != null && s.posterNumber <= 100 },
  { id: 'early-1000', label: 'One of the first 1,000 posters', test: (s) => s.posterNumber != null && s.posterNumber <= 1000 },
];

export function chainDay(height) {
  return Math.floor(Number(height) / BLOCKS_PER_DAY);
}

function bump(map, key, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function setOf(map, key) {
  let s = map.get(key);
  if (!s) {
    s = new Set();
    map.set(key, s);
  }
  return s;
}

function streaks(days, today) {
  const sorted = [...days].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const d of sorted) {
    run = prev != null && d === prev + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  }
  // The current streak survives until a full chain day passes with no post.
  let current = 0;
  if (prev != null && prev >= today - 1) {
    current = 1;
    for (let i = sorted.length - 2; i >= 0 && sorted[i] === sorted[i + 1] - 1; i -= 1) current += 1;
  }
  return { current, longest };
}

/**
 * Compute standing for every account in `state` at `tipHeight`.
 * Returns { version, tipHeight, accounts: Map<address, AccountStanding>, credOf(address) }.
 */
export function computeStanding(state, tipHeight) {
  const tip = Number(tipHeight) || 0;
  const today = chainDay(tip);
  const since = new Map();
  const seen = (a, h) => {
    if (!a) return;
    const prev = since.get(a);
    if (prev == null || h < prev) since.set(a, h);
  };

  // Posters in chain order. state.posts is filled in chain order by reduceState.
  const posterNumber = new Map();
  const postsBy = new Map();
  const days = new Map();
  for (const p of state.posts.values()) {
    seen(p.author, p.height);
    if (!POST_OPS.has(p.op)) continue;
    if (!posterNumber.has(p.author)) posterNumber.set(p.author, posterNumber.size + 1);
    setOf(days, p.author).add(chainDay(p.height));
    if (!p.deleted) bump(postsBy, p.author);
  }

  const authorOf = (ref) => {
    const p = state.posts.get(ref);
    return p && !p.deleted ? p.author : null;
  };

  // Endorsement edges u -> v, capped per pair, never u === v.
  const edges = new Map(); // u -> Map(v -> weight)
  const add = (u, v, w) => {
    if (!u || !v || u === v) return;
    const row = edges.get(u) ?? new Map();
    row.set(v, Math.min(PAIR_CAP, (row.get(v) ?? 0) + w));
    edges.set(u, row);
  };

  const repliesFrom = new Map();
  const reactionsFrom = new Map();
  const repostsFrom = new Map();
  const tippers = new Map();
  const counts = { replies: new Map(), reactions: new Map(), reposts: new Map(), tips: new Map(), tipKoinu: new Map() };

  for (const p of state.posts.values()) {
    if (p.deleted || !p.ref) continue;
    const to = authorOf(p.ref);
    if (!to || to === p.author) continue;
    if (p.op === 'reply') {
      bump(counts.replies, to);
      setOf(repliesFrom, to).add(p.author);
      add(p.author, to, W.reply);
    } else if (p.op === 'quote') {
      add(p.author, to, W.quote);
    }
  }
  for (const r of state.reactions.values()) {
    seen(r.author, r.height);
    if (r.react === 'none') continue;
    const to = authorOf(r.ref);
    if (!to || to === r.author) continue;
    bump(counts.reactions, to);
    setOf(reactionsFrom, to).add(r.author);
    add(r.author, to, W.react);
  }
  for (const r of state.reposts.values()) {
    seen(r.author, r.height);
    const to = authorOf(r.ref);
    if (!to || to === r.author) continue;
    bump(counts.reposts, to);
    setOf(repostsFrom, to).add(r.author);
    add(r.author, to, W.repost);
  }
  const followers = new Map();
  for (const [key, edge] of state.follows) {
    const [u, v] = key.split('\0');
    seen(u, edge.height);
    if (edge.op !== 'follow' || u === v) continue;
    setOf(followers, v).add(u);
    add(u, v, W.follow);
  }
  for (const list of state.tips.values()) {
    for (const t of list) {
      seen(t.from, t.height);
      if (!t.from || !t.to || t.from === t.to) continue;
      bump(counts.tips, t.to);
      counts.tipKoinu.set(t.to, (counts.tipKoinu.get(t.to) ?? 0n) + BigInt(t.koinu));
      setOf(tippers, t.to).add(t.from);
      if (BigInt(t.koinu) >= MIN_TIP_KOINU) add(t.from, t.to, W.tip);
    }
  }
  for (const pr of state.profiles?.values?.() ?? []) seen(pr.address, pr.height);

  // Every account, in a fixed order so float sums run the same way everywhere.
  const accounts = [...since.keys()].sort();
  const endorsers = new Map();
  for (const [u, row] of edges) for (const v of row.keys()) setOf(endorsers, v).add(u);

  // Seeds: accounts that have been posting for a week, with a few posts and at least
  // one other account endorsing them. New sybils cannot become seeds in a day.
  let seeds = accounts.filter(
    (a) =>
      (since.get(a) ?? Infinity) <= tip - SEED_AGE_BLOCKS &&
      (postsBy.get(a) ?? 0) >= SEED_MIN_POSTS &&
      (endorsers.get(a)?.size ?? 0) >= 1,
  );
  if (seeds.length === 0) seeds = accounts.filter((a) => (postsBy.get(a) ?? 0) >= 1);
  if (seeds.length === 0) seeds = accounts;
  const seedSet = new Set(seeds);
  const p = (a) => (seedSet.has(a) ? 1 / seeds.length : 0);

  // Personalized PageRank from the seeds. Endorsing many accounts splits your weight.
  let trust = new Map(accounts.map((a) => [a, p(a)]));
  for (let k = 0; k < ITERATIONS; k += 1) {
    const next = new Map(accounts.map((a) => [a, (1 - DAMPING) * p(a)]));
    let dangling = 0;
    for (const u of accounts) {
      const t = trust.get(u) ?? 0;
      const row = edges.get(u);
      if (!row || row.size === 0) {
        dangling += t;
        continue;
      }
      let total = 0;
      const targets = [...row.keys()].sort();
      for (const v of targets) total += row.get(v);
      for (const v of targets) next.set(v, (next.get(v) ?? 0) + DAMPING * t * (row.get(v) / total));
    }
    if (dangling > 0) for (const s of seeds) next.set(s, next.get(s) + (DAMPING * dangling) / seeds.length);
    trust = next;
  }

  const n = accounts.length || 1;
  const ranked = [...accounts].sort(
    (a, b) => trust.get(b) - trust.get(a) || (since.get(a) ?? 0) - (since.get(b) ?? 0) || (a < b ? -1 : 1),
  );
  const rankOf = new Map(ranked.map((a, i) => [a, i + 1]));

  const out = new Map();
  for (const a of accounts) {
    const st = streaks(days.get(a) ?? new Set(), today);
    const t = trust.get(a) ?? 0;
    const row = {
      address: a,
      since: since.get(a) ?? null,
      sinceDay: since.has(a) ? chainDay(since.get(a)) : null,
      posterNumber: posterNumber.get(a) ?? null,
      posts: postsBy.get(a) ?? 0,
      repliesReceived: counts.replies.get(a) ?? 0,
      distinctRepliers: repliesFrom.get(a)?.size ?? 0,
      reactionsReceived: counts.reactions.get(a) ?? 0,
      distinctReactors: reactionsFrom.get(a)?.size ?? 0,
      repostsReceived: counts.reposts.get(a) ?? 0,
      followers: followers.get(a)?.size ?? 0,
      tipsReceived: counts.tips.get(a) ?? 0,
      tipKoinuReceived: counts.tipKoinu.get(a) ?? 0n,
      distinctTippers: tippers.get(a)?.size ?? 0,
      currentStreak: st.current,
      longestStreak: st.longest,
      activeDays: days.get(a)?.size ?? 0,
      trust: t,
      // 1.0 is an average account. Shown as a whole number: 100 = average.
      score: Math.round(t * n * 100),
      rank: rankOf.get(a),
      of: n,
      seed: seedSet.has(a),
      milestones: [],
    };
    row.milestones = MILESTONES.filter((m) => m.test(row)).map((m) => m.id);
    out.set(a, row);
  }

  return {
    version: STANDING_VERSION,
    tipHeight: tip,
    accounts: out,
    /** How much one account's engagement counts in rankings: CRED_FLOOR..1. */
    credOf: (a) => Math.max(CRED_FLOOR, Math.min(1, (trust.get(a) ?? 0) * n)),
  };
}

/**
 * Engagement per post, weighted by who engaged: Map(postId -> score). Each account's
 * total on one post is capped at PAIR_CAP, replies count once per account, the author
 * never counts, and an account with no standing counts CRED_FLOOR.
 */
export function engagementScores(state, standing) {
  const tallies = new Map(); // postId -> Map(account -> weight)
  const touch = (postId, u, w) => {
    const post = state.posts.get(postId);
    if (!post || post.deleted || !u || u === post.author) return;
    const t = tallies.get(postId) ?? new Map();
    t.set(u, Math.min(PAIR_CAP, (t.get(u) ?? 0) + w));
    tallies.set(postId, t);
  };
  for (const r of state.reactions.values()) if (r.react !== 'none') touch(r.ref, r.author, W.react);
  for (const r of state.reposts.values()) touch(r.ref, r.author, W.repost);
  const replied = new Set();
  for (const p of state.posts.values()) {
    if (p.deleted || !p.ref) continue;
    if (p.op === 'reply') {
      const key = `${p.ref}\0${p.author}`;
      if (replied.has(key)) continue;
      replied.add(key);
      touch(p.ref, p.author, W.reply);
    } else if (p.op === 'quote') touch(p.ref, p.author, W.quote);
  }
  for (const [ref, list] of state.tips) for (const t of list) if (BigInt(t.koinu) >= MIN_TIP_KOINU) touch(ref, t.from, W.tip);
  const out = new Map();
  for (const [postId, t] of tallies) {
    let score = 0;
    for (const u of [...t.keys()].sort()) score += t.get(u) * standing.credOf(u);
    out.set(postId, score);
  }
  return out;
}
