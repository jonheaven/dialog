// node --test spec/protocols/dialog/check.test.mjs
// Requires npm install in this directory. A missing dependency fails the test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as secp from '@noble/secp256k1';
import {
  base58Decode as b58decode,
  base58Encode as b58encode,
  FIXTURE_PRIV_HEX,
  MARKER,
  MARKER_UTF8_HEX,
  addressForPriv,
  chainOrder,
  classifyBody,
  contentDecision,
  dogecoinMainnetAddress,
  followGraph,
  hasDuplicateKeys,
  p2pkhAddress,
  reduceGraph,
  rollback,
  signMessage,
  signedMessage,
  verifyMessage,
} from './codec.mjs';

const vectors = JSON.parse(readFileSync(new URL('./vectors/auth.json', import.meta.url), 'utf8'));
const post = vectors.content.find((row) => row.id === 'DLG-001');
const reply = vectors.content.find((row) => row.id === 'DLG-002');

test('marker is Ð:DLG and is not Ð:SOC or Ð:DIG', () => {
  assert.equal(Buffer.from(MARKER, 'utf8').toString('hex'), 'c3903a444c47');
  assert.equal(MARKER_UTF8_HEX, 'c3903a444c47');
  assert.equal(Buffer.from('Ð:SOC', 'utf8').toString('hex'), 'c3903a534f43');
  assert.equal(Buffer.from('Ð:DIG', 'utf8').toString('hex'), 'c3903a444947');
});

test('the checker recomputes the canonical string and the signature', () => {
  for (const row of vectors.content.filter((item) => item.expect === 'pass')) {
    const again = signedMessage(row.body);
    assert.equal(again, row.signed_message);
    assert.equal(again.startsWith('Ðialog:v1:'), true);
    assert.equal(again.includes(row.body.sig), false);
    assert.equal(again.includes(`"p":"Ð:DLG"`), true);
    assert.equal(again.includes(`"v":1`), true);
    assert.equal(again.includes(`"net":"dogecoin"`), true);
    assert.equal(again.includes(`"op":"${row.body.op}"`), true);
    const fresh = signMessage(again, FIXTURE_PRIV_HEX);
    assert.equal(fresh, row.body.sig);
    assert.equal(verifyMessage(row.body.addr, fresh, again), true);
  }
  assert.equal(addressForPriv(FIXTURE_PRIV_HEX), vectors.author_address);
});

test('each committed vector is accepted or rejected by recomputation', () => {
  assert.equal(vectors.content.length, 8);
  for (const row of vectors.content) {
    const result = contentDecision(row);
    assert.equal(result.ok, row.expect === 'pass', `${row.id} ${result.reason ?? ''}`);
    if (row.expect === 'pass') assert.equal(result.author, row.body.addr);
  }
});

test('changing a bound field breaks the signature', () => {
  const mutations = [
    ['p', 'Ð:DIG'],
    ['v', 2],
    ['net', 'testnet'],
    ['op', 'reply'],
    ['text', post.body.text + '.'],
    ['nonce', '0000000000000000'],
    ['tip', vectors.other_address],
    ['addr', vectors.other_address],
  ];
  for (const [key, value] of mutations) {
    const body = { ...post.body, [key]: value };
    const result = contentDecision({ body });
    assert.equal(result.ok, false, key);
  }
});

