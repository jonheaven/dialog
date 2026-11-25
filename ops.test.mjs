// node --test   (from this directory, after npm install)
// v1 ops added beside post/reply: edit, delete, tip, profile, keylink, keyrevoke,
// and the compact OP_RETURN carrier.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as secp from '@noble/secp256k1';
import {
  FIXTURE_PRIV_HEX,
  OTHER_PRIV_HEX,
  MAX_OP_RETURN_SCRIPT_BYTES,
  addressForPriv,
  buildBody,
  bytesToHex,
  classifyBody,
  classifyCompactTx,
  compactAuthor,
  compactPayloadFromScript,
  compactScriptHex,
  contentDecision,
  currentVersion,
  decodeCompact,
  encodeCompact,
  hash160,
  hexToBytes,
  messageHash,
  parseRawTx,
  reduceState,
  rollback,
  signMessage,
  signedMessage,
} from './codec.mjs';

const A = addressForPriv(FIXTURE_PRIV_HEX);
const B = addressForPriv(OTHER_PRIV_HEX);
const THIRD_PRIV = '0000000000000000000000000000000000000000000000000000000000000003';
const C = addressForPriv(THIRD_PRIV);
const PRIV = { [A]: FIXTURE_PRIV_HEX, [B]: OTHER_PRIV_HEX, [C]: THIRD_PRIV };
const compactVectors = JSON.parse(readFileSync(new URL('./vectors/compact.json', import.meta.url), 'utf8'));
const opVectors = JSON.parse(readFileSync(new URL('./vectors/ops.json', import.meta.url), 'utf8'));

let nonceCounter = 0;
function signed(op, fields, signer = A) {
  nonceCounter += 1;
  const body = buildBody(op, fields, signer, nonceCounter.toString(16).padStart(16, '0'));
  body.sig = signMessage(signedMessage(body), PRIV[signer]);
  return body;
}
function ins(id, height, body, extra = {}) {
  return { kind: 'inscription', id, height, tx: extra.tx ?? 0, sub: extra.sub ?? 0, bodyBytes: JSON.stringify(body), outputs: extra.outputs };
}
const id = (n) => `${n.toString(16).padStart(64, '0')}i0`;

/** A P2PKH scriptSig for `priv`: <DER sig + hashtype> <compressed pubkey>. */
function scriptSigFor(priv, hashtype = 0x01) {
  const compact = secp.sign(new Uint8Array(32).fill(7), hexToBytes(priv), { prehash: false });
  const int = (b) => {
    let x = [...b];
    while (x.length > 1 && x[0] === 0 && x[1] < 0x80) x = x.slice(1);
    if (x[0] >= 0x80) x = [0, ...x];
    return [0x02, x.length, ...x];
  };
  const body = [...int(compact.subarray(0, 32)), ...int(compact.subarray(32))];
  const der = [0x30, body.length, ...body];
  const sig = new Uint8Array([...der, hashtype]);
  const pub = secp.getPublicKey(hexToBytes(priv), true);
  return bytesToHex(new Uint8Array([sig.length, ...sig, pub.length, ...pub]));
}
function p2pkhScript(priv) {
  const h = hash160(secp.getPublicKey(hexToBytes(priv), true));
  return `76a914${bytesToHex(h)}88ac`;
}
function compactEvent(n, height, action, priv = FIXTURE_PRIV_HEX, outputs = []) {
  const txid = n.toString(16).padStart(64, 'c');
  const tx = {
    txid,
    inputs: [{ scriptSig: scriptSigFor(priv), prevoutScript: p2pkhScript(priv) }],
    outputs: [{ script: compactScriptHex(action), value: 0 }, ...outputs],
  };
  return { kind: 'compact', id: `${txid}:0`, height, tx: 0, sub: 1e9, classified: classifyCompactTx(tx) };
}

