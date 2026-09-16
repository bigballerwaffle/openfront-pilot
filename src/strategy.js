import {
  isNuclearEconomyReady,
  findHydrogenTarget,
  chooseNuclearStrike,
} from './strategy/nuclear.js';
import { chooseLanding } from './strategy/naval.js';
import {
  updateNuclearThreat,
  chooseInvestment,
  distanceToEnemyBorder,
  rankBuildingSites,
} from './strategy/construction.js';
import { chooseDiplomacy } from './strategy/diplomacy.js';
import {
  chooseLandAttack,
  chooseCounterattack,
  chooseReinforcement,
  forecastConquest,
} from './strategy/combat.js';
import { isAI, humanAttacks, earlyCapacity } from './safety.js';
import { U, clamp, friendly } from './common.js';
import { VARIANTS } from './learning.js';

import {
  DEFAULTS,
  PROFILES,
  COOLDOWNS,
  MIN_HUMAN_ATTACK_RATIO,
  NEAR_CAPACITY_THRESHOLD,
  NUCLEAR,
} from './rules.js';
export { DEFAULTS } from './rules.js';

export class Strategy {
  constructor(adapter, options = {}, tuning = VARIANTS[0]) {
    this.adapter = adapter;
    this.options = { ...DEFAULTS, ...options };
    this.last = new Map();
    this.tuning = tuning;
    this.focus = null;
    this.futureOpponent = null;
    this.blast = null;
    this.firstNuclearThreatTick = null;
  }

