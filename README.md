# OpenFront Pilot

A browser extension that plays your OpenFront position automatically and learns which of its strategy variants work better across completed games. It runs locally in your game tab; no API key, subscription, or separate server is needed.

## Install in Chrome or Edge

1. Extract **OpenFront-Pilot.zip** to a folder on your computer. Keep the folder after installation.
2. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
3. Enable **Developer mode**.
4. Click **Load unpacked** and choose the **openfront-pilot** folder containing `manifest.json` and `pilot.js`.
5. Open or refresh **https://openfront.io/**.
6. On the OpenFront homepage, click **Start** in the Pilot panel. It joins an available public **Free For All** lobby, selects a starting point with expansion room and a preference for nearby water, and starts playing. If already in a match, Start takes over that position and selects a spawn if needed.

The extension starts paused. Start authorizes continuous play: after a match ends or your spawned player is eliminated, the pilot exits to the homepage and joins the next available public FFA game automatically. It uses the normal game join handler and respects username, trust and update checks. Complete any game prompt if joining is blocked. The bot stays armed while the connection and map load; it does not mistake an unset in-lobby flag for an immediate failure. If no eligible FFA lobby is available, it waits. It stays armed through connection delays, clock stalls, unconfirmed commands and match transitions. Automatic cycling continues until Escape or Stop all. In team games, leaving immediately after your own elimination can mean skipping a learning result because the team outcome is not known yet. You can also enter single-player yourself and press Start there to check the integration.

**O** (the letter O) starts the bot when you are not typing. Pressing O while it is running does nothing. **Escape** and **Stop all** are the only controls that disarm a running bot; the Pause button has been removed. They stop the timer, revoke pending bot work, detach the result observer and cancel learning writes waiting to commit. Click **Start** to resume after stopping; O cannot restart a stopped bot.

**Alt-Tab and changing tabs do not stop it.** Keep the game tab open; closing/reloading the page, browser suspension and computer sleep can still interrupt any page script. Escape works while the game tab has keyboard focus, not system-wide. Stopping does not undo commands already accepted by the game. The panel can be dragged or collapsed.


## Strategy in v0.11.0

This revision follows ten additional Enzo videos reviewed through available transcripts and sampled gameplay scenes. See [the source and implementation notes](STRATEGY-REVIEW-V11.md) for limitations and tactics deliberately not copied.

- **Timely renewals:** renew the soonest-expiring useful flank before handling new offers or rejections, retaining native eligibility and cooldowns.
- **Smaller wilderness boats:** use a 10% foothold (preferred minimum 1,000 troops, bounded by the available budget). Defended landings remain concentrated and crossing checks remain enforced.
- **Connected cities:** favor safe city sites linked to completed own factories through owned land, without relaxing placement clearances or dispersion scoring.