test('a high-S re-encoding is invalid', () => {
  const raw = Buffer.from(post.body.sig, 'base64');
  const parsed = secp.Signature.fromBytes(raw.subarray(1), 'compact');
  assert.equal(parsed.hasHighS(), false);
  const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const high = new secp.Signature(parsed.r, n - parsed.s).toBytes('compact');
  const wrapped = Buffer.concat([raw.subarray(0, 1), Buffer.from(high)]).toString('base64');
  const result = contentDecision({ body: { ...post.body, sig: wrapped } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'high-s');
});

test('the compression bit selects one public-key encoding', () => {
  const raw = Buffer.from(post.body.sig, 'base64');
  const flipped = Buffer.from(raw);
  const flag = (flipped[0] - 27) & 4;
  flipped[0] = flag ? flipped[0] - 4 : flipped[0] + 4;
  const message = signedMessage(post.body);
  assert.equal(verifyMessage(post.body.addr, flipped.toString('base64'), message), false);
});

test('only mainnet address version 0x1e matches', () => {
  const pub = secp.getPublicKey(
    Uint8Array.from(Buffer.from(FIXTURE_PRIV_HEX, 'hex')),
    true,
  );
  const bitcoin = p2pkhAddress(pub, 0x00);
  assert.notEqual(bitcoin, post.body.addr);
  assert.equal(verifyMessage(bitcoin, post.body.sig, signedMessage(post.body)), false);
  assert.equal(p2pkhAddress(pub, 0x1e), post.body.addr);
});

test('unknown version and unknown fields are not version 1', () => {
  const version = contentDecision({ body: { ...post.body, v: 9 } });
  assert.equal(version.ok, false);
  assert.equal(version.reason, 'version');
  assert.equal(classifyBody(JSON.stringify({ ...post.body, v: 2 })).status, 'UNSUPPORTED');
  assert.equal(contentDecision({ body: { ...post.body, v: '1' } }).reason, 'binding');
  const extra = contentDecision({ body: { ...post.body, recipient: post.body.addr } });
  assert.equal(extra.ok, false);
  assert.equal(extra.reason, 'field');
});

test('missing bytes are unavailable and bad bytes are invalid', () => {
  assert.equal(classifyBody(null).status, 'UNAVAILABLE');
  const noSig = { ...post.body };
  delete noSig.sig;
  assert.equal(classifyBody(JSON.stringify(noSig)).status, 'UNAVAILABLE');
  assert.equal(classifyBody(JSON.stringify({ ...post.body, sig: '' })).status, 'UNAVAILABLE');
  const bad = classifyBody(JSON.stringify({ ...post.body, text: 'tampered' }));
  assert.equal(bad.status, 'INVALID');
  assert.equal(classifyBody(JSON.stringify(post.body)).status, 'VALID');
  assert.equal(classifyBody('{').status, 'INVALID');
});

test('the same signature is one statement, and a reply is another', () => {
  const parentBytes = JSON.stringify(post.body);
  const replyBytes = JSON.stringify(reply.body);
  const events = [
    { id: 'later-copy', height: 20, tx: 1, sub: 0, bodyBytes: parentBytes },
    { id: 'reply', height: 11, tx: 0, sub: 1, bodyBytes: replyBytes },
    { id: 'first', height: 10, tx: 2, sub: 0, bodyBytes: parentBytes },
  ];
  const reduced = reduceGraph(events);
  assert.deepEqual(chainOrder(events).map((event) => event.id), ['first', 'reply', 'later-copy']);
  const byId = Object.fromEntries(reduced.map((event) => [event.id, event.status]));
  assert.equal(byId.first, 'VALID');
  assert.equal(byId.reply, 'VALID');
  assert.equal(byId['later-copy'], 'DUPLICATE');
  assert.notEqual(
    reduced.find((event) => event.id === 'first').statement,
    reduced.find((event) => event.id === 'reply').statement,
  );
});

test('a reorg drops records at the replaced height', () => {
  const kept = rollback(
    [
      { height: 9, id: 'a' },
      { height: 10, id: 'b' },
      { height: 11, id: 'c' },
    ],
    10,
  );
  assert.deepEqual(kept.map((event) => event.id), ['a']);
});

test('a non-canonical base64 spelling is not a second post', () => {
  const raw = Buffer.from(post.body.sig, 'base64');
  const urlSafe = raw.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const spelled = JSON.stringify({ ...post.body, sig: urlSafe });
  const again = JSON.stringify({ ...post.body, sig: `${post.body.sig} ` });
  assert.equal(classifyBody(spelled).status, 'INVALID');
  assert.equal(classifyBody(again).status, 'INVALID');
  const reduced = reduceGraph([
    { id: 'real', height: 1, tx: 0, sub: 0, bodyBytes: JSON.stringify(post.body) },
    { id: 'spelling', height: 2, tx: 0, sub: 0, bodyBytes: spelled },
  ]);
  assert.equal(reduced.filter((event) => event.status === 'VALID').length, 1);
  assert.equal(reduced.find((event) => event.id === 'spelling').status, 'INVALID');
});

test('duplicate raw JSON keys are invalid even though JSON.parse keeps one', () => {
  const raw = `{"p":"Ð:DLG","v":1,"net":"dogecoin","op":"post","nonce":"0102030405060708","text":"one","text":"two","addr":"${post.body.addr}","sig":"${post.body.sig}"}`;
  assert.equal(hasDuplicateKeys(raw), true);
  assert.equal(JSON.parse(raw).text, 'two');
  const classified = classifyBody(raw);
  assert.equal(classified.status, 'INVALID');
  assert.equal(classified.reason, 'duplicate-key');
});

test('decoded JSON escapes are the same member name', () => {
  const fixtures = JSON.parse(readFileSync(new URL('./vectors/duplicate-keys.json', import.meta.url), 'utf8'));
  const counter = fixtures.cases.find((row) => row.id === 'dlg-001-u006fp-before-op');
  assert.equal(counter.raw.includes('\\u006fp'), true);
  assert.equal(JSON.parse(counter.raw).op, 'post');
  assert.equal(classifyBody(counter.raw).status, 'INVALID');
  assert.equal(classifyBody(counter.raw).reason, 'duplicate-key');
  for (const row of fixtures.cases) {
    assert.equal(hasDuplicateKeys(row.raw), row.duplicate, row.id);
    if (row.duplicate) assert.doesNotThrow(() => JSON.parse(row.raw), row.id);
  }
  assert.equal(hasDuplicateKeys(JSON.stringify(post.body)), false);
  assert.equal(classifyBody(JSON.stringify(post.body)).status, 'VALID');
});

test('follow and unfollow are one edge, stable across replay and reorg', () => {
  const target = vectors.other_address;
  const follow = {
    p: 'Ð:DLG',
    v: 1,
    net: 'dogecoin',
    op: 'follow',
    ref: target,
    nonce: 'aaaaaaaaaaaaaaaa',
    addr: vectors.author_address,
  };
  follow.sig = signMessage(signedMessage(follow), FIXTURE_PRIV_HEX);
  const unfollow = {
    p: 'Ð:DLG',
    v: 1,
    net: 'dogecoin',
    op: 'unfollow',
    ref: target,
    nonce: 'bbbbbbbbbbbbbbbb',
    addr: vectors.author_address,
  };
  unfollow.sig = signMessage(signedMessage(unfollow), FIXTURE_PRIV_HEX);
  const decoded = b58decode(target);
  decoded[decoded.length - 1] ^= 0xff;
  const bad = b58encode(decoded);
  assert.equal(dogecoinMainnetAddress(target), true);
  assert.equal(dogecoinMainnetAddress(bad), false);
  const otherNet = p2pkhAddress(secp.getPublicKey(Uint8Array.from(Buffer.from(FIXTURE_PRIV_HEX, 'hex')), true), 0x71);
  assert.equal(dogecoinMainnetAddress(otherNet), false);
  assert.equal(contentDecision({ body: { ...post.body, tip: otherNet } }).reason, 'tip');
  assert.equal(contentDecision({ body: { ...follow, tip: target } }).reason, 'field');
  assert.equal(contentDecision({ body: { ...follow, ref: bad } }).reason, 'ref');
  const events = [
    { id: 'follow', height: 5, tx: 1, sub: 0, bodyBytes: JSON.stringify(follow) },
    { id: 'replay', height: 6, tx: 0, sub: 0, bodyBytes: JSON.stringify(follow) },
    { id: 'unfollow', height: 7, tx: 0, sub: 0, bodyBytes: JSON.stringify(unfollow) },
  ];
  const key = `${vectors.author_address}\0${target}`;
  const first = followGraph(events);
  const second = followGraph(events);
  assert.equal(first.edges.get(key).op, 'unfollow');
  assert.equal(second.edges.get(key).statement, first.edges.get(key).statement);
  assert.equal(first.log.find((row) => row.id === 'replay').status, 'DUPLICATE');
  const rolled = followGraph(rollback(events, 7));
  assert.equal(rolled.edges.get(key).op, 'follow');
  assert.equal(followGraph(rollback(events, 5)).edges.has(key), false);
});

test('an oversized signed body is rejected', () => {
  const body = {
    p: 'Ð:DLG',
    v: 1,
    net: 'dogecoin',
    op: 'post',
    nonce: 'ffffffffffffffff',
    text: 'x'.repeat(4100),
    addr: vectors.author_address,
  };
  body.sig = signMessage(signedMessage(body), FIXTURE_PRIV_HEX);
  const result = contentDecision({ body });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'oversize');
});

test('spoofed display strings and a BOM are invalid, and a self-follow does nothing', () => {
  const body = post.body;
  assert.equal(contentDecision({ body: { ...body, text: 'hello\u202e' } }).reason, 'text');
  assert.equal(contentDecision({ body: { ...body, text: '   ' } }).reason, 'text');
  assert.equal(contentDecision({ body: { ...body, text: 'cafe\u0301' } }).reason, 'text');
  assert.equal(classifyBody(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b])).reason, 'utf8');
  assert.equal(classifyBody(new Uint8Array([0xff])).reason, 'utf8');

  const follow = {
    p: 'Ð:DLG',
    v: 1,
    net: 'dogecoin',
    op: 'follow',
    ref: vectors.author_address,
    nonce: 'bbbbbbbbbbbbbbbb',
    addr: vectors.author_address,
  };
  follow.sig = signMessage(signedMessage(follow), FIXTURE_PRIV_HEX);
  const state = followGraph([{ id: 'self', height: 1, tx: 0, sub: 0, bodyBytes: JSON.stringify(follow) }]);
  assert.equal(state.log[0].status, 'NO_EFFECT');
  assert.equal(state.log[0].reason, 'self');
  assert.equal(state.edges.size, 0);
});
