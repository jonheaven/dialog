import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS_PER_DAY, CRED_FLOOR, computeStanding, engagementScores } from './standing.mjs';

function emptyState() {
  return { posts: new Map(), reactions: new Map(), reposts: new Map(), follows: new Map(), profiles: new Map(), keys: new Map(), tips: new Map(), log: [] };
}
let n = 0;
function post(s, author, height, extra = {}) {
  const id = `${(++n).toString(16).padStart(64, '0')}i0`;
  s.posts.set(id, { id, op: 'post', author, ref: null, height, deleted: null, versions: [], ...extra });
  return id;
}
const react = (s, author, ref, height) => s.reactions.set(`${author}\0${ref}`, { author, ref, react: 'like', height });
const follow = (s, u, v, height) => s.follows.set(`${u}\0${v}`, { op: 'follow', height });

const DAY = BLOCKS_PER_DAY;

test('first post number, since, streaks and milestones come from chain order and height', () => {
  const s = emptyState();
  post(s, 'A', 10);
  post(s, 'B', 20);
  for (let d = 0; d < 8; d += 1) post(s, 'A', 5 * DAY + d * DAY + 3);
  const tip = 12 * DAY + 5;
  const st = computeStanding(s, tip);
  const a = st.accounts.get('A');
  assert.equal(a.posterNumber, 1);
  assert.equal(st.accounts.get('B').posterNumber, 2);
  assert.equal(a.since, 10);
  assert.equal(a.longestStreak, 8);
  assert.equal(a.currentStreak, 8); // last post day 12 = today
  assert.ok(a.milestones.includes('first-post'));
  assert.ok(a.milestones.includes('streak-7'));
  assert.ok(a.milestones.includes('early-100'));
  // A missed chain day ends the current streak, not the longest.
  const later = computeStanding(s, 15 * DAY);
  assert.equal(later.accounts.get('A').currentStreak, 0);
  assert.equal(later.accounts.get('A').longestStreak, 8);
});

test('self-interaction never counts', () => {
  const s = emptyState();
  const p = post(s, 'A', 1);
  react(s, 'A', p, 2);
  follow(s, 'A', 'A', 3);
  s.tips.set(p, [{ id: 'x', from: 'A', to: 'A', koinu: 100_000_000n, height: 4 }]);
  const st = computeStanding(s, 100);
  const a = st.accounts.get('A');
  assert.equal(a.reactionsReceived, 0);
  assert.equal(a.followers, 0);
  assert.equal(a.tipsReceived, 0);
  assert.equal(engagementScores(s, st).get(p) ?? 0, 0);
});

test('a ring of fresh sybils does not outrank an account real people endorse', () => {
  const s = emptyState();
  const tip = 30 * DAY;
  // Ten established accounts, posting for weeks, following each other and H.
  const honest = Array.from({ length: 10 }, (_, i) => `H${i}`);
  for (const h of honest) for (let k = 0; k < 4; k += 1) post(s, h, k * DAY + 1);
  for (const u of honest) for (const v of honest) if (u !== v) follow(s, u, v, 5 * DAY);
  const real = 'REAL';
  const realPost = post(s, real, 20 * DAY);
  for (const h of honest.slice(0, 3)) {
    follow(s, h, real, 21 * DAY);
    react(s, h, realPost, 21 * DAY);
  }
  // Forty sybils created yesterday, all following, reacting to and replying to SPAM.
  const spam = 'SPAM';
  const spamPost = post(s, spam, tip - DAY);
  const sybils = Array.from({ length: 40 }, (_, i) => `S${i}`);
  for (const x of sybils) {
    post(s, x, tip - DAY);
    follow(s, x, spam, tip - 10);
    react(s, x, spamPost, tip - 10);
    post(s, x, tip - 5, { op: 'reply', ref: spamPost });
    for (const y of sybils) if (x !== y) follow(s, x, y, tip - 10);
  }
  const st = computeStanding(s, tip);
  const R = st.accounts.get(real);
  const S = st.accounts.get(spam);
  assert.ok(S.followers > R.followers, 'raw counts favour the spammer');
  assert.ok(R.trust > S.trust, `trust ${R.trust} should beat ${S.trust}`);
  assert.ok(R.rank < S.rank);
  for (const x of sybils) assert.equal(st.credOf(x), CRED_FLOOR);
  const eng = engagementScores(s, st);
  assert.ok(eng.get(realPost) > eng.get(spamPost), 'Top feed favours the post real people engaged with');
});

test('same chain, same numbers: insertion order of the maps does not matter', () => {
  const build = (reverse) => {
    const s = emptyState();
    n = 1000;
    const ids = ['A', 'B', 'C', 'D'].map((a, i) => post(s, a, i + 1));
    const edges = [['A', 'B'], ['B', 'C'], ['C', 'A'], ['D', 'A'], ['A', 'D']];
    for (const [u, v] of reverse ? [...edges].reverse() : edges) follow(s, u, v, 50);
    const reacts = [['B', ids[0]], ['C', ids[0]], ['D', ids[1]]];
    for (const [u, p] of reverse ? [...reacts].reverse() : reacts) react(s, u, p, 60);
    return computeStanding(s, 20 * DAY);
  };
  const a = build(false);
  const b = build(true);
  for (const [addr, row] of a.accounts) {
    assert.equal(row.score, b.accounts.get(addr).score);
    assert.equal(row.rank, b.accounts.get(addr).rank);
  }
});
