# Dogecoin Social Layer — North Star

**Status:** Canonical greenfield design (Era 2)  
**Motto:** *Few rules. Hard money for attention. Keys over platforms.*  
**Normative public protocol:** [Ðocial](spec.md) (`Ð:SOC`) — this repo  
**Normative private protocol:** Ðignal (`Ð:DIG`) — separate spec; not this repo

This document is the **single mental model** for social on Dogecoin under Dogenals.  
If a marketing name, old draft, or folder conflicts with this file, **this file + the linked `spec.md` win**.

---

## 1. Why this exists

Dogecoin already has inscriptions. What it lacked was a **simple, public, self-custodial social standard** the whole ecosystem can index the same way:

- Posts anyone can read
- Engagement that can **pay creators** without a platform middleman
- Follows that live on L1
- Private messages that never pretend to be the public feed

dogenals.com, doge.cam, wallets, and dogex should all speak **one** public social language.

---

## 2. The whole map (only three jobs)

```text
┌─────────────────────────────────────────────────────────┐
│  PUBLIC SOCIAL OS          Ðocial   Ð:SOC               │
│  posts · threads · follows · engage (react / tip)       │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  PRIVATE MESSAGING         Ðignal   Ð:DIG               │
│  DMs · rooms · whisper on a public post                 │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  IDENTITY (optional)       ÐMS · Ð𝕏 · ÐPFP / ÐPFA       │
│  profile metadata · anti-grift handle · avatar / audio  │
│  (separate protocols — any app may resolve without feed)│
└─────────────────────────────────────────────────────────┘
```

That is the full social surface for launch. Everything else is either:

- **absorbed** into Ðocial (see §4), or  
- **not social** (marketplace ÐMP, tokens, lotto, …).

**ÐPFP / ÐPFA stay outside Ðocial.** dogex `GET /api/profile/:address` is the eco resolver.

---

## 3. Satoshi-style rules (non-negotiable)

1. **Chain is truth.** dogex materializes; command.dog notifies; the website displays. None of them invent likes.
2. **One public protocol.** New public social txs use `Ð:SOC` only.
3. **One engage verb.** Free react and paid tip are the **same op** with different economics (UTXO tip optional).
4. **Tip amount lives in the UTXO**, not in the OP_RETURN. The signal names the target; the money speaks for itself.
5. **One emission per user action.** No dual-writing `Ð:P` + `Ð:SOC` + ÐEcho for the same click.
6. **Keys over accounts.** No protocol admin, no global mute key, no centralized follow server as authority.
7. **Private stays private.** Encrypted bodies are Ðignal. Ðocial content is public forever — say so in the wallet.
8. **Simple enough for a weekend wallet.** If a rule needs a committee, delete it.

---

## 4. Consolidation (what happened to the museum)

Greenfield decision: stop shipping five parallel “social” products.

| Old name | Status for **new** deployments | Where it lives now |
| --- | --- | --- |
| **Ðocial** | **Canonical** public social OS | this repo ([spec.md](spec.md)) |
| **Ðignal** | **Canonical** private messaging | separate protocol (`Ð:DIG`) |
| **Doge Signals** (umbrella) | **Superseded as product surface** | Points here + Ðocial engage |
| **ÐPulse** (`Ð:P`) | **Legacy** free reactions | Indexers MAY map → Ðocial `engage`; wallets MUST emit `Ð:SOC` |
| **ÐEcho** | **Legacy** amplify-only | New reshares → Ðocial `repost` |
| **ÐGift** | Optional later / non-feed | Keep own spec; not required for feed v1 |
| **ÐSP** | Product-specific (doge.show) | Keep; not part of dogenals.com feed core |

Historical specs remain in-repo for reference. They are **not** competing launch products.

---

## 5. User verbs (what dogenals.com ships)

| User action | On-chain | Pays creator? |
| --- | --- | --- |
| **Post** | Inscription `op: post` (+ optional announce signal) | Mention tips **if** extra outputs |
| **Reply** | Inscription with `parent` | **May** pay parent `pay_to` |
| **Quote / Repost** | Inscription with quote/repost_of | **Should** pay original `pay_to` |
| **Like** (primary button) | `engage` + DOGE ≥ min to post `pay_to` | **Yes** |
| **React** (emoji) | `engage` with reaction byte; tip optional | Only if tip attached |
| **Follow / Unfollow** | compact signal | No |
| **Message / Whisper** | Ðignal | No |

Default **Like** = paid. That is the cultural and economic loop: attention has cost; creators get koinu.

---

## 6. Adoption path

1. Spec freeze on this north star + [spec.md](spec.md)  
2. dogex: posts + engage validation + follows + feed APIs  
3. web-com: home feed, compose, like, follow, profile  
4. doge.cam: media → post  
5. command.dog: notifications only  
6. Wallets: one builder for `Ð:SOC` engage + tip outputs (like, quote/repost branch, mentions)  

No mainnet dual-stack. No “phase 1 free likes only.” The default product is honest about money.

---

## 7. What we are not building

- Platform-owned social graphs sold as “on-chain”
- Smart-contract social on Dogecoin
- Encrypted public feeds (use Ðignal)
- Free infinite spam “likes” as first-class protocol success metrics
- A new protocol folder for every emoji

---

## 8. Success

Success is not 40 protocol READMEs. Success is:

- A stranger opens **dogenals.com**, connects a wallet, posts once, gets tipped on a like, and understands it without a whitepaper.
- Two independent indexers agree on `engage_count` and `tip_total` for a post.
- Elon (or anyone) can verify a claim by looking at a transaction — not an API key.

**Doginals remain Doginals. Dogenals is the standard. Social belongs on the chain that tips in DOGE.**
