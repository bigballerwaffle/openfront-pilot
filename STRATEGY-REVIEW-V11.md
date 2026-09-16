# Enzo review for v0.11.0

Reviewed September 16, 2026. These ten videos differ from the three in `STRATEGY-REVIEW.md`.

## Review method and sources

Read each available English auto-generated transcript and inspected sampled gameplay scenes in YouTube. This was **not ten uninterrupted full-length viewings**. Ads and playback transitions were excluded from gameplay evidence. The trade-island transcript has a gap around 20:50–22:26. Samples confirm particular situations, not every narrated outcome. The factory-match visual was small and was not used to infer exact building distances.

Links use descriptive labels; times are approximate video positions, not game clocks.

| Video | Length | Visual sample and relevant lesson |
| --- | --- | --- |
| [How to Dominate the Early Game](https://www.youtube.com/watch?v=fRP48Dl3Cnw) | 4:14 | Opening and around 1:41: expansion among small AI territories. Narration emphasizes efficient clearing, depleted bots, plains and strong-neighbor alliances. |
| [v34 changing the meta](https://www.youtube.com/watch?v=x-gZ2IFXfnY) | 23:26 | Around 4:41–4:56: crowded coast, multiple allies and nearby infrastructure. Later narration warns about oversized wilderness transports and unfinished cross-map conquests. |
| [Rainbow-shaped river map, v34](https://www.youtube.com/watch?v=gXVRJz3cJP8) | 15:59 | Around 1:35: cities and factories near the river and remaining nations. Special five-million-gold, four-minute-peace rules make this unsuitable as a universal opening. |
| [Central landlocked spawn](https://www.youtube.com/watch?v=sKumGwgLhuo) | 11:46 | Around 2:21–2:40: human neighbors on multiple sides; on-screen advice favors stronger-player alliances. Later narration regrets strengthening rivals through reciprocal trade. |
| [Random spawn without nukes](https://www.youtube.com/watch?v=bnrPZEmTEgE) | 17:01 | Around 3:24–3:51: separate Irish/British positions and a fight near infrastructure. Narration favors rear cities and continuing flank alliances. |
| [An unusually strong spawn](https://www.youtube.com/watch?v=aaCW7Ftv5N4) | 16:52 | Around 3:22–3:35: cleared territory, allied flank and a connected economic line. Narration values city captures and waiting for defenders to spend troops. |
| [A powerful box-map tactic](https://www.youtube.com/watch?v=YADXdGgmHHc) | 15:20 | Around 6:00 and following: central Albania, allied Noob on one side, target below. Narration demonstrates a nuclear split but also warns about defense posts and exposed borders. |
| [Using the “powerhouse of the cell”](https://www.youtube.com/watch?v=Gx-S0puqK_E) | 16:54 | Early-midgame river-side fighting. Narration explicitly depends on two other players supplying factories, which a solo bot cannot reproduce. General lessons: economic connections and timely renewals. |
| [OpenFront.io v31 Tutorial](https://www.youtube.com/watch?v=IeR36481zsI) | 19:12 | Around 9:35: Sweden offensive, protected eastern territory, and a note that captured defense posts self-destruct. Narration explains growth, railways, defense coverage and alliance expiry. |
| [Peaceful trade island](https://www.youtube.com/watch?v=6MjVf2HBvI8) | 26:50 | Around 8:03 and following: shared Cyprus, ports, warships and incoming threats. Narration repeatedly renews the island alliance and warns about exposing it with low reserves. |

## Implemented adaptations

These are bounded engineering choices, not a reproduction of Enzo's play or a measured win-rate improvement.

1. **Soonest useful renewal first.** Incoming offers/rejections could previously postpone renewals, and array order chose the ally. Renewals now precede that queue and sort by expiry. A recent new offer does not block renewal; renewal and per-player cooldowns remain. Expired, distant, unwanted, AI and campaign-target alliances remain excluded. Dispatch still checks native eligibility.
2. **Small wilderness transports.** Empty-land landings send 10% of home troops, with a preferred 1,000-troop minimum, bounded by the available budget. Previously they used the full defended-invasion budget. Defended landings, reserve limits, crossing checks and one-offensive rules are unchanged. A foothold is not a guarantee of clearing an entire island.
3. **Cities extend protected own networks.** City-site ranking gets a bounded bonus for completed own factories within native station range and connected by a straight owned-land corridor. Border/water clearances, dispersion, terrain scoring and native placement validation remain. This estimates connectivity, not actual railway routing or profit. Foreign factory cooperation is not assumed.

Existing v0.10 rules—stronger-capacity alliances, repeated spawn relocation, capacity-pressure spending, city-capture value and emergency defense posts—were retained, not relabeled as new work.

## Not copied

- Full sends, transport spam and repeated bait/counter exchanges: conflict with reserves, front limits and the requested defensive response policy.
- Betrayal setups and chat coordination: outside established bot behavior.
- Factories supplied by cooperating players: not a controllable resource.
- Guaranteed bomb-splits or cheap annexations: require validated topology and live mechanics, not just successful examples.
- Fixed map spawns, special starting resources and old exact growth/price numbers: not safe universal settings.

## Verification

All **123 tests pass**, including seven new tests covering renewal priority/cooldowns/exclusions, owned-network connectivity, city-site preference, small transports, defended invasion size and hostile-water rejection. The extension bundle was rebuilt. These tests do not establish live multiplayer compatibility or a win-rate improvement.

Version is **0.11.0** in the extension, panel and bundle. Learning uses a new `conquest-v11-renewals-networks` context; storage keys and bounded historical summaries are preserved.
