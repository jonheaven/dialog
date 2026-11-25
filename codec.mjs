/**
 * Ðialog v1 reference checks.
 *
 * One file, two carriers:
 *   - inscription: a signed JSON body (every op)
 *   - compact: one OP_RETURN output, authored by the key that spends input 0
 *
 * Pure ESM. Runs in Node and in browsers. Dependencies: @noble/secp256k1 v3
 * and @noble/hashes v1.8. Public test keys only.
 */
import { hmac } from '@noble/hashes/hmac.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as secp from '@noble/secp256k1';

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

export const FIXTURE_PRIV_HEX = '0000000000000000000000000000000000000000000000000000000000000001';
export const OTHER_PRIV_HEX = '0000000000000000000000000000000000000000000000000000000000000002';
const MESSAGE_PREFIX = '\u0019Dogecoin Signed Message:\n';
const SIGNED_PREFIX = '\u00d0ialog:v1:';
export const MARKER = '\u00d0:DLG';
export const MARKER_UTF8_HEX = 'c3903a444c47';
export const MAX_SIGNED_JSON_BYTES = 4096;
/** Dogecoin Core 1.14.9 `MAX_OP_RETURN_RELAY` (src/script/standard.h): 83 script bytes. */
export const MAX_OP_RETURN_SCRIPT_BYTES = 83;

// ---------------------------------------------------------------------------
// Bytes

export function utf8(text) {
  return new TextEncoder().encode(text);
}

