import {
  MIN_AI_ATTACK_RATIO,
  NEAR_CAPACITY_THRESHOLD,
  MAX_TROOP_SEND_FRACTION,
  DEFENSE,
} from '../rules.js';
import { captureValue, terrainRank } from '../opportunities.js';
import { compactnessScore } from '../geometry.js';
import {
  isAI,
  humanAttacks,
  landFrontAllowed,
  growthAdvantage,
  structureThreatened,
  earlyCapacity,
} from '../safety.js';
import { U, sample, clamp } from '../common.js';

export function chooseLandAttack(strategy, state, reserve) {
  if (humanAttacks(state).length || state.own.some((unit) => unit.type === U.transport))
    return null;
  const budget = Math.min(state.troops - reserve, state.troops * strategy.tuning.attack);
  const neutral = state.map.fronts.find((f) => f.id === 0);
  if (
    (!strategy.focus || earlyCapacity(state)) &&
    neutral &&
    landFrontAllowed(state, 0) &&
    budget > Math.max(1200, state.cap * 0.035)
  ) {
    const troops = Math.floor(Math.min(budget, state.troops * strategy.tuning.neutral));
    return {
      kind: 'attack',
      targetID: null,
      tile: neutral.tiles[0],
      troops,
      reserve,
      reason: 'Opening expansion: capture wilderness before starting the next conquest.',
    };
  }
  const candidates = [];
  for (const enemy of strategy.targetPool(state)) {
    if (!landFrontAllowed(state, enemy.id)) continue;
    const waves = state.allOutgoing ?? state.outgoing;
    // Open the second AI front only while the first remains well supplied.
    if (
      waves.some((a) => {
        const other = state.enemies.find((enemy) => enemy.id === a.targetID);
        return !other || a.troops < other.troops * MIN_AI_ATTACK_RATIO;
      })
    )
      continue;
    const ideal = isAI(enemy) ? MIN_AI_ATTACK_RATIO : strategy.strengthRatio();
    if (budget < 2500) continue;
    const forecast = strategy.forecast(state, enemy, budget);
    let minRatio = ideal;
    // At capacity the ideal casualty ratio may be unattainable. Permit a
    // measured attack only if the forecast promises meaningful progress.
    if (
      (state.troops / state.cap >= NEAR_CAPACITY_THRESHOLD || earlyCapacity(state)) &&
      forecast &&
      forecast.gain >= Math.min(enemy.area, Math.max(120, enemy.area * 0.35))
    )
      minRatio = isAI(enemy) ? 0.9 : 1.05;
    const growth =
      !isAI(enemy) &&
      forecast &&
      forecast.gain >= Math.min(enemy.area, 120) &&
      growthAdvantage(state, enemy, budget);
    if (growth) minRatio = Math.min(minRatio, 0.85);
    if (budget < enemy.troops * minRatio) continue;
    if (!forecast || forecast.gain < Math.min(60, enemy.area * 0.2)) continue;
    const finish = forecast.gain >= enemy.area ? 3 : 1;
    const score =
      (forecast.gain / Math.max(100, forecast.loss)) * 2500 * finish +
      (enemy.traitor ? 12 : 0) +
      compactnessScore(state, enemy) * 3 +
      captureValue(state, enemy, forecast);
    let troops = budget;
    if (isAI(enemy) && state.enemies.filter(isAI).length >= 2 && forecast.gain > 0) {
      troops = Math.min(
        budget,
        Math.max(
          2500,
          enemy.troops * minRatio,
          (enemy.area * forecast.loss) / forecast.gain / 0.55,
        ),
      );
    }
    candidates.push({
      kind: 'attack',
      targetID: enemy.playerID,
      tile: enemy.tiles[0],
      troops: Math.min(Math.floor(budget), Math.ceil(troops)),
      reserve,
      minRatio,
      score,
      growth: Boolean(growth),
      aiPolicy: isAI(enemy),
      secondary: waves.length > 0,
      reason: `${waves.length ? 'Second AI conquest' : strategy.focus ? 'Finish' : 'Conquer'} ${enemy.name}: ${(troops / Math.max(1, enemy.troops)).toFixed(1)}× defending troops; preserve reserves.`,
    });
  }
  return candidates.sort((a, b) => b.score - a.score)[0] ?? null;
}

export function chooseCounterattack(strategy, state) {
  if (state.immunized) return null;
  const attacks = humanAttacks(state),
    totals = new Map();
  for (const a of attacks) totals.set(a.attackerID, (totals.get(a.attackerID) ?? 0) + a.troops);
  for (const [id, incoming] of [...totals].sort((a, b) => b[1] - a[1])) {
    const enemy = state.enemies.find((enemy) => enemy.id === id);
    if (!enemy || isAI(enemy) || !enemy.tiles.length) continue;
    if (!structureThreatened(state, id)) continue;
    const other = attacks.filter((a) => a.attackerID !== id).reduce((n, a) => n + a.troops, 0);
    const reserve = Math.max(state.cap * 0.18, other * 1.15);
    const troops = Math.floor(
      Math.min(incoming, state.troops * MAX_TROOP_SEND_FRACTION, state.troops - reserve),
    );
    if (!Number.isFinite(troops) || troops < 100) continue;
    return {
      kind: 'attack',
      targetID: enemy.playerID,
      tile: enemy.tiles[0],
      troops,
      reserve,
      counter: true,
      minRatio: 0,
      reason: `Counter ${enemy.name}: cancel up to ${troops.toLocaleString()} incoming troops${troops < incoming ? '; partial cancellation' : ''}.`,
    };
  }
  return null;
}

