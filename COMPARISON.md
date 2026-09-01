# Ðocial — comparisons (post-consolidation)

**Normative:** [spec.md](spec.md) · **North star:** [SOCIAL_LAYER.md](SOCIAL_LAYER.md)

## vs other systems

| System | Truth | Paid attention | Notes |
| --- | --- | --- | --- |
| **Ðocial** | Dogecoin L1 | Yes (UTXO: like, quote/repost branch, mentions) | Canonical Dogenals public social |
| **Ðignal** | Dogecoin L1 | No | Private only |
| **Legacy ÐPulse** | OP_RETURN | No | Superseded by Ðocial engage |
| **Legacy ÐEcho** | Inscription | No | Superseded by Ðocial repost for social |
| **Nostr** | Relays | Optional zaps | Fine as cache; not L1 truth |
| **Twetch / Bitcoin Schema** | BSV OP_RETURN (B:// + MAP + AIP) | Payees API + outputs | Learned: like must *name* the post on L1; branch/mention pay as extra UTXOs. Do **not** copy unbounded OP_RETURN, MAP pipes, or a hosted `/payees` invoice as consensus |
| **Pure OP_RETURN socials** | Chain | Rare | Too weak for media posts |
| **Inscription-only socials** | Chain | Rare | Too heavy for engage/follow |

## Internal: one stack

| Job | Protocol |
| --- | --- |
| Public feed | Ðocial |
| Private chat | Ðignal |
| Profile | ÐMS + Ð𝕏 + ÐPFP |

No third “micro social” product for launch.
