import { NUCLEAR, COOLDOWNS } from '../rules.js';
import { strikeValue } from '../opportunities.js';
import { isAI } from '../safety.js';
import { U, sample } from '../common.js';

export function isNuclearEconomyReady(strategy, state) {
  const levels = (types) =>
    state.own
      .filter((unit) => types.includes(unit.type) && !unit.building)
      .reduce((n, unit) => n + unit.level, 0);
  return (
    strategy.options.nukes &&
    (state.game.ticksSinceStart?.() ?? 0) >= NUCLEAR.economyMinimumAgeTicks &&
    levels([U.city]) >= 4 &&
    levels([U.port, U.factory]) >= 3 &&
    state.enemies.some((enemy) => !isAI(enemy)) &&
    !state.enemies.some(isAI)
  );
}

export function findHydrogenTarget(strategy, state) {
  if (
    !strategy.nuclearEstablished(state) ||
    !state.own.some((unit) => unit.type === U.silo && !unit.building) ||
    (state.allOutgoing ?? state.outgoing).length ||
    state.own.some((unit) => unit.type === U.transport) ||
    strategy.cooldown('nuke', state.tick, COOLDOWNS.nuclearStrike) ||
    state.config.isUnitDisabled?.(U.hydrogen)
  )
    return null;
  const target =
    state.enemies.find((enemy) => enemy.playerID === strategy.focus) ??
    [...state.enemies].sort((a, b) => a.troops - b.troops)[0];
  if (!target || isAI(target)) return null;
  const game = state.game,
    tiles = new Set(
      state.hostileUnits.filter((unit) => unit.owner === target.id).map((unit) => unit.tile),
    );
  const step = Math.max(12, Math.ceil(Math.sqrt((game.width() * game.height()) / 700)));
  for (let y = (step / 2) | 0; y < game.height(); y += step)
    for (let x = (step / 2) | 0; x < game.width(); x += step) {
      const tile = game.ref(x, y);
      if (game.ownerID(tile) === target.id && game.isLand(tile)) tiles.add(tile);
    }
  const sams = state.hostileUnits.filter((unit) => unit.type === U.sam && !unit.building);
  const ranked = sample(tiles, 128)
    .map((tile) => ({ tile, score: strikeValue(state, tile, target) }))
    .sort((a, b) => b.score - a.score);
  for (const { tile } of ranked) {
    if (
      game.ownerID(tile) !== target.id ||
      sams.some(
        (unit) =>
          game.euclideanDistSquared(tile, unit.tile) <=
          ((state.config.samRange?.(unit.level) ?? NUCLEAR.defaultSamRange) +
            NUCLEAR.samSafetyMargin) **
            2,
      )
    )
      continue;
    if (strategy.adapter.nukeSafe(state, tile, U.hydrogen))
      return { tile, targetID: target.playerID };
  }
  return null;
}

export async function chooseNuclearStrike(strategy, state, active) {
  if (state.gold < NUCLEAR.hydrogenSavings) return null;
  const candidate = strategy.hydrogenCandidate(state);
  if (!candidate || !active()) return null;
  const option = await strategy.adapter.buildOption(state, U.hydrogen, candidate.tile);
  if (!active() || !option || option.canBuild === false) return null;
  return {
    kind: 'build',
    unit: U.hydrogen,
    ...candidate,
    goldReserve: 0,
    reason:
      'Hydrogen strike at valuable enemy land and infrastructure outside known SAM coverage; reassess after impact, then invade.',
  };
}
