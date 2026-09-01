# WALLET.md — shipping Ðocial

Normative rules live in [spec.md](spec.md). This file is the implementer path: encode, sign, broadcast, display.

**Canonical repo:** [github.com/jonheaven/docial-spec](https://github.com/jonheaven/docial-spec)  
**Reference encoder:** [jonheaven/dojak](https://github.com/jonheaven/dojak) `@dojak/core` `encodeDsocialSignal` / `buildDsocialPostJson`.

## 1. Posts (content inscription)

Build JSON (`examples/post-valid.json`):

```json
{
  "p": "Ð:SOC",
  "v": "1.1",
  "op": "post",
  "chain": "dogecoin",
  "content": "Much social. Very L1.",
  "pay_to": "<author P2PKH>"
}
```

Inscribe it with the **Dogecoin P2SH commit → reveal** pattern (not Bitcoin tapscript in `scriptSig`). Broadcast **commit then reveal** through command.dog → Core (`POST /v1/tx/broadcast`). Do not treat a public-relay `/push` ack as success.

Reply / quote / repost: same `p`/`v`, required `parent` / `quote` / `repost_of` ([spec.md §5.2](spec.md)).

Label the UI: **public forever**.

## 2. Engage (Like / react / tip)

One OP_RETURN, 30 bytes ([spec.md §4.1](spec.md)):

| Offset | Size | Field |
| ---: | ---: | --- |
| 0 | 6 | UTF-8 `Ð:SOC` |
| 6 | 1 | version `0x01` |
| 7 | 1 | kind `0x02` engage |
| 8 | 1 | flags |
| 9 | 1 | reaction (`0x01` like) |
| 10 | 16 | `SHA256(target_id)[0..16)` |
| 26 | 4 | nonce uint32 LE |

`target_id` for engage is the post inscription id `{64 hex}i{n}` **lowercase**.

**Product Like:** flags bit 0 (sound) + reaction `like` + a **spendable DOGE output** to the post `pay_to` of at least `max(1_000_000, min_like_koinu)` koinu (default **0.01 DOGE**). Show the tip amount before sign.

Free react: same signal, no (or below-min) output to `pay_to`. Still a valid engage; `tipped = false`.

Copy-paste: [reference/dsocial.mjs](reference/dsocial.mjs). Vectors: [vectors/op-return-vectors.json](vectors/op-return-vectors.json).

## 3. Follow

Kind `0x03` follow / `0x04` unfollow. `reaction = 0`. `target_hash16` = first 16 bytes of SHA256(followee address string). No value transfer.

## 4. Resolve before Like

1. Fetch the post (dogex `GET /api/social/post/:id` or inscription body).
2. `pay_to` on the JSON if valid; else first owner at reveal.
3. If unresolved, you **cannot** mark tipped. Do not invent an amount field.

## 5. Broadcast

Studio default: command.dog `POST /v1/tx/broadcast` → local Core. Fail loud on 502. Do not fall back to BlockCypher / Tatum / Blockchair as “success.”

## 6. Display

- Feed from dogex, not from a private like DB.
- Show `engage_count`, `tipped_engage_count`, `tip_total_koinu` from the indexer.
- `tweetVerified`-style claims do not apply here. Tips are UTXOs — show amounts from chain.
- Whisper / DM → Ðignal, not a Ðocial op.

## 7. MUST NOT

See [AGENTS.md](AGENTS.md). Short version: one protocol, one emission per click, tip in the UTXO, P2SH inscriptions, no Pulse/Echo dual-write.
