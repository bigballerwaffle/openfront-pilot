import { TerritoryReward, matchReward } from './reward.js';
import { VARIANTS, contextKey, optionsKey } from './learning.js';

// OpenFront's WinnerSchema / GameImpl.makeWinner use client IDs, not player IDs.
export function resultFor(winner, identity) {
  if (!Array.isArray(winner) || winner.length < 2 || typeof winner[1] !== 'string') return null;
  if (winner[0] === 'player') return winner[1] === identity.clientID;
  if (winner[0] === 'team') return winner.slice(2).includes(identity.clientID);
  if (winner[0] === 'nation') return false;
  return null;
}

export function winnerUpdate(updates) {
  if (!updates || typeof updates !== 'object') return null;
  for (const group of Object.values(updates)) {
    if (!Array.isArray(group)) continue;
    for (const update of group) {
      if (update && Object.hasOwn(update, 'winner') && Object.hasOwn(update, 'allPlayersStats'))
        return update;
    }
  }
  return null;
}

// Observe the existing view update after it completes. Arguments, return value,
// thrown errors, and game data are unchanged; observer failures never reach it.
export function observeUpdates(game, callback) {
  if (typeof game.update !== 'function') return null;
  const descriptor = Object.getOwnPropertyDescriptor(game, 'update');
  const original = game.update;
  function wrapped(...args) {
    const result = Reflect.apply(original, this, args);
    try {
      callback(args[0]);
    } catch {
      /* Never interrupt a game update. */
    }
    return result;
  }
  try {
    game.update = wrapped;
  } catch {
    return null;
  }
  if (game.update !== wrapped) return null;
  return () => {
    if (game.update !== wrapped) return;
    if (descriptor) Object.defineProperty(game, 'update', descriptor);
    else delete game.update;
  };
}

