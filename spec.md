# Ðialog

**Status:** Launch Draft. No activation height. doginals.lol reads and writes it. Dogex stores the raw `Ð:DLG` records but does not compute Ðialog state, and nothing indexes compact actions yet (see [INTEGRATION.md](INTEGRATION.md)).
**Name:** Ðialog
**Marker:** `Ð:DLG`
**Marker UTF-8:** `c3 90 3a 44 4c 47`
**Inscription JSON:** `"p": "Ð:DLG"`
**Version:** integer `1`
**Chain:** Dogecoin mainnet

Ðialog is a public social graph that lives on Dogecoin. The chain is the network. A record is valid because of bytes on chain and the author's own key, and for no other reason. Any indexer that applies this document to the same blocks computes the same posts, edits, deletes, reactions, reposts, follows, tips, profiles, and linked keys. Any site can read and write it. No site is special.

Ðialog is not Ðocial. It does not use the marker `Ð:SOC` and has no upgrade path from it. Ðocial is the retired name.

Normative language is RFC 2119. [codec.mjs](codec.mjs) is the reference checker. [vectors/](vectors/) holds the bodies, canonical strings and OP_RETURN bytes. [check.test.mjs](check.test.mjs) and [ops.test.mjs](ops.test.mjs) run them.

## 1. Rules that do not bend

1. Validity depends only on chain data and the author's signature (an inscription body signature, or the key that spends input 0 of a compact action).
2. There is no registrar, attestation, allowlist, required payee, platform fee, or treasury. The mining fee is the only cost.
3. Every indexer computes the same state from the same blocks. Wall-clock time, a site's database, and a server's opinion are not inputs.
4. Frontends are interchangeable. The optional `app` field is a hint for display. It never changes validity or state.
5. Tips go from one user to another, directly, and only when the sender chooses.

A site MAY hide a valid record in its own interface (mutes, blocks, filters). Hiding is a site choice. It does not make the record invalid anywhere else.

## 2. Marker

`Ð` is U+00D0 LATIN CAPITAL LETTER ETH. The marker is the six UTF-8 bytes `c3 90 3a 44 4c 47`: `Ð`, `:`, `D`, `L`, `G`. The same six bytes open every compact payload (§6).

ASCII `D:DLG` is not the marker. `Ð:SOC` (`c3 90 3a 53 4f 43`) is not the marker. `Ð:DIG` (`c3 90 3a 44 49 47`) is not the marker. `D://` (`44 3a 2f 2f`) is not the marker.

## 3. Two carriers

| Carrier | Ops | Authorship | Typical cost |
| --- | --- | --- | --- |
| Inscription (signed JSON body) | every op | Dogecoin signed message in `sig` | commit + reveal |
| Compact (one OP_RETURN output) | `react`, `repost`, `follow`, `unfollow`, `tip`, `delete`, `keyrevoke` | the P2PKH key that spends input 0 | one ordinary transaction |

Both carriers write the same state. A follow made by inscription and an unfollow made by OP_RETURN act on one edge. An indexer MUST read both. Every op MUST remain valid as an inscription.

## 4. Inscription bodies

The body is one JSON object. The author is the mainnet P2PKH address that `sig` recovers to, or the account named in `as` when the signer is a linked key (§7.9). The address that receives the inscription is never the author.

### 4.1 Common fields

| Field | Rule |
| --- | --- |
| `p` | MUST be `Ð:DLG` |
| `v` | MUST be the integer `1`. A larger integer is a later version (§7.11). Anything else is invalid |
| `net` | MUST be `dogecoin` |
| `op` | One of the ops in §4.2 |
| `nonce` | MUST be 16 lowercase hex characters |
| `addr` | MUST be the signer's canonical mainnet P2PKH address |
| `sig` | MUST be the canonical standard base64 of the 65-byte signature in §5 |
| `as` | MAY be a mainnet P2PKH account address when `addr` is a key that account linked (§7.9). MUST NOT equal `addr`. MUST be absent for `profile` and `keylink`. For `keyrevoke` it is allowed only when `ref` equals `addr` (a key revoking itself) |
| `app` | MAY be 1 to 32 characters of `a-z 0-9 . -`, starting with a letter or digit. Display hint only |

### 4.2 Ops and their fields

`id` below means a lowercase inscription id `{64 hex}i{n}` with `n` a decimal integer from 0 to 4294967295 and no leading zeros. `address` means a canonical mainnet P2PKH address.