test('ops vectors: every pass vector verifies, every fail vector names its reason', () => {
  for (const row of opVectors.content) {
    const result = contentDecision({ body: row.body });
    if (row.expect === 'pass') {
      assert.equal(result.ok, true, `${row.id} ${result.reason ?? ''}`);
      assert.equal(signedMessage(row.body), row.signed_message, row.id);
    } else {
      assert.equal(result.ok, false, row.id);
      assert.equal(result.reason, row.reason, row.id);
    }
  }
});

test('compact vectors: exact bytes, script within the 83-byte relay limit, round trip', () => {
  for (const row of compactVectors.vectors) {
    const script = compactScriptHex(row.action);
    assert.equal(script, row.script_hex, row.id);
    assert.equal(script.length / 2, row.script_bytes, row.id);
    assert.ok(script.length / 2 <= MAX_OP_RETURN_SCRIPT_BYTES, row.id);
    const decoded = decodeCompact(compactPayloadFromScript(script));
    assert.equal(decoded.status, 'VALID', row.id);
    const expect = { ...row.action };
    if (expect.op === 'repost') expect.undo = Boolean(expect.undo);
    assert.deepEqual(decoded.action, expect, row.id);
  }
});

test('a D:// OP_RETURN is not a Ðialog compact action, and the reverse', () => {
  const dproto = `6a4c50${bytesToHex(new TextEncoder().encode('D://'))}${'11'.repeat(76)}`;
  assert.equal(compactPayloadFromScript(dproto), null);
  const ours = compactScriptHex({ op: 'follow', ref: B });
  assert.notEqual(ours.slice(0, 6), '6a4c50');
  assert.notEqual(ours.slice(4, 12), bytesToHex(new TextEncoder().encode('D://')));
  // Non-minimal push of the same payload is not accepted.
  const payload = encodeCompact({ op: 'follow', ref: B });
  assert.equal(compactPayloadFromScript(`6a4c${payload.length.toString(16).padStart(2, '0')}${bytesToHex(payload)}`), null);
  // Trailing bytes after the push are not accepted.
  assert.equal(compactPayloadFromScript(`${ours}00`), null);
});

test('compact decode: wrong length, unknown op, future version', () => {
  const p = encodeCompact({ op: 'react', ref: id(1), react: 'like' });
  assert.equal(decodeCompact(p.subarray(0, p.length - 1)).reason, 'length');
  const extra = new Uint8Array([...p, 0]);
  assert.equal(decodeCompact(extra).reason, 'length');
  const badOp = Uint8Array.from(p);
  badOp[6] = 0x1f;
  assert.equal(decodeCompact(badOp).reason, 'op');
  const future = Uint8Array.from(p);
  future[6] = 0x21;
  assert.equal(decodeCompact(future).status, 'UNSUPPORTED');
  const badReact = Uint8Array.from(p);
  badReact[43] = 9;
  assert.equal(decodeCompact(badReact).reason, 'react');
});

test('compact author is the P2PKH key on input 0, signed SIGHASH_ALL', () => {
  const ok = compactAuthor(scriptSigFor(FIXTURE_PRIV_HEX), p2pkhScript(FIXTURE_PRIV_HEX));
  assert.equal(ok.ok, true);
  assert.equal(ok.author, A);
  assert.equal(ok.prevoutChecked, true);
  assert.equal(compactAuthor(scriptSigFor(FIXTURE_PRIV_HEX, 0x02)).reason, 'sighash');
  assert.equal(compactAuthor(scriptSigFor(FIXTURE_PRIV_HEX, 0x81)).reason, 'sighash');
  assert.equal(compactAuthor(scriptSigFor(FIXTURE_PRIV_HEX), p2pkhScript(OTHER_PRIV_HEX)).reason, 'prevout');
  assert.equal(compactAuthor('00').reason, 'input0-not-p2pkh');
  const unchecked = compactAuthor(scriptSigFor(FIXTURE_PRIV_HEX));
  assert.equal(unchecked.prevoutChecked, false);
});

