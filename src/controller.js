import { COMMAND_CONFIRMATION_TICKS, STALLED_CLOCK_WARNING_MS } from './rules.js';
import { Strategy, DEFAULTS } from './strategy.js';
import { U } from './common.js';
import { coachingState, lesson, coachedTuning, prefersSaving } from './coaching.js';
import { contextKey } from './learning.js';

export class PilotController {
  constructor(adapter, report = () => {}, options = {}, learning = null) {
    this.adapter = adapter;
    this.report = report;
    this.options = { ...DEFAULTS, ...options };
    this.running = false;
    this.epoch = 0;
    this.pending = null;
    this.busy = false;
    this.lastTick = null;
    this.tickTime = 0;
    this.commands = 0;
    this.learning = learning;
    this.stopped = false;
    this.adapter.spendingAllowed = () => this.options.spending !== false;
  }
  observeManual() {
    if (this.observedBridge === this.adapter.bridge) return;
    this.restoreManual?.();
    this.observedBridge = this.adapter.bridge;
    this.restoreManual = this.adapter.bridge?.observeManual?.((kind, event) =>
      this.teach(kind, event),
    );
  }
  teach(kind, event = {}) {
    if (!this.running || this.stopped || !this.options.learning || !this.learning?.store) return;
    // Even actions we cannot imitate (such as diplomacy or manual spawning)
    // make this an assisted game, not an unaided strategy trial.
    if (this.adapter.game) this.learning.assist?.(this.adapter.game);
    const state = coachingState(this.adapter.game);
    if (!state) return;
    const sample = lesson(kind, event, state);
    if (!sample) return;
    const key = contextKey(state.game, this.options) + ':' + state.key;
    const generation = this.learning.generation;
    const accept = () =>
      this.running &&
      !this.stopped &&
      this.adapter.game === state.game &&
      this.options.learning &&
      this.learning.generation === generation;
    // The user has supplied a fresh decision. Discard an older in-flight plan.
    this.epoch++;
    this.pending = null;
    this.adapter.lastMap = null;
    this.learning.assist?.(state.game);
    this.learning.store
      .teach(key, sample, accept)
      .then((saved) => {
        if (saved && accept())
          this.learning.notify(
            'Manual guidance learned: ' +
              sample.label +
              '. Preferences adapt after repeated examples; safety rules still apply.',
          );
      })
      .catch(() => {});
    if (kind === 'build' || kind === 'upgrade') {
      this.learning.store.teach(key, { label: 'spend', value: 1 }, accept).catch(() => {});
    }
  }
  start({ explicit = false } = {}) {
    if (this.stopped && !explicit) return;
    if (this.running) return;
    if (!this.adapter.connect()) {
      this.report({
        status: 'waiting',
        message: 'Join a match, choose a spawn, then press Start.',
      });
      return;
    }
    const same = this.game === this.adapter.game;
    this.game = this.adapter.game;
    this.epoch++;
    this.running = true;
    this.observeManual();
    this.stopped = false;
    this.pending = null;
    this.lastTick = null;
    if (!same || !this.strategy) this.strategy = new Strategy(this.adapter, this.options);
    this.learning?.control(true);
    this.report({ status: 'running', message: 'Pilot started. Waiting for fresh game state.' });
  }
  pause(message = 'Paused. You have control.', interrupted = false) {
    if (this.stopped) return;
    this.learning?.control(false);
    if (interrupted) this.learning?.invalidate(message);
    this.running = false;
    this.epoch++;
    this.pending = null;
    this.report({ status: 'paused', message });
  }
  emergencyStop(message = 'Emergency stop: bot and learning halted. Click Start to resume.') {
    // Revoke command authorization before calling any observer or UI code.
    this.running = false;
    this.stopped = true;
    this.epoch++;
    this.pending = null;
    this.restoreManual?.();
    this.restoreManual = null;
    this.observedBridge = null;
    try {
      this.learning?.abort();
    } catch {
      /* Commands remain stopped even if cleanup fails. */
    }
    this.report({ status: 'stopped', message });
  }
  async step(now = Date.now()) {
    if (this.stopped) return;
    try {
      this.learning?.poll(this.game, this.running, this.options, this.adapter.sameGame(this.game));
    } catch {
      this.learning?.invalidate('Learning could not read the match state.');
    }
    if (this.busy || !this.running) return;
    this.busy = true;
    const epoch = this.epoch,
      active = () => this.running && this.epoch === epoch && this.adapter.sameGame(this.game);
    try {
      if (!this.adapter.sameGame(this.game)) {
        if (this.adapter.connect() && this.adapter.game !== this.game) {
          this.game = this.adapter.game;
          this.epoch++;
          this.pending = null;
          this.lastTick = null;
          this.strategy = new Strategy(this.adapter, this.options);
          this.observeManual();
          this.report({
            status: 'waiting',
            message: 'New match detected; attaching automatically.',
          });
        } else
          this.report({
            status: 'waiting',
            message: 'Waiting for the game connection. Pilot remains armed.',
          });
        return;
      }
      if (this.game.inSpawnPhase?.()) {
        const message = this.adapter.autoSpawn(active);
        if (active()) this.report({ status: 'waiting', message });
        return;
      }
      const state = await this.adapter.snapshot();
      if (!active()) return;
      if (state.inactive) {
        this.report({ status: 'waiting', message: state.inactive + '. Pilot remains armed.' });
        return;
      }
      if (state.tick !== this.lastTick) {
        this.lastTick = state.tick;
        this.tickTime = now;
      } else {
        if (this.adapter.document?.hidden) {
          this.tickTime = now;
          this.report({
            status: 'waiting',
            message: 'Running in background; waiting for fresh game updates.',
          });
          return;
        }
        if (now - this.tickTime > STALLED_CLOCK_WARNING_MS)
          this.report({
            status: 'waiting',
            message: 'Waiting for the game clock to resume. Pilot remains armed.',
          });
        return;
      }
      this.report({ status: 'running', snapshot: state, commands: this.commands });
      if (this.learning) this.strategy.tuning = this.learning.begin(state, this.options);
      this.strategy.saveGold = false;
      if (this.options.learning && this.learning?.store) {
        const view = coachingState(state.game);
        if (view) {
          const key = contextKey(state.game, this.options) + ':' + view.key;
          const stats = this.learning.store.data.coaching.find((r) => r.key === key)?.stats;
          this.strategy.tuning = coachedTuning(this.strategy.tuning, stats);
          // A learned pause is bounded to 30 seconds per context per match.
          this.savingWindows ??= new Map();
          if (this.savingGame !== state.game) {
            this.savingGame = state.game;
            this.savingWindows.clear();
          }
          if (prefersSaving(stats)) {
            if (!this.savingWindows.has(key)) this.savingWindows.set(key, state.tick);
            this.strategy.saveGold = state.tick - this.savingWindows.get(key) < 300;
          }
        }
      }
      this.report({ status: 'running', savingGold: this.strategy.saveGold });
      if (this.pending) {
        if (this.adapter.confirmed(state, this.pending)) {
          this.report({
            status: 'running',
            message: 'Confirmed: ' + this.pending.reason,
            log: true,
          });
          this.pending = null;
        } else if (state.tick - this.pending.at > COMMAND_CONFIRMATION_TICKS) {
          const expired = this.pending;
          this.pending = null;
          this.strategy.record(expired, state.tick);
          this.adapter.lastMap = null;
          this.report({
            status: 'waiting',
            message:
              'Command unconfirmed. Refreshing the position and replanning after cooldown; still running.',
            log: true,
          });
          return;
        } else return;
      }
      this.strategy.options = { ...this.options };
      const action = await this.strategy.choose(state, active);
      if (!active() || !action) return;
      if (action.kind === 'wait') {
        this.report({ status: 'running', message: action.reason });
        return;
      }
      const permitted = () =>
        active() && (action.kind !== 'build' || this.options.spending !== false);
      if (!permitted()) return;
      const sent = await this.adapter.execute(state, action, permitted);
      if (!active()) return;
      if (sent) {
        this.pending = sent;
        this.commands++;
        this.learning?.command();
        this.strategy.record(action, state.tick);
        if ([U.atom, U.hydrogen, U.mirv].includes(action.unit))
          this.strategy.last.set('nuke', state.tick);
        this.report({
          status: 'running',
          message: action.reason,
          log: true,
          commands: this.commands,
        });
      } else {
        if (['alliance', 'reject', 'extend'].includes(action.kind))
          this.strategy.record(action, state.tick);
        this.report({
          status: 'running',
          message: 'Position changed or request unavailable; reconsidering.',
        });
      }
    } catch (error) {
      if (this.epoch === epoch) {
        this.learning?.invalidate('Client state temporarily unavailable.');
        this.report({
          status: 'waiting',
          message:
            (error.message || String(error)) + ' Retrying state checks; pilot remains armed.',
        });
      }
    } finally {
      this.busy = false;
    }
  }
}