  // Action history and campaign state persist between decisions in one match.
  cooldown(key, tick, duration) {
    return tick - (this.last.get(key) ?? -1e9) < duration;
  }
  record(a, tick) {
    this.last.set(a.kind, tick);
    if (a.unit === U.hydrogen && a.targetID) {
      this.focus = a.targetID;
      this.blast = { targetID: a.targetID, tick };
    }
    if (a.counter) this.last.set('counter', tick);
    if (['attack', 'boat'].includes(a.kind) && a.targetID != null && !a.counter && !a.secondary)
      this.focus = a.targetID;
    if (['alliance', 'reject', 'extend'].includes(a.kind))
      this.last.set(`diplomacy:${a.targetID}`, tick);
    if (a.unit) this.last.set(a.unit, tick);
    if (a.targetID != null) this.last.set(`target:${a.targetID}`, tick);
  }
  reserves(state) {
    const profile = PROFILES[this.options.profile] ?? PROFILES.balanced;
    const nonBots = state.enemies.filter((enemy) => !isAI(enemy) && enemy.playerID !== this.focus);
    const strongest = Math.max(0, ...nonBots.map((enemy) => enemy.troops));
    const incoming = humanAttacks(state).reduce((sum, a) => sum + a.troops, 0);
    const ratio =
      clamp(profile.reserve + this.tuning.reserve - (nonBots.length ? 0 : 0.06), 0.2, 0.5) +
      (nonBots.length > 1 ? 0.07 : 0) +
      (incoming ? 0.12 : 0);
    return Math.min(
      state.cap * 0.82,
      Math.max(state.cap * ratio, strongest * 0.28, incoming * 0.95),
    );
  }
  syncFocus(state) {
    if (this.focus) {
      const player = state.players.find((player) => player.id() === this.focus);
      // Test/older snapshots can lack the complete player list; only clear a
      // known campaign on positive evidence of defeat or friendship.
      if (player && (!player.isAlive() || friendly(state.me, player))) this.focus = null;
    }
    if (!this.focus) {
      const wave = (state.allOutgoing ?? state.outgoing).find((a) => a.targetID !== 0);
      const enemy = wave && state.enemies.find((enemy) => enemy.id === wave.targetID);
      if (enemy) this.focus = enemy.playerID;
    }
  }
  targetPool(state) {
    if (this.focus) {
      const primary = state.enemies.find((enemy) => enemy.playerID === this.focus);
      const waves = state.allOutgoing ?? state.outgoing;
      if (primary && isAI(primary) && waves.some((a) => a.targetID === primary.id))
        return state.enemies.filter(isAI);
      return primary ? [primary] : [];
    }
    const ai = state.enemies.filter(isAI);
    return ai.length ? ai : state.enemies;
  }
  strengthRatio() {
    // Learning may ask for MORE margin; it cannot abandon concentrated attacks.
    return Math.max(
      MIN_HUMAN_ATTACK_RATIO,
      (PROFILES[this.options.profile] ?? PROFILES.balanced).advantage * this.tuning.advantage,
    );
  }
  async choose(state, active = () => true) {
    // Read top to bottom: the first available action wins. Keep this order when
    // changing individual policies; moving a branch changes gameplay priority.
    this.syncFocus(state);
    this.samReady(state);
    const reserve = this.reserves(state),
      ratio = state.troops / state.cap;
    const humanIncoming = humanAttacks(state);

    // 1. Protect structures immediately; recall troops if reserves are critical.
    const counter = this.counterattack(state);
    if (counter && !this.cooldown('counter', state.tick, COOLDOWNS.counter)) return counter;
    if (
      humanIncoming.length &&
      state.troops < reserve * 0.65 &&
      this.adapter.bridge.supports('cancel')
    ) {
      const retreat = [...state.outgoing].sort((a, b) => b.troops - a.troops)[0];
      if (retreat && !this.cooldown('cancel', state.tick, COOLDOWNS.recall))
        return {
          kind: 'cancel',
          attackID: retreat.id,
          reason: 'Recall troops: reserve is critically low under attack.',
        };
    }
    const reinforcement = this.reinforce(state, reserve);
    const attack = humanIncoming.length ? null : this.attack(state, reserve);

    // 2. Fund defenses under pressure, then revisit flank alliances.
    if (
      this.options.economy &&
      humanIncoming.length &&
      !this.cooldown('build', state.tick, COOLDOWNS.emergencyBuild)
    ) {
      const defense = await this.investment(state, reserve, active, true);
      if (!active()) return null;
      if (defense) return defense;
    }
    if (this.options.diplomacy) {
      const diplomatic = this.diplomacy(state, attack?.targetID);
      if (diplomatic) return diplomatic;
    }
    if (!humanIncoming.length && earlyCapacity(state) && !state.immunized) {
      if (reinforcement && !this.cooldown('attack', state.tick, COOLDOWNS.attack))
        return reinforcement;
      if (attack && !this.cooldown('attack', state.tick, COOLDOWNS.attack)) return attack;
    }
    // 3. Finish committed conquests before routine construction or new fronts.
    if (reinforcement && !this.cooldown('attack', state.tick, COOLDOWNS.reinforcement))
      return reinforcement;
    if (
      attack &&
      attack.targetID === this.focus &&
      isAI(state.enemies.find((enemy) => enemy.playerID === this.focus)) &&
      !state.immunized &&
      !this.cooldown('attack', state.tick, COOLDOWNS.attack)
    )
      return attack;
    if (!humanIncoming.length && this.options.nukes && !state.immunized) {
      if (
        this.blast &&
        (state.own.some((unit) => unit.type === U.hydrogen) ||
          state.tick - this.blast.tick < NUCLEAR.missileObservationTicks)
      )
        return this.wait('Hydrogen strike in flight; wait before committing the invasion.');
      if (this.blast) this.blast = null;
      const strike = await this.nuclear(state, active);
      if (!active()) return null;
      if (strike) return strike;
    }
    if (this.options.economy && !this.cooldown('build', state.tick, COOLDOWNS.routineBuild)) {
      const build = await this.investment(state, reserve, active);
      if (!active()) return null;
      if (build) return build;
    }
    // 4. Recheck attacks after asynchronous construction/nuclear planning.
    if (reinforcement && !this.cooldown('attack', state.tick, COOLDOWNS.reinforcement))
      return reinforcement;
    if (humanIncoming.length)
      return this.wait(
        'Human attack: hold against the push and build useful defenses; counter immediately only to protect structures.',
      );
    if (attack && !state.immunized && !this.cooldown('attack', state.tick, COOLDOWNS.attack))
      return attack;
    const busy =
      (state.allOutgoing ?? state.outgoing).length > 0 ||
      state.own.some((unit) => unit.type === U.transport);
    if (busy)
      return this.wait(
        'Maintain the current target; reinforce when useful without opening a second front.',
      );
    if (state.troops <= reserve + 1000)
      return this.wait(`Rebuilding a concentrated army: ${Math.round(ratio * 100)}% of capacity.`);
    if (state.immunized) return this.wait('Waiting for spawn immunity to end.');
    if (attack && !this.cooldown('attack', state.tick, COOLDOWNS.attack)) return attack;

    // 5. Try a safe landing or nuclear follow-up; otherwise explain the wait.
    if (
      this.options.navy &&
      this.adapter.bridge.supports('boat') &&
      !this.cooldown('boat', state.tick, COOLDOWNS.navalLanding) &&
      (this.focus || !state.enemies.length) &&
      !state.map.fronts.some((f) => f.id === 0)
    ) {
      const boat = await this.landing(state, reserve, active);
      if (!active()) return null;
      if (boat) return boat;
    }
    if (
      this.focus &&
      this.options.nukes &&
      !this.cooldown('nuke', state.tick, COOLDOWNS.nuclearRecheck)
    ) {
      const nuke = await this.nuclear(state, active);
      if (nuke) return nuke;
    }
    if (ratio >= NEAR_CAPACITY_THRESHOLD)
      return this.wait(
        'Army near capacity: no cost-effective attack or safe route found; prioritize capacity and defenses.',
      );
    return this.wait(
      this.focus
        ? 'Keep the conquest target: gathering a larger force or waiting for a safe route.'
        : 'Waiting for enough troops to overwhelm a nearby tribe or nation before targeting players.',
    );
  }
  wait(reason) {
    return { kind: 'wait', reason };
  }

  // Stable entry points for the controller, other policies, and regression tests.
  // The actual decisions live in the named strategy modules imported above.
  attack(state, reserve) {
    return chooseLandAttack(this, state, reserve);
  }
  counterattack(state) {
    return chooseCounterattack(this, state);
  }
  reinforce(state, reserve) {
    return chooseReinforcement(this, state, reserve);
  }
  diplomacy(state, proposed) {
    return chooseDiplomacy(this, state, proposed);
  }
  forecast(state, enemy, budget) {
    return forecastConquest(this, state, enemy, budget);
  }
  samReady(state) {
    return updateNuclearThreat(this, state);
  }
  investment(state, reserve, active, defensiveOnly = false) {
    return chooseInvestment(this, state, reserve, active, defensiveOnly);
  }
  danger(state, tile, humansOnly = false) {
    return distanceToEnemyBorder(this, state, tile, humansOnly);
  }
  sites(state, type) {
    return rankBuildingSites(this, state, type);
  }
  landing(state, reserve, active) {
    return chooseLanding(this, state, reserve, active);
  }
  nuclearEstablished(state) {
    return isNuclearEconomyReady(this, state);
  }
  hydrogenCandidate(state) {
    return findHydrogenTarget(this, state);
  }
  nuclear(state, active) {
    return chooseNuclearStrike(this, state, active);
  }
}
