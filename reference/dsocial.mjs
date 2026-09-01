#!/usr/bin/env node
/**
 * Ðocial compact OP_RETURN encode / parse.
 * Zero dependencies. MIT. Canonical layout: spec.md §4
 *
 *   node reference/dsocial.mjs encode engage like 00112233445566778899aabbccddeeff 1 1
 *   node reference/dsocial.mjs encode follow ffffffffffffffffffffffffffffffff 0
 *   node reference/dsocial.mjs parse c3903a534f430102010100112233445566778899aabbccddeeff01000000
 *   node reference/dsocial.mjs hash16 <utf8 target id>
 */

import { createHash } from 'node:crypto';

export const DSOCIAL_MARKER = 'Ð:SOC';
export const DSOCIAL_VERSION = 0x01;
export const DSOCIAL_SIGNAL_BYTES = 30;
export const DSOCIAL_MAGIC = Buffer.from(DSOCIAL_MARKER, 'utf8');

export const DSOCIAL_KIND = {
  post: 0x01,
  engage: 0x02,
  follow: 0x03,
  unfollow: 0x04,
  reply: 0x05,
  quote: 0x06,
  repost: 0x07,
};

export const DSOCIAL_REACTION = {
  none: 0x00,
  like: 0x01,
  heart: 0x02,
  fire: 0x03,
  laugh: 0x04,
  doge: 0x05,
  checkin: 0x10,
  milestone: 0x20,
};

const KIND_NAME = Object.fromEntries(Object.entries(DSOCIAL_KIND).map(([k, v]) => [v, k]));
const REACTION_NAME = Object.fromEntries(Object.entries(DSOCIAL_REACTION).map(([k, v]) => [v, k]));

export function sha256Hash16(utf8) {
  return createHash('sha256').update(String(utf8), 'utf8').digest().subarray(0, 16);
}

function kindByte(kind) {
  if (typeof kind === 'number') return kind;
  const k = DSOCIAL_KIND[kind];
  if (k === undefined) throw new Error(`unknown kind: ${kind}`);
  return k;
}

function reactionByte(reaction) {
  if (reaction === undefined || reaction === null) return 0;
  if (typeof reaction === 'number') return reaction;
  const r = DSOCIAL_REACTION[reaction];
  if (r === undefined) throw new Error(`unknown reaction: ${reaction}`);
  return r;
}

function resolveHash16(opts) {
  if (opts.targetHash16 !== undefined) {
    const buf = Buffer.isBuffer(opts.targetHash16)
      ? opts.targetHash16
      : Buffer.from(String(opts.targetHash16).replace(/^0x/i, ''), 'hex');
    if (buf.length !== 16) throw new Error('Ðocial target_hash16 must be 16 bytes');
    return buf;
  }
  if (!opts.targetId) throw new Error('Ðocial signal needs targetId or targetHash16');
  return sha256Hash16(opts.targetId);
}

/** Spec §4.1 binary signal. */
export function encodeDsocialSignal(opts) {
  const kind = kindByte(opts.kind);
  const flags = (opts.flags ?? 0) & 0xff;
  const reaction = reactionByte(opts.reaction);
  if (kind === DSOCIAL_KIND.engage && reaction === 0) {
    throw new Error('Ðocial engage MUST set a non-zero reaction');
  }
  const out = Buffer.alloc(DSOCIAL_SIGNAL_BYTES);
  DSOCIAL_MAGIC.copy(out, 0);
  out[6] = DSOCIAL_VERSION;
  out[7] = kind;
  out[8] = flags;
  out[9] = reaction;
  resolveHash16(opts).copy(out, 10);
  out.writeUInt32LE((opts.nonce ?? 1) >>> 0, 26);
  return out;
}

export function parseDsocialSignal(payload) {
  const bytes = Buffer.isBuffer(payload)
    ? payload
    : Buffer.from(String(payload).replace(/^0x/i, ''), 'hex');
  if (bytes.length !== DSOCIAL_SIGNAL_BYTES) return null;
  if (!bytes.subarray(0, 6).equals(DSOCIAL_MAGIC)) return null;
  const kind = bytes[7];
  const reaction = bytes[9];
  return {
    magic: DSOCIAL_MARKER,
    version: bytes[6],
    kind,
    kindName: KIND_NAME[kind] || null,
    flags: bytes[8],
    reaction,
    reactionName: REACTION_NAME[reaction] || null,
    targetHash16Hex: bytes.subarray(10, 26).toString('hex'),
    nonce: bytes.readUInt32LE(26),
  };
}

/** scriptPubKey for a standard OP_RETURN output (payload length 1..75). */
export function scriptPubKey(payload) {
  if (payload.length < 1 || payload.length > 75) {
    throw new Error('OP_RETURN payload must be 1–75 bytes');
  }
  return Buffer.concat([Buffer.from([0x6a, payload.length]), payload]);
}

function main(argv) {
  const cmd = argv[0];
  if (cmd === 'hash16') {
    const h = sha256Hash16(argv.slice(1).join(' '));
    process.stdout.write(h.toString('hex') + '\n');
    return;
  }
  if (cmd === 'encode') {
    const kind = argv[1];
    let payload;
    if (kind === 'engage') {
      payload = encodeDsocialSignal({
        kind: 'engage',
        reaction: argv[2],
        targetHash16: argv[3],
        nonce: argv[4] !== undefined ? Number(argv[4]) : 1,
        flags: argv[5] !== undefined ? Number(argv[5]) : 0,
      });
    } else if (kind === 'follow' || kind === 'unfollow') {
      payload = encodeDsocialSignal({
        kind,
        reaction: 'none',
        targetHash16: argv[2],
        nonce: argv[3] !== undefined ? Number(argv[3]) : 0,
        flags: 0,
      });
    } else {
      process.stderr.write('encode kind must be engage | follow | unfollow\n');
      process.exit(2);
    }
    const spk = scriptPubKey(payload);
    process.stdout.write(
      JSON.stringify(
        {
          kind,
          payloadHex: payload.toString('hex'),
          scriptPubKeyHex: spk.toString('hex'),
          payloadLen: payload.length,
          parsed: parseDsocialSignal(payload),
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }
  if (cmd === 'parse') {
    const parsed = parseDsocialSignal(argv[1]);
    if (!parsed) {
      process.stderr.write('not a Ðocial payload\n');
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(parsed, null, 2) + '\n');
    return;
  }
  process.stderr.write(
    'usage:\n' +
      '  node reference/dsocial.mjs encode engage <reaction> <targetHash16hex> [nonce] [flags]\n' +
      '  node reference/dsocial.mjs encode follow <targetHash16hex> [nonce]\n' +
      '  node reference/dsocial.mjs parse <payloadHex>\n' +
      '  node reference/dsocial.mjs hash16 <utf8>\n',
  );
  process.exit(2);
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  String(process.argv[1]).replace(/\\/g, '/').endsWith('reference/dsocial.mjs');
if (isMain) main(process.argv.slice(2));