| `op` | Required | Optional | Meaning |
| --- | --- | --- | --- |
| `post` | `text` | `media`, `tip` | A new post |
| `reply` | `ref` (id), `text` | `media`, `tip` | A reply to `ref` |
| `quote` | `ref` (id), `text` | `media`, `tip` | A post that quotes `ref` |
| `repost` | `ref` (id) | `text` | Repost `ref`. With `text` it is also shown as a quote |
| `engage` | `ref` (id), `react` | | Set this author's reaction on `ref`. `react` is `like`, `heart`, `fire`, `laugh`, `doge`, or `none` (clear) |
| `follow` | `ref` (address) | | Follow `ref` |
| `unfollow` | `ref` (address) | | Unfollow `ref` |
| `edit` | `ref` (id), `text` | `media` | A new version of the author's own `post`, `reply`, or `quote` |
| `delete` | `ref` (id) | | Tombstone for the author's own post, reply, quote, or repost |
| `tip` | `ref` (id) | `text` | A direct tip to the author of `ref`. The amount is in the outputs (§7.7) |
| `profile` | | `name`, `bio`, `avatar`, `banner`, `links`, `tip` | The author's whole public profile (§7.8) |
| `keylink` | `ref` (address), `ops` | `label` | Let key `ref` sign `ops` for this account (§7.9) |
| `keyrevoke` | `ref` (address) | | End a link (§7.9) |

Field rules:

| Field | Rule |
| --- | --- |
| `text` | A display string (§4.3). On `post`, `reply`, `quote`, and `edit` it is required and must contain a non-whitespace character. On `repost` and `tip` it is optional, and the same rule applies when it is present |
| `media` | 1 to 4 distinct inscription ids. The media are existing inscriptions; Ðialog does not carry file bytes |
| `tip` | An address. On `post`, `reply`, and `quote` it is where tips to that post go. On `profile` it is the author's default tip address |
| `name` | 1 to 50 UTF-16 code units, a display string, with no leading or trailing whitespace |
| `bio` | 0 to 500 UTF-16 code units, a display string. Spaces alone are rejected |
| `avatar`, `banner` | An inscription id. The image is that inscription |
| `links` | 1 to 4 distinct strings, each 9 to 200 code units, starting `https://`, with no whitespace or control characters |
| `ops` | 1 or more distinct names from `post`, `reply`, `quote`, `repost`, `engage`, `follow`, `unfollow`, `edit`, `delete`, `tip` |
| `label` | 1 to 32 UTF-16 code units, a display string, with no leading or trailing whitespace |

A field not listed for the op MUST be rejected. Duplicate keys MUST be rejected (§7.1). The canonical JSON of the object with `sig` removed MUST be at most 4096 bytes. That is this protocol's content cap, not a consensus or relay rule.

### 4.3 Body bytes and display strings

The inscription content type MUST be `application/json`. A `charset=utf-8` parameter is allowed. Any other type is not a Ðialog body.

The body is those content bytes and nothing else. An indexer MUST NOT append later pushes from the same reveal script. A D:// reader has to glue extra pushes back into one JSON value because that builder splits a record across them. That join is not Ðialog. When a body continues across reveals, it does so only as a Doginals content chain: each later reveal spends output 0 of the previous one, and the bytes concatenate in that order. The inscription id is the first reveal.

The bytes MUST be UTF-8 with no byte-order mark. Invalid UTF-8 is INVALID. A decoder that strips a BOM and then accepts the rest is wrong.

A display string (`text`, `name`, `bio`, `label`) MUST already be Unicode NFC. It MUST NOT contain a noncharacter, a lone surrogate, a bidirectional control (U+061C, U+200E, U+200F, U+202A through U+202E, U+2066 through U+2069), or one of U+00AD, U+034F, U+180E, U+200B, U+2060, U+FEFF, U+FFF9 through U+FFFB. `text` and `bio` MAY contain U+0009 and U+000A. Every other C0 or C1 control is rejected. Emoji joiners (U+200D) and variation selectors stay allowed. Signers normalize to NFC before signing. Two indexers then show the same name, and a name cannot paint itself over someone else's.

## 5. Signature

The signed message is the prefix `Ðialog:v1:` (first character U+00D0) immediately followed by the canonical JSON of the object with `sig` removed.

Canonical JSON, for the types allowed here:

- objects: keys sorted by UTF-16 code unit, no whitespace
- arrays: source order
- strings: JSON string escaping
- integers: decimal, no sign, no leading zero, no exponent
- no floats, no booleans, no nulls

The signature is a Dogecoin signed message:

