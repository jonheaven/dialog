# Ðialog: one graph, many sites

**Status:** Launch Draft
**Rules:** [spec.md](spec.md)

Any site, bot, or indexer can read and write Ðialog. None is special. This page says how, and what belongs to the protocol versus a site.

## Publish

1. Build the body with [codec.mjs](codec.mjs) `buildBody(op, fields, addr, randomNonce())`.
2. Have the author's wallet sign `signedMessage(body)` as a standard Dogecoin signed message, and set `sig`. Keys stay in the wallet. A server never needs one.
3. Check the result with `classifyBody(json)` before spending anything. It must be `VALID`.
4. Inscribe the JSON (`application/json`). Who inscribes, and which output receives the inscription, does not matter. Authorship is the signature.
5. A `tip` inscription pays the recipient in the same transaction that reveals the inscription. Nothing else is paid. The mining fee is the only cost; a site MUST NOT add a fee or payee to a Ðialog action.
6. Small actions (react, repost, follow, unfollow, tip, delete, keyrevoke) MAY use the compact carrier instead: one transaction whose only OP_RETURN is `compactScript(encodeCompact(action))`, and whose input 0 spends a P2PKH output of the author's key ([spec.md](spec.md) §6).

Do not also emit `Ð:SOC` or D:// for the same user action.

### One-click posting (what doginals.lol does)

A user should never leave the site to post. The reference flow needs only a wallet that can sign its own P2PKH coins (a PSBT or a raw tx), and no server key:

1. The site builds a funding transaction: the user's coins pay a P2SH output locked to `<one-time pubkey> OP_CHECKSIGVERIFY OP_DROP×n OP_1`, plus change back to the user. The wallet signs it (SIGHASH_ALL). The site checks that the signed transaction has the same inputs and outputs and valid signatures before anything goes out.
2. The site signs the reveal with the one-time key it made for this post. The reveal carries the doginals.js envelope (`ord`, part count, `application/json`, countdown/data pairs) and pays 0.001 DOGE back to the author (plus the tip for `tip`). The key never leaves the browser and is wiped after signing.
3. A relay passes the signed transactions to Dogecoin Core in order and returns the txids. It holds no key and adds no output, fee or payee.

A body that does not fit one reveal script (1458 bytes for `application/json`) continues in further reveals, each spending vout 0 of the one before, exactly as doginals.js chains them. The inscription id is the first reveal's txid with `i0`; the inscription ends on the last reveal's output 0. Readers MUST stitch the chain before reading the body. Dogecoin Core relays at most 25 unconfirmed transactions in a chain, so one broadcast is the funding transaction plus at most 24 reveals; Ðialog's own 4096-byte cap (§4.2) needs three. A `tip` stays in one reveal, because readers check the reveal named by the inscription id for the payment.

doginals.lol only sends multi-reveal bodies when its indexer reports `GET /api/doginals/capabilities` → `doginals_js_chain.multi_tx_bodies` and `protocols_on_completion` both `true`. Otherwise it keeps one reveal and splits longer text into a thread: part 1 is the post, each later part replies to the one before, and each carries an ` (i/n)` suffix.

Reference: `web-com/src/lib/dialog/tx.mjs` (builder) and `web-com/api/_dialog-relay.js` (relay) in this repository.

## Read

1. Collect every inscription whose JSON `p` is `Ð:DLG`, with its block height and its position in the block, and fetch the raw body bytes. Re-encoding the JSON loses duplicate keys, so check the bytes.
2. For `tip` inscriptions, also fetch the reveal transaction's outputs.
3. For compact actions, scan OP_RETURN outputs for the `c3 90 3a 44 4c 47` magic and run `classifyCompactTx` with input 0's scriptSig and, when available, its prevout script.
4. Sort everything into chain order and run `reduceState(events)`. Statuses: `VALID`, `INVALID`, `UNAVAILABLE` (bytes not in hand), `UNSUPPORTED` (later version), `DUPLICATE`, `NO_EFFECT`, `UNAUTHORIZED`.
5. On a reorg, drop records at or above the replaced height (`rollback`) and reduce again.

### Dogex today

Dogex has no Ðialog indexer. Its generic protocol index stores any JSON inscription with a `p` marker it has no dedicated handler for, which includes `Ð:DLG`:

- `GET /api/doginals/protocol/%C3%90%3ADLG?offset=0&limit=500` returns `{marker, records:[{inscription_id, p, op, block_height, sequence_number, payload}], total}`. Pages hold at most 500.
- Records come back in key order (by inscription id), not chain order. Sort by `(block_height, sequence_number)` yourself.
- `payload` is re-encoded JSON. Fetch raw bytes from `GET /cdn/content/{inscription_id}` before checking.
- `GET /api/tx/{txid}/raw` returns `{hex}` for tip outputs.
- A body spread over several reveals is stitched, and its protocol record is written in the block where the last chunk lands (`block_height` is that block). Builds that report `/api/doginals/capabilities` do this; older builds stored the head only and never wrote a record for it.
- Dogex does not check signatures, compute state, or index compact OP_RETURN actions. Until something does, compact actions are valid on chain but no public reader shows them.

doginals.lol reads exactly this and runs the codec in the browser.

## Protocol or app

The protocol carries only what two sites must agree on. Everything else is a site's own choice and MUST NOT be written to the chain as Ðialog.

| Setting | Where | Why |
| --- | --- | --- |
| Display name, bio, avatar, banner, links, tip address | Protocol: `profile` (author-signed, latest wins, whole replace) | Every reader must show the same identity |
| Linked keys and their allowed ops | Protocol: `keylink`, `keyrevoke` | Every reader must agree which signatures count |
| Posts, replies, quotes, reposts, reactions, follows, unfollows, tips, edits, deletes | Protocol | The graph itself |
| Handle | Neither: use a ÐNS name the address owns, or another naming protocol | Naming is its own protocol, not Ðialog |
| Theme, language, autoplay or inline media | App | Display only |
| Default feed tab, ranking (top, hot), show replies in feed | App | Ranking is a site's opinion |
| Standing (poster number, streaks, rank) | Neither: a reading of state ([STANDING.md](STANDING.md)) | Any reader can recompute it; nothing is written for it |
| Muted accounts, blocked accounts, muted words | App | On an open chain nobody can stop a post; a site decides what it shows its user |
| Notification kinds, last-seen marker | App | Computed from public state per viewer |
| Compose defaults (carrier, `app` hint, default tip amount) | App | The `app` field is a hint and changes nothing |
| Spending limits, one-tap approval | Wallet | A key holder's own policy |
| Paid follows, paid messages, paywalls, revenue splits | Not supported | They need a fee collector; tips cover paying people |

A site MAY store app settings in local storage or in its own account system. It MUST NOT treat another site's app settings as protocol state.

## Draft status

There is no activation height. Bodies inscribed now follow version 1 and stay valid under it; a later version keeps the marker and does not change version 1 meaning ([spec.md](spec.md) §7.11).