- **Conquest order:** expand into adjacent wilderness; conquer nearby tribes (`BOT`) and nations (`NATION`); only then consider human-player opportunities. If a neighboring AI is too strong, gather troops rather than diverting to an easier human.
- **Finish started AI conquests first:** reinforcement now budgets for remaining territory costs as well as defending troop count. Reinforcing a committed attack and restarting an unfinished primary AI conquest take priority over routine construction and new targets.
- **Up to two AI conquests:** two tribes/nations can be attacked concurrently if the first deployed force remains at least 1.3× its defender's current army and the second attack passes troop/cost checks with reserves intact. No third AI front, mixed AI/human conquests, or parallel transport is opened. Human conquests remain concentrated on one target. Existing offensives can be reinforced; the primary conquest objective is retained while a secondary AI attack runs.
- **More active expansion:** AI attacks do not trigger a defensive hold or inflate reserves, including the small attacks tribes and nations regularly send. AI conquests normally require 1.3× defending troops; human conquests retain the 1.67× ideal. When multiple AI targets are available, the bot sizes sends to the target's army and estimated conquest costs so it can afford a second offensive. At 92% capacity, favorable forecasts can still allow the existing 0.9× AI / 1.05× human fallback. This is a heuristic, not a guarantee that every conquest succeeds.
- **Capacity and replenishment:** a human attack can proceed below the ideal current-army ratio when your troop capacity is at least 35% larger, projected post-send growth exceeds the defender's by at least 15%, and a bounded 60-tick recovery estimate supports the attack. No real troop counts are modified. The advantage is checked again immediately before dispatch; growth forecasts are not guaranteed future reinforcements.
- **Late-game hydrogen plan:** after at least 1,800 game ticks, four completed city levels, three completed income-building levels and no nearby AI opponents, the bot can fund a silo (1.9 million staging balance), then reserve 5 million for a hydrogen bomb. Saving for the bomb requires a known viable target, a completed silo and no active offensive. Human pressure takes precedence over this saving plan. Nuclear strategy must be enabled. Early-game spending follows the normal city/income strategy.
- **Strike then reassess:** prefer enemy land outside the known firing radius of every non-allied SAM, with a 15-tile margin, and reject blast areas containing your or allied territory. A valid default-price hydrogen bomb can launch at 5 million gold, before routine buildings consume the funds. The target becomes the conquest objective; wait through the observed missile flight, then reassess current troops for an invasion. SAMs along the flight path may still intercept the bomb; being outside coverage at the destination does not guarantee arrival or damage. The bot uses the native launch path and does not assume a successful explosion.
- **City/income balance:** the baseline targets approximately **60% city levels and 40% port/factory levels** among these investments. The city/income learning variants adjust that share to 64%/56%; all favor cities. This is a mix of construction/upgrade levels, not a fixed split of gold spending. Site availability, costs and urgent defenses can alter the sequence.
- **Defense before retaliation:** build posts against human pressure totaling at least 3% of troop capacity or 2,000 troops, whichever is larger. Posts must cover an attacking human's frontier; candidate sites are now generated directly behind that frontier. Ordinary pressure retains the two-level limit and 300-tick purchase spacing. A huge push (at least 10,000 troops, 20% of capacity and 45% of your current troops) allows up to six post levels, 30-tick spacing, and spending the full gold balance on posts or city capacity. Routine income and silo spending yield during that emergency. Unfinished construction still limits duplicate purchases.
- **Safer construction:** cities, factories, SAMs and silos require 24 tiles of clearance from other players' territory and 18 from water, including small lakes. Defense posts require 16 from other players and 18 from water, with candidate scoring favoring a setback around 23 tiles from the hostile front. Upgrades must pass the same check. Ports necessarily remain coastal, but retain the border clearance. On narrow islands or cramped territory the bot may postpone building.
- **Continuous flank diplomacy:** reconsider neighboring humans before routine reinforcement throughout the match. A human conquest leaves other meaningful neighboring flanks eligible without the old two-alliance cap. While fighting AI, retain a weaker human expansion option when available. Neighbors with more than 110% of your troop capacity are priority alliance candidates, including when no conquest is selected. Border directions use their sampled average instead of one arbitrary tile. Incoming offers and renewals use the same policy; distant alliances do not fill local slots. Pending requests do not count as confirmed protection. No chat messages are sent. Turn this off with **Protect flanks with alliances**.
- **Transport caution:** prefer wilderness and AI landing targets; allow only short, direct open-water crossings without a currently non-allied warship's firing radius intersecting the crossing, plus a 25-tile margin. Allied and teammate warships are excluded from this threat check. Recheck before launch. Obstructed crossings are skipped. The native pathfinder chooses the actual route; moving warships and later route changes can still endanger a ship.
- **Structure-saving counters:** a human push triggers an immediate counter only when that attacker's current territory is within 28 tiles of an owned structure. This proximity is a threat estimate, not an exact prediction of the attack path. The check runs again before dispatch. Counter sends remain capped at the incoming force and affordable budget, preserve other defensive reserves, and retain the conquest objective. Other pushes are held with reserves and useful defenses. Human pressure still blocks unrelated conquests.
- **Opening capacity and shape:** during the first 6,000 game ticks (ten minutes), 85% troop capacity triggers affordable expansion or reinforcement before routine purchases, permits the forecast-backed attack fallback earlier, and raises city investment priority. An idle conquest focus no longer blocks available wilderness expansion at that threshold. Unsafe attacks remain excluded. Compactness has more influence on target ranking, with shared-frontage scoring for tiny territories missed by regional sampling. Native land attacks target an owner, so the engine still chooses which tiles are conquered.
- Build and upgrade the economy, and optionally use late-game hydrogen strikes before a human conquest. Friendly blast areas and intact SAM coverage remain excluded.
- Revalidate ownership, relations, troop advantage, construction placement, and existing offensives before sending. Non-diplomatic commands wait for acknowledgement. If no acknowledgement appears after 65 game ticks, discard the pending assumption, refresh the map and replan after the command cooldown. This does not resend the old packet blindly or disarm the pilot. Counterattacks can be acknowledged by reduced incoming troops even when no outgoing army remains. Diplomacy is rate-limited without waiting for another player's response.