1. Let `M` be the signed message as UTF-8.
2. Hash `SHA256d( 0x19 || "Dogecoin Signed Message:\n" || compact-size(|M|) || M )`.
3. `sig` is 65 bytes: `header || r (32) || s (32)`. Its text MUST be canonical standard base64: alphabet `A–Z a–z 0–9 + /`, length a multiple of 4, padding `=` only, and decoding then re-encoding MUST reproduce the text. URL-safe alphabet, missing padding, and whitespace are invalid. They are not a second post.
4. `header` is 27 through 34. Recovery id is `(header - 27) & 3`. The public key is compressed if and only if `(header - 27) & 4` is set. The other encoding of the same point MUST NOT be accepted.
5. `s` MUST be low: `s <= n/2` for secp256k1 order `n`.
6. Every address field MUST be canonical base58check: 25 bytes, version `0x1e`, and the last 4 bytes equal the first 4 bytes of SHA256d of the first 21.

Every field except `sig` is inside the signed string. Changing any of them after signing makes the signature fail.

Why a body signature: the Doginals reveal used for DNS names and by `inscribe` in public `apezord/doginals` puts the body in `scriptSig` pushes that the reveal's `SIGHASH_ALL` signature does not commit to, and the key in its redeem script is usually a one-time key. A signature over the body is what binds the text to a stable address, including when someone else pays for or broadcasts the inscription.

## 6. Compact carrier (OP_RETURN)

### 6.1 Relay limit

Dogecoin Core 1.14.9 (current release, December 2024) relays a null-data output whose script is at most `MAX_OP_RETURN_RELAY = 83` bytes (`src/script/standard.h`: "+1 for OP_RETURN, +2 for the pushdata opcodes", enforced as `nMaxDatacarrierBytes` in `src/policy/policy.cpp`), and at most one null-data output per transaction (`multi-op-return`). Every compact script below is at most 46 bytes.

### 6.2 Script

```
6a  <L>  <payload: L bytes>        L = 27, 43, or 44 (a direct push, 1 ≤ L ≤ 75)
```

The script MUST be exactly `OP_RETURN`, one minimal direct push, and nothing else. `OP_PUSHDATA1` forms, extra pushes, and trailing bytes are not Ðialog. The transaction MUST have exactly one OP_RETURN output.

### 6.3 Payload

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 6 | magic `c3 90 3a 44 4c 47` (`Ð:DLG`) |
| 6 | 1 | `version << 4 | op`. Version is `1` |
| 7 | … | op body |

| op | code | body | payload bytes |
| --- | --- | --- | --- |
| `react` | 1 | target (36) · reaction (1) | 44 |
| `repost` | 2 | target (36) · flag (1): `1` repost, `0` undo | 44 |
| `follow` | 3 | key hash (20) | 27 |
| `unfollow` | 4 | key hash (20) | 27 |
| `tip` | 5 | target (36) | 43 |
| `delete` | 6 | target (36) | 43 |
| `keyrevoke` | 7 | key hash (20) | 27 |

- target: the 32 bytes of the inscription id's txid in the order they are written in the id (hex-decoded, not reversed), then the id's index as a 4-byte little-endian integer. The full id is carried, so no prefix search is needed.
- key hash: the 20-byte HASH160 of a mainnet P2PKH address (version `0x1e` implied).
- reaction: `0` none (clear), `1` like, `2` heart, `3` fire, `4` laugh, `5` doge.

A payload whose length is wrong for its op, whose op code is unknown, or whose reaction or flag byte is out of range is invalid. Version `0` is invalid. A version above `1` is a later version (§7.11).

Example (`follow` of `D5kTEGxmas71USKAcAaJptKjq8NJc6EK8C`), 29 script bytes:

```
6a 1b c3903a444c47 13 06afd46bcdfd22ef94ac122aa11f241244a37ecc
```

All nine ops are in [vectors/compact.json](vectors/compact.json).

### 6.4 Authorship

The author of a compact action is the mainnet P2PKH address whose key spends **input 0**. Input 0 MUST spend a P2PKH output; its `scriptSig` MUST be exactly `<DER signature + hashtype> <public key>`, the public key MUST hash to that output's key hash, and the hashtype byte MUST be `SIGHASH_ALL` (`0x01`). Consensus has already checked that signature, and `SIGHASH_ALL` commits it to every output, including the OP_RETURN. An indexer MUST look up input 0's previous output to confirm it is P2PKH. Other inputs do not change the author. If input 0 belongs to a key another account linked (§7.9), the action counts for that account only when its op (`react` counts as `engage`) is in the link's `ops`; otherwise it has no effect.

