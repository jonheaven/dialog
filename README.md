# Ðialog

**Status:** Launch Draft. No activation height.
**Marker:** `Ð:DLG` (`c3 90 3a 44 4c 47`)
**JSON:** `"p": "Ð:DLG"`, `"v": 1`
**Public spec:** [github.com/jonheaven/dialog](https://github.com/jonheaven/dialog)
**Spec:** [spec.md](spec.md)

Ðocial (`Ð:SOC`, the old `docial-spec` repository) is a retired name. This protocol replaces it. Do not emit `Ð:SOC` for a new post.

Ðialog is a social protocol on Dogecoin. Each wallet signs its own posts, replies, quotes, reposts, reactions, follows, profile, edits, deletes, and linked keys. Two carriers hold them: a signed JSON inscription, or for small actions one OP_RETURN of at most 46 bytes. No registrar, no fee, no payee. Any indexer that applies [spec.md](spec.md) to the same blocks gets the same state. It does not use `Ð:SOC`.

| File | What it is |
| --- | --- |
| [spec.md](spec.md) | The rules. §6 is the OP_RETURN layout, §7 the state rules, §10 Ðialog vs D:// |
| [INTEGRATION.md](INTEGRATION.md) | How a site publishes and reads, and which settings are protocol and which are app |
| [STANDING.md](STANDING.md) | standing/1: suggested, non-consensus social standing any reader computes from the same state |
| [standing.mjs](standing.mjs) | Reference standing/1 (`computeStanding`, `engagementScores`) |
| [codec.mjs](codec.mjs) | Reference checker and state reducer (pure ESM, `@noble/hashes` + `@noble/secp256k1`) |
| [schemas/content.json](schemas/content.json) | JSON Schema for inscription bodies |
| [vectors/](vectors/) | Signed bodies, canonical strings, compact scripts; `build-vectors.mjs` regenerates `ops.json` and `compact.json` |
| [examples/](examples/) | One body per common op, and a compact script |

From this directory, after `npm install`:

```bash
node --test
```