Choose **Cautious**, **Balanced**, or **Aggressive**. Switches control construction, naval expansion, nuclear strategy, alliances, and learning. Silo construction requires automatic construction. Learning cannot override AI priority, the two-AI/one-human offensive limits, human-only defensive holds, or placement and crossing checks. The capacity fallback is an explicit rule, not a learned exception.

## What this version does not claim

This is an experimental heuristic bot with online strategy tuning. It cannot guarantee a win or become a perfect player just by accumulating matches. It cannot guarantee that alliance offers will be accepted or that allies will remain trustworthy. Spawn scoring is a bounded map sample, not a guarantee of the best starting point. It does not coordinate a team through chat or plan coordinated nuclear salvos. Naval planning uses sampled candidate landing sites; it can miss distant or small islands. Warships use the game's normal autonomous behavior after construction.

The original playing engine was checked against upstream source commit **6d4155392266d9e2de449cde2fc277057f74a782**. The original development simulation used the real OpenFront engine, GameView, PlayerView, command constructors, troop growth, combat, and building executions. That result does not establish a multiplayer win rate or demonstrate an advantage from the new learning system.

**Live openfront.io execution has not been verified in this environment** because its human-verification screen prevented entering a live match. Integration checks withhold incompatible commands while continuing to monitor for valid state; staying armed does not mean issuing commands without usable game data. OpenFront updates may require an extension update.

If the panel says **Cannot identify** or **Unsupported game client**, copy its exact message when reporting the problem. An unconfirmed command triggers fresh planning after a cooldown; no restart is needed. A persistent compatibility error may still require an extension update. If the panel is absent, verify that the extension is enabled and refresh the game page.

## Learning across games

**Learn across games** is enabled by default. Choose your play style and other settings before starting, let the bot play, and keep the game tab open until the result is observed. No training server or API key is needed.

The bot tries seven bounded strategy variants: the baseline balance, larger reserves, earlier attacks, faster expansion, moderately smaller troop sends, earlier cities, and more income before cities. It updates their scores after an eligible win or loss, then uses those scores when selecting a variant for the next match. It continues trying alternatives occasionally, so individual matches can get worse even as evidence accumulates. It does not train a neural network, invent new tactics, or rewrite its code.

The **Learning** section shows learned games, wins, memory usage, the current trial, and variant results for the current match type. A higher observed win rate is evidence from your games, not a controlled comparison: map, opponents, teammates, and spawn quality also affect results. Expect to need many comparable games to find a useful preference.

**What counts as a training result:**

- A recognized native game result, or your elimination in free-for-all. Team games wait for the team result, even if you are eliminated first; keep the tab open.
- At least one bot command and 30 game ticks of bot control, with the bot active for at least 80% of your time alive since the match started.
- No bot settings changes or client compatibility errors during the trial.

Abandoned games, unknown or cancelled results, late takeovers, and substantial manual pauses are skipped. Skipping is shown in the panel and does not count as a loss. Manual actions while the bot is running are not distinguished from its own play, so let it control the position during training. Escape or Stop all excludes the remainder of the current trial from learning; saved results from previous games remain. A completed result is updated only once; the latest 128 match IDs prevent repeat credit across reloads. Replays do not train.

Turning learning off uses the original tuning and retains your saved scores. Turning it off during a match excludes that match from training. Settings changes apply to play immediately; newly learned scores choose a new trial at the next match.

### Memory and backups

There are **no recordings, screenshots, maps, or move-by-move logs** in the saved learning model. It retains aggregate scores for at most 12 match types, the latest 24 tiny result summaries, 128 recent match identifiers, and up to 1,000 win/loss flags. The serialized model has a hard **64 KiB** limit, counting two bytes per stored character; browser bookkeeping is additional. These limits are independent of how many games you play. Least recently used match types are evicted when needed.