Tradeoff. A compact signature over the payload would let anyone relay an action for someone else, but a 65-byte signature plus a 36-byte target does not fit in one standard push next to the magic. Using the spending key costs zero payload bytes and needs no new cryptography, but: the author has to fund the transaction from their own P2PKH address; P2SH, multisig, and non-`SIGHASH_ALL` spends cannot author compact actions; and a Doginals reveal (whose input 0 is P2SH) cannot carry one. Anyone who needs those cases uses the inscription carrier, which every op supports.

A compact action's id is `{txid}:{vout}`. It cannot be the target of `delete`. Undo a compact repost with `repost` flag `0`, a reaction with reaction `0`, and a follow with `unfollow`.

## 7. State

### 7.1 Statements and duplicates

An inscription's statement id is the author address, the 65 signature bytes, and the hash of the signed message. The first confirmed occurrence in chain order is the statement. A later inscription with the same statement id is a duplicate and has no effect.

Duplicate keys in the raw JSON make the body invalid. Member names are the same key when JSON string decoding yields the same UTF-16 code units: `\u006fp` and `op` are one key, so are `\/` and `/`. Each object has its own names. Parsers that keep one of two values MUST NOT accept the body.

### 7.2 Order and reorgs

Chain order is `(block height, transaction index, sub)` compared numerically, where `sub` is the inscription's input index, and a compact action sorts after every inscription in its transaction. Wall-clock time and `nonce` never break ties.

A reorg drops every record at or above the replaced height. The replacement blocks are applied in order and the state is recomputed. Indexers SHOULD wait for confirmations before showing a record as final; the depth is a display choice, not a validity rule.

### 7.3 Posts, edits, and deletes

- `post`, `reply`, and `quote` create a post whose id is the inscription id.
- `edit` adds a version to `ref` when `ref` is a `post`, `reply`, or `quote` whose author is the edit's author, and `ref` is not deleted. Otherwise it has no effect. Clients show the latest version in chain order. Every version stays on chain and indexers SHOULD expose the history. An edit cannot target an edit.
- `delete` marks `ref` deleted when the author of `ref` is the delete's author. Deletion is permanent. A later edit has no effect. Reactions, reposts and tips remain recorded but compliant clients hide the post and all its versions.
- Honest limit: a delete is a tombstone, not erasure. The bytes stay on every full node forever. Only indexers and apps that follow this document hide them.

### 7.4 Reactions

One reaction per (author, target): the latest `engage` or compact `react` in chain order wins. `none` / `0` clears it. The target can be any inscription id, not only a Ðialog post: a collectible, a token deploy, or any other Doginal. Replies and quotes may also reference any inscription.

### 7.5 Reposts

One repost per (author, target): the latest of `repost` (inscription), compact `repost` flag `1`, compact flag `0`, or a `delete` of the author's repost inscription wins. Like reactions, the target can be any inscription.

### 7.6 Follows

For each (author, followee) the latest `follow` or `unfollow` in chain order, from either carrier, is the edge. A duplicate statement does not move it. Unfollow is on chain. A follow or unfollow whose author and followee are the same account has no effect.

### 7.7 Tips

A tip is `tip` (inscription) or compact `tip` naming a post. The recipient is the post's `tip` field, else the post author's current `profile.tip`, else the post author's address, resolved at the tip's chain position. A tip to an inscription that is not a Ðialog post has no recipient in Ðialog state and has no effect; send a plain payment instead. The amount is the sum of the transaction's P2PKH outputs to the recipient. There is no minimum, no split, and no protocol payee. A tip whose recipient is the sender, or whose amount is zero, has no effect.

### 7.8 Profiles

`profile` replaces the author's whole profile. The latest valid `profile` in chain order wins. A field that is absent is empty; there is no merge. An empty `profile` clears the profile. Only the account key may publish one.

### 7.9 Linked keys

- `keylink` lets key `ref` sign the listed `ops` for this account, from the link's chain position on. The signer's body names the account in `as`. A compact action from the key acts for the account (§6.4).
- A key serves one account at a time. A `keylink` naming a key that another account currently links has no effect. An account cannot link itself.
- `keyrevoke` ends a link from its chain position on. The account may revoke any of its keys; a key may revoke itself (`addr` = `ref`, `as` = account). Revocation is not retroactive: records the key made while linked stay valid.
- Rotate a key by linking the new key, then revoking the old one. Ordering between the two is chain order.
- A record from a key that is not linked for that op at its chain position is valid as a signature but has no effect.
- Only the account key publishes `profile`, `keylink`, and its own `keyrevoke`. The account key itself cannot be rotated: a lost or leaked account key is the end of that account. Use a fresh address and say so from the old one while you still can.