export function concat(...parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error('bad hex');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes) {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64Encode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

/** Strict standard base64. Returns null for any other spelling. */
export function base64Decode(text) {
  if (typeof text !== 'string' || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    const n =
      (B64.indexOf(text[i]) << 18) |
      (B64.indexOf(text[i + 1]) << 12) |
      ((text[i + 2] === '=' ? 0 : B64.indexOf(text[i + 2])) << 6) |
      (text[i + 3] === '=' ? 0 : B64.indexOf(text[i + 3]));
    if (o < out.length) out[o++] = (n >> 16) & 0xff;
    if (o < out.length) out[o++] = (n >> 8) & 0xff;
    if (o < out.length) out[o++] = n & 0xff;
  }
  if (base64Encode(out) !== text) return null;
  return out;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

export function base58Decode(text) {
  if (typeof text !== 'string' || text.length === 0) throw new Error('base58');
  let n = 0n;
  for (const c of text) {
    const v = B58.indexOf(c);
    if (v < 0) throw new Error('base58');
    n = n * 58n + BigInt(v);
  }
  const body = [];
  while (n > 0n) {
    body.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  let zeros = 0;
  for (const c of text) {
    if (c !== '1') break;
    zeros += 1;
  }
  return Uint8Array.from([...new Array(zeros).fill(0), ...body]);
}

export function sha256d(bytes) {
  return sha256(sha256(bytes));
}

export function hash160(bytes) {
  return ripemd160(sha256(bytes));
}

function compactSize(n) {
  if (n < 253) return Uint8Array.of(n);
  if (n <= 0xffff) return Uint8Array.of(253, n & 0xff, (n >> 8) & 0xff);
  throw new Error('message too long for this checker');
}

// ---------------------------------------------------------------------------
// Canonical JSON and the signed message

/** RFC 8785 for the types this protocol allows: objects, arrays, strings, safe integers. */
export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || (typeof value === 'number' && !Number.isInteger(value))) {
    throw new Error('unsupported JSON type');
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('bad integer');
    return String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  throw new Error('unsupported JSON type');
}

export function signedMessage(body) {
  const view = { ...body };
  delete view.sig;
  return `${SIGNED_PREFIX}${canonicalJson(view)}`;
}

export function messageHash(message) {
  const payload = utf8(message);
  return sha256d(concat(utf8(MESSAGE_PREFIX), compactSize(payload.length), payload));
}

// ---------------------------------------------------------------------------
// Addresses and signatures

/** Mainnet P2PKH version is 0x1e. Any other version byte is a different address. */
export function p2pkhAddress(pubkey, version = 0x1e) {
  return addressFromHash160(hash160(pubkey), version);
}

export function addressFromHash160(h160, version = 0x1e) {
  const payload = concat(Uint8Array.of(version), h160);
  return base58Encode(concat(payload, sha256d(payload).slice(0, 4)));
}

/** 20-byte key hash of a canonical mainnet P2PKH address, or null. */
export function addressHash160(address) {
  if (typeof address !== 'string') return null;
  let raw;
  try {
    raw = base58Decode(address);
  } catch {
    return null;
  }
  if (raw.length !== 25 || raw[0] !== 0x1e) return null;
  const expect = sha256d(raw.subarray(0, 21)).subarray(0, 4);
  if (!bytesEqual(raw.subarray(21), expect)) return null;
  if (base58Encode(raw) !== address) return null;
  return raw.slice(1, 21);
}

export function dogecoinMainnetAddress(address) {
  return addressHash160(address) !== null;
}

export function addressForPriv(privHex) {
  return p2pkhAddress(secp.getPublicKey(hexToBytes(privHex), true));
}

/** Dogecoin signed message, compressed key header (31..34). Test and tooling use only. */
export function signMessage(message, privHex) {
  const rec = secp.sign(messageHash(message), hexToBytes(privHex), { prehash: false, format: 'recovered' });
  const out = new Uint8Array(65);
  out[0] = 27 + 4 + rec[0];
  out.set(rec.subarray(1), 1);
  return base64Encode(out);
}

/** Standard base64 of exactly 65 bytes, padding included, header 27..34. */
export function canonicalSignature(sigB64) {
  const raw = base64Decode(sigB64);
  if (!raw || raw.length !== 65) return null;
  if (raw[0] < 27 || raw[0] > 34) return null;
  return raw;
}

export function signatureHighS(sigB64) {
  const raw = base64Decode(sigB64);
  if (!raw || raw.length !== 65) return false;
  try {
    return secp.Signature.fromBytes(raw.subarray(1), 'compact').hasHighS();
  } catch {
    return false;
  }
}

/** Address recovered from a Dogecoin signed message, or null. */
export function recoverAddress(sigB64, message) {
  const raw = canonicalSignature(sigB64);
  if (!raw) return null;
  const recovery = (raw[0] - 27) & 3;
  const compressed = ((raw[0] - 27) & 4) !== 0;
  let point;
  try {
    const rec = concat(Uint8Array.of(recovery), raw.subarray(1));
    point = secp.Point.fromBytes(secp.recoverPublicKey(rec, messageHash(message), { prehash: false }));
  } catch {
    return null;
  }
  return p2pkhAddress(point.toBytes(compressed), 0x1e);
}

export function verifyMessage(address, sigB64, message) {
  return recoverAddress(sigB64, message) === address;
}

// ---------------------------------------------------------------------------
// Duplicate member names

/**
 * True when one JSON object repeats a member name after string decoding.
 * `\u006fp` and `op` are the same key. A nested object has its own names.
 * A match inside a string value is not a key. Malformed JSON returns false;
 * the caller then rejects it as not JSON.
 */
export function hasDuplicateKeys(text) {
  if (typeof text !== 'string') return false;
  let i = 0;
  const n = text.length;
  let duplicate = false;
  const skip = () => {
    while (i < n && (text[i] === ' ' || text[i] === '\n' || text[i] === '\r' || text[i] === '\t')) i += 1;
  };
  const parseString = () => {
    if (text[i] !== '"') throw new Error('string');
    i += 1;
    let out = '';
    while (i < n) {
      const c = text[i];
      if (c === '"') {
        i += 1;
        return out;
      }
      if (c === '\\') {
        i += 1;
        if (i >= n) throw new Error('string');
        const e = text[i];
        i += 1;
        if (e === '"' || e === '\\' || e === '/') out += e;
        else if (e === 'b') out += '\b';
        else if (e === 'f') out += '\f';
        else if (e === 'n') out += '\n';
        else if (e === 'r') out += '\r';
        else if (e === 't') out += '\t';
        else if (e === 'u') {
          if (i + 4 > n) throw new Error('string');
          const hex = text.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error('string');
          i += 4;
          out += String.fromCharCode(Number.parseInt(hex, 16));
        } else throw new Error('string');
        continue;
      }
      if (c.charCodeAt(0) <= 0x1f) throw new Error('string');
      out += c;
      i += 1;
    }
    throw new Error('string');
  };
  const parseNumber = () => {
    const start = i;
    if (text[i] === '-') i += 1;
    if (text[i] === '0') i += 1;
    else if (text[i] >= '1' && text[i] <= '9') {
      i += 1;
      while (i < n && text[i] >= '0' && text[i] <= '9') i += 1;
    } else throw new Error('number');
    if (text[i] === '.') {
      i += 1;
      if (i >= n || text[i] < '0' || text[i] > '9') throw new Error('number');
      while (i < n && text[i] >= '0' && text[i] <= '9') i += 1;
    }
    if (text[i] === 'e' || text[i] === 'E') {
      i += 1;
      if (text[i] === '+' || text[i] === '-') i += 1;
      if (i >= n || text[i] < '0' || text[i] > '9') throw new Error('number');
      while (i < n && text[i] >= '0' && text[i] <= '9') i += 1;
    }
    if (i === start) throw new Error('number');
  };
  const parseLiteral = (word) => {
    if (text.slice(i, i + word.length) !== word) throw new Error('literal');
    i += word.length;
  };
  const parseValue = () => {
    skip();
    if (i >= n) throw new Error('end');
    const c = text[i];
    if (c === '{') return parseObject();
    if (c === '[') return parseArray();
    if (c === '"') {
      parseString();
      return undefined;
    }
    if (c === 't') return parseLiteral('true');
    if (c === 'f') return parseLiteral('false');
    if (c === 'n') return parseLiteral('null');
    if (c === '-' || (c >= '0' && c <= '9')) return parseNumber();
    throw new Error('value');
  };
  const parseObject = () => {
    i += 1;
    skip();
    const keys = new Set();
    if (text[i] === '}') {
      i += 1;
      return;
    }
    while (i < n) {
      skip();
      const key = parseString();
      if (keys.has(key)) duplicate = true;
      else keys.add(key);
      skip();
      if (text[i] !== ':') throw new Error('colon');
      i += 1;
      parseValue();
      skip();
      if (text[i] === ',') {
        i += 1;
        continue;
      }
      if (text[i] === '}') {
        i += 1;
        return;
      }
      throw new Error('object');
    }
    throw new Error('object');
  };
  const parseArray = () => {
    i += 1;
    skip();
    if (text[i] === ']') {
      i += 1;
      return;
    }
    while (i < n) {
      parseValue();
      skip();
      if (text[i] === ',') {
        i += 1;
        continue;
      }
      if (text[i] === ']') {
        i += 1;
        return;
      }
      throw new Error('array');
    }
    throw new Error('array');
  };
  try {
    skip();
    parseValue();
    skip();
    if (i !== n) return false;
    return duplicate;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Inscription bodies

export const OPS = Object.freeze([
  'post',
  'reply',
  'quote',
  'repost',
  'engage',
  'follow',
  'unfollow',
  'edit',
  'delete',
  'tip',
  'profile',
  'keylink',
  'keyrevoke',
]);

export const REACTIONS = Object.freeze(['like', 'heart', 'fire', 'laugh', 'doge', 'none']);

/** Ops a linked key may sign for its account. `profile` and `keylink` stay with the account key. */
export const DELEGABLE_OPS = Object.freeze([
  'post',
  'reply',
  'quote',
  'repost',
  'engage',
  'follow',
  'unfollow',
  'edit',
  'delete',
  'tip',
]);

const COMMON_KEYS = ['p', 'v', 'net', 'op', 'nonce', 'addr', 'sig', 'as', 'app'];
const OP_KEYS = {
  post: ['text', 'media', 'tip'],
  reply: ['ref', 'text', 'media', 'tip'],
  quote: ['ref', 'text', 'media', 'tip'],
  repost: ['ref', 'text'],
  engage: ['ref', 'react'],
  follow: ['ref'],
  unfollow: ['ref'],
  edit: ['ref', 'text', 'media'],
  delete: ['ref'],
  tip: ['ref', 'text'],
  profile: ['name', 'bio', 'avatar', 'banner', 'links', 'tip'],
  keylink: ['ref', 'ops', 'label'],
  keyrevoke: ['ref'],
};
const INSCRIPTION_ID = /^[0-9a-f]{64}i(0|[1-9][0-9]{0,9})$/;
const APP = /^[a-z0-9][a-z0-9.-]{0,31}$/;
const POST_LIKE = new Set(['post', 'reply', 'quote']);

export function isInscriptionId(id) {
  return typeof id === 'string' && INSCRIPTION_ID.test(id) && Number(id.split('i')[1]) <= 0xffffffff;
}

function utf16Len(s) {
  return s.length;
}

function stringField(value, { min = 0, max }) {
  return typeof value === 'string' && utf16Len(value) >= min && utf16Len(value) <= max;
}

/** Bidi controls and the invisible format characters used to spoof a name. U+200D (emoji ZWJ) stays. */
const SPOOF = /[\u00ad\u034f\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff\ufff9-\ufffb]/;

function nonCharacter(cp) {
  if (cp >= 0xfdd0 && cp <= 0xfdef) return true;
  return (cp & 0xfffe) === 0xfffe && cp <= 0x10ffff;
}

/** Display strings are NFC, with no bidi controls, noncharacters, or lone surrogates. */
export function displayStringOk(value, { min = 0, max, multiline = false } = {}) {
  if (typeof value !== 'string' || value.normalize('NFC') !== value) return false;
  const n = utf16Len(value);
  if (n < min || n > max || SPOOF.test(value)) return false;
  for (const ch of value) {
    const cp = ch.codePointAt(0);
    if (cp >= 0xd800 && cp <= 0xdfff) return false;
    if (nonCharacter(cp)) return false;
    const control = cp < 0x20 || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f);
    if (control && !(multiline && (cp === 0x09 || cp === 0x0a))) return false;
  }
  return true;
}

export function decodeUtf8(bodyBytes) {
  if (typeof bodyBytes === 'string') return bodyBytes.charCodeAt(0) === 0xfeff ? null : bodyBytes;
  const bytes = bodyBytes instanceof Uint8Array ? bodyBytes : new Uint8Array(bodyBytes);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

function httpsLink(value) {
  if (!stringField(value, { min: 9, max: 200 })) return false;
  if (!value.startsWith('https://') || /[\s\u0000-\u001f\u007f]/.test(value)) return false;
  return true;
}

function fail(reason) {
  return { ok: false, reason };
}

/**
 * Stateless check of one body: fields, signature, size. It does not decide
 * whether a linked key was active, whether an edit targets the author's own
 * post, and so on. That is `reduceState`.
 */
export function contentDecision(vector) {
  const body = vector.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('body');
  if (body.p !== MARKER || body.net !== 'dogecoin') return fail('binding');
  if (body.v !== 1) return fail(typeof body.v === 'number' && Number.isSafeInteger(body.v) && body.v > 1 ? 'version' : 'binding');
  const op = body.op;
  if (!OPS.includes(op)) return fail('op');
  const allowed = new Set([...COMMON_KEYS, ...OP_KEYS[op]]);
  for (const key of Object.keys(body)) if (!allowed.has(key)) return fail('field');

  if (typeof body.addr !== 'string' || typeof body.sig !== 'string' || !/^[0-9a-f]{16}$/.test(body.nonce ?? '')) {
    return fail('auth fields');
  }
  if (!dogecoinMainnetAddress(body.addr)) return fail('addr');
  if (body.as != null) {
    if (!dogecoinMainnetAddress(body.as) || body.as === body.addr) return fail('as');
    if (op === 'profile' || op === 'keylink') return fail('as');
    if (op === 'keyrevoke' && body.ref !== body.addr) return fail('as');
  }
  if (body.app != null && !(typeof body.app === 'string' && APP.test(body.app))) return fail('app');

  const needsPostRef = ['reply', 'quote', 'repost', 'engage', 'edit', 'delete', 'tip'];
  if (needsPostRef.includes(op) && !isInscriptionId(body.ref)) return fail('ref');
  if (['follow', 'unfollow', 'keylink', 'keyrevoke'].includes(op) && !dogecoinMainnetAddress(body.ref)) return fail('ref');
  if (op === 'keylink' && body.ref === body.addr) return fail('ref');

  const prose = (value) => displayStringOk(value, { min: 1, max: 65536, multiline: true }) && value.trim().length > 0;
  if (['post', 'reply', 'quote', 'edit'].includes(op) && !prose(body.text)) return fail('text');
  if ((op === 'repost' || op === 'tip') && body.text != null && !prose(body.text)) return fail('text');
  if (op === 'engage' && !REACTIONS.includes(body.react)) return fail('react');

  if (body.media != null) {
    if (!Array.isArray(body.media) || body.media.length < 1 || body.media.length > 4) return fail('media');
    if (!body.media.every(isInscriptionId) || new Set(body.media).size !== body.media.length) return fail('media');
  }
  if (body.tip != null && !dogecoinMainnetAddress(body.tip)) return fail('tip');

  if (op === 'profile') {
    if (body.name != null && (!displayStringOk(body.name, { min: 1, max: 50 }) || body.name.trim() !== body.name)) return fail('name');
    if (body.bio != null && (!displayStringOk(body.bio, { max: 500, multiline: true }) || (body.bio.length > 0 && body.bio.trim().length === 0))) return fail('bio');
    if (body.avatar != null && !isInscriptionId(body.avatar)) return fail('avatar');
    if (body.banner != null && !isInscriptionId(body.banner)) return fail('banner');
    if (body.links != null) {
      if (!Array.isArray(body.links) || body.links.length < 1 || body.links.length > 4) return fail('links');
      if (!body.links.every(httpsLink) || new Set(body.links).size !== body.links.length) return fail('links');
    }
  }
  if (op === 'keylink') {
    if (!Array.isArray(body.ops) || body.ops.length < 1) return fail('ops');
    if (!body.ops.every((o) => DELEGABLE_OPS.includes(o)) || new Set(body.ops).size !== body.ops.length) return fail('ops');
    if (body.label != null && (!displayStringOk(body.label, { min: 1, max: 32 }) || body.label.trim() !== body.label)) return fail('label');
  }

  if (!canonicalSignature(body.sig)) return fail('sig-encoding');
  if (signatureHighS(body.sig)) return fail('high-s');
  let canonical;
  try {
    canonical = signedMessage(body);
  } catch {
    return fail('canonical');
  }
  if (utf8(canonical.slice(SIGNED_PREFIX.length)).length > MAX_SIGNED_JSON_BYTES) return fail('oversize');
  if (!verifyMessage(body.addr, body.sig, canonical)) return fail('signature');
  const raw = canonicalSignature(body.sig);
  const statement = `${body.addr}:${bytesToHex(raw)}:${bytesToHex(messageHash(canonical))}`;
  return { ok: true, author: body.addr, statement };
}

/**
 * bodyBytes null: the inscription was not fetched (UNAVAILABLE).
 * Present bytes that fail the rules: INVALID.
 * A body that says a later integer version: UNSUPPORTED (skipped, not invalid).
 * Present bytes that pass: VALID.
 * A present object with no sig, or sig "", is UNAVAILABLE (signature bytes are not here).
 */
export function classifyBody(bodyBytes) {
  if (bodyBytes == null) return { status: 'UNAVAILABLE', reason: 'body bytes missing' };
  const text = decodeUtf8(bodyBytes);
  if (text == null) return { status: 'INVALID', reason: 'utf8' };
  if (hasDuplicateKeys(text)) return { status: 'INVALID', reason: 'duplicate-key' };
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { status: 'INVALID', reason: 'not json' };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { status: 'INVALID', reason: 'body' };
  if (typeof body.sig !== 'string' || body.sig.length === 0) {
    return { status: 'UNAVAILABLE', reason: 'signature bytes missing' };
  }
  const decision = contentDecision({ body });
  if (!decision.ok) {
    if (decision.reason === 'version') return { status: 'UNSUPPORTED', reason: 'version' };
    return { status: 'INVALID', reason: decision.reason };
  }
  return { status: 'VALID', author: decision.author, statement: decision.statement, body };
}

/** Unsigned body with a fresh nonce. The wallet signs `signedMessage(body)`. */
export function buildBody(op, fields, addr, nonceHex) {
  const body = { p: MARKER, v: 1, net: 'dogecoin', op, nonce: nonceHex, addr };
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    body[key] = typeof value === 'string' && (key === 'text' || key === 'name' || key === 'bio' || key === 'label')
      ? value.normalize('NFC')
      : value;
  }
  return body;
}

export function randomNonce() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

// ---------------------------------------------------------------------------
// Compact carrier: one OP_RETURN

export const COMPACT_MAGIC_HEX = MARKER_UTF8_HEX;
export const COMPACT_VERSION = 1;
export const COMPACT_OPS = Object.freeze({
  1: 'react',
  2: 'repost',
  3: 'follow',
  4: 'unfollow',
  5: 'tip',
  6: 'delete',
  7: 'keyrevoke',
});
const COMPACT_CODE = Object.fromEntries(Object.entries(COMPACT_OPS).map(([k, v]) => [v, Number(k)]));
/** Reaction byte. 0 clears the author's reaction on the target. */
export const COMPACT_REACT = Object.freeze({ 0: 'none', 1: 'like', 2: 'heart', 3: 'fire', 4: 'laugh', 5: 'doge' });
const COMPACT_REACT_CODE = Object.fromEntries(Object.entries(COMPACT_REACT).map(([k, v]) => [v, Number(k)]));
const COMPACT_LEN = { react: 44, repost: 44, follow: 27, unfollow: 27, tip: 43, delete: 43, keyrevoke: 27 };

function targetBytes(inscriptionId) {
  if (!isInscriptionId(inscriptionId)) throw new Error('target must be an inscription id');
  const [txid, index] = inscriptionId.split('i');
  const out = new Uint8Array(36);
  out.set(hexToBytes(txid), 0);
  const n = Number(index);
  out[32] = n & 0xff;
  out[33] = (n >>> 8) & 0xff;
  out[34] = (n >>> 16) & 0xff;
  out[35] = (n >>> 24) & 0xff;
  return out;
}

function targetId(bytes) {
  const n = bytes[32] + bytes[33] * 0x100 + bytes[34] * 0x10000 + bytes[35] * 0x1000000;
  return `${bytesToHex(bytes.subarray(0, 32))}i${n}`;
}

/**
 * Encode one compact action to the OP_RETURN data push.
 * action: { op: 'react', ref, react } | { op: 'repost', ref, undo? } | { op: 'follow'|'unfollow'|'keyrevoke', ref: address }
 *       | { op: 'tip'|'delete', ref }
 */
export function encodeCompact(action) {
  const code = COMPACT_CODE[action?.op];
  if (!code) throw new Error('unknown compact op');
  const head = concat(hexToBytes(COMPACT_MAGIC_HEX), Uint8Array.of((COMPACT_VERSION << 4) | code));
  switch (action.op) {
    case 'react': {
      const r = COMPACT_REACT_CODE[action.react];
      if (r === undefined) throw new Error('unknown reaction');
      return concat(head, targetBytes(action.ref), Uint8Array.of(r));
    }
    case 'repost':
      return concat(head, targetBytes(action.ref), Uint8Array.of(action.undo ? 0 : 1));
    case 'tip':
    case 'delete':
      return concat(head, targetBytes(action.ref));
    default: {
      const h = addressHash160(action.ref);
      if (!h) throw new Error('target must be a mainnet P2PKH address');
      return concat(head, h);
    }
  }
}

/** Full output script: OP_RETURN, one minimal direct push. */
export function compactScript(payload) {
  if (payload.length < 1 || payload.length > 75) throw new Error('payload length');
  return concat(Uint8Array.of(0x6a, payload.length), payload);
}

export function compactScriptHex(action) {
  return bytesToHex(compactScript(encodeCompact(action)));
}

/**
 * Data push of a Ðialog OP_RETURN script, or null when the script is not one.
 * Only `6a <len 1..75> <payload>` with nothing after the push is accepted.
 */
export function compactPayloadFromScript(script) {
  const s = typeof script === 'string' ? hexToBytes(script) : script;
  if (s.length < 8 || s.length > MAX_OP_RETURN_SCRIPT_BYTES || s[0] !== 0x6a) return null;
  const len = s[1];
  if (len < 1 || len > 75 || s.length !== 2 + len) return null;
  const payload = s.subarray(2);
  if (bytesToHex(payload.subarray(0, 6)) !== COMPACT_MAGIC_HEX) return null;
  return payload;
}

/**
 * Decode a payload. Returns { status: 'VALID', action }, { status: 'UNSUPPORTED' }
 * for a later version nibble, or { status: 'INVALID', reason }.
 */
export function decodeCompact(payload) {
  if (!payload || payload.length < 7 || bytesToHex(payload.subarray(0, 6)) !== COMPACT_MAGIC_HEX) {
    return { status: 'INVALID', reason: 'magic' };
  }
  const version = payload[6] >> 4;
  if (version !== COMPACT_VERSION) {
    return version === 0 ? { status: 'INVALID', reason: 'version' } : { status: 'UNSUPPORTED', reason: 'version' };
  }
  const op = COMPACT_OPS[payload[6] & 0x0f];
  if (!op) return { status: 'INVALID', reason: 'op' };
  if (payload.length !== COMPACT_LEN[op]) return { status: 'INVALID', reason: 'length' };
  const body = payload.subarray(7);
  if (op === 'react') {
    const react = COMPACT_REACT[body[36]];
    if (!react) return { status: 'INVALID', reason: 'react' };
    return { status: 'VALID', action: { op, ref: targetId(body), react } };
  }
  if (op === 'repost') {
    if (body[36] > 1) return { status: 'INVALID', reason: 'flag' };
    return { status: 'VALID', action: { op, ref: targetId(body), undo: body[36] === 0 } };
  }
  if (op === 'tip' || op === 'delete') return { status: 'VALID', action: { op, ref: targetId(body) } };
  return { status: 'VALID', action: { op, ref: addressFromHash160(body) } };
}

/** Script pushes, or null for a non-push opcode. */
export function scriptPushes(script) {
  const s = typeof script === 'string' ? hexToBytes(script) : script;
  const out = [];
  let i = 0;
  while (i < s.length) {
    const op = s[i];
    i += 1;
    let len;
    if (op >= 1 && op <= 75) len = op;
    else if (op === 0x4c) {
      if (i + 1 > s.length) return null;
      len = s[i];
      i += 1;
    } else if (op === 0x4d) {
      if (i + 2 > s.length) return null;
      len = s[i] | (s[i + 1] << 8);
      i += 2;
    } else if (op === 0) {
      out.push(new Uint8Array(0));
      continue;
    } else return null;
    if (i + len > s.length) return null;
    out.push(s.slice(i, i + len));
    i += len;
  }
  return out;
}

function p2pkhScriptHash(script) {
  const s = typeof script === 'string' ? hexToBytes(script) : script;
  if (s.length === 25 && s[0] === 0x76 && s[1] === 0xa9 && s[2] === 0x14 && s[23] === 0x88 && s[24] === 0xac) {
    return s.slice(3, 23);
  }
  return null;
}

export function outputAddress(script) {
  const h = p2pkhScriptHash(script);
  return h ? addressFromHash160(h) : null;
}

/**
 * Author of a compact action: the P2PKH key that spends input 0 with SIGHASH_ALL.
 * prevoutScript (hex or bytes) is the output input 0 spends. When it is given it
 * MUST be the P2PKH script of that key. When it is not given the result says
 * `prevoutChecked: false`; an indexer MUST check it.
 */
export function compactAuthor(input0ScriptSig, prevoutScript) {
  const pushes = scriptPushes(input0ScriptSig ?? '');
  if (!pushes || pushes.length !== 2) return { ok: false, reason: 'input0-not-p2pkh' };
  const [sig, pub] = pushes;
  const pubOk =
    (pub.length === 33 && (pub[0] === 2 || pub[0] === 3)) || (pub.length === 65 && pub[0] === 4);
  if (!pubOk) return { ok: false, reason: 'input0-not-p2pkh' };
  if (sig.length < 9 || sig[0] !== 0x30) return { ok: false, reason: 'input0-not-p2pkh' };
  if (sig[sig.length - 1] !== 0x01) return { ok: false, reason: 'sighash' };
  const h = hash160(pub);
  if (prevoutScript != null) {
    const prev = p2pkhScriptHash(prevoutScript);
    if (!prev || !bytesEqual(prev, h)) return { ok: false, reason: 'prevout' };
  }
  return { ok: true, author: addressFromHash160(h), prevoutChecked: prevoutScript != null };
}

/**
 * Classify one transaction. tx: { txid, inputs: [{ scriptSig, prevoutScript? }], outputs: [{ script, value }] }
 * (hex strings, value in koinu as number or bigint). Returns null when the tx has no Ðialog OP_RETURN.
 */
export function classifyCompactTx(tx) {
  const dialogOuts = [];
  let opReturns = 0;
  tx.outputs.forEach((out, vout) => {
    const s = typeof out.script === 'string' ? hexToBytes(out.script) : out.script;
    if (s[0] === 0x6a) {
      opReturns += 1;
      const payload = compactPayloadFromScript(s);
      if (payload) dialogOuts.push({ vout, payload });
    }
  });
  if (dialogOuts.length === 0) return null;
  const { vout, payload } = dialogOuts[0];
  const base = { id: `${tx.txid}:${vout}`, txid: tx.txid, vout };
  if (opReturns !== 1) return { ...base, status: 'INVALID', reason: 'op-return-count' };
  const decoded = decodeCompact(payload);
  if (decoded.status !== 'VALID') return { ...base, ...decoded };
  const who = compactAuthor(tx.inputs[0]?.scriptSig, tx.inputs[0]?.prevoutScript);
  if (!who.ok) return { ...base, status: 'INVALID', reason: who.reason };
  const outputs = tx.outputs
    .map((out) => ({ address: outputAddress(out.script), value: BigInt(out.value) }))
    .filter((out) => out.address);
  return { ...base, status: 'VALID', author: who.author, prevoutChecked: who.prevoutChecked, action: decoded.action, outputs };
}

/** Minimal legacy transaction parser (Dogecoin has no segwit). */
export function parseRawTx(hex) {
  const b = hexToBytes(hex);
  let i = 0;
  const need = (n) => {
    if (i + n > b.length) throw new Error('short tx');
  };
  const u32 = () => {
    need(4);
    const v = b[i] + b[i + 1] * 0x100 + b[i + 2] * 0x10000 + b[i + 3] * 0x1000000;
    i += 4;
    return v;
  };
  const varint = () => {
    need(1);
    const f = b[i];
    i += 1;
    if (f < 0xfd) return f;
    if (f === 0xfd) {
      need(2);
      const v = b[i] | (b[i + 1] << 8);
      i += 2;
      return v;
    }
    if (f === 0xfe) return u32();
    throw new Error('varint');
  };
  const take = (n) => {
    need(n);
    const out = b.slice(i, i + n);
    i += n;
    return out;
  };
  u32();
  const inputs = [];
  const nIn = varint();
  for (let k = 0; k < nIn; k += 1) {
    const prev = take(32);
    const prevVout = u32();
    const scriptSig = take(varint());
    u32();
    inputs.push({ prevTxid: bytesToHex(prev.slice().reverse()), prevVout, scriptSig: bytesToHex(scriptSig) });
  }
  const outputs = [];
  const nOut = varint();
  for (let k = 0; k < nOut; k += 1) {
    const lo = BigInt(u32());
    const hi = BigInt(u32());
    outputs.push({ value: (hi << 32n) | lo, script: bytesToHex(take(varint())) });
  }
  u32();
  if (i !== b.length) throw new Error('trailing bytes');
  return { txid: bytesToHex(sha256d(b).reverse()), inputs, outputs };
}

// ---------------------------------------------------------------------------
// Order, reorgs, and state

/** Chain order: (height, tx index, sub). sub is the inscription input index, or 1e9 + vout for a compact action. */
export function chainOrder(events) {
  return [...events].sort((a, b) => a.height - b.height || a.tx - b.tx || a.sub - b.sub);
}

/** Drop every record at or above `height`, then the caller reapplies the new blocks. */
export function rollback(events, height) {
  return events.filter((event) => event.height < height);
}

/** First VALID (author, sig) in chain order is the statement. A later copy is a duplicate. */
export function reduceGraph(events) {
  const seen = new Set();
  const accepted = [];
  for (const event of chainOrder(events)) {
    const classified = classifyBody(event.bodyBytes);
    if (classified.status !== 'VALID') {
      accepted.push({ ...event, status: classified.status, reason: classified.reason });
      continue;
    }
    if (seen.has(classified.statement)) {
      accepted.push({ ...event, status: 'DUPLICATE', statement: classified.statement });
      continue;
    }
    seen.add(classified.statement);
    accepted.push({ ...event, status: 'VALID', author: classified.author, statement: classified.statement });
  }
  return accepted;
}

/** Follow edges only. Same rules as `reduceState().follows`. */
export function followGraph(events) {
  const state = reduceState(events);
  const edges = new Map();
  for (const [key, edge] of state.follows) edges.set(key, edge);
  return { log: state.log, edges };
}

const COMPACT_TO_OP = { react: 'engage', repost: 'repost', follow: 'follow', unfollow: 'unfollow', tip: 'tip', delete: 'delete', keyrevoke: 'keyrevoke' };

function recipientFor(state, target) {
  const post = state.posts.get(target);
  if (!post) return null;
  if (post.tip) return post.tip;
  const profile = state.profiles.get(post.author);
  return profile?.tip ?? post.author;
}

/**
 * Deterministic state from events in any order. Each event is either
 *   { kind: 'inscription', id, height, tx, sub, bodyBytes, outputs? }
 *   { kind: 'compact', id, height, tx, sub, classified }  (classified = classifyCompactTx result)
 * `outputs` on an inscription event is [{ address, value }] of its reveal transaction, used for tips.
 * Events without `kind` are inscriptions.
 */
export function reduceState(events) {
  const state = {
    posts: new Map(),
    reactions: new Map(),
    reposts: new Map(),
    follows: new Map(),
    profiles: new Map(),
    keys: new Map(),
    tips: new Map(),
    log: [],
  };
  const seen = new Set();
  const delegateOwner = new Map();

  const activeAccount = (signer, as, op) => {
    if (as == null) return signer;
    const link = state.keys.get(`${as}\0${signer}`);
    if (!link || link.revoked || !link.ops.includes(op)) return null;
    return as;
  };

  const note = (event, status, extra = {}) => {
    state.log.push({ id: event.id, status, ...extra });
  };

  const applyTip = (event, account, ref, outputs, text) => {
    const recipient = recipientFor(state, ref);
    if (!recipient || recipient === account) return note(event, 'NO_EFFECT', { reason: 'tip-recipient' });
    let amount = 0n;
    for (const out of outputs ?? []) if (out.address === recipient) amount += BigInt(out.value);
    if (amount === 0n) return note(event, 'NO_EFFECT', { reason: 'tip-amount' });
    const list = state.tips.get(ref) ?? [];
    list.push({ id: event.id, from: account, to: recipient, koinu: amount, text: text ?? null, height: event.height });
    state.tips.set(ref, list);
    return note(event, 'VALID', { op: 'tip', author: account });
  };

  // Any inscription can be reacted to or reposted: a Ðialog post, an NFT, a token deploy.
  const applyReact = (event, account, ref, react) => {
    const key = `${account}\0${ref}`;
    if (react === 'none') state.reactions.delete(key);
    else state.reactions.set(key, { author: account, ref, react, height: event.height });
    return note(event, 'VALID', { op: 'engage', author: account });
  };

  const applyRepost = (event, account, ref, undo, via) => {
    const key = `${account}\0${ref}`;
    if (undo) state.reposts.delete(key);
    else state.reposts.set(key, { author: account, ref, via, height: event.height });
    return note(event, 'VALID', { op: 'repost', author: account });
  };

  const applyFollow = (event, account, ref, op, statement) => {
    if (account === ref) return note(event, 'NO_EFFECT', { reason: 'self' });
    state.follows.set(`${account}\0${ref}`, { op, height: event.height, tx: event.tx, sub: event.sub, statement });
    return note(event, 'VALID', { op, author: account, statement });
  };

  const applyDelete = (event, account, ref) => {
    const post = state.posts.get(ref);
    if (post && post.author === account && !post.deleted) {
      post.deleted = { id: event.id, height: event.height };
      for (const [key, rp] of state.reposts) if (rp.via === ref) state.reposts.delete(key);
      return note(event, 'VALID', { op: 'delete', author: account });
    }
    return note(event, 'NO_EFFECT', { reason: 'delete-target' });
  };

  const applyRevoke = (event, signer, ref) => {
    // The account revokes its own linked key, or a linked key revokes itself.
    const account = signer === ref ? delegateOwner.get(ref) : signer;
    const link = account ? state.keys.get(`${account}\0${ref}`) : null;
    if (!link || link.revoked) return note(event, 'NO_EFFECT', { reason: 'keyrevoke-target' });
    link.revoked = { id: event.id, height: event.height };
    delegateOwner.delete(ref);
    return note(event, 'VALID', { op: 'keyrevoke', author: account });
  };

  for (const event of chainOrder(events)) {
    if (event.kind === 'compact') {
      const c = event.classified;
      if (!c || c.status !== 'VALID') {
        note(event, c?.status ?? 'INVALID', { reason: c?.reason });
        continue;
      }
      const { action } = c;
      const op = COMPACT_TO_OP[action.op];
      if (op === 'keyrevoke') {
        applyRevoke(event, c.author, action.ref);
        continue;
      }
      // A compact action from a linked key acts for its account.
      const owner = delegateOwner.get(c.author);
      const account = owner ? activeAccount(c.author, owner, op) : c.author;
      if (!account) {
        note(event, 'UNAUTHORIZED', { reason: 'key-op-not-linked' });
        continue;
      }
      if (op === 'engage') applyReact(event, account, action.ref, action.react);
      else if (op === 'repost') applyRepost(event, account, action.ref, action.undo, null);
      else if (op === 'follow' || op === 'unfollow') applyFollow(event, account, action.ref, op, c.id);
      else if (op === 'tip') applyTip(event, account, action.ref, c.outputs, null);
      else if (op === 'delete') applyDelete(event, account, action.ref);
      continue;
    }

    const classified = classifyBody(event.bodyBytes);
    if (classified.status !== 'VALID') {
      note(event, classified.status, { reason: classified.reason });
      continue;
    }
    if (seen.has(classified.statement)) {
      note(event, 'DUPLICATE', { statement: classified.statement });
      continue;
    }
    seen.add(classified.statement);
    const body = classified.body;
    const op = body.op;
    const signer = body.addr;

    if (op === 'keyrevoke') {
      applyRevoke(event, signer, body.ref);
      continue;
    }
    const account = activeAccount(signer, body.as, op);
    if (!account) {
      note(event, 'UNAUTHORIZED', { reason: 'key-not-linked' });
      continue;
    }

    switch (op) {
      case 'post':
      case 'reply':
      case 'quote': {
        state.posts.set(event.id, {
          id: event.id,
          op,
          author: account,
          signer,
          ref: body.ref ?? null,
          text: body.text,
          media: body.media ?? [],
          tip: body.tip ?? null,
          app: body.app ?? null,
          height: event.height,
          versions: [{ id: event.id, text: body.text, media: body.media ?? [], height: event.height }],
          deleted: null,
        });
        note(event, 'VALID', { op, author: account, statement: classified.statement });
        break;
      }
      case 'repost': {
        if (body.text) {
          // A repost with text is shown like a quote of its target, and can be deleted as one.
          state.posts.set(event.id, {
            id: event.id,
            op: 'repost',
            author: account,
            signer,
            ref: body.ref,
            text: body.text,
            media: [],
            tip: null,
            app: body.app ?? null,
            height: event.height,
            versions: [{ id: event.id, text: body.text, media: [], height: event.height }],
            deleted: null,
          });
        }
        applyRepost(event, account, body.ref, false, event.id);
        break;
      }
      case 'engage':
        applyReact(event, account, body.ref, body.react);
        break;
      case 'follow':
      case 'unfollow':
        applyFollow(event, account, body.ref, op, classified.statement);
        break;
      case 'edit': {
        const post = state.posts.get(body.ref);
        if (!post || post.author !== account || post.deleted || !POST_LIKE.has(post.op)) {
          note(event, 'NO_EFFECT', { reason: 'edit-target' });
          break;
        }
        post.versions.push({ id: event.id, text: body.text, media: body.media ?? [], height: event.height });
        note(event, 'VALID', { op, author: account });
        break;
      }
      case 'delete':
        applyDelete(event, account, body.ref);
        break;
      case 'tip':
        applyTip(event, account, body.ref, event.outputs, body.text);
        break;
      case 'profile': {
        const profile = { address: account, statement: classified.statement, id: event.id, height: event.height };
        for (const key of ['name', 'bio', 'avatar', 'banner', 'links', 'tip']) if (body[key] != null) profile[key] = body[key];
        state.profiles.set(account, profile);
        note(event, 'VALID', { op, author: account });
        break;
      }
      case 'keylink': {
        const current = delegateOwner.get(body.ref);
        if (current && current !== account) {
          note(event, 'NO_EFFECT', { reason: 'key-linked-elsewhere' });
          break;
        }
        state.keys.set(`${account}\0${body.ref}`, {
          account,
          key: body.ref,
          ops: [...body.ops],
          label: body.label ?? null,
          id: event.id,
          height: event.height,
          revoked: null,
        });
        delegateOwner.set(body.ref, account);
        note(event, 'VALID', { op, author: account });
        break;
      }
      default:
        note(event, 'NO_EFFECT', { reason: 'op' });
    }
  }
  return state;
}

/** Latest visible version of a post, or null when it is deleted or unknown. */
export function currentVersion(state, id) {
  const post = state.posts.get(id);
  if (!post || post.deleted) return null;
  return post.versions[post.versions.length - 1];
}
