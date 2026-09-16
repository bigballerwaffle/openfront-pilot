import { COMMAND_CONFIRMATION_TICKS, STALLED_CLOCK_WARNING_MS } from './rules.js';
import { Strategy, DEFAULTS } from './strategy.js';
import { U } from './common.js';

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
      const sent = await this.adapter.execute(state, action, active);
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