Experience is grouped by strategy revision, game type, team/FFA mode, difficulty, standard/custom resource rules, your play style, and your enabled bot features. The learner uses a discounted upper-confidence selection rule: untried variants go first; thereafter it balances estimated reward against uncertainty. Each completed result multiplies existing evidence weights in that context by 0.98, then adds the composite match reward described below to the chosen variant. The code keeps the trial fixed throughout a match. Different maps share experience. Older evidence gradually receives less weight. Summary counters and results are saved in this browser's OpenFront local storage. Clearing site data removes them; different browsers, profiles, and origins keep separate models.

- **Export backup:** download a small JSON copy of the learned scores.
- **Import backup:** restore that copy, replacing the current scores. Imported data is validated before replacement.
- **Reset learning:** clear the scores after confirmation.

Export/import/reset during a trial is handled without modifying game state; import and reset exclude the active trial. If saving fails, the panel reports that changes are only in memory and you can export a backup.

### Updating an existing installation

Update the files in your installed `openfront-pilot` folder. In `chrome://extensions`, click the reload arrow on OpenFront Pilot, then refresh the game tab. The panel should say **v0.11.0**. If you have no installation, follow the installation steps above. Updating extension files preserves learning already saved in the browser. This strategy revision starts separate variant scores so old results do not falsely rate the new rules; existing summaries remain until normal memory limits evict them. Keep only one enabled copy of the extension.

## Automatic setup details

FFA selection reads the homepage's current public FFA list, skips full and inaccessible trusted lobbies, and calls the game's verified `validateAndJoin` handler. It never directly sends a lobby network request. Each join request is followed while connection and map loading complete; Stop all and Escape disarm takeover even if the already-accepted lobby join continues.

Starting points require an unowned, traversable radius-four land patch. Scoring combines terrain, coast access and human spawn density within 100 tiles. During the spawn phase, the bot reassesses every 20 ticks and can move repeatedly when crowding grows, provided another valid patch has fewer nearby humans and a meaningfully lower crowding score. There is no three-attempt limit. Random-spawn, replay and spectator modes are respected; relocation stops when the spawn phase ends or the bot is stopped. If spawn coordinates are unavailable, a confirmed spawn is retained.

### Continuous-match lifecycle

On a confirmed game-over state or elimination of an already-spawned player, the bot first observes/finalizes the available learning result (with a bounded wait), then navigates to `/`, the game's normal exit destination. A one-use resume marker in this tab's session storage expires after two minutes and starts the next FFA entry after the homepage loads. Escape or Stop all removes that permission, including while a result is being saved. Replays, intentional spectator mode, living players and the spawn phase do not trigger cycling. Manual reloads normally start stopped; automatic match-transition reloads resume deliberately.

## Files and development

Start with [CODE-GUIDE.md](CODE-GUIDE.md) for a plain-language reading order, a map of the strategy modules, and examples of how a decision reaches the game. Important policy thresholds live in `src/rules.js`. The readable source is formatted with `npm run format`; `npm run format:check` checks it without editing.

`pilot.js` is the ready-to-run bundled extension. `src/` contains its readable source, split into the adapter, command bridge, strategy, controller, and panel. `tests/` contains behavioral regression tests.

With Node.js 24 or later:

```bash
npm install --ignore-scripts
npm run build
npm test
```

The browser bundle has no external JavaScript dependencies or network client of its own. See `TESTING.md` for the validation performed and its limits.

## Implementation and data

The extension reads the game's `control-panel.game` and `control-panel.eventBus` references in the page's main JavaScript world. It dispatches the same typed events used by the client UI. For learning, a reversible observer wraps GameView.update, calling the original method with unchanged arguments and retaining only the final result and timing counters. It restores the original method after a result or when leaving the match. It does not modify troop counts, prices, combat rules, or the game simulation. Constructor field signatures allow matching the supported command types when production class names are minified; ambiguous matches are rejected.

Settings and bounded learning summaries are saved in this browser's OpenFront local storage. The decision log stays in the current page. The extension itself does not send telemetry or upload match data. Its manifest is limited to `openfront.io` and `www.openfront.io`.

