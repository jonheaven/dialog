# AGENTS.md — implementing Ðocial in a wallet or dApp

You are adding **Ðocial** (wire `Ð:SOC`, inscriptions `"p": "Ð:SOC"`) to someone else’s product. Do not redesign it. Do not revive ÐPulse / ÐEcho as a second feed.

**Canonical spec:** this repository.  
**Maintainer:** Jon Heaven ([github.com/jonheaven](https://github.com/jonheaven), [x.com/jontype](https://x.com/jontype)).  
**Wallet reference:** [jonheaven/dojak](https://github.com/jonheaven/dojak) `@dojak/core` `modules/dogenals/dsocial.ts`.

## Read order (do not skip)

1. [README.md](README.md) — what it is, hex example, APIs
2. [WALLET.md](WALLET.md) — post inscription, engage + tip output, follow
3. [spec.md](spec.md) — normative (30-byte layout, kinds, pay_to)
4. [reference/dsocial.mjs](reference/dsocial.mjs) — copy or port this; do not invent a second layout
5. [vectors/op-return-vectors.json](vectors/op-return-vectors.json) — round-trip these hex strings before you ship

JSON under `schemas/` is for content inscriptions and decoded API shapes. Product engage path is compact OP_RETURN **plus** a real DOGE output.

## What “done” means

A wallet or dApp is compliant when:

1. **Post / reply / quote / repost** inscribes `"p":"Ð:SOC"` `"v":"1.1"` per [spec.md §5](spec.md).
2. **Engage** builds the 30-byte `Ð:SOC` payload from [spec.md §4](spec.md) and [reference/dsocial.mjs](reference/dsocial.mjs). `kind=engage` **MUST** set a non-zero reaction.
3. **Like** (product default) is engage `reaction=like` **and** a spendable DOGE output to the post `pay_to` ≥ `max(1_000_000, min_like_koinu)` koinu (0.01 DOGE default).
4. Tip amount is **never** encoded in OP_RETURN. Indexers sum outputs.
5. **Follow / unfollow** is a 30-byte signal (target = followee address hash16). No value required.
6. One user action → **at most one** Ðocial emission. No dual-write of `Ð:P` or ÐEcho.

## MUST NOT

- Do not use Bitcoin tapscript `OP_FALSE OP_IF … OP_ENDIF` in Dogecoin `scriptSig`.
- Do not ship a one-tx P2PKH “inscription” as the post. Dogecoin inscriptions are **P2SH commit → reveal**.
- Do not put `amount_koinu` or a content hash in the 30-byte v1.1 signal (removed from v1.0).
- Do not treat command.dog sockets as the like ledger. Chain (dogex) is truth.
- Do not encrypt public posts. Private bodies are Ðignal, not Ðocial.
- Do not invent a `like` content `op`. Engage is the signal.

## Live checks (use these, don’t stub)

```text
GET https://dogex.command.dog/api/social/feed
GET https://dogex.command.dog/api/social/post/<inscriptionId>
```

Local encode check:

```text
node reference/dsocial.mjs parse c3903a534f430102010100112233445566778899aabbccddeeff01000000
node reference/dsocial.mjs encode engage like 00112233445566778899aabbccddeeff 1 1
```

Expected payload hex: `c3903a534f430102010100112233445566778899aabbccddeeff01000000`.

## Chain vs product

| Layer | Job | You should |
| --- | --- | --- |
| This spec | Bytes + state machine | Implement exactly |
| `dogex.command.dog` `/api/social/*` | Chain truth | Read for feed / post / graph |
| `api.command.dog` | Product notify | Optional sockets; never a second like count |
| [dogenals.com](https://dogenals.com) | Reference feed UX | Copy the Like = tipped engage rule |

Ambiguity is a **spec issue**. Do not invent a private dialect. Open an issue on [jonheaven/dsocial-spec](https://github.com/jonheaven/dsocial-spec).