test('a transaction with two OP_RETURN outputs carries no compact action', () => {
  const tx = {
    txid: 'ab'.repeat(32),
    inputs: [{ scriptSig: scriptSigFor(FIXTURE_PRIV_HEX), prevoutScript: p2pkhScript(FIXTURE_PRIV_HEX) }],
    outputs: [
      { script: compactScriptHex({ op: 'follow', ref: B }), value: 0 },
      { script: '6a0100', value: 0 },
    ],
  };
  assert.equal(classifyCompactTx(tx).reason, 'op-return-count');
  assert.equal(classifyCompactTx({ ...tx, outputs: [{ script: p2pkhScript(OTHER_PRIV_HEX), value: 1 }] }), null);
});

test('raw transaction parser reads inputs, outputs and the txid', () => {
  // Built by hand: version 1, one input, two outputs, locktime 0.
  const sigScript = scriptSigFor(FIXTURE_PRIV_HEX);
  const op = compactScriptHex({ op: 'follow', ref: B });
  const le64 = (n) => {
    const b = new Uint8Array(8);
    let v = BigInt(n);
    for (let i = 0; i < 8; i += 1) {
      b[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    return bytesToHex(b);
  };
  const hex =
    '01000000' +
    '01' +
    '11'.repeat(32) +
    '00000000' +
    (sigScript.length / 2).toString(16).padStart(2, '0') +
    sigScript +
    'ffffffff' +
    '02' +
    le64(0) +
    (op.length / 2).toString(16).padStart(2, '0') +
    op +
    le64(100000000) +
    '19' +
    p2pkhScript(OTHER_PRIV_HEX) +
    '00000000';
  const tx = parseRawTx(hex);
  assert.equal(tx.inputs.length, 1);
  assert.equal(tx.outputs.length, 2);
  assert.equal(tx.outputs[1].value, 100000000n);
  assert.equal(tx.inputs[0].scriptSig, sigScript);
  const c = classifyCompactTx(tx);
  assert.equal(c.status, 'VALID');
  assert.equal(c.author, A);
  assert.equal(c.action.ref, B);
  assert.throws(() => parseRawTx(`${hex}00`));
});

test('edit: author only, latest in chain order wins, history kept, delete hides all', () => {
  const post = signed('post', { text: 'v0' });
  const edit1 = signed('edit', { ref: id(1), text: 'v1' });
  const edit2 = signed('edit', { ref: id(1), text: 'v2' });
  const forged = signed('edit', { ref: id(1), text: 'not yours' }, B);
  const del = signed('delete', { ref: id(1) });
  const late = signed('edit', { ref: id(1), text: 'after delete' });
  const events = [
    ins(id(3), 12, edit2),
    ins(id(2), 11, edit1),
    ins(id(4), 13, forged),
    ins(id(1), 10, post),
  ];
  const s = reduceState(events);
  assert.equal(currentVersion(s, id(1)).text, 'v2');
  assert.deepEqual(s.posts.get(id(1)).versions.map((v) => v.text), ['v0', 'v1', 'v2']);
  assert.equal(s.log.find((r) => r.id === id(4)).status, 'NO_EFFECT');
  const withDelete = reduceState([ins(id(6), 15, late), ...events, ins(id(5), 14, del)]);
  assert.equal(currentVersion(withDelete, id(1)), null);
  assert.equal(withDelete.posts.get(id(1)).versions.length, 3);
  assert.equal(withDelete.log.find((r) => r.id === id(6)).status, 'NO_EFFECT');
  // Same block: transaction index orders the two edits.
  const sameBlock = reduceState([ins(id(1), 10, post), ins(id(3), 11, edit2, { tx: 1 }), ins(id(2), 11, edit1, { tx: 2 })]);
  assert.equal(currentVersion(sameBlock, id(1)).text, 'v1');
  // Another author cannot delete it.
  const otherDelete = reduceState([ins(id(1), 10, post), ins(id(7), 11, signed('delete', { ref: id(1) }, B))]);
  assert.equal(currentVersion(otherDelete, id(1)).text, 'v0');
});

test('profile: author signed, latest wins, full replacement, reorg returns the earlier one', () => {
  const p1 = signed('profile', { name: 'Shibe', bio: 'first', links: ['https://example.com'], tip: B });
  const p2 = signed('profile', { name: 'Shibe 2' });
  const events = [ins(id(10), 20, p1), ins(id(11), 21, p2)];
  const s = reduceState(events);
  assert.equal(s.profiles.get(A).name, 'Shibe 2');
  assert.equal(s.profiles.get(A).bio, undefined);
  assert.equal(reduceState(rollback(events, 21)).profiles.get(A).bio, 'first');
  assert.equal(contentDecision({ body: signed('profile', { links: ['http://plain.example'] }) }).reason, 'links');
  assert.equal(contentDecision({ body: signed('profile', { name: 'x'.repeat(51) }) }).reason, 'name');
  assert.equal(contentDecision({ body: signed('profile', { avatar: 'nope' }) }).reason, 'avatar');
  assert.equal(contentDecision({ body: signed('profile', { text: 'no' }) }).reason, 'field');
});

test('keys: link, act, rotate, revoke; ordering is chain order and revocation is not retroactive', () => {
  const link = signed('keylink', { ref: C, ops: ['post', 'engage'], label: 'cli' });
  const viaKey = signed('post', { text: 'from my CLI key', as: A }, C);
  const notAllowed = signed('follow', { ref: B, as: A }, C);
  const revoke = signed('keyrevoke', { ref: C });
  const afterRevoke = signed('post', { text: 'too late', as: A }, C);
  const events = [
    ins(id(20), 30, link),
    ins(id(21), 31, viaKey),
    ins(id(22), 32, notAllowed),
    ins(id(23), 33, revoke),
    ins(id(24), 34, afterRevoke),
  ];
  const s = reduceState(events);
  assert.equal(s.posts.get(id(21)).author, A);
  assert.equal(s.posts.get(id(21)).signer, C);
  assert.equal(s.log.find((r) => r.id === id(22)).status, 'UNAUTHORIZED');
  assert.equal(s.log.find((r) => r.id === id(24)).status, 'UNAUTHORIZED');
  assert.ok(s.keys.get(`${A}\0${C}`).revoked);
  // Before the link is mined, the same signed post does nothing.
  const early = reduceState([ins(id(21), 29, viaKey), ins(id(20), 30, link)]);
  assert.equal(early.posts.has(id(21)), false);
  // A key can serve one account at a time. B cannot claim C while A holds it.
  const steal = signed('keylink', { ref: C, ops: ['post'] }, B);
  const s2 = reduceState([ins(id(20), 30, link), ins(id(25), 31, steal)]);
  assert.equal(s2.log.find((r) => r.id === id(25)).reason, 'key-linked-elsewhere');
  // The key may revoke itself.
  const selfRevoke = signed('keyrevoke', { ref: C, as: A }, C);
  const s3 = reduceState([ins(id(20), 30, link), ins(id(26), 31, selfRevoke)]);
  assert.ok(s3.keys.get(`${A}\0${C}`).revoked);
  // A linked key cannot publish a profile or link more keys.
  assert.equal(contentDecision({ body: signed('profile', { name: 'x', as: A }, C) }).reason, 'as');
  assert.equal(contentDecision({ body: signed('keylink', { ref: B, ops: ['post'], as: A }, C) }).reason, 'as');
  // Compact action from the linked key counts for the account, only for linked ops.
  const like = compactEvent(1, 31, { op: 'react', ref: id(21), react: 'like' }, THIRD_PRIV);
  const follow = compactEvent(2, 31, { op: 'follow', ref: B }, THIRD_PRIV);
  const s4 = reduceState([ins(id(20), 30, link), ins(id(21), 30, viaKey, { tx: 1 }), like, follow]);
  assert.equal(s4.reactions.get(`${A}\0${id(21)}`).react, 'like');
  assert.equal(s4.log.find((r) => r.id === follow.id).status, 'UNAUTHORIZED');
});

test('reactions and reposts: one per author and target, latest wins, compact and inscription agree', () => {
  const post = signed('post', { text: 'react to me' }, B);
  const heart = signed('engage', { ref: id(30), react: 'heart' });
  const events = [
    ins(id(30), 40, post),
    ins(id(31), 41, heart),
    compactEvent(3, 42, { op: 'react', ref: id(30), react: 'fire' }),
    compactEvent(4, 43, { op: 'repost', ref: id(30) }),
  ];
  const s = reduceState(events);
  assert.equal(s.reactions.get(`${A}\0${id(30)}`).react, 'fire');
  assert.ok(s.reposts.has(`${A}\0${id(30)}`));
  const cleared = reduceState([
    ...events,
    compactEvent(5, 44, { op: 'react', ref: id(30), react: 'none' }),
    compactEvent(6, 44, { op: 'repost', ref: id(30), undo: true }),
  ]);
  assert.equal(cleared.reactions.has(`${A}\0${id(30)}`), false);
  assert.equal(cleared.reposts.has(`${A}\0${id(30)}`), false);
  // Any inscription can be reacted to, not only Ðialog posts.
  const nft = reduceState([compactEvent(7, 1, { op: 'react', ref: id(99), react: 'like' })]);
  assert.equal(nft.log[0].status, 'VALID');
  assert.equal(nft.reactions.get(`${A}\0${id(99)}`).react, 'like');
});

test('follows: compact and inscription share one edge; compact unfollow is on chain', () => {
  const follow = signed('follow', { ref: B });
  const events = [ins(id(40), 50, follow), compactEvent(8, 51, { op: 'unfollow', ref: B })];
  const s = reduceState(events);
  assert.equal(s.follows.get(`${A}\0${B}`).op, 'unfollow');
  assert.equal(reduceState(rollback(events, 51)).follows.get(`${A}\0${B}`).op, 'follow');
});

test('tips: direct outputs to the post tip address, else profile tip, else author; no self tip', () => {
  const post = signed('post', { text: 'tip me' }, B);
  const profile = signed('profile', { tip: C }, B);
  const out = (address, koinu) => ({ address, value: koinu });
  const sTipCompact = compactEvent(9, 61, { op: 'tip', ref: id(50) }, FIXTURE_PRIV_HEX, [
    { script: p2pkhScript(OTHER_PRIV_HEX), value: 250000000 },
  ]);
  const s = reduceState([ins(id(50), 60, post), sTipCompact]);
  assert.equal(s.tips.get(id(50))[0].koinu, 250000000n);
  assert.equal(s.tips.get(id(50))[0].to, B);
  const tipIns = signed('tip', { ref: id(50), text: 'wow' });
  const s2 = reduceState([
    ins(id(50), 60, post),
    ins(id(51), 61, profile),
    ins(id(52), 62, tipIns, { outputs: [out(C, 100000000), out(B, 5)] }),
  ]);
  assert.equal(s2.tips.get(id(50))[0].to, C);
  assert.equal(s2.tips.get(id(50))[0].koinu, 100000000n);
  const self = signed('tip', { ref: id(50) }, B);
  const s3 = reduceState([ins(id(50), 60, post), ins(id(53), 61, self, { outputs: [out(B, 100)] })]);
  assert.equal(s3.log.find((r) => r.id === id(53)).status, 'NO_EFFECT');
});

test('unknown fields are invalid; app is a hint and does not change validity', () => {
  const withApp = signed('post', { text: 'hi', app: 'doginals.lol' });
  assert.equal(classifyBody(JSON.stringify(withApp)).status, 'VALID');
  const extra = { ...withApp, color: 'red' };
  assert.equal(contentDecision({ body: extra }).reason, 'field');
  assert.equal(contentDecision({ body: signed('post', { text: 'x', app: 'Bad App' }) }).reason, 'app');
});

test('the same body re-inscribed is one statement in the state too', () => {
  const post = signed('post', { text: 'once' });
  const s = reduceState([ins(id(60), 70, post), ins(id(61), 71, post)]);
  assert.equal(s.posts.size, 1);
  assert.equal(s.log.find((r) => r.id === id(61)).status, 'DUPLICATE');
  assert.equal(typeof messageHash('x'), 'object');
});
