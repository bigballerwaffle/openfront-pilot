# Validation record

## v0.10.0 opening growth, defense, diplomacy and spawn relocation

The 116-test suite covers the existing behavior plus ten new scenarios: posts before retaliation; structure-triggered counters; huge-push spending beyond the ordinary two-level cap; early capacity relief before routine purchases; early reinforcement; compact target selection without region samples; stronger-neighbor alliances; diplomacy during reinforcement and late renewals; more than two useful flank commitments; repeated spawn relocation with stop/phase guards; and dispatch rejection after structure danger is absent. Some scenarios share a test. Older counter fixtures now include threatened structures, and the previous two-alliance expectation was updated for the requested expanded flank policy.

The extension is rebuilt as v0.10.0. Learning uses a new strategy context while preserving prior totals and saved history. The dependency lockfile was regenerated because it referenced unavailable package versions, allowing the JSDOM panel tests to run. Tests remain fixtures and bundled-UI checks; no live multiplayer performance claim is made.

Official source inspected on September 16, 2026: [SpawnExecution.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/execution/SpawnExecution.ts) allows replacing a chosen spawn during the selection phase and excludes random-spawn rerolls. [AttackExecution.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/execution/AttackExecution.ts) uses owner-targeted attacks, chooses the conquered tiles internally, and cancels opposing forces. [PlayerView.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/client/view/PlayerView.ts) exposes player capacity inputs and spawn state. Counter urgency uses nearby current hostile ownership as a bounded threat heuristic; it does not predict the precise future attack path.

## Original v0.1.0 behavioral tests

Run `npm test` with Node.js. All 17 tests passed before packaging.

These cover command identification with minified class names, ambiguous client rejection, troop reserves, target selection, defense estimates, build validation, normalized upgrade sites, spawn waiting, stopping during asynchronous work, match replacement, stalled clocks, action confirmation, and alliances formed during validation.

The browser bundle was rebuilt from the included source and passed Node's JavaScript syntax check.

## Upstream engine experiment

During development, the bot was connected to the actual OpenFront engine and client GameView/PlayerView using source commit `6d4155392266d9e2de449cde2fc277057f74a782` from https://github.com/openfrontio/OpenFrontIO.

A single simulated game used a 256 × 192 plains map, normal troop growth and construction, one controlled human player, and eight active game bots. The pilot issued 42 commands and reached 46,705 of 49,152 tiles (95.02% control), with a city, factory, and two defense posts. Commands used the game's event constructors and normal attack and construction executions.

This was a development experiment, not a representative benchmark. The temporary upstream simulation harness is not included. The included regression tests are independently runnable.

## Remaining limits

The deployed openfront.io game could not be tested because its human-verification screen blocked the test browser. Browser installation and compatibility with that deployed build remain unverified. Naval and nuclear gameplay have not been validated in a complete match. This result does not establish a multiplayer win rate or perfect strategy.

## v0.1.1 shortcut update

Changed Start/Pause from F8 to the letter O, which is absent from the upstream default key bindings. The shortcut consumes keydown and keyup, ignores held-key repeats and modifier combinations, and leaves typing fields alone. The rebuilt bundle passed the JavaScript syntax check. No strategy changes were made.

## v0.2.0 learning validation

The release suite contains 38 passing tests: the 17 original behavior tests, 19 learning and controller tests, and 2 bundled-panel tests using JSDOM. The rebuilt bundle also passed Node's JavaScript syntax check.

The learning tests cover:

- A deterministic training scenario in which one strategy wins: the learner selects that strategy in at least 45 of its final 60 trials.
- A changing synthetic environment: after the previous winner becomes unsuccessful, the learner shifts toward the newly successful strategy.
- Persistence across fresh store instances, JSON backup round trips, corrupt-data handling, failed saves without losing in-memory learning, and cross-tab lock serialization.
- 1,500 artificial results across 30 match types, with stored data staying within the 64 KiB cap and retaining at most 12 contexts, 24 result summaries, and 128 recent match IDs.
- Native winner-shaped updates using client IDs and eligible team members; capturing an ephemeral result before polling; FFA elimination versus waiting for a team result; preserving the game's original update method behavior.
- Late takeovers, substantial manual pauses, cancelled games, changed settings, unknown outcomes, repeated results, and turning learning off.
- Learned tuning changing actual strategy actions while preserving troop reserves.
- The actual PilotController start/pause/resume/result lifecycle connected to the learner through an adapter fixture.
- The bundled panel loading saved scores, displaying memory usage, persisting the learning switch, handling the O shortcut, and resetting scores.

These are software behavior tests and synthetic learning experiments. They do not demonstrate a real-game win-rate improvement. No new live multiplayer or full OpenFront-engine benchmark was run for v0.2.0. The original engine experiment above predates this learning feature.

Result integration was checked against these official upstream source interfaces:

