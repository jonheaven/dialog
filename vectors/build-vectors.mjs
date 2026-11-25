// Rebuilds vectors/ops.json and vectors/compact.json from codec.mjs.
// node vectors/build-vectors.mjs   (then review the diff; tests compare against the files)
import { writeFileSync } from 'node:fs';
import {
  FIXTURE_PRIV_HEX,
  OTHER_PRIV_HEX,
  addressForPriv,
  buildBody,
  compactScriptHex,
  contentDecision,
  signMessage,
  signedMessage,
} from '../codec.mjs';

const A = addressForPriv(FIXTURE_PRIV_HEX);
const B = addressForPriv(OTHER_PRIV_HEX);
const C = addressForPriv('0000000000000000000000000000000000000000000000000000000000000003');
const POST = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaai0';
const AVATAR = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbi0';

function sign(body, priv = FIXTURE_PRIV_HEX) {
  return { ...body, sig: signMessage(signedMessage(body), priv) };
}

const pass = [
  ['DLG-OP-001', 'edit', { ref: POST, text: 'Edited text. The original stays on chain.' }],
  ['DLG-OP-002', 'delete', { ref: POST }],
  ['DLG-OP-003', 'tip', { ref: POST, text: 'such post' }],
  ['DLG-OP-004', 'profile', { name: 'Fixture Shibe', bio: 'Public test key 1.', avatar: AVATAR, links: ['https://dogenals.org'], tip: A }],
  ['DLG-OP-005', 'keylink', { ref: C, ops: ['post', 'reply', 'engage'], label: 'cli' }],
  ['DLG-OP-006', 'keyrevoke', { ref: C }],
  ['DLG-OP-007', 'engage', { ref: POST, react: 'none' }],
  ['DLG-OP-008', 'post', { text: 'With media and an app hint.', media: [AVATAR], app: 'doginals.lol' }],
].map(([id, op, fields], i) => {
  const body = sign(buildBody(op, fields, A, (0x1000 + i).toString(16).padStart(16, '0')));
  return { id, expect: 'pass', body, signed_message: signedMessage(body) };
});

const failCases = [
  ['DLG-OP-F01', 'field', 'edit', { ref: POST, text: 'x' }, { react: 'like' }],
  ['DLG-OP-F02', 'ref', 'edit', { ref: B, text: 'x' }],
  ['DLG-OP-F03', 'links', 'profile', { links: ['javascript:alert(1)'] }],
  ['DLG-OP-F04', 'ops', 'keylink', { ref: C, ops: ['profile'] }],
  ['DLG-OP-F05', 'as', 'profile', { name: 'x', as: B }],
  ['DLG-OP-F06', 'ref', 'keylink', { ref: A, ops: ['post'] }],
  ['DLG-OP-F07', 'react', 'engage', { ref: POST, react: 'rocket' }],
  ['DLG-OP-F08', 'media', 'post', { text: 'x', media: [POST, POST] }],
];
const fail = failCases.map(([id, reason, op, fields, extra], i) => {
  const body = sign({ ...buildBody(op, fields, A, (0x2000 + i).toString(16).padStart(16, '0')), ...(extra ?? {}) });
  const got = contentDecision({ body });
  if (got.ok || got.reason !== reason) throw new Error(`${id}: expected ${reason}, got ${JSON.stringify(got)}`);
  return { id, expect: 'fail', reason, body };
});
for (const row of pass) if (!contentDecision({ body: row.body }).ok) throw new Error(row.id);

writeFileSync(
  new URL('./ops.json', import.meta.url),
  `${JSON.stringify({ protocol: 'Ðialog', marker: 'Ð:DLG', version: 1, fixture_note: 'Public test keys 1, 2 and 3. Not for funds.', author_address: A, other_address: B, linked_key_address: C, content: [...pass, ...fail] }, null, 2)}\n`,
);

const compact = [
  ['DLG-C-001', { op: 'react', ref: POST, react: 'like' }],
  ['DLG-C-002', { op: 'react', ref: POST, react: 'none' }],
  ['DLG-C-003', { op: 'repost', ref: POST }],
  ['DLG-C-004', { op: 'repost', ref: POST, undo: true }],
  ['DLG-C-005', { op: 'follow', ref: B }],
  ['DLG-C-006', { op: 'unfollow', ref: B }],
  ['DLG-C-007', { op: 'tip', ref: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccci258' }],
  ['DLG-C-008', { op: 'delete', ref: POST }],
  ['DLG-C-009', { op: 'keyrevoke', ref: C }],
].map(([id, action]) => {
  const script_hex = compactScriptHex(action);
  return { id, action, script_hex, script_bytes: script_hex.length / 2 };
});
writeFileSync(
  new URL('./compact.json', import.meta.url),
  `${JSON.stringify({ protocol: 'Ðialog', carrier: 'OP_RETURN', magic_hex: 'c3903a444c47', relay_limit_script_bytes: 83, vectors: compact }, null, 2)}\n`,
);
console.log('ok', pass.length + fail.length, compact.length);
