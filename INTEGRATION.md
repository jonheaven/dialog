# Ðocial integration — dogex / command.dog / web-com / doge.cam

**Normative:** [spec.md](spec.md) v1.1 · **North star:** [SOCIAL_LAYER.md](SOCIAL_LAYER.md)

## Truth

```text
Dogecoin L1  →  dogex  →  APIs  →  dogenals.com / doge.cam
                ↑
         command.dog (notify only)
```

## dogex (build this)

### Detect

- OP_RETURN prefix UTF-8 `Ð:SOC` (`c3 90 3a 53 4f 43`), binary **30 bytes** preferred  
- Inscription `"p":"Ð:SOC"`

### State

| CF / index | Role |
| --- | --- |
| `social_post` | post id → author, height, pay_to, parent/quote/repost, content meta |
| `social_by_author` | author → posts |
| `social_thread` | parent → children |
| `social_engage` | (post, txid) → sender, reaction, tip_koinu, tipped |
| `social_engage_agg` | post → engage_count, tipped_engage_count, tip_total_koinu |
| `social_follow` | follower→followee active edge |

### Engage validation

1. Parse kind=`engage`, reaction≠0  
2. Resolve target from hash16 (unique)  
3. `tip_koinu` = sum of spendable outputs to pay_to  
4. `tipped = tip_koinu >= max(1_000_000, min_like_koinu)`  
5. Never trust a client “amount” field  

### HTTP (ship names)

```text
GET /api/social/feed
GET /api/social/post/:id
GET /api/social/post/:id/engages
GET /api/social/user/:address/posts
GET /api/social/user/:address/timeline
GET /api/social/user/:address/following
GET /api/social/user/:address/followers
```

Aliases under `/api/dsocial/*` MAY redirect.  
Generic: `GET /api/doginals/protocol/Ð:SOC` until dedicated routes land.

### Legacy read (optional)

- Map historical `Ð:P` → free engage for analytics only  
- Do **not** require new wallets to emit `Ð:P`

## command.dog

- Websocket: `social:post`, `social:engage`, `social:follow`  
- Throttle notifications  
- **No** second like ledger  

## web-com (dogenals.com)

1. Home feed  
2. Compose post (wallet inscribe)  
3. **Like** = engage + min tip PSBT  
4. React picker = engage ± tip  
5. Follow  
6. Profile (ÐMS/Ð𝕏/ÐPFP + posts + tips earned)  
7. Whisper → Ðignal  

## doge.cam

Capture → media inscription → Ðocial `post` with `media[]`.

## Ship order

1. Spec v1.1 (this tree)  
2. dogex post + engage + follow  
3. web-com read feed  
4. web-com like/follow  
5. doge.cam share  
6. command.dog notify  

## Conformance

`vectors/conformance.json` · `vectors/op-return-vectors.json`