- https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/Schemas.ts — WinnerSchema.
- https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/game/GameImpl.ts — makeWinner uses client IDs and eligible team members.
- https://github.com/openfrontio/OpenFrontIO/blob/main/src/client/view/GameView.ts — update, gameID, ticksSinceStart, gameOver, and updatesSinceLastTick.
- https://github.com/openfrontio/OpenFrontIO/blob/main/src/client/ClientGameRunner.ts — invokes the GameView.update method on incoming updates.

Run `npm install --ignore-scripts`, then `npm run build` and `npm test` to reproduce the release suite. JSDOM and esbuild are development dependencies only.

## v0.3.0 conquest and emergency-stop validation

52 tests pass, including the actual bundled panel in JSDOM. New coverage checks the wilderness → AI → human sequence, persistent target selection with remaining territory, stronger nearby AI preventing human diversion, all learned variants retaining troop advantage, and active/returning/transport offensives blocking a second attack. Tests also cover incoming alliance acceptance and target rejection, directional flank offers, native alliance event dispatch, and distinguishing minified request events from identical-shaped break-alliance events.

Map fixtures check inland clearance against lakes and foreign territory, defense setbacks, permitted coastal ports, mid-crossing warship interception, allied warships, and obstructed transport routes. Execution fixtures change defender strength or start another attack during asynchronous validation and verify that no command is sent.

Emergency-stop tests verify pending command cancellation, halted learning polling, restored result observation, cancellation of a queued learning save, stopping while typing, stopped timers on focus loss, O failing to restart after Escape, and deliberate Start-button recovery. The existing learning fixture was updated to provide the full troop/unit snapshot used by the one-offensive guard.

These fixtures do not establish live performance. No complete engine or multiplayer match was run for this revision, and the user's PC/browser was not remotely connected. Alliance response quality, naval survival and victory rates remain unmeasured in live play.

Additional official interfaces checked:

- [Config.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/configuration/Config.ts): attackLogic casualty ratio and warshipTargettingRange.
- [Transport.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/client/Transport.ts): alliance request/reject/extension events and handlers.
- [PlayerImpl.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/game/PlayerImpl.ts): alliance request legality and extension windows.
- [GameImpl.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/game/GameImpl.ts): reciprocal requests accept an alliance.
- [PlayerView.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/client/view/PlayerView.ts): outgoing requests, alliance views, border tiles and actions.
- [TransportShipExecution.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/execution/TransportShipExecution.ts): native destination/spawn resolution and water pathfinding.

Boat checks examine a conservative direct corridor; they are not access to the native pre-launch path. Construction clearances and the 25-tile naval margin are bot policy choices, not guarantees from the game.

## v0.4.0 automatic setup and combat update

68 tests pass after rebuilding the browser bundle. Tests updated from v0.3 reflect the deliberately changed rules: same-target reinforcement is now allowed; the ideal troop ratio can relax at capacity; unsolicited alliances are no longer automatically accepted; Alt-Tab keeps the timer running.

New behavior tests cover:

- The bundled Start → FFA lobby → map loading → automatic spawn flow, including Escape during loading. A single public FFA join through the game's normal validation handler, waiting for map loading, and refusing full/team/trust-restricted lobbies. A rejected join is not bypassed or retried indefinitely. Stopping during loading prevents takeover.
- Inland spawn scoring, occupied starting patches, acknowledgement, no relocation after spawning, and no spawn commands after stop/phase end or in spectator/random-spawn modes.
- A near-capacity AI attack with a feasible forecast while the same matchup below capacity waits for strength; incoming attacks preventing a new conquest; reinforcing an existing non-depleted attack; and holding reinforcements when defense needs the troops.
- Dispatch allowing reinforcements against the same active target, rejecting a different front, and cancelling a new conquest when an incoming attack appears during validation.
- Selective incoming alliance acceptance, a preserved future opponent, and the commitment cap. The existing naval test confirms allied warships do not block an otherwise clear transport route.
- The bundled panel retaining its timer after blur/visibility changes and still stopping on Escape; a delayed clock in a hidden tab not triggering the ordinary stalled-clock pause.

Upstream source inspected for this revision:

- [GameModeSelector.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/client/GameModeSelector.ts): public FFA list, in-lobby state, and native validateAndJoin gates.
- [SpawnExecution.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/execution/SpawnExecution.ts) and [Util.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/execution/Util.ts): spawn-phase legality, random-spawn handling and radius-four starting patches.
- [AttackExecution.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/execution/AttackExecution.ts): sending a new land attack against the same target merges the outgoing forces, and opposing attacks cancel troops.

These are fixture and bundled-UI tests, not a live multiplayer or full-engine benchmark. Native lobby/spawn compatibility with the deployed game remains unverified. Browser throttling, suspension and sleep remain outside the extension's control. Escape is a game-tab shortcut, not a global desktop shortcut.

## v0.5.0 delayed connection, persistent control and revised combat

