# Enzo Plays review — v0.8.0

Reviewed on 12 September 2026. The full English auto-generated transcripts of the following three videos were read through their final timestamps. Video playback remained at a buffering frame in the cloud browser, including after a reload, so this is a complete narration review, not a claim of watching all visual gameplay. Auto-captions can contain transcription errors.

| Video | Relevant passages | Application |
| --- | --- | --- |
| [The Ultimate Openfront.io Beginner's Guide](https://www.youtube.com/watch?v=8bxcAsJJXJg) — 21:16 | 0:15–0:35 terrain/spawn; 4:25–5:05 growth and surroundings; 6:55–7:55 port access and capturing ports; 13:25–15:45 structure placement and nuclear follow-up | Plains preference for expansion; terrain-aware protected construction; value capturable infrastructure. Keep established reserve and strike-then-reassess behavior. |
| [Harnessing the Power of Economy in OpenFront.io](https://www.youtube.com/watch?v=LjHGs047sSM) — 35:15 | 1:23–2:10 full-send mistake and mountains; 3:03–4:55 races for cities/factory; 6:05–8:05 linking stations; 24:55–26:16 connecting the train network | More valuable conquest selection and factories near connected own cities/ports. Maintain reserves and the user's approximate 60/40 city/income mix. |
| [OpenFront v33 has Changed the Meta](https://www.youtube.com/watch?v=xt6GLZ6PL3Y) — 52:10 | 2:13–3:05 timing and capacity; 4:25–4:42 commitment; 5:35–5:53 targeted strikes; 25:00–26:36 trade benefiting rivals; 29:08–29:24 city concentration; 48:05–48:12 spreading risk | Keep existing target commitment; rank hydrogen targets by valuable enemy land and infrastructure; avoid speculative factory placements with no own station connection; protected construction still spreads structures. |

The first guide is dated February 2025 and its pinned creator comment identifies it as outdated. Its exact prices, capacity increments, workforce slider, alliance rules, and win threshold were not copied. The later matches also reflect their recorded versions, not a guarantee of current balance.

## Verified mechanics and design choices

Fresh official source fetched during this revision:

- [Config.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/configuration/Config.ts): terrain/defense/fallout affect attack losses; troop replenishment depends on current troops and capacity; cities increase capacity; station range and nuclear radii come from configuration. The extension continues to use the installed game's exposed values where supported.
- [PortExecution.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/execution/PortExecution.ts): nearby factories create stations at ports. Maritime trade depends on water connectivity, trade eligibility, port levels, and route distance; having any distant port on the map does not prove a trading route.
- [Railroad.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/game/Railroad.ts): railroads connect stations through tile paths. The extension's owned-land corridor test is a conservative placement heuristic; it is not a native railroad simulation or an income guarantee.

Implementation weights and thresholds are engineering choices, not percentages claimed by Enzo. Infrastructure value is capped so expensive or dangerous conquests do not become attractive solely because they contain a city. The existing focus still wins over switching to another target. Rough terrain is only a placement bonus after the normal ownership, coast, and border safety checks. Factories require an accessible completed own city or port within station range; winding native routes may be missed. Disconnected factories yield to other construction instead of stopping the bot.

Hydrogen candidates now rank sampled enemy land and completed city/silo/income/defense levels within the configured blast footprint. Friendly-fire rejection and known SAM endpoint coverage checks still apply; a high score never overrides them. Ranking does not guarantee interception-free flight or predict exact blast damage. The existing late-game, economy, five-million-gold, no-AI-neighbor, and post-impact reassessment gates remain.

## Deliberately not copied

Your explicit preferences remain authoritative: no AI alliances, no alliance with every player, no excessive defense posts, no full-send attacks, no indiscriminate new fronts, and no early nuclear saving. The videos' betrayals, diplomatic threats, deliberate self-bombing, dense mega-base stacking, and endgame MIRV standoffs are not reproduced. No chat messages or threats are sent. This revision does not add workforce-slider automation from the obsolete guide.

## Evidence limits

99 automated tests pass against the rebuilt bundle. These verify software decisions and retained controls, not multiplayer performance. No live match or measured win-rate improvement is claimed. The recent-game display is the place to evaluate the update on actual recorded bot matches.