export function chooseReinforcement(strategy, state, reserve) {
  const waves = state.allOutgoing ?? state.outgoing;
  const ids = [...new Set(waves.map((a) => a.targetID))];
  const choices = ids
    .map((id) => {
      if (!landFrontAllowed(state, id, true)) return null;
      const enemy = state.enemies.find((enemy) => enemy.id === id);
      const neutral = id === 0 ? state.map.fronts.find((f) => f.id === 0) : null;
      if (!enemy && !neutral) return null;
      const committed = waves.filter((a) => a.targetID === id).reduce((n, a) => n + a.troops, 0);
      let ideal = enemy
        ? enemy.troops * (isAI(enemy) ? MIN_AI_ATTACK_RATIO : strategy.strengthRatio())
        : state.cap * 0.15;
      if (enemy && isAI(enemy)) {
        const estimate = strategy.forecast(
          state,
          enemy,
          Math.max(committed, state.troops - reserve),
        );
        if (estimate?.gain > 0)
          ideal = Math.max(ideal, (enemy.area * estimate.loss) / estimate.gain / 0.65);
      }
      return { enemy, neutral, committed, ideal, deficit: ideal - committed };
    })
    .filter(Boolean)
    .sort((a, b) => b.deficit - a.deficit);
  const choice = choices[0];
  if (!choice) return null;
  const { enemy, neutral, ideal, committed } = choice,
    capped = state.troops / state.cap >= NEAR_CAPACITY_THRESHOLD || earlyCapacity(state);
  if (!capped && committed >= ideal) return null;
  const incoming = humanAttacks(state).reduce((n, a) => n + a.troops, 0);
  reserve = Math.max(reserve, incoming ? state.cap * 0.25 + incoming * 1.25 : 0);
  const available = Math.min(state.troops - reserve, state.troops * strategy.tuning.attack);
  const troops = Math.floor(
    Math.min(available, Math.max(ideal - committed, capped ? state.troops * 0.25 : 0)),
  );
  if (!Number.isFinite(troops) || troops < Math.max(200, state.cap * 0.005)) return null;
  return {
    kind: 'attack',
    targetID: enemy?.playerID ?? null,
    tile: (enemy ?? neutral).tiles[0],
    troops,
    reserve,
    reinforce: true,
    minRatio: 0,
    secondary: enemy && strategy.focus !== enemy.playerID,
    reason: `Reinforce ${enemy?.name ?? 'wilderness expansion'} with ${troops.toLocaleString()} troops.`,
  };
}

export function forecastConquest(strategy, state, enemy, budget) {
  const game = state.game;
  const defenses = state.hostileUnits.filter(
    (unit) => unit.owner === enemy.id && unit.type === U.defense && !unit.building,
  );
  const radius = state.config.defensePostRange?.() ?? DEFENSE.defaultPostRange;
  let totalLoss = 0,
    fraction = 0,
    n = 0;
  for (const tile of sample(enemy.tiles, 8)) {
    const defended = defenses.some(
      (unit) => game.euclideanDistSquared(tile, unit.tile) <= radius * radius,
    );
    let loss, f;
    if (state.config.attackLogic?.length === 1) {
      const result = state.config.attackLogic({
        terrain: game.terrainType(tile),
        attackTroops: budget,
        attacker: { type: state.me.type(), numTiles: state.tiles },
        defender: {
          type: enemy.type,
          numTiles: Math.max(1, enemy.area),
          troops: enemy.troops,
          isTraitor: enemy.traitor,
          isDisconnectedTeammate: false,
        },
        defenderHasDefensePost: defended,
        falloutRatio: game.hasFallout?.(tile) ? 0 : null,
        borderSize: Math.max(1, enemy.count),
      });
      loss = result.attackerTroopLoss;
      f = result.tickFraction;
    } else {
      // Conservative fallback for older clients with a different attackLogic signature.
      const terrain = terrainRank(game.terrainType?.(tile));
      const rough = terrain === 2 ? 1.6 : terrain === 1 ? 1.3 : 1;
      loss =
        (20 + (enemy.troops / Math.max(1, enemy.area)) * 1.5) *
        rough *
        (defended ? 5 : 1) *
        clamp(enemy.troops / budget, 0.6, 2) *
        (enemy.type === 'BOT' ? 0.5 : 1);
      f = (0.3 * rough * (defended ? 3 : 1)) / Math.max(1, enemy.count);
    }
    if (!Number.isFinite(loss) || !Number.isFinite(f) || loss < 0 || f <= 0) return null;
    totalLoss += loss;
    fraction += f;
    n++;
  }
  if (!n) return null;
  const loss = totalLoss / n,
    tickFraction = fraction / n;
  const gain = Math.min(enemy.area, (budget * 0.7) / Math.max(1, loss));
  return { gain, loss: gain * loss };
}