79 tests pass after rebuilding the bundle. Earlier tests were updated where the user deliberately changed behavior: connection/clock/match delays remain armed, unregistered commands replan instead of stopping, AI strength no longer inflates defensive reserves, and the Pause UI has been removed.

New coverage includes:

- The actual bundled UI waiting through multiple polls with no immediate inLobby acknowledgement, then taking over the loaded map and spawning. Stop all during the delay still prevents takeover. O no longer pauses a running bot.
- Minor BOT and NATION attacks permitting wilderness and AI expansion without extra defensive reserves.
- An affordable second AI front, preserved primary objective, no third front or mixed human conquest, and reinforcement of an under-strength first offensive.
- Native dispatch independently rechecking the second-front limit during AI pressure.
- Human counterattacks preserving the conquest objective, reducing the send when incoming pressure shrinks during validation, and confirmation through incoming-force reduction even when no outgoing army survives.
- A command that receives no acknowledgement being retired and replanned after cooldown while the controller remains running. Temporary state errors recover on the next successful read.
- Ten eligible baseline economic choices producing six city levels and four income-building levels.
- Defense construction requiring human pressure, the two-level cap, the 300-tick cooldown, and a location covering the attacking human frontier rather than an unrelated border.

Counterattack logic uses the previously inspected official AttackExecution implementation, which cancels opposing forces before merging same-target land attacks. A new attempt to open that source through web retrieval was unavailable; the local source copy from the preceding revision was retained. No live game or new complete upstream-engine match was run for this revision. The tests establish software behavior, not multiplayer performance or guaranteed defensive cancellation under network delay.

## v0.6.0 continuous matches, replenishment and hydrogen strategy

86 tests pass after rebuilding the bundle. New tests cover win/elimination navigation, a single-use next-page resume marker, cancellation during result saving, no departure while alive or spawning, capacity plus replenishment requirements without player mutation, late-game/five-million hydrogen gates, hostile SAM coverage, friendly blast rejection, AI-work exclusion, and the nuclear follow-up target.

Earlier tests were adjusted for the deliberate prioritization change: diplomacy selection is tested directly when AI finishing now precedes offers, and a second AI conquest requires sufficient troops for the first target's estimated remaining territory costs as well as its defending army.

The prior local official source copies support the integration: Main.ts documents game exit navigation to `/`; Config.ts exposes maxTroops and troopIncreaseRate, prices Hydrogen Bomb at 5,000,000 under default rules, and defines its blast radii. A fresh web retrieval of Main.ts was unavailable in this environment. No live game, actual missile interception experiment or full-engine benchmark was performed for this revision. Automated tests do not establish improved multiplayer win rate. The missile's destination being outside SAM coverage does not verify its entire native flight path.

## v0.7.0 ship types, delayed SAMs and recent results

93 tests pass against the rebuilt extension. New coverage includes ignored client unit filters returning trade ships, hostile/allied warship route behavior, trade ships not blocking land offensives as transports, SAM eligibility and actual investment before/after the 900-tick delay, coastal spawn clearance and port access, hard dispatch rejection of AI/unknown alliance targets, sampled territory moments and compact-conquest preference, bounded 1,000-outcome retention, old-backup migration, actual-sample win-rate denominators, and the bundled UI's editable/persisted window.

No live multiplayer match was run for this release. The original trade-ship report was not reproduced against the user's installed client; explicit type validation now guards all typed ship queries and dispatch checks. Tests establish behavior on the included fixtures, not a measured win-rate improvement. The sampled compactness estimate is a preference, not a guarantee of circular territory. The requested Enzo Plays video page exposed no playable video or transcript through the available retrieval, so no gameplay observations from it were incorporated.


## v0.8.0 Enzo transcript review

99 tests pass against the rebuilt extension. New tests check numeric/named terrain compatibility, preference for plains spawns, infrastructure-aware target selection without abandoning the active nation, factory station range/ownership/completion/water gaps, construction fallback for isolated factories, final dispatch rejection after a station is captured, and hydrogen ranking with SAM/friendly-fire rejection. The economy fixture now supplies separate city/factory tiles instead of unrealistically placing them on the same tile. Its 6-city/4-income sequence still passes.

See STRATEGY-REVIEW.md for all three fully reviewed video transcripts, timestamp references, current official source verification, and the limitation that video playback remained buffered. No live multiplayer benchmark was performed.

## v0.9.0 territory rewards

106 tests pass against the rebuilt extension. New coverage checks stronger losing-game rewards, wins always outranking losses, time-weighted territory averages, preservation of pre-defeat peak territory, a fixed map denominator, paused-time exclusion, missing telemetry, unchanged factual win counts, backup validation and migration, completed-match recording through the real observer, and strategy selection learning from territory when every training outcome is a loss.

No live multiplayer benchmark was run. These tests verify reward accounting and variant selection, not a measured increase in win rate.
