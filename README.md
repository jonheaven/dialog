# Ðocial — public Social OS for Dogecoin

**This repository is the canonical public specification for Ðocial (`Ð:SOC`).**

Ðocial is one public social protocol: posts and threads as inscriptions, **engage** as a single OP_RETURN verb (react + optional DOGE tip to the creator), and follows on L1. Private chat is **not** this protocol — that is Ðignal (`Ð:DIG`).

| | |
| ---: | --- |
| **Wire** | OP_RETURN magic UTF-8 `Ð:SOC` (30-byte binary) |
| **JSON** | inscription `"p": "Ð:SOC"` · `"v": "1.1"` |
| **Status** | v1.1 consolidated launch draft |
| **Chain** | Dogecoin |
| **License** | [MIT](LICENSE) |
| **Source of truth** | **[spec.md](spec.md)** |

Tip amount is **never** in the OP_RETURN. The signal names the target; spendable outputs to `pay_to` are the money.

## Authors

Jon Heaven — GitHub [@jonheaven](https://github.com/jonheaven) · X [@jontype](https://x.com/jontype)

If you ship this in a wallet, indexer, or feed, you are implementing **this** protocol. Keep `Ð:SOC` bytes and `"p": "Ð:SOC"` identical so every indexer sees one graph.

## Start here (pick your job)

| You are… | Read this |
| --- | --- |
| **Human, 2 minutes** | this README |
| **Wallet / dApp engineer** | **[WALLET.md](WALLET.md)** — post, engage, follow, tip UTXO |
| **AI coding agent** | **[AGENTS.md](AGENTS.md)** — do / don’t, files, live checks |
| **Protocol implementer** | **[spec.md](spec.md)** — normative rules |
| **Need bytes today** | **[reference/dsocial.mjs](reference/dsocial.mjs)** + **[vectors/op-return-vectors.json](vectors/op-return-vectors.json)** |

North star (mental model, not extra MUST rules): [SOCIAL_LAYER.md](SOCIAL_LAYER.md). Indexer / product sketch: [INTEGRATION.md](INTEGRATION.md).

## How it works

```text
1. Author inscribes JSON p:"Ð:SOC" op:post (content + pay_to).
2. Reader likes: same tx has OP_RETURN Ð:SOC engage + DOGE output ≥ min to pay_to.
3. Indexer stores the post, sums tip from UTXOs (never from the signal), counts engage.
4. Follow is a 30-byte signal; last follow/unfollow wins per pair.
```

### Compact engage (SOC-OR-001)

```text
payload:       c3903a534f430102010100112233445566778899aabbccddeeff01000000
scriptPubKey:  6a1ec3903a534f430102010100112233445566778899aabbccddeeff01000000
```

`6a` = `OP_RETURN`. `1e` = 30-byte push. Round-trip with:

```text
node reference/dsocial.mjs parse c3903a534f430102010100112233445566778899aabbccddeeff01000000
```

## Public APIs (chain truth)

```text
GET https://dogex.command.dog/api/social/feed
GET https://dogex.command.dog/api/social/post/:id
GET https://dogex.command.dog/api/social/post/:id/engages
GET https://dogex.command.dog/api/social/user/:address/posts
GET https://dogex.command.dog/api/social/user/:address/timeline
GET https://dogex.command.dog/api/social/user/:address/following
GET https://dogex.command.dog/api/social/user/:address/followers
```

Routes may still be landing; treat empty as “not indexed yet,” not a second protocol. Generic fallback: `GET /api/doginals/protocol/Ð:SOC`.

Product UI: [dogenals.com](https://dogenals.com) feed. Media posts: [doge.cam](https://doge.cam). Notifications only: command.dog — **not** a like ledger.

## Copy-paste encode (Node, no deps)

```js
import { encodeDsocialSignal, scriptPubKey } from './reference/dsocial.mjs';

const payload = encodeDsocialSignal({
  kind: 'engage',
  flags: 0x01,
  reaction: 'like',
  targetHash16: '00112233445566778899aabbccddeeff',
  nonce: 1,
});
// 30 bytes — put this in OP_RETURN, plus a DOGE output to the post pay_to
```

Full wallet steps: [WALLET.md](WALLET.md). Production encoder: [`@dojak/core` `dsocial.ts`](https://github.com/jonheaven/dojak).

## What you must not do

- Do **not** put tip amount in the 30-byte signal. Amount is UTXO to `pay_to`.
- Do **not** dual-emit `Ð:P` / ÐEcho / Doge Signals for the same click.
- Do **not** treat encrypted DMs as Ðocial. That is Ðignal.
- Do **not** invent a second “like” inscription op. Engage is the signal.
- Do **not** use Bitcoin tapscript `OP_FALSE OP_IF … OP_ENDIF` in Dogecoin `scriptSig`. Posts use P2SH commit → reveal.

## Repo layout

```text
spec.md                      normative protocol
SOCIAL_LAYER.md              north star (public vs Ðignal)
WALLET.md                    wallets / dApps
AGENTS.md                    briefing for coding agents
INTEGRATION.md               dogex / command.dog / product sketch
COMPARISON.md                vs Pulse / Echo / Nostr
reference/dsocial.mjs        encode + parse (MIT, zero deps)
vectors/op-return-vectors.json  SOC-OR hex vectors
vectors/conformance.json     JSON schema vectors
schemas/                     post / signal / engage JSON Schema
examples/                    valid JSON bodies
```

## Status

Launch draft **v1.1**. The 30-byte layout and UTXO tip rule here are what wallets and dogex should implement. No dual-stack “free likes first.”