### 7.10 Missing and bad bytes

If the inscription body has not been fetched, or the body has no `sig` or `sig` is empty, the record is **UNAVAILABLE**. If the body is present and any rule in §4 or §5 fails, it is **INVALID**. Invalid records are invalid for every site.

### 7.11 Unknown fields and later versions

Unknown fields in a version 1 body make it invalid. A body whose `v` is an integer above 1, or a compact payload whose version nibble is above 1, is **UNSUPPORTED**: a version 1 indexer skips it, does not count it, and does not call it invalid. A later version MUST keep the marker and MUST NOT change the meaning of version 1 records.

## 8. What goes on chain, and what does not

On chain: identity (address and linked keys), profile (`name`, `bio`, `avatar`, `banner`, `links`, `tip`), posts, replies, quotes, reposts, reactions, follows, tips, edits, and deletes. Other apps need these to agree.

Not on chain: theme, language, feed defaults, mutes, blocks, muted words, notification choices, compose defaults, one-tap spending limits, and similar preferences. Those belong to each app. [INTEGRATION.md](INTEGRATION.md) lists them.

## 9. Pay-to-reveal is not in this protocol

A trustless pay-to-reveal would need the payment to force the release of a decryption key. Dogecoin script can do a hash-locked payment (`OP_SHA256 <H> OP_EQUALVERIFY <seller> OP_CHECKSIG`, with a `OP_CHECKLOCKTIMEVERIFY` refund): the seller claims the coins only by publishing the preimage. But that preimage is then public on chain, so the first buyer unlocks the post for everyone, and nothing on chain proves the preimage decrypts anything worth having. A per-buyer unlock needs someone to hand each buyer a key off chain, which is a trusted party. So Ðialog has no reveal op. An author who wants to sell content can post a teaser and take tips.

## 10. Ðialog and D://

D:// is DogeFeed's protocol (launched November 8, 2026). Facts from its launch post and from `thedoginalsexplorer/dogefeed-indexer`:

| | D:// | Ðialog |
| --- | --- | --- |
| Marker | `"p":"D://"` (a `map.app` other than `dogefeed` is not D://) | `"p":"Ð:DLG"` |
| Who can write a valid record | Records need DogeFeed's registrar signature (`att`, key `dfreg1`) | Anyone with a key |
| Required payment | At least 0.1 DOGE to DogeFeed per record; comments and quotes also pay the parent author 0.01 DOGE; tips and reveals split 90/10 | None. Mining fee only |
| Author signature | `"D://:v1:" + JCS`, Dogecoin signed message | `"Ðialog:v1:" + canonical JSON`, Dogecoin signed message |
| Compact actions | 83-byte script `6a 4c 50 "D://" …`, with a registrar signature inside; post targets are a 10-byte txid prefix plus index | ≤46-byte script `6a <L> "Ð:DLG" …`; full target; author is the input 0 key |
| Unfollow | Off chain | On chain |
| Edit, delete | Yes (original author only) | Yes (original author only) |
| Linked keys | `keylink` with spending caps; `keyrevoke` | `keylink` with op list; `keyrevoke`; caps stay in the client |
| Profile on chain | No (profiles live on DogeFeed's servers) | Yes, `profile`, NFC, no bidi controls |
| Inscription body | JSON may be split across reveal pushes and joined by the reader | The inscription content only. Extra pushes are not part of it. UTF-8, no BOM |
| Pay-to-reveal | Yes, through DogeFeed | No (§9) |

The two do not collide: different JSON markers, different OP_RETURN magic, and different push forms. An indexer MAY show a D:// record that passes D://'s own checks, labeled as D://. It MUST NOT store it as `Ð:DLG`. A site MUST NOT emit both protocols for one user action.

## 11. Standing is not consensus

Social standing (poster numbers, streaks, ranks) is a reading of the state in §7, never an input to it. [STANDING.md](STANDING.md) defines a suggested, deterministic `standing/1` that any reader can compute. It adds no op, no token and no payment, and no record is valid or invalid because of it.

## 12. Out of scope

Encrypted messages (use Ðignal, `Ð:DIG`), tokens, names, and any author script other than P2PKH.
