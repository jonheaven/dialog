<!-- markdownlint-disable MD024 -->
# Ðocial — Public Social OS for Dogecoin

Version: v1.1 (Consolidated Launch Draft)  
Status: Draft — **Canonical public social layer**  
Last Updated: 2026-08-03  
Chain: Dogecoin  
**Canonical public spec:** [github.com/jonheaven/docial-spec](https://github.com/jonheaven/docial-spec)  
North star: [SOCIAL_LAYER.md](SOCIAL_LAYER.md)  
Wallets: [WALLET.md](WALLET.md) · Agents: [AGENTS.md](AGENTS.md)

### Naming

- **Display name:** **Ðocial**
- **Public canonical:** **[jonheaven/docial-spec](https://github.com/jonheaven/docial-spec)** (studio working copy: `dogenals/spec/protocols/dsocial/`).
- **Wire marker:** OP_RETURN **`Ð:SOC`** · inscriptions **`"p": "Ð:SOC"`**
- **Supersedes for new social deployments:** standalone ÐPulse free-likes, Doge Signals product umbrella, ÐEcho-as-primary-repost (see §14)

---

## Table of Contents

1. Introduction  
2. Goals and Non-Goals  
3. Architecture  
4. OP_RETURN Signal Format  
5. Content Inscription Format  
6. Engage (React + Tip)  
7. Follows  
8. Replies, Quotes, Reposts  
9. Profiles and Identity  
10. Wallet, Frontend, Indexer  
11. Integrations  
12. Security  
13. Examples  
14. Consolidation and Legacy  
15. Launch Summary  

---

## 1. Introduction

Ðocial is the **one public social protocol** for Dogecoin under Dogenals.

It is intentionally small:

- **Posts** (and threads) as inscriptions  
- **Engage** as one OP_RETURN verb — free react and/or paid tip  
- **Follows** as compact OP_RETURN  
- **No platform ownership** of the graph  

Private chat is **not** Ðocial. Use **Ðignal** (`Ð:DIG`).

The default product “Like” on dogenals.com is a **tipped engage**: a small DOGE output to the post creator plus an `engage` signal. Attention has cost. Creators get paid. Spam has a price.

---

## 2. Goals and Non-Goals

### Goals

- One public social wire language every honest indexer can implement the same way  
- Creator monetization without custody or marketplace middlemen  
- Cheap engagement (OP_RETURN) + rich content (inscriptions)  
- Self-custodial follows and timelines  
- Clear rules for dogex, wallets, and dogenals.com  
- Room for media posts (doge.cam) and whispers (Ðignal pointers)  

### Non-Goals

- Encrypted messaging (Ðignal)  
- Marketplace settlement (ÐMP)  
- Free infinite protocol-level “likes” as the primary success metric  
- Dual-emission of the same user action under multiple markers  
- Off-chain moderation as consensus  

---

## 3. Architecture

| Layer | Carrier | Holds |
| --- | --- | --- |
| **Content** | Inscription JSON `"p":"Ð:SOC"` | post / reply / quote / repost / profile body |
| **Signal** | OP_RETURN `Ð:SOC` | engage, follow, unfollow, optional announce |
| **Value** | Spendable DOGE (or optional token) **outputs** | tip to creator — **normative tip amount** |

### One emission rule

For a single user action, wallets **MUST** emit **at most one** Ðocial signal (and at most one content inscription when required).  
Wallets **MUST NOT** also emit legacy `Ð:P`, ÐEcho, or duplicate markers “for compatibility” on the same action.  
Indexers **MAY** *derive* secondary metrics; they **MUST NOT** require dual txs.

### Carrier preference

| Action | Required | Optional |
| --- | --- | --- |
| Post / reply / quote / repost | Content inscription | Announce signal |
| Engage (react / tip / like) | OP_RETURN `engage` | DOGE tip output; rich inscription **not** required |
| Follow / unfollow | OP_RETURN | — |
| Short status only | OP_RETURN short text **or** tiny post inscription | Prefer inscription if > 40 chars of body |

---

## 4. OP_RETURN Signal Format

Implementations **MUST** support the **binary** form. Short text **MAY** be used for demos and human-readable status only.

### 4.1 Binary signal (canonical) — 30 bytes

| Offset | Size | Field | Description |
| --- | ---: | --- | --- |
| 0 | 6 | magic | UTF-8 `Ð:SOC` (`c3 90 3a 53 4f 43`) |
| 6 | 1 | version | `0x01` |
| 7 | 1 | kind | §4.2 |
| 8 | 1 | flags | §4.3 |
| 9 | 1 | reaction | §4.4; `0x00` if not an engage |
| 10 | 16 | target_hash16 | §4.5 |
| 26 | 4 | nonce | uint32 LE |

**Total: 30 bytes.** Fits easily under Dogecoin OP_RETURN policy.

**No amount field in the signal.** Tip amount is the sum of spendable outputs to the resolved `pay_to` address in the **same transaction** (§6).

### 4.2 Kind values

| Value | Kind | Meaning |
| ---: | --- | --- |
| `0x01` | `post` | Optional announce: content inscription expected |
| `0x02` | `engage` | React and/or tip toward a post (or inscription) |
| `0x03` | `follow` | Follow profile/address |
| `0x04` | `unfollow` | Unfollow |
| `0x05` | `reply` | Optional announce for reply inscription |
| `0x06` | `quote` | Optional announce for quote inscription |
| `0x07` | `repost` | Optional announce for repost inscription |

### 4.3 Flags

| Bit | Meaning |
| ---: | --- |
| 0 | Sound / notification hint (untrusted) |
| 1 | Content inscription expected in same or linked flow |
| 2 | Reserved (was “amount in signal” — **unused**; MUST be 0) |
| 3 | Ðignal whisper available for this post |
| 4 | Marketplace / ÐMP context |
| 5 | Media on content inscription |
| 6–7 | Reserved; MUST be 0 in v1 |

### 4.4 Reaction byte (engage only)

Aligned with historical ÐPulse labels for human familiarity; **new wire is only `Ð:SOC`**.

| Byte | Label | Product note |
| ---: | --- | --- |
| `0x00` | none | Invalid for `kind=engage` |
| `0x01` | `like` | **Default Like button** (expect tip — §6) |
| `0x02` | `heart` | |
| `0x03` | `fire` | |
| `0x04` | `laugh` | |
| `0x05` | `doge` | |
| `0x10` | `checkin` | |
| `0x20` | `milestone` | |

Unknown non-zero reactions: indexers **MUST** store as `reaction_raw` and **MAY** display as “react”.

### 4.5 target_hash16

Let `H = SHA256(target_id_utf8)` and take the first 16 bytes.

| Kind | `target_id_utf8` |
| --- | --- |
| engage, reply, quote, repost, post announce | Inscription id `{64 hex}i{n}` lowercase |
| follow, unfollow | Followee address string as commonly encoded |

Because only 16 bytes ride in OP_RETURN, content inscriptions **SHOULD** carry full ids. Indexers resolve hash16 against known posts; ambiguous matches **MUST NOT** count as valid paid engage.

### 4.6 Short text (optional)

```text
Ð:SOC:<kind>:<payload>
```

Kinds: `e` engage, `f` follow, `u` unfollow, `p` post, `r` reply, `q` quote, `rp` repost.  
Payload **MUST** stay within total OP_RETURN limits. Private data **MUST NOT** appear here.

---

## 5. Content Inscription Format

```json
{
  "p": "Ð:SOC",
  "v": "1.1",
  "op": "post",
  "chain": "dogecoin",
  "content": "Much social. Very L1.",
  "pay_to": "D8mZsgKwmSQWYRPEMCcm8KzNFj1JVF5UpA",
  "tags": ["dogenals"]
}
```

### 5.1 Required fields

| Field | Rule |
| --- | --- |
| `p` | MUST be `"Ð:SOC"` |
| `v` | MUST be `"1.1"` for this draft (`"1.0"` readers SHOULD accept as compatible posts) |
| `op` | MUST be one of §5.2 |

### 5.2 Operations

| `op` | Requirements |
| --- | --- |
| `post` | `content` SHOULD be non-empty; `pay_to` SHOULD be set |
| `reply` | `parent` MUST (inscription id) |
| `quote` | `quote` MUST |
| `repost` | `repost_of` MUST |
| `profile` | social prefs only; identity body stays ÐMS/Ð𝕏/ÐPFP |

**Removed from v1.1 content ops:** standalone `like` / `follow` inscriptions as the preferred path.  
Engage and follow are **signals**. Optional rich records are not required for validity.

### 5.3 Important optional fields

| Field | Use |
| --- | --- |
| `pay_to` | Creator tip address (SHOULD on every post/reply/quote that wants tips) |
| `min_like_koinu` | Raise minimum tip (MUST NOT lower below protocol default for “paid” status) |
| `parent` / `reply_to` | Thread |
| `quote` / `repost_of` | References |
| `media[]` | `{ "inscription_id", "mime" }` — prefer separate media inscriptions |
| `tags` / `mentions` | Discovery (mentions are not proofs) |
| `whisper` | Ðignal inscription id for private attach |
| `dms` / `dx` | Identity links |
| `lang` | BCP-47 |

Soft size: **4 KB** typical. Media blobs belong in their own inscriptions.

### 5.4 Compact aliases (optional)

`o`→`op`, `c`→`chain`, `ct`→`content`, `pay`→`pay_to`, `par`→`parent`, `q`→`quote`, `rp`→`repost_of`, `m`→`media`, `tg`→`tags`, `mlk`→`min_like_koinu`

---

## 6. Engage (React + Tip)

**One verb. Two economics.**

### 6.1 Valid engage (always)

A valid **engage** requires:

1. OP_RETURN binary (or short text) with `kind = engage`  
2. `reaction ≠ 0`  
3. Resolvable `target` post (or allowed inscription) from `target_hash16`  

Indexers record: sender, target, reaction, height, txid, `tip_koinu`, `tipped`.

### 6.2 Tip (paid engage)

In the **same transaction**, if the sum of spendable DOGE outputs to the post’s **pay address** (§6.3) is ≥  
`max(1_000_000, post.min_like_koinu)` koinu (default **0.01 DOGE** soft-dust safe):

- `tipped = true`  
- `tip_koinu =` that sum (UTXO truth; ignore any client-reported amount)  
- Counts toward `tip_total_koinu` and `tipped_engage_count`  

If below minimum or wrong address: still a valid **free engage** (`tipped = false`) unless policy hides spam.

### 6.3 Pay address resolution

1. `pay_to` on the target post inscription if valid  
2. Else first owner address of the post inscription at reveal  
3. Else `tipped` cannot be true (`unresolved_pay_to`)

### 6.4 Product defaults (normative for dogenals.com-class UIs)

| UI control | Wire |
| --- | --- |
| **Like** | `engage` + `reaction=like` + tip ≥ minimum |
| **React** | `engage` + chosen reaction; tip optional |
| **Tip only** | `engage` + `reaction=like` (or doge) + tip ≥ minimum |

Wallets **MUST** show the tip amount before sign when constructing a Like.

### 6.5 Aggregates (indexer)

Per post:

| Field | Meaning |
| --- | --- |
| `engage_count` | Valid engages |
| `tipped_engage_count` | Engages with `tipped=true` |
| `tip_total_koinu` | Sum of tips |
| `unique_engagers` | Distinct senders (optional) |

Per-address `signals_consistency` / governance: count **weeks with any Ðocial engage or follow** (not four legacy protocols).

### 6.6 Duplicates

Each engage tx is a separate event (boosts allowed). Frontends **MAY** show “you already engaged” as UX only.

---

## 7. Follows

- `kind=follow` / `unfollow`, target = followee address hash16  
- Last event wins per `(follower, followee)` in block order  
- **No** value transfer required  
- Timeline: posts by followed authors, ordered by `(height, tx_index)`

---

## 8. Replies, Quotes, Reposts

| `op` | MUST include |
| --- | --- |
| `reply` | `parent` |
| `quote` | `quote` |
| `repost` | `repost_of` |

Targets **SHOULD** be Ðocial posts; quoting any inscription is allowed (display as shared inscription).  
Cycles: store both; UI breaks loops.  
**Repost replaces ÐEcho** for new social reshares. Do not require a second ÐEcho inscription.

---

## 9. Profiles and Identity

Ðocial does not invent identity:

| Need | Protocol |
| --- | --- |
| Bio, files, attestations | ÐMS |
| Optional 𝕏 link | Ð𝕏 |
| Avatar / audio | **ÐPFP / ÐPFA** — separate identity protocol; dogex `/api/profile/:address` |
| Chat keys | Ðignal key-announcement |
| Pinned post / default min tip | Ðocial `op: profile` (MUST NOT redefine avatar) |

---

## 10. Wallet, Frontend, Indexer

### Wallets

- Build **one** social encoder: Ðocial binary + optional tip output  
- Resolve `pay_to` before Like  
- Mute, quiet mode, min-tip display threshold  
- Label all Ðocial content **public forever**  

### Frontends (dogenals.com, doge.cam)

- Feed from dogex, not from a private DB of “likes”  
- Like button = tipped engage by default  
- Whisper = Ðignal deep link  
- Live sockets optional; chain wins on conflict  

### Indexers (dogex)

- Parse `Ð:SOC` OP_RETURN + `"p":"Ð:SOC"`  
- Validate tips from **outputs**  
- Reorg-safe undo  
- Suggested routes: see [INTEGRATION.md](INTEGRATION.md)  
- Schemas: [schemas/](schemas/) · vectors: [vectors/](vectors/)  

---

## 11. Integrations

| Protocol | Role |
| --- | --- |
| **Ðignal** | DMs, rooms, `whisper` on posts |
| **ÐMS / Ð𝕏 / ÐPFP** | Profile |
| **ÐMP** | Share listings via `context`; never settle in Ðocial |
| **Dunes / Treats** | Optional extra tip asset in same tx (v1: DOGE defines `tipped`) |
| **ÐRep** | MAY later weight tipped engages; not required for v1 validity |
| **doge.cam** | Media → inscription → post |
| **command.dog** | Notifications only |

---

## 12. Security

- Public graph and posts are permanent and linkable  
- Tips can dust-spam creators — wallets SHOULD filter low tips  
- Notification bits are untrusted  
- Never put secrets in Ðocial content  
- Hash16 ambiguity → don’t count paid tip without unique resolve  
- No dual-marker “compat” spam  

---

## 13. Examples

### 13.1 Decoded engage (Like with tip)

```json
{
  "magic": "Ð:SOC",
  "version": 1,
  "kind": "engage",
  "flags": { "sound_hint": true },
  "reaction": "like",
  "target_hash16": "00112233445566778899aabbccddeeff",
  "nonce": 1
}
```

Same tx: DOGE output ≥ 100000 koinu to post `pay_to`.

### 13.2 Post

```json
{
  "p": "Ð:SOC",
  "v": "1.1",
  "op": "post",
  "chain": "dogecoin",
  "content": "Hello Ðocial — one protocol, tips in DOGE.",
  "pay_to": "D8mZsgKwmSQWYRPEMCcm8KzNFj1JVF5UpA",
  "tags": ["dogenals"]
}
```

### 13.3 Reply

```json
{
  "p": "Ð:SOC",
  "v": "1.1",
  "op": "reply",
  "chain": "dogecoin",
  "parent": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaai0",
  "content": "On-chain reply.",
  "pay_to": "D8mZsgKwmSQWYRPEMCcm8KzNFj1JVF5UpA"
}
```

### 13.4 Repost

```json
{
  "p": "Ð:SOC",
  "v": "1.1",
  "op": "repost",
  "chain": "dogecoin",
  "repost_of": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaai0"
}
```

### 13.5 Short free react (no tip)

Binary engage, `reaction=fire`, no DOGE to `pay_to` → free engage.

---

## 14. Consolidation and Legacy

### 14.1 Canonical

- **Public social:** this specification  
- **Private social:** Ðignal  

### 14.2 Legacy markers (read-only / transition)

| Legacy | Indexer policy for **new** wallets | Indexer policy for **history** |
| --- | --- | --- |
| `Ð:P` (ÐPulse) | **MUST NOT** emit | MAY map to free `engage` with same reaction labels |
| ÐEcho inscriptions | **MUST NOT** use for new reshares | MAY count as historical amplify |
| Doge Signals umbrella | Product name retired | See [SOCIAL_LAYER.md](SOCIAL_LAYER.md) |

### 14.3 v1.0 → v1.1 wire changes

- Binary length **54 → 30** bytes  
- Removed signal `amount_koinu` and `content_hash16`  
- Unified `like` kind into **`engage` + reaction**  
- Content `v` **1.1**; prefer signals for engage/follow  

No mainnet Ðocial history is assumed; v1.1 is the greenfield freeze.

---

## 15. Launch Summary

Ðocial v1.1 is Dogecoin’s public social OS:

1. Inscriptions for posts and threads  
2. 30-byte `Ð:SOC` signals for engage and follow  
3. Tips as real DOGE outputs to `pay_to`  
4. One Like button economics for dogenals.com  
5. Ðignal for private; identity protocols for profiles  
6. Legacy Pulse/Echo/Signals absorbed or read-only  

Schemas, examples, vectors, and integration notes sit beside this file.