Official source: [OpenFrontIO](https://github.com/openfrontio/OpenFrontIO). Combat, alliance events and transport interfaces were checked in its current source; see TESTING.md.

Independent project; not affiliated with OpenFront. Original extension code is MIT licensed. OpenFront's own source retains its upstream licenses and is not included in this archive.


## v0.7.0: ships, coastal starts, compact conquests and recent win rate

- Ship queries explicitly verify the unit type. Trade Ships cannot be counted as Warships or troop Transports, even if a client returns an unfiltered unit list. Allied warships remain excluded from invasion threats.
- SAM construction and its reserve bank wait **900 game ticks (90 seconds at normal speed)** after an enemy silo is first detected. The timer resets when no enemy silo remains. Normal economy investment continues during this delay.
- Spawn selection favors usable water about 12–24 tiles away, with a full radius-four land patch and broad expansion room. If no suitable coastal location exists, inland candidates remain available. This is a port-access preference, not a guarantee of port profitability.
- AI conquest scoring estimates the shape of the combined territory from bounded public-map samples. It favors filling gaps and avoids long extensions when other costs are comparable. Finishing an existing AI conquest and having sufficient troops still take priority. Native attack expansion controls the exact resulting outline.
- Only explicitly HUMAN players can receive accepted/new/renewed alliances. This restriction is checked again immediately before dispatch; tribes and nations are excluded.
- **Win rate · last games** accepts any number from **1 to 1,000**. It counts completed matches recorded by the learning system, using the actual number of available outcomes as the denominator. Learning-off, interrupted, unobserved, and ineligible games are not included. Existing backups supply their last 24 retained summaries; older discarded outcomes cannot be recovered. New outcomes require only bounded win/loss flags, within the existing 64 KiB model limit. Export/import and reset include these results.

To update: stop the old bot, extract this ZIP over its extension folder, click the extension's Reload button on chrome://extensions or edge://extensions, then refresh OpenFront. The panel should show **v0.8.0**. Escape and Stop all remain the stop controls.

For the v0.7.0 release, Enzo's guide was not accessible. In v0.8.0, the complete transcripts of three videos were reviewed; see STRATEGY-REVIEW.md for sources, timestamps, implementation choices, and playback limitations.


## v0.8.0: lessons from Enzo Plays

- Prefer plains around the spawn while retaining coastal access and expansion room. Protected city/silo sites receive a modest rough-terrain bonus; the inland and border checks still apply.
- Prefer comparably affordable conquests containing accessible completed cities, ports, factories, or silos. Do not abandon a committed AI conquest to chase a new building.
- Place factories within native station range of completed own cities or ports, checking a continuous owned-land connection. Favor locations connecting more station levels. If no suitable connection exists, consider other buildings instead. Recheck the actual build location and station ownership before dispatch.
- Aim late-game hydrogen strikes at more valuable enemy land and infrastructure instead of taking the first valid sampled tile. Preserve all existing friendly-fire, SAM, economy, and follow-up guards.

The default city/income target remains approximately 60/40 where suitable sites exist. No new setup options or extension permissions are needed. The learning model starts fresh strategy comparisons for v0.8.0 while retaining past results for the win-rate display. Update by stopping the bot, replacing the extracted folder, reloading the extension, and refreshing OpenFront.

## v0.9.0 territory rewards

Learning now scores each eligible completed match as **70% win + 20% peak map share + 10% average map share**. Shares range from zero to one. A loss with 50% peak territory and 25% average territory earns 12.5/100; a win earns at least 70/100. Every win scores above every loss, while stronger losing games also provide useful feedback.

Peak and average territory use the map’s original land area as their denominator. Average share is weighted by game time while the bot controls your living player. Simply extending a match at the same share does not increase its reward. Missing territory telemetry gives no territory bonus. Existing eligibility rules still apply; stopping or abandoning a match does not produce a training result.

The Learning panel shows each variant’s mean **Score**, plus the latest match’s reward, peak territory and average territory. The selectable recent win-rate display continues to count actual wins and losses. The learner still chooses among seven bounded variants; these rewards do not guarantee improvement after every game.

This revision starts separate strategy scores because the reward scale changed. Old win/loss history and backups remain usable; territory statistics are not invented for old matches. Only small running aggregates and bounded summaries are stored, with no recordings and the same 64 KiB model limit.