export class MatchLearning {
  constructor(store, onChange = () => {}) {
    this.store = store;
    this.onChange = onChange;
    this.run = null;
    this.seenGames = new WeakSet();
    this.assistedGames = new WeakSet();
    this.message = 'Learning is ready. Start a match to collect a result.';
    this.lastSave = Promise.resolve();
    this.generation = 0;
  }
  info() {
    return {
      ...this.store.summary(this.run?.context),
      message: this.message,
      variant: this.run?.variant.name ?? null,
      active: Boolean(this.run && !this.run.done),
    };
  }
  notify(message) {
    if (message) this.message = message;
    this.onChange(this.info());
  }
  begin(s, options) {
    if (this.run?.game === s.game) return options.learning ? this.run.variant : VARIANTS[0];
    if (this.run && !this.run.done) this.finish(null, 'Match left before a result was observed.');
    if (!options.learning || this.seenGames.has(s.game)) return VARIANTS[0];
    const g = s.game,
      me = s.me;
    const gameID = g.gameID?.(),
      clientID = me.clientID?.();
    if (
      typeof gameID !== 'string' ||
      typeof clientID !== 'string' ||
      !Number.isFinite(g.ticksSinceStart?.())
    ) {
      this.notify('Learning unavailable: this client does not expose match identity and timing.');
      return VARIANTS[0];
    }
    const context = contextKey(g, options),
      variant = this.store.select(context);
    const run = {
      game: g,
      context,
      variant,
      id: `${gameID}:${clientID}`,
      identity: { clientID, team: me.team?.() ?? null },
      options: optionsKey(options),
      lastTick: s.tick,
      totalTicks: Math.max(0, g.ticksSinceStart()),
      territory: new TerritoryReward(g, me),
      botTicks: 0,
      commands: 0,
      wasAlive: true,
      running: true,
      done: false,
      excluded: '',
      assisted: this.assistedGames.has(g) || options.spending === false,
      restore: null,
    };
    if (run.id.length > 100) {
      this.notify('Learning unavailable: unsupported match identifier.');
      return VARIANTS[0];
    }
    this.run = run;
    this.seenGames.add(g);
    run.restore = observeUpdates(g, (update) => this.inspect(update));
    if (!run.restore) run.excluded = 'Cannot observe the match result reliably in this client.';
    this.notify(
      run.excluded ||
        `Trying ${variant.name.toLowerCase()}. Learning updates when the result is known.`,
    );
    return variant;
  }
  advance() {
    const r = this.run;
    if (!r || r.done) return;
    const tick = r.game.ticks();
    if (!Number.isFinite(tick) || tick < r.lastTick) {
      this.invalidate('Game clock changed unexpectedly.');
      return;
    }
    const delta = tick - r.lastTick;
    r.territory.observe(r.game.myPlayer(), delta, r.running && r.wasAlive);
    if (r.wasAlive) {
      r.totalTicks += delta;
      if (r.running) r.botTicks += delta;
    }
    r.lastTick = tick;
    r.wasAlive = Boolean(r.game.myPlayer()?.isAlive());
  }
  inspect(update) {
    const r = this.run;
    if (!r || r.done) return;
    try {
      this.advance();
      if (r.game.gameOver?.()) {
        const win = winnerUpdate(update?.updates ?? r.game.updatesSinceLastTick?.());
        this.finish(
          win ? resultFor(win.winner, r.identity) : null,
          win ? 'The game ended without a recognized winner.' : 'The final result was unavailable.',
        );
      } else if (!r.wasAlive && r.identity.team === null) {
        this.finish(false);
      }
    } catch {
      this.invalidate('Could not read the match result.');
    }
  }
  poll(game, running, options, sameGame = true) {
    const r = this.run;
    if (!r || r.done) return;
    this.inspect();
    if (r.done) return;
    if (!sameGame || game !== r.game) {
      this.finish(null, 'Match left before a result was observed.');
      return;
    }
    if (optionsKey(options) !== r.options) this.invalidate('Settings changed during this match.');
    r.running = running;
  }
  control(running) {
    this.advance();
    if (this.run && !this.run.done) this.run.running = running;
  }
  command() {
    if (this.run && !this.run.done) this.run.commands++;
  }
  assist(game = this.run?.game) {
    if (game) this.assistedGames.add(game);
    if (this.run?.game === game && !this.run.done) this.run.assisted = true;
  }
  invalidate(reason) {
    if (!this.run || this.run.done || this.run.excluded) return;
    this.run.excluded = reason;
    this.notify(`This match will be skipped: ${reason}`);
  }
  finish(win, reason = 'No reliable result was observed.') {
    const r = this.run;
    if (!r || r.done) return this.lastSave;
    r.done = true;
    r.restore?.();
    const coverage = Math.min(1, r.botTicks / Math.max(1, r.totalTicks));
    const excluded =
      r.excluded ||
      (win === null ? reason : '') ||
      (r.botTicks < 30 || r.commands < 1 ? 'Not enough bot play to evaluate.' : '') ||
      (coverage < 0.8 ? 'The bot controlled less than 80% of your time alive.' : '');
    if (excluded) {
      this.notify(`No learning update: ${excluded}`);
      return this.lastSave;
    }
    const territory = r.territory.summary();
    const reward = matchReward(win, territory);
    const summary = {
      reward,
      territory,
      id: r.id,
      context: r.assisted ? r.context + '|assisted' : r.context,
      assisted: r.assisted === true,
      variant: r.variant.id,
      win,
      ticks: r.totalTicks,
      commands: r.commands,
      coverage,
    };
    const generation = this.generation;
    const accept = () => this.generation === generation;
    this.lastSave = this.store
      .record(summary, accept)
      .then((saved) => {
        if (!accept()) return;
        this.notify(
          saved
            ? `${r.assisted ? 'Assisted ' : ''}${win ? 'win' : 'loss'} learned · reward ${(reward * 100).toFixed(1)}/100${territory ? ` · peak land ${(territory.peakShare * 100).toFixed(1)}%` : ' · territory unavailable'}.`
            : 'This match was already learned; it was not counted twice.',
        );
      })
      .catch(() => {
        if (accept()) this.notify('The result could not be saved. Previous learning is preserved.');
      });
    return this.lastSave;
  }
  abort() {
    this.generation++;
    const r = this.run;
    if (r) {
      r.done = true;
      r.running = false;
      r.excluded = 'Emergency stop.';
      r.restore?.();
      r.restore = null;
    }
    this.notify('Learning stopped. This match will not produce another learning update.');
  }
  close() {
    this.inspect();
    return this.finish(null, 'Page closed before the result was observed.');
  }
}
