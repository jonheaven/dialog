# Ðialog standing/1 (suggested, non-consensus)

**Status:** Launch Draft. Not part of Ðialog consensus.
**Reference:** [standing.mjs](standing.mjs) (`computeStanding`, `engagementScores`), tests in [standing.test.mjs](standing.test.mjs)

Standing is a social record, not money. It has no token, no points, no balance, nothing to buy, sell, claim or redeem, and no promise of any payout. It is a way to read the public graph so that people who show up, keep showing up, and get real replies are visible.

It is computed only from Ðialog state ([spec.md](spec.md) §7) and a tip height. No wall clock, no off-chain data, no new ops. Two readers with the same blocks and the same tip get the same numbers. A site MAY show it, change how it looks, or ignore it. It MUST NOT be written back to the chain as Ðialog, and it does not change which records are valid.

## Inputs

- `state`: the output of `reduceState(events)` from [codec.mjs](codec.mjs).
- `tipHeight`: the block height standing is measured at. doginals.lol uses the highest indexed Ðialog height.

A chain day is 1440 blocks (`floor(height / 1440)`). Dogecoin targets one block a minute, so it is close to a calendar day without trusting anyone's clock.

## Per-account facts

| Field | Meaning |
| --- | --- |
| `since` | First height the account appears in any Ðialog record |
| `posterNumber` | 1 for the first account to post, reply or quote, in chain order |
| `posts` | Live posts, replies and quotes (deleted ones do not count) |
| `repliesReceived`, `distinctRepliers` | Replies to their posts, and how many different accounts wrote them |
| `reactionsReceived`, `distinctReactors` | Reactions other than `none` on their posts |
| `repostsReceived`, `followers` | Reposts of their posts; accounts whose latest follow edge to them is `follow` |
| `tipsReceived`, `tipKoinuReceived`, `distinctTippers` | Ðialog tips paid to them |
| `currentStreak`, `longestStreak`, `activeDays` | Chain days in a row with a post. The current streak survives until a whole chain day passes without one |
| `milestones` | `first-post`, `posts-10`, `posts-100`, `first-reply`, `followers-10`, `followers-100`, `first-tip`, `streak-7`, `streak-30`, `early-100`, `early-1000` |

Anything done to yourself is ignored everywhere: replying to, reacting to, reposting, following or tipping your own address adds nothing.

## Trust and rank

Counts are easy to fake with fresh addresses. Rank is not a count:

1. **Endorsement edges.** `u → v` for each thing `u` does to `v`: follow 3, reply 2, quote 2, repost 2, tip of at least 0.01 DOGE 2, reaction 1. Each pair is capped at 8 in total, however many times `u` repeats it. Self-edges do not exist.
2. **Seeds.** Accounts first seen at least 7 chain days before the tip, with at least 3 live posts and at least one other account endorsing them. Until any account qualifies, every account with a post is a seed; failing that, every account.
3. **Trust.** Personalized PageRank from the seeds: damping 0.85, 20 iterations, uniform restart over the seeds, dangling weight returned to the seeds. An account that endorses many others splits its weight between them. Accounts are processed in sorted address order so float sums are identical everywhere.
4. **Rank** is position by trust, ties by earlier `since`, then by address. `score = round(trust × accounts × 100)`, so 100 is an average account.

A ring of new addresses endorsing each other gains almost nothing: none of them are seeds, so little trust flows in, and the ring cannot become seeds for a week and only if someone outside endorses them.

## Post engagement

`engagementScores(state, standing)` gives each post `Σ over accounts min(8, weight) × cred(account)`, where `cred = clamp(trust × accounts, 0.01, 1)`. The author never counts, each account's replies count once per post, and an account with no standing counts 1% of a trusted one. A hundred fresh likes equal one like from an account people actually engage with.

## How doginals.lol shows it

- **Profile card:** rank (`#k of n`, and top percent once there are 20 accounts), posts, how many different people replied and reacted, followers, days posted, the current and best streak, and milestones. A new account sees "Your standing starts with your first post".
- **Poster badge:** `#N` next to the name for the first 1,000 posters, with "since block X" on hover.
- **Feeds:** Top sorts by engagement score; Hot divides it by age in hours (`(score + 1) / (hours + 2)^1.5`). The side panel lists the highest-ranked accounts you do not follow yet.
- **Copy:** social, never financial. No "earn", no "rewards", no balances.

These are site choices ([INTEGRATION.md](INTEGRATION.md), "Protocol or app"). Another site can rank differently and still read the same Ðialog.

## Versioning

A change to any constant or rule is a new name (`standing/2`). Sites say which one they show.
