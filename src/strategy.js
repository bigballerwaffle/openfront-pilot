import { captureValue, factoryConnections, strikeValue, terrainRank } from './opportunities.js';
import { compactnessScore } from './geometry.js';
import { isHuman, isAI, safePlacement, safeCrossing, coastalTile, humanAttacks, lookupPlayer, landFrontAllowed, defenseUseful, growthAdvantage, structureThreatened, earlyCapacity } from './safety.js';
import { unitsOf, U, STRUCTURES, sample, clamp, friendly, number } from './common.js';
import { VARIANTS } from './learning.js';

export const DEFAULTS = Object.freeze({ profile: 'balanced', economy: true, navy: true, nukes: true, learning: true, diplomacy: true });
const PROFILES = {
  cautious: { reserve: 0.38, advantage: 1.85 },
  balanced: { reserve: 0.30, advantage: 1.67 },
  aggressive: { reserve: 0.24, advantage: 1.67 }
};

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
  cooldown(key, tick, duration) { return tick - (this.last.get(key) ?? -1e9) < duration; }
  record(a, tick) {
    this.last.set(a.kind, tick);
    if (a.unit === U.hydrogen && a.targetID) { this.focus = a.targetID; this.blast = { targetID: a.targetID, tick }; }
    if (a.counter) this.last.set('counter', tick);
    if (['attack', 'boat'].includes(a.kind) && a.targetID != null && !a.counter && !a.secondary) this.focus = a.targetID;
    if (['alliance', 'reject', 'extend'].includes(a.kind)) this.last.set(`diplomacy:${a.targetID}`, tick);
    if (a.unit) this.last.set(a.unit, tick);
    if (a.targetID != null) this.last.set(`target:${a.targetID}`, tick);
  }
  reserves(s) {
    const p = PROFILES[this.options.profile] ?? PROFILES.balanced;
    const nonBots = s.enemies.filter(e => !isAI(e) && e.playerID !== this.focus);
    const strongest = Math.max(0, ...nonBots.map(e => e.troops));
    const incoming = humanAttacks(s).reduce((sum, a) => sum + a.troops, 0);
    const ratio = clamp(p.reserve + this.tuning.reserve - (nonBots.length ? 0 : .06), .20, .50)
      + (nonBots.length > 1 ? 0.07 : 0) + (incoming ? 0.12 : 0);
    return Math.min(s.cap * 0.82, Math.max(s.cap * ratio, strongest * 0.28, incoming * 0.95));
  }
  syncFocus(s) {
    if (this.focus) {
      const p = s.players.find(p => p.id() === this.focus);
      // Test/older snapshots can lack the complete player list; only clear a
      // known campaign on positive evidence of defeat or friendship.
      if (p && (!p.isAlive() || friendly(s.me, p))) this.focus = null;
    }
    if (!this.focus) {
      const wave = (s.allOutgoing ?? s.outgoing).find(a => a.targetID !== 0);
      const e = wave && s.enemies.find(e => e.id === wave.targetID);
      if (e) this.focus = e.playerID;
    }
  }
  targetPool(s) {
    if (this.focus) {
      const primary = s.enemies.find(e => e.playerID === this.focus);
      const waves = s.allOutgoing ?? s.outgoing;
      if (primary && isAI(primary) && waves.some(a => a.targetID === primary.id)) return s.enemies.filter(isAI);
      return primary ? [primary] : [];
    }
    const ai = s.enemies.filter(isAI);
    return ai.length ? ai : s.enemies;
  }
  strengthRatio() {
    // Learning may ask for MORE margin; it cannot abandon concentrated attacks.
    return Math.max(1.67, (PROFILES[this.options.profile] ?? PROFILES.balanced).advantage * this.tuning.advantage);
  }
  async choose(s, active = () => true) {
    this.syncFocus(s);
    this.samReady(s);
    const reserve = this.reserves(s), ratio = s.troops / s.cap;
    const humanIncoming = humanAttacks(s);
    const counter = this.counterattack(s);
    if (counter && !this.cooldown('counter', s.tick, 12)) return counter;
    if (humanIncoming.length && s.troops < reserve * 0.65 && this.adapter.bridge.supports('cancel')) {
      const retreat = [...s.outgoing].sort((a, b) => b.troops - a.troops)[0];
      if (retreat && !this.cooldown('cancel', s.tick, 20)) return {
        kind: 'cancel', attackID: retreat.id, reason: 'Recall troops: reserve is critically low under attack.'
      };
    }
    const reinforcement = this.reinforce(s, reserve);
    const attack = humanIncoming.length ? null : this.attack(s, reserve);
    // Revisit flank protection throughout a campaign, before routine reinforcement.
    if (this.options.economy && humanIncoming.length && !this.cooldown('build', s.tick, 10)) {
      const defense = await this.investment(s, reserve, active, true);
      if (!active()) return null;
      if (defense) return defense;
    }
    if (this.options.diplomacy) {
      const diplomatic = this.diplomacy(s, attack?.targetID);
      if (diplomatic) return diplomatic;
    }
    if (!humanIncoming.length && earlyCapacity(s) && !s.immunized) {
      if (reinforcement && !this.cooldown('attack', s.tick, 12)) return reinforcement;
      if (attack && !this.cooldown('attack', s.tick, 12)) return attack;
    }
    // Finish committed AI work before spending on routine buildings or opening another front.
    if (reinforcement && !this.cooldown('attack', s.tick, 20)) return reinforcement;
    if (attack && attack.targetID === this.focus && isAI(s.enemies.find(e => e.playerID === this.focus))
      && !s.immunized && !this.cooldown('attack', s.tick, 12)) return attack;
    if (!humanIncoming.length && this.options.nukes && !s.immunized) {
      if (this.blast && (s.own.some(u => u.type === U.hydrogen) || s.tick - this.blast.tick < 40))
        return this.wait('Hydrogen strike in flight; wait before committing the invasion.');
      if (this.blast) this.blast = null;
      const strike = await this.nuclear(s, active);
      if (!active()) return null;
      if (strike) return strike;
    }
    if (this.options.economy && !this.cooldown('build', s.tick, 25)) {
      const build = await this.investment(s, reserve, active);
      if (!active()) return null;
      if (build) return build;
    }
    if (reinforcement && !this.cooldown('attack', s.tick, 20)) return reinforcement;
    if (humanIncoming.length) return this.wait('Human attack: hold against the push and build useful defenses; counter immediately only to protect structures.');
    if (attack && !s.immunized && !this.cooldown('attack', s.tick, 12)) return attack;
    const busy = (s.allOutgoing ?? s.outgoing).length > 0 || s.own.some(u => u.type === U.transport);
    if (busy) return this.wait('Maintain the current target; reinforce when useful without opening a second front.');
    if (s.troops <= reserve + 1000) return this.wait(`Rebuilding a concentrated army: ${Math.round(ratio * 100)}% of capacity.`);
    if (s.immunized) return this.wait('Waiting for spawn immunity to end.');
    if (attack && !this.cooldown('attack', s.tick, 12)) return attack;
    if (this.options.navy && this.adapter.bridge.supports('boat') && !this.cooldown('boat', s.tick, 180)
      && (this.focus || !s.enemies.length) && !s.map.fronts.some(f => f.id === 0)) {
      const boat = await this.landing(s, reserve, active);
      if (!active()) return null;
      if (boat) return boat;
    }
    if (this.focus && this.options.nukes && !this.cooldown('nuke', s.tick, 150)) {
      const nuke = await this.nuclear(s, active);
      if (nuke) return nuke;
    }
    if (ratio >= .92) return this.wait('Army near capacity: no cost-effective attack or safe route found; prioritize capacity and defenses.');
    return this.wait(this.focus ? 'Keep the conquest target: gathering a larger force or waiting for a safe route.'
      : 'Waiting for enough troops to overwhelm a nearby tribe or nation before targeting players.');
  }
  wait(reason) { return { kind: 'wait', reason }; }
  attack(s, reserve) {
    if (humanAttacks(s).length || s.own.some(u => u.type === U.transport)) return null;
    const budget = Math.min(s.troops - reserve, s.troops * this.tuning.attack);
    const neutral = s.map.fronts.find(f => f.id === 0);
    if ((!this.focus || earlyCapacity(s)) && neutral && landFrontAllowed(s, 0) && budget > Math.max(1200, s.cap * 0.035)) {
      const troops = Math.floor(Math.min(budget, s.troops * this.tuning.neutral));
      return { kind: 'attack', targetID: null, tile: neutral.tiles[0], troops, reserve,
        reason: 'Opening expansion: capture wilderness before starting the next conquest.' };
    }
    const candidates = [];
    for (const e of this.targetPool(s)) {
      if (!landFrontAllowed(s, e.id)) continue;
      const waves = s.allOutgoing ?? s.outgoing;
      // Open the second AI front only while the first remains well supplied.
      if (waves.some(a => {
        const other = s.enemies.find(e => e.id === a.targetID);
        return !other || a.troops < other.troops * 1.3;
      })) continue;
      const ideal = isAI(e) ? 1.3 : this.strengthRatio();
      if (budget < 2500) continue;
      const forecast = this.forecast(s, e, budget);
      let minRatio = ideal;
      // At capacity the ideal casualty ratio may be unattainable. Permit a
      // measured attack only if the forecast promises meaningful progress.
      if ((s.troops / s.cap >= .92 || earlyCapacity(s)) && forecast
        && forecast.gain >= Math.min(e.area, Math.max(120, e.area * .35))) minRatio = isAI(e) ? .9 : 1.05;
      const growth = !isAI(e) && forecast && forecast.gain >= Math.min(e.area, 120) && growthAdvantage(s, e, budget);
      if (growth) minRatio = Math.min(minRatio, .85);
      if (budget < e.troops * minRatio) continue;
      if (!forecast || forecast.gain < Math.min(60, e.area * 0.2)) continue;
      const finish = forecast.gain >= e.area ? 3 : 1;
      const score = forecast.gain / Math.max(100, forecast.loss) * 2500 * finish + (e.traitor ? 12 : 0) + compactnessScore(s, e) * 3 + captureValue(s, e, forecast);
      let troops = budget;
      if (isAI(e) && s.enemies.filter(isAI).length >= 2 && forecast.gain > 0) {
        troops = Math.min(budget, Math.max(2500, e.troops * minRatio, e.area * forecast.loss / forecast.gain / .55));
      }
      candidates.push({ kind: 'attack', targetID: e.playerID, tile: e.tiles[0],
        troops: Math.min(Math.floor(budget), Math.ceil(troops)), reserve, minRatio, score, growth: Boolean(growth), aiPolicy: isAI(e), secondary: waves.length > 0,
        reason: `${waves.length ? 'Second AI conquest' : this.focus ? 'Finish' : 'Conquer'} ${e.name}: ${(troops / Math.max(1, e.troops)).toFixed(1)}× defending troops; preserve reserves.` });
    }
    return candidates.sort((a, b) => b.score - a.score)[0] ?? null;
  }
  counterattack(s) {
    if (s.immunized) return null;
    const attacks = humanAttacks(s), totals = new Map();
    for (const a of attacks) totals.set(a.attackerID, (totals.get(a.attackerID) ?? 0) + a.troops);
    for (const [id, incoming] of [...totals].sort((a, b) => b[1] - a[1])) {
      const enemy = s.enemies.find(e => e.id === id);
      if (!enemy || isAI(enemy) || !enemy.tiles.length) continue;
      if (!structureThreatened(s, id)) continue;
      const other = attacks.filter(a => a.attackerID !== id).reduce((n, a) => n + a.troops, 0);
      const reserve = Math.max(s.cap * .18, other * 1.15);
      const troops = Math.floor(Math.min(incoming, s.troops * .72, s.troops - reserve));
      if (!Number.isFinite(troops) || troops < 100) continue;
      return { kind: 'attack', targetID: enemy.playerID, tile: enemy.tiles[0], troops, reserve,
        counter: true, minRatio: 0,
        reason: `Counter ${enemy.name}: cancel up to ${troops.toLocaleString()} incoming troops${troops < incoming ? '; partial cancellation' : ''}.` };
    }
    return null;
  }
  reinforce(s, reserve) {
    const waves = s.allOutgoing ?? s.outgoing;
    const ids = [...new Set(waves.map(a => a.targetID))];
    const choices = ids.map(id => {
      if (!landFrontAllowed(s, id, true)) return null;
      const enemy = s.enemies.find(e => e.id === id);
      const neutral = id === 0 ? s.map.fronts.find(f => f.id === 0) : null;
      if (!enemy && !neutral) return null;
      const committed = waves.filter(a => a.targetID === id).reduce((n, a) => n + a.troops, 0);
      let ideal = enemy ? enemy.troops * (isAI(enemy) ? 1.3 : this.strengthRatio()) : s.cap * .15;
      if (enemy && isAI(enemy)) {
        const estimate = this.forecast(s, enemy, Math.max(committed, s.troops - reserve));
        if (estimate?.gain > 0) ideal = Math.max(ideal, enemy.area * estimate.loss / estimate.gain / .65);
      }
      return { enemy, neutral, committed, ideal, deficit: ideal - committed };
    }).filter(Boolean).sort((a, b) => b.deficit - a.deficit);
    const choice = choices[0]; if (!choice) return null;
    const { enemy, neutral, ideal, committed } = choice, capped = s.troops / s.cap >= .92 || earlyCapacity(s);
    if (!capped && committed >= ideal) return null;
    const incoming = humanAttacks(s).reduce((n, a) => n + a.troops, 0);
    reserve = Math.max(reserve, incoming ? s.cap * .25 + incoming * 1.25 : 0);
    const available = Math.min(s.troops - reserve, s.troops * this.tuning.attack);
    const troops = Math.floor(Math.min(available, Math.max(ideal - committed, capped ? s.troops * .25 : 0)));
    if (!Number.isFinite(troops) || troops < Math.max(200, s.cap * .005)) return null;
    return { kind: 'attack', targetID: enemy?.playerID ?? null, tile: (enemy ?? neutral).tiles[0],
      troops, reserve, reinforce: true, minRatio: 0, secondary: enemy && this.focus !== enemy.playerID,
      reason: `Reinforce ${enemy?.name ?? 'wilderness expansion'} with ${troops.toLocaleString()} troops.` };
  }
  diplomacy(s, proposed) {
    if (s.config.disableAlliances?.()) return null;
    const fronts = s.map.fronts.filter(f => f.id !== 0);
    const humans = s.players.filter(p => isHuman(p) && p.id() !== s.me.id() && p.isAlive()
      && (fronts.some(f => f.id === p.smallID()) || s.enemies.some(e => e.playerID === p.id())));
    const target = this.focus ?? proposed ?? this.targetPool(s).filter(isAI).sort((a, b) => a.troops - b.troops)[0]?.playerID;
    const stronger = p => {
      try { return s.config.maxTroops(p) > s.cap * 1.10; } catch { return false; }
    };
    // The current human conquest already supplies an expansion route. While
    // fighting AI, keep a weaker human available only when one actually exists.
    const humanTarget = humans.some(p => p.id() === target);
    const future = humanTarget ? null : humans.filter(p => p.id() !== target && !friendly(s.me, p)
      && !stronger(p) && !s.me.isRequestingAllianceWith?.(p)).sort((a, b) => a.troops() - b.troops())[0];
    this.futureOpponent = future?.id() ?? null;
    const focus = s.enemies.find(e => e.playerID === target), center = s.map.center;
    const offAxis = p => {
      const front = s.enemies.find(e => e.playerID === p.id()) ?? fronts.find(f => f.id === p.smallID());
      if (!focus || !front || !center) return 0;
      const vector = f => {
        const points = f.border?.length ? f.border : f.tiles;
        return { x: points.reduce((n, t) => n + s.game.x(t), 0) / points.length - center.x,
          y: points.reduce((n, t) => n + s.game.y(t), 0) / points.length - center.y };
      };
      const a = vector(focus), b = vector(front);
      return 1 - (a.x * b.x + a.y * b.y) / Math.max(1, Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y));
    };
    const limit = Math.max(0, humans.length - (humanTarget || future ? 1 : 0));
    const eligible = humans.filter(p => p.id() !== target && p.id() !== this.futureOpponent
      && (stronger(p) || humanTarget || !focus || offAxis(p) >= .35)
      && (stronger(p) || p.troops() >= s.troops * .15
        || (fronts.find(f => f.id === p.smallID())?.count ?? s.enemies.find(e => e.playerID === p.id())?.count ?? 0) >= 6))
      .sort((a, b) => Number(stronger(b)) - Number(stronger(a)) || offAxis(b) - offAxis(a) || b.troops() - a.troops()).slice(0, limit);
    const wanted = new Set(eligible.map(p => p.id()));
    const occupied = humans.filter(p => p.id() !== target
      && (friendly(s.me, p) || s.me.isRequestingAllianceWith?.(p))).length;
    const room = p => friendly(s.me, p) || s.me.isRequestingAllianceWith?.(p) || occupied < limit;
    for (const p of s.players) {
      if (!p.isRequestingAllianceWith?.(s.me) || this.cooldown(`diplomacy:${p.id()}`, s.tick, 80)) continue;
      const kind = wanted.has(p.id()) && room(p) ? 'alliance' : 'reject';
      if (this.adapter.bridge.supports(kind)) return { kind, targetID: p.id(),
        reason: kind === 'reject' ? `Decline ${p.name()}: preserve expansion options and limit alliances.` : `Accept ${p.name()}: useful protection on another flank.` };
    }
    if (this.cooldown('alliance', s.tick, 25) || this.cooldown('extend', s.tick, 25)) return null;
    if (this.adapter.bridge.supports('extend')) for (const a of s.me.alliances?.() ?? []) {
      if (!wanted.has(a.other) || a.expiresAt - s.tick > (s.config.allianceExtensionPromptOffset?.() ?? 300)
        || this.cooldown(`diplomacy:${a.other}`, s.tick, 120)) continue;
      return { kind: 'extend', targetID: a.other, reason: 'Extend a useful flank alliance; let unnecessary alliances expire.' };
    }
    if (!this.adapter.bridge.supports('alliance') || occupied >= limit) return null;
    const p = eligible.find(p => !friendly(s.me, p) && !s.me.isRequestingAllianceWith?.(p)
      && !this.cooldown(`diplomacy:${p.id()}`, s.tick, 300));
    return p ? { kind: 'alliance', targetID: p.id(), reason: `Offer ${p.name()} a flank alliance while preserving a future opponent.` } : null;
  }
  forecast(s, enemy, budget) {
    const g = s.game;
    const defenses = s.hostileUnits.filter(u => u.owner === enemy.id && u.type === U.defense && !u.building);
    const radius = s.config.defensePostRange?.() ?? 30;
    let totalLoss = 0, fraction = 0, n = 0;
    for (const tile of sample(enemy.tiles, 8)) {
      const defended = defenses.some(u => g.euclideanDistSquared(tile, u.tile) <= radius * radius);
      let loss, f;
      if (s.config.attackLogic?.length === 1) {
        const result = s.config.attackLogic({ terrain: g.terrainType(tile), attackTroops: budget,
          attacker: { type: s.me.type(), numTiles: s.tiles },
          defender: { type: enemy.type, numTiles: Math.max(1, enemy.area), troops: enemy.troops,
            isTraitor: enemy.traitor, isDisconnectedTeammate: false },
          defenderHasDefensePost: defended, falloutRatio: g.hasFallout?.(tile) ? 0 : null,
          borderSize: Math.max(1, enemy.count) });
        loss = result.attackerTroopLoss; f = result.tickFraction;
      } else {
        // Conservative fallback for older clients with a different attackLogic signature.
        const terrain = terrainRank(g.terrainType?.(tile));
        const rough = terrain === 2 ? 1.6 : terrain === 1 ? 1.3 : 1;
        loss = (20 + enemy.troops / Math.max(1, enemy.area) * 1.5) * rough * (defended ? 5 : 1)
          * clamp(enemy.troops / budget, 0.6, 2) * (enemy.type === 'BOT' ? 0.5 : 1);
        f = 0.3 * rough * (defended ? 3 : 1) / Math.max(1, enemy.count);
      }
      if (!Number.isFinite(loss) || !Number.isFinite(f) || loss < 0 || f <= 0) return null;
      totalLoss += loss; fraction += f; n++;
    }
    if (!n) return null;
    const loss = totalLoss / n, tickFraction = fraction / n;
    const gain = Math.min(enemy.area, budget * 0.70 / Math.max(1, loss));
    return { gain, loss: gain * loss };
  }
  samReady(s) {
    if (!s.hostileUnits.some(u => u.type === U.silo)) {
      this.firstNuclearThreatTick = null; return false;
    }
    this.firstNuclearThreatTick ??= s.tick;
    // Normal game clock: ten ticks/second. Background tab timing cannot skip this delay.
    return s.tick - this.firstNuclearThreatTick >= 900;
  }
  async investment(s, reserve, active, defensiveOnly = false) {
    if (s.gold < 100000 || s.tiles < 250) return null;
    const count = type => s.own.filter(u => u.type === type).reduce((a, u) => a + u.level, 0);
    const cities = count(U.city), economy = count(U.port) + count(U.factory);
    const nuclearThreat = this.samReady(s);
    const threatened = humanAttacks(s).length > 0;
    const humanPressure = humanAttacks(s).reduce((n, a) => n + a.troops, 0);
    const huge = humanPressure >= Math.max(10000, s.cap * .20, s.troops * .45);
    const preferCity = cities + economy === 0 || cities / (cities + economy) < (this.tuning.city ?? .6);
    const types = [];
    if (humanPressure >= Math.max(2000, s.cap * .03) && count(U.defense) < (huge ? 6 : 2) && !this.cooldown(U.defense, s.tick, huge ? 30 : 300)) types.push([U.defense, 150]);
    if (nuclearThreat && cities >= 2 && count(U.sam) < Math.max(2, Math.ceil(cities / 3))) types.push([U.sam, 110]);
    types.push([U.city, earlyCapacity(s) || huge ? 120 : preferCity ? 100 : 65]);
    if (s.map.shores.length) types.push([U.port, preferCity ? 65 : 100]);
    types.push([U.factory, s.map.shores.length ? 32 : preferCity ? 65 : 100]);
    if (this.options.navy && count(U.port) && s.gold > 450000 && count(U.warship) < Math.min(3, count(U.port))) {
      types.push([U.warship, s.hostileUnits.some(u => u.type === U.transport) ? 95 : 48]);
    }
    if (this.options.nukes && economy >= 3 && cities >= 3 && !count(U.silo) && s.gold >= 1900000) types.push([U.silo, 78]);
    const savingHydrogen = !threatened && !earlyCapacity(s) && this.hydrogenCandidate(s) !== null;
    const savingSilo = !threatened && !earlyCapacity(s) && this.nuclearEstablished(s) && !s.own.some(u => u.type === U.silo && !u.building);
    const nuclearFund = savingHydrogen ? 5000000 : savingSilo ? 1900000 : 0;
    const bank = huge ? 0 : nuclearThreat && !count(U.sam) ? 100000 : threatened ? 50000 : 0;
    for (const [type] of types.sort((a, b) => b[1] - a[1])) {
      if ((defensiveOnly || huge) && type !== U.defense && !(huge && type === U.city)) continue;
      if (!active()) return null;
      if (this.cooldown(type, s.tick, huge ? 30 : 40) || s.config.isUnitDisabled?.(type)) continue;
      // Allow at most one unfinished building of each type.
      if (s.own.some(u => u.type === type && u.building)) continue;
      const sites = this.sites(s, type);
      for (const tile of sites.slice(0, 16)) {
        if (!active()) return null;
        if (type === U.factory && factoryConnections(s, tile) === 0) continue;
        const option = await this.adapter.buildOption(s, type, tile);
        if (!option || number(option.cost) + (nuclearFund && type !== U.silo ? Math.max(bank, nuclearFund) : bank) > s.gold) continue;
        const upgrading = option.canUpgrade !== false;
        const actualTile = upgrading ? s.game.unit(option.canUpgrade)?.tile() : option.canBuild;
        if (actualTile === false || actualTile === undefined) continue;
        if (!safePlacement(s, actualTile, type) || (type === U.defense && !defenseUseful(s, actualTile))
          || (type === U.factory && factoryConnections(s, actualTile) === 0)) continue;
        return { kind: 'build', unit: type, tile, goldReserve: bank,
          reason: `${upgrading ? 'Upgrade' : 'Build'} ${type.toLowerCase()}${type === U.city ? ' to raise troop capacity' : type === U.port || type === U.factory ? ' to grow income' : ' to protect the position'}.` };
      }
    }
    return null;
  }
  danger(s, tile, humansOnly = false) {
    let dist = 1e9;
    for (const e of s.enemies.filter(e => !humansOnly || !isAI(e))) for (const b of sample(e.border, 16)) {
      dist = Math.min(dist, Math.sqrt(s.game.euclideanDistSquared(tile, b)));
    }
    return dist;
  }
  sites(s, type) {
    const g = s.game, existing = s.own.filter(u => STRUCTURES.includes(u.type));
    let tiles = type === U.port || type === U.warship ? s.map.shores : s.map.sites;
    tiles = [...new Set([...tiles, ...s.own.filter(u => u.type === type && !u.building).map(u => u.tile)])];
    const border = s.enemies.filter(e => type !== U.defense || !isAI(e)).flatMap(e => sample(e.border, 12));
    if (type === U.defense) {
      const setback = [];
      for (const t of border) for (let a = 0; a < 12; a++) for (const r of [18, 23]) {
        const x = Math.round(g.x(t) + Math.cos(a * Math.PI / 6) * r);
        const y = Math.round(g.y(t) + Math.sin(a * Math.PI / 6) * r);
        if (g.isValidCoord(x, y)) setback.push(g.ref(x, y));
      }
      tiles = [...new Set([...setback, ...tiles])].filter(t => safePlacement(s, t, type) && defenseUseful(s, t));
    }
    const score = t => {
      const danger = this.danger(s, t, type === U.defense);
      const shore = Math.min(110, ...s.map.shores.map(b => Math.sqrt(g.euclideanDistSquared(t, b))));
      const near = existing.length ? Math.min(...existing.map(u => Math.sqrt(g.euclideanDistSquared(t, u.tile)))) : 80;
      const same = s.own.find(u => u.type === type && u.tile === t);
      if (type === U.defense) {
        const covered = s.own.some(u => u.type === U.defense && g.euclideanDistSquared(t, u.tile) < 25 ** 2);
        return 100 + Math.min(shore, 30) - Math.abs(danger - 23) - (covered ? 100 : 0);
      }
      if (type === U.factory) {
        const links = factoryConnections(s, t);
        return Math.min(danger, 110) + shore + Math.min(near, 75) + Math.min(links, 8) * 22 - (same ? same.level * 12 : 0);
      }
      if (type === U.sam) {
        const value = existing.filter(u => [U.city, U.port, U.factory].includes(u.type)
          && g.euclideanDistSquared(t, u.tile) < 70 ** 2).length * 15;
        const covered = s.own.some(u => u.type === U.sam && !u.building && g.euclideanDistSquared(t, u.tile) < 65 ** 2);
        return value + Math.min(danger, 60) - (covered ? 100 : 0);
      }
      // A port needs a trading partner. Longer routes tend to be more valuable.
      if (type === U.port) {
        const others = unitsOf(s.game, U.port).filter(u => u.owner().smallID() !== s.me.smallID()
          && !s.me.hasEmbargo?.(u.owner()));
        const route = others.length ? Math.max(...sample(others, 30).map(u => Math.sqrt(g.euclideanDistSquared(t, u.tile())))) : 0;
        return Math.min(danger, 90) + Math.min(near, 65) + Math.min(route / 12, 60) - (same ? same.level * 10 : 0);
      }
      // Factories near city stations, cities spread across protected interior.
      return Math.min(danger, 110) + shore + Math.min(near, 75) + (terrainRank(g.terrainType?.(t)) ?? 0) * 12
        - (same ? same.level * 12 : 0);
    };
    return tiles.filter(t => g.ownerID(t) === s.me.smallID() && g.isLand(t) && !g.hasFallout?.(t))
      .map(tile => ({ tile, score: score(tile) })).sort((a, b) => b.score - a.score).map(x => x.tile);
  }
  async landing(s, reserve, active) {
    if (!s.map.shores.length) return null;
    const g = s.game, candidates = new Set();
    for (const shore of sample(s.map.shores, 16)) {
      for (const distance of [20, 45, 85, 150, 230]) for (let angle = 0; angle < 12; angle++) {
        const x = Math.round(g.x(shore) + Math.cos(angle * Math.PI / 6) * distance);
        const y = Math.round(g.y(shore) + Math.sin(angle * Math.PI / 6) * distance);
        if (!g.isValidCoord(x, y)) continue;
        const tile = g.ref(x, y);
        if (coastalTile(g, tile) && g.ownerID(tile) !== s.me.smallID() && !friendly(s.me, g.owner(tile))) candidates.add(tile);
      }
    }
    const budget = Math.min(s.troops - reserve, s.troops * this.tuning.attack);
    const nearbyAI = [...candidates].some(t => { const p = g.owner(t); return p.isPlayer() && isAI(p); });
    const ranked = [...candidates].map(tile => {
      const p = g.owner(tile);
      if (this.focus && p.id() !== this.focus) return null;
      if (!this.focus && nearbyAI && p.isPlayer() && !isAI(p)) return null;
      if (p.isPlayer() && budget < p.troops() * this.strengthRatio()) return null;
      if (s.enemies.some(e => e.id === p.smallID())) return null;
      const nearest = Math.min(...sample(s.map.shores, 30).map(t => g.euclideanDistSquared(tile, t)));

      return { tile, owner: p, score: (p.isPlayer() ? isAI(p) ? 100 : 0 : 200) - Math.sqrt(nearest) / 15 };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    for (const c of ranked.slice(0, 5)) {
      if (!active()) return null;
      const option = await this.adapter.buildOption(s, U.transport, c.tile);
      if (option && option.canBuild !== false && safeCrossing(s, option.canBuild, c.tile)) return { kind: 'boat', targetID: c.owner.id(), tile: c.tile,
        troops: Math.floor(budget), reserve, minRatio: this.strengthRatio(), reason: 'Concentrated landing: direct water corridor clear of current hostile warship range.' };
    }
    return null;
  }
  nuclearEstablished(s) {
    const levels = types => s.own.filter(u => types.includes(u.type) && !u.building).reduce((n, u) => n + u.level, 0);
    return this.options.nukes && (s.game.ticksSinceStart?.() ?? 0) >= 1800 && levels([U.city]) >= 4
      && levels([U.port, U.factory]) >= 3 && s.enemies.some(e => !isAI(e)) && !s.enemies.some(isAI);
  }
  hydrogenCandidate(s) {
    if (!this.nuclearEstablished(s) || !s.own.some(u => u.type === U.silo && !u.building)
      || (s.allOutgoing ?? s.outgoing).length || s.own.some(u => u.type === U.transport)
      || this.cooldown('nuke', s.tick, 1200) || s.config.isUnitDisabled?.(U.hydrogen)) return null;
    const target = s.enemies.find(e => e.playerID === this.focus) ?? [...s.enemies].sort((a, b) => a.troops - b.troops)[0];
    if (!target || isAI(target)) return null;
    const g = s.game, tiles = new Set(s.hostileUnits.filter(u => u.owner === target.id).map(u => u.tile));
    const step = Math.max(12, Math.ceil(Math.sqrt(g.width() * g.height() / 700)));
    for (let y = step / 2 | 0; y < g.height(); y += step) for (let x = step / 2 | 0; x < g.width(); x += step) {
      const tile = g.ref(x, y); if (g.ownerID(tile) === target.id && g.isLand(tile)) tiles.add(tile);
    }
    const sams = s.hostileUnits.filter(u => u.type === U.sam && !u.building);
    const ranked = sample(tiles, 128).map(tile => ({ tile, score: strikeValue(s, tile, target) }))
      .sort((a, b) => b.score - a.score);
    for (const { tile } of ranked) {
      if (g.ownerID(tile) !== target.id || sams.some(u => g.euclideanDistSquared(tile, u.tile)
        <= ((s.config.samRange?.(u.level) ?? 150) + 15) ** 2)) continue;
      if (this.adapter.nukeSafe(s, tile, U.hydrogen)) return { tile, targetID: target.playerID };
    }
    return null;
  }
  async nuclear(s, active) {
    if (s.gold < 5000000) return null;
    const candidate = this.hydrogenCandidate(s);
    if (!candidate || !active()) return null;
    const option = await this.adapter.buildOption(s, U.hydrogen, candidate.tile);
    if (!active() || !option || option.canBuild === false) return null;
    return { kind: 'build', unit: U.hydrogen, ...candidate, goldReserve: 0,
      reason: 'Hydrogen strike at valuable enemy land and infrastructure outside known SAM coverage; reassess after impact, then invade.' };
  }
}
