# Ðocial — comparisons (post-consolidation)

**Normative:** [spec.md](spec.md) · **North star:** [SOCIAL_LAYER.md](SOCIAL_LAYER.md)

## vs other systems

| System | Truth | Paid attention | Notes |
| --- | --- | --- | --- |
| **Ðocial** | Dogecoin L1 | Yes (UTXO tip on engage) | Canonical Dogenals public social |
| **Ðignal** | Dogecoin L1 | No | Private only |
| **Legacy ÐPulse** | OP_RETURN | No | Superseded by Ðocial engage |
| **Legacy ÐEcho** | Inscription | No | Superseded by Ðocial repost for social |
| **Nostr** | Relays | Optional zaps | Fine as cache; not L1 truth |
| **Pure OP_RETURN socials** | Chain | Rare | Too weak for media posts |
| **Inscription-only socials** | Chain | Rare | Too heavy for engage/follow |

## Internal: one stack

| Job | Protocol |
| --- | --- |
| Public feed | Ðocial |
| Private chat | Ðignal |
| Profile | ÐMS + Ð𝕏 + ÐPFP |

No third “micro social” product for launch.
