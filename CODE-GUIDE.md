# Reading and changing OpenFront Pilot

Start with `src/strategy.js`, especially `choose()`. It reads the current position and returns one proposed action. The controller asks the adapter to check that action again and send it to OpenFront.

Read the files in `src/`, not `pilot.js`. `pilot.js` is the generated copy loaded by the browser extension; rebuilding replaces it.

## Where to find each behavior

| What you want to understand or change | File |
| --- | --- |
| Which action gets priority | [src/strategy.js](src/strategy.js) — `choose()` |
| Thresholds, delays, and default settings | [src/rules.js](src/rules.js) |
| Target selection, counterattacks, reinforcement, combat estimates | [src/strategy/combat.js](src/strategy/combat.js) |
| Alliance offers, acceptance, and renewal | [src/strategy/diplomacy.js](src/strategy/diplomacy.js) |
| Building priorities, emergency spending, and building locations | [src/strategy/construction.js](src/strategy/construction.js) |
| Transport landing candidates | [src/strategy/naval.js](src/strategy/naval.js) |
| Hydrogen targets and nuclear readiness | [src/strategy/nuclear.js](src/strategy/nuclear.js) |
| Spawn locations and nearby-player crowding | [src/strategy/spawn.js](src/strategy/spawn.js) |
| Shared limits on attacks, placement, and crossings | [src/safety.js](src/safety.js) |
| Reading OpenFront and confirming commands | [src/adapter.js](src/adapter.js) |
| Final validation and sending a command | [src/commands.js](src/commands.js) |
| Resolving the game's native command constructors | [src/events.js](src/events.js) |
| Running, stopping, and waiting for acknowledgement | [src/controller.js](src/controller.js) |
| Joining lobbies and moving to the next match | [src/setup.js](src/setup.js), [src/requeue.js](src/requeue.js) |
| Startup, buttons, keyboard shortcuts, and UI updates | [src/main.js](src/main.js) |
| Panel HTML and CSS | [src/panel.js](src/panel.js) |
| Selecting and saving learned strategy variants | [src/learning.js](src/learning.js) |
| Deciding whether a match qualifies for learning | [src/match-learning.js](src/match-learning.js) |
| Territory reward calculation | [src/reward.js](src/reward.js) |

## Follow one decision

1. `main.js` schedules a check every 500 milliseconds while the bot is armed.
2. `controller.step()` checks the match, stop state, and game clock. It waits if an earlier command has not been acknowledged yet.
3. `adapter.snapshot()` collects troops, gold, units, nearby enemies, and map information into a `state` object.
4. `strategy.choose(state, active)` checks its priorities from top to bottom. The first available action is returned.
5. `adapter.execute()` routes that action to `commands.js`, which checks the current game state again. A target may have become an ally or gained troops while planning was in progress.
6. `EventBridge` sends the native event. The controller records the pending command and looks for its result on later checks.

The `active()` callback answers “does this work still belong to the running bot and current match?” Checks after `await` prevent old work from sending commands after Stop or a match change.

## What the names mean

`state` is the collected position. `game` is OpenFront's live game object. `ourPlayer` is its live player object. `enemy` describes one neighboring opponent, and `unit` describes a building, ship, or missile.

Some existing data-field names remain short because they are shared across the project and tests:

| State field | Meaning |
| --- | --- |
| `state.me` | Our live player object |
| `state.cap` | Maximum troop capacity |
| `state.troops`, `state.gold`, `state.tiles` | Current troops, money, and owned tile count |
| `state.own` | Our normalized unit records |
| `state.enemies` | Neighboring hostile players and their shared frontiers |
| `state.incoming`, `state.outgoing` | Active incoming and outgoing attacks |
| `state.allOutgoing` | Outgoing attacks including those returning |
| `state.map.fronts` | Shared borders, including wilderness as owner `0` |
| `state.map.sites`, `state.map.shores` | Sampled building sites and coastal tiles |
| `state.tick` | Current game-clock tick |

`enemy.id` is the game's small numeric player ID; `enemy.playerID` is its string ID used by commands. They are not interchangeable. `enemy.raw` provides the live player object when needed.

`U.city`, `U.defense`, and the other names from `common.js` are constants for OpenFront's unit names.

The strategy keeps a little memory between decisions: `focus` is the current conquest target, `last` holds action timestamps, and `tuning` is the learning variant selected for this match.

## How policies return decisions

A policy returns an action object when it finds something to do, or `null` when it has no proposal. For example:

```js
return {
  kind: 'attack',
  targetID: enemy.playerID,
  tile: enemy.tiles[0],
  troops: troopsToSend,
  reserve: troopsToKeep,
  reason: 'Conquer the nearby nation while preserving reserves.',
};
```

This object is a proposal. The dispatch checks in `commands.js` still have to approve it. `kind: 'wait'` supplies a panel message without sending a game command.

The small methods near the bottom of `Strategy` delegate to the separate policy modules. Keeping these entry points lets policies call each other and lets existing tests substitute a single decision without replacing the entire strategy.

## Make a small change

For a threshold change, first look in `rules.js`. For example, `EARLY_CAPACITY_THRESHOLD` controls when opening-game capacity pressure begins, and `STRUCTURE_DANGER_RADIUS` controls the structure-proximity check. Durations are game ticks unless their name ends in `_MS`. The normal game clock has ten ticks per second.

For a priority change, edit `choose()` carefully: moving an earlier return changes which action wins. For a new condition, find the relevant policy and check whether final dispatch also needs the condition.

After editing, run:

```sh
npm run format
npm run build
npm test
```

Build before testing so the panel tests exercise the current bundle. Reload the extension and refresh OpenFront to use it in the browser. `npm run format:check` checks formatting without changing files.

The original refactor preserved v0.10.0 behavior. The subsequent v0.11.0 strategy changes are documented in `STRATEGY-REVIEW-V11.md`; public entry points and saved-data keys remain stable, with a separate learning context for the new rules. Behavioral tests do not measure live multiplayer win rate.
